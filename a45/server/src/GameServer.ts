import { createSocket } from 'dgram';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { 
  PlayerState, 
  PlayerShip, 
  Galaxy, 
  Station,
  EntitySnapshot,
  TradeRequest,
  TradeResponse,
  CommodityInventory,
  COMMODITIES,
  vec2Distance,
  calculateCargoWeight,
  getCommodity,
  FactionId,
  MissionId,
  Fleet,
  FleetFormation,
  getRelationship,
  RadarContact,
  vec2Length,
  FactionWarEvent,
  Reputation,
  getReputationRank
} from '@space-trade/shared';
import {
  getMessageType,
  MessageType,
  decodeHello,
  decodeInput,
  decodeTradeRequest,
  decodeRadarScanRequest,
  decodeFleetCreate,
  decodeFleetInvite,
  decodeFleetAccept,
  decodeFleetDecline,
  decodeFleetLeave,
  decodeFleetFormation,
  decodeMissionAccept,
  decodeMissionAbandon,
  encodeHelloAck,
  encodeSnapshot,
  encodeTradeResponse,
  encodePing,
  decodePing,
  encodePong,
  encodeRadarScanResult,
  encodeFleetState,
  encodeMissionList,
  encodeMissionUpdate,
  encodeFactionEvent,
  encodeOtherPlayerSnapshot
} from '@space-trade/shared';
import { GalaxyGenerator } from './GalaxyGenerator';
import { EconomySystem } from './EconomySystem';
import { database } from './Database';
import { PhysicsEngine } from './Physics';
import { FactionSystem } from './FactionSystem';
import { MissionSystem } from './MissionSystem';
import { FleetSystem } from './FleetSystem';
import { v4 as uuidv4 } from 'uuid';

interface ClientConnection {
  id: string;
  address: string;
  port: number;
  lastSeen: number;
  inputSequence: number;
  ws?: WebSocket;
  playerId?: string;
}

const SNAPSHOT_INTERVAL = 50;
const ECONOMY_TICK_INTERVAL = 1000;
const FACTION_AI_INTERVAL = 1000;
const CLIENT_TIMEOUT = 30000;
const DOCKING_DISTANCE = 50;
const DEFAULT_FACTION: FactionId = 'independent';
const DEFAULT_SHIP_MAX_SHIELD = 100;
const DEFAULT_SHIP_MAX_FIREPOWER = 50;
const MAX_RADAR_RANGE = 2000;
const OTHER_SNAPSHOT_INTERVAL = 200;

export class GameServer {
  private tcpPort: number;
  private udpPort: number;
  private galaxySeed: number;
  private udpSocket: ReturnType<typeof createSocket>;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private players: Map<string, PlayerState> = new Map();
  private galaxy: Galaxy | null = null;
  private stations: Map<string, Station> = new Map();
  private running: boolean = false;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private economyInterval: NodeJS.Timeout | null = null;
  private lastTickTime: number = 0;
  private playerInputHistory: Map<string, Map<number, any>> = new Map();
  private snapshotSequence: number = 0;

  private factionSystem: FactionSystem | null = null;
  private missionSystem: MissionSystem | null = null;
  private fleetSystem: FleetSystem | null = null;
  private playerReputation: Map<string, Map<FactionId, number>> = new Map();

  constructor(tcpPort: number, udpPort: number, galaxySeed: number) {
    this.tcpPort = tcpPort;
    this.udpPort = udpPort;
    this.galaxySeed = galaxySeed;
    this.udpSocket = createSocket('udp4');
    this.httpServer = http.createServer();
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });
  }

  async start(): Promise<void> {
    await database.initialize();
    this.generateGalaxy();
    this.initializeSystems();
    this.setupUdpSocket();
    this.setupWebSocket();
    this.startGameLoop();
    this.running = true;
    console.log(`Game server running on TCP port ${this.tcpPort} (WS), UDP port ${this.udpPort}`);
  }

  private initializeSystems(): void {
    if (!this.galaxy) return;

    this.factionSystem = new FactionSystem(this.galaxy, this.galaxySeed);
    this.missionSystem = new MissionSystem(this.galaxy, this.galaxySeed);
    this.fleetSystem = new FleetSystem();

    this.factionSystem.onEvent((event) => {
      this.broadcastFactionEvent(event);
    });
  }

  private generateGalaxy(): void {
    const generator = new GalaxyGenerator(this.galaxySeed);
    this.galaxy = generator.generateGalaxy();

    for (const station of this.galaxy.stations) {
      this.stations.set(station.id, station);
    }

    console.log(`Generated galaxy with:
      ${this.galaxy.stars.length} stars
      ${this.galaxy.planets.length} planets
      ${this.galaxy.stations.length} stations
      ${this.galaxy.factions.length} factions`);
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, request) => {
      const clientId = uuidv4();
      const clientAddress = request.socket.remoteAddress || 'unknown';
      const clientPort = request.socket.remotePort || 0;

      const client: ClientConnection = {
        id: clientId,
        address: clientAddress,
        port: clientPort,
        lastSeen: Date.now(),
        inputSequence: 0,
        ws
      };

      this.clients.set(clientId, client);
      console.log(`WebSocket client connected: ${clientAddress}:${clientPort} (${clientId})`);

      ws.on('message', (data) => {
        try {
          const buffer = data instanceof ArrayBuffer 
            ? new Uint8Array(data) 
            : Buffer.isBuffer(data)
              ? new Uint8Array(data)
              : new Uint8Array();
          this.handleWebSocketMessage(buffer, clientId, ws);
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.handleClientDisconnect(clientId);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error (${clientId}):`, err);
      });
    });

    this.httpServer.listen(this.tcpPort);
  }

  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client?.playerId) {
      const player = this.players.get(client.playerId);
      if (player && this.fleetSystem?.isInFleet(player.id)) {
        this.fleetSystem.leaveFleet(player, (id) => this.players.get(id));
      }
    }
    this.clients.delete(clientId);
  }

  private handleWebSocketMessage(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastSeen = Date.now();
      }

      const msgType = getMessageType(data);

      switch (msgType) {
        case MessageType.HELLO:
          this.handleWebSocketHello(data, clientId, ws);
          break;
        case MessageType.INPUT:
          this.handleWebSocketInput(data, clientId);
          break;
        case MessageType.TRADE_REQUEST:
          this.handleWebSocketTradeRequest(data, clientId, ws);
          break;
        case MessageType.PING:
          const timestamp = decodePing(data);
          const pong = encodePong(timestamp);
          ws.send(pong);
          break;
        case MessageType.RADAR_SCAN_REQUEST:
          this.handleRadarScan(data, clientId, ws);
          break;
        case MessageType.FLEET_CREATE:
          this.handleFleetCreate(data, clientId, ws);
          break;
        case MessageType.FLEET_INVITE:
          this.handleFleetInvite(data, clientId, ws);
          break;
        case MessageType.FLEET_ACCEPT:
          this.handleFleetAccept(data, clientId, ws);
          break;
        case MessageType.FLEET_DECLINE:
          this.handleFleetDecline(data, clientId, ws);
          break;
        case MessageType.FLEET_LEAVE:
          this.handleFleetLeave(clientId, ws);
          break;
        case MessageType.FLEET_FORMATION:
          this.handleFleetFormation(data, clientId, ws);
          break;
        case MessageType.MISSION_ACCEPT:
          this.handleMissionAccept(data, clientId, ws);
          break;
        case MessageType.MISSION_ABANDON:
          this.handleMissionAbandon(data, clientId, ws);
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  }

  private async handleWebSocketHello(data: Uint8Array, clientId: string, ws: WebSocket): Promise<void> {
    const { playerName } = decodeHello(data);
    
    try {
      const savedPlayer = await database.getOrCreatePlayer(playerName);
      
      let client = this.clients.get(clientId);
      if (client) {
        client.lastSeen = Date.now();
        client.playerId = savedPlayer.id;
      }

      let player = this.players.get(savedPlayer.id);
      if (!player) {
        const ship: PlayerShip = {
          id: uuidv4(),
          playerId: savedPlayer.id,
          position: { x: savedPlayer.positionX, y: savedPlayer.positionY },
          velocity: { x: 0, y: 0 },
          rotation: savedPlayer.rotation,
          angularVelocity: 0,
          currentStarId: savedPlayer.currentStarId,
          dockingStationId: savedPlayer.dockingStationId,
          maxSpeed: 200,
          maxAcceleration: 150,
          maxAngularSpeed: 3,
          cargoCapacity: 100,
          currentCargo: savedPlayer.cargo,
          credits: savedPlayer.credits,
          factionId: savedPlayer.factionId || DEFAULT_FACTION,
          shield: DEFAULT_SHIP_MAX_SHIELD,
          maxShield: DEFAULT_SHIP_MAX_SHIELD,
          firepower: DEFAULT_SHIP_MAX_FIREPOWER,
          maxFirepower: DEFAULT_SHIP_MAX_FIREPOWER
        };

        player = {
          id: savedPlayer.id,
          name: playerName,
          ship,
          lastUpdate: Date.now(),
          reputation: new Map(),
          activeMissionIds: []
        };

        this.players.set(savedPlayer.id, player);
        this.playerInputHistory.set(savedPlayer.id, new Map());
        this.initializePlayerReputation(savedPlayer.id, savedPlayer.factionId || DEFAULT_FACTION);
      }

      const ack = encodeHelloAck(savedPlayer.id, player.ship.factionId);
      ws.send(ack);

      this.sendPlayerInitialState(player, ws);

      console.log(`Player "${playerName}" (${savedPlayer.id}) connected via WebSocket`);
    } catch (err) {
      console.error('Error handling WebSocket hello:', err);
    }
  }

  private initializePlayerReputation(playerId: string, factionId: FactionId): void {
    const reputation = new Map<FactionId, number>();
    reputation.set('galactic_federation', 0);
    reputation.set('pirate_kingdom', 0);
    reputation.set('merchant_gilde', 0);
    reputation.set('independent', 0);
    
    if (factionId !== 'independent') {
      reputation.set(factionId, 100);
    }
    
    this.playerReputation.set(playerId, reputation);
  }

  private handleWebSocketInput(data: Uint8Array, clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const input = decodeInput(data);
    client.lastSeen = Date.now();

    const player = this.players.get(input.playerId);
    if (!player) return;

    if (input.sequence > client.inputSequence) {
      client.inputSequence = input.sequence;
      
      const inputHistory = this.playerInputHistory.get(player.id);
      if (inputHistory) {
        inputHistory.set(input.sequence, input);
        if (inputHistory.size > 100) {
          const oldestKey = Math.min(...inputHistory.keys());
          inputHistory.delete(oldestKey);
        }
      }

      const now = Date.now();
      const deltaTime = Math.min(now - player.lastUpdate, 100);
      player.lastUpdate = now;

      let fleetPosition = null;
      if (this.fleetSystem?.isInFleet(player.id)) {
        fleetPosition = this.fleetSystem.getFleetPosition(
          player.ship.fleetId!,
          player.id,
          (id) => this.players.get(id)
        );
      }

      PhysicsEngine.updateShip(player.ship, input, deltaTime);

      if (this.missionSystem) {
        const activeMission = this.missionSystem.getPlayerActiveMission(player.id);
        if (activeMission && deltaTime > 0) {
          const progressGain = deltaTime / 1000;
          this.missionSystem.updateMissionProgress(player.id, progressGain);
        }
      }

      this.updateDocking(player);
    }
  }

  private async handleWebSocketTradeRequest(data: Uint8Array, clientId: string, ws: WebSocket): Promise<void> {
    const request = decodeTradeRequest(data);
    
    const player = this.players.get(request.playerId);
    if (!player) {
      this.sendTradeResponseWs(false, 0, [], [], 'Player not found', ws);
      return;
    }

    if (!player.ship.dockingStationId) {
      this.sendTradeResponseWs(false, player.ship.credits, player.ship.currentCargo, [], 'Not docked at a station', ws);
      return;
    }

    if (player.ship.dockingStationId !== request.stationId) {
      this.sendTradeResponseWs(false, player.ship.credits, player.ship.currentCargo, [], 'Docked at different station', ws);
      return;
    }

    const station = this.stations.get(request.stationId);
    if (!station) {
      this.sendTradeResponseWs(false, player.ship.credits, player.ship.currentCargo, [], 'Station not found', ws);
      return;
    }

    if (station.factionId) {
      const relation = getRelationship(
        player.ship.factionId,
        station.factionId,
        this.playerReputation.get(player.id)?.get(station.factionId) || 0
      );
      
      if (relation === 'enemy') {
        this.sendTradeResponseWs(false, player.ship.credits, player.ship.currentCargo, [], 'Hostile faction - cannot trade', ws);
        return;
      }
    }

    try {
      const response = await this.executeTrade(player, station, request);

      if (response.success) {
        const factionId = station.factionId;
        this.updatePlayerReputation(
          player.id,
          factionId,
          request.quantity > 0 ? 5 : 0
        );
      }

      this.sendTradeResponseWs(
        response.success,
        response.credits,
        response.cargo,
        response.stationInventory,
        response.message,
        ws
      );
    } catch (err) {
      console.error('Trade error:', err);
      this.sendTradeResponseWs(false, player.ship.credits, player.ship.currentCargo, [], 'Trade failed', ws);
    }
  }

  private updatePlayerReputation(playerId: string, factionId: FactionId, change: number): void {
    const reputation = this.playerReputation.get(playerId);
    if (!reputation) return;

    const current = reputation.get(factionId) || 0;
    const newValue = Math.max(-1000, Math.min(1000, current + change));
    reputation.set(factionId, newValue);
  }

  private handleRadarScan(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { range } = decodeRadarScanRequest(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId) return;

      const scanningPlayer = this.players.get(client.playerId);
      if (!scanningPlayer) return;

      const contacts: RadarContact[] = [];
      const scanRange = Math.min(range || MAX_RADAR_RANGE, MAX_RADAR_RANGE * 2);

      for (const [playerId, player] of this.players) {
        if (playerId === scanningPlayer.id) continue;

        const distance = vec2Distance(scanningPlayer.ship.position, player.ship.position);
        if (distance > scanRange) continue;

        const relation = getRelationship(
          scanningPlayer.ship.factionId,
          player.ship.factionId,
          this.playerReputation.get(scanningPlayer.id)?.get(player.ship.factionId) || 0
        );

        contacts.push({
          playerId,
          name: player.name,
          position: { ...player.ship.position },
          velocity: { ...player.ship.velocity },
          factionId: player.ship.factionId,
          relationship: relation,
          distance,
          shield: player.ship.shield,
          fleetId: player.ship.fleetId
        });
      }

      contacts.sort((a, b) => a.distance - b.distance);

      const result = encodeRadarScanResult(contacts, Date.now());
      ws.send(result);
    } catch (err) {
      console.error('Radar scan error:', err);
    }
  }

  private handleFleetCreate(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { name, formation } = decodeFleetCreate(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId) return;

      const player = this.players.get(client.playerId);
      if (!player || !this.fleetSystem) return;

      const fleet = this.fleetSystem.createFleet(player, name, formation, (id) => this.players.get(id));
      if (!fleet) {
        this.sendFleetStateToClient(player.id, null, ws);
        return;
      }

      this.sendFleetStateToClient(player.id, fleet, ws);
      this.broadcastFleetUpdate(fleet);
    } catch (err) {
      console.error('Fleet create error:', err);
    }
  }

  private handleFleetInvite(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { targetPlayerId, fleetId } = decodeFleetInvite(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.fleetSystem) return;

      const success = this.fleetSystem.inviteToFleet(
        client.playerId,
        targetPlayerId,
        (id) => this.players.get(id)
      );

      if (success) {
        const targetClient = this.findClientByPlayerId(targetPlayerId);
        if (targetClient?.ws) {
          const fleet = this.fleetSystem.getFleet(fleetId);
          this.sendFleetStateToClient(targetPlayerId, fleet, targetClient.ws);
        }
      }
    } catch (err) {
      console.error('Fleet invite error:', err);
    }
  }

  private handleFleetAccept(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { fleetId } = decodeFleetAccept(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.fleetSystem) return;

      const player = this.players.get(client.playerId);
      if (!player) return;

      const fleet = this.fleetSystem.acceptInvite(player, fleetId, (id) => this.players.get(id));
      if (!fleet) {
        this.sendFleetStateToClient(player.id, null, ws);
        return;
      }

      this.broadcastFleetUpdate(fleet);
    } catch (err) {
      console.error('Fleet accept error:', err);
    }
  }

  private handleFleetDecline(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { fleetId } = decodeFleetDecline(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.fleetSystem) return;

      this.fleetSystem.declineInvite(client.playerId, fleetId);
    } catch (err) {
      console.error('Fleet decline error:', err);
    }
  }

  private handleFleetLeave(clientId: string, ws: WebSocket): void {
    try {
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.fleetSystem) return;

      const player = this.players.get(client.playerId);
      if (!player) return;

      const fleetId = player.ship.fleetId;
      this.fleetSystem.leaveFleet(player, (id) => this.players.get(id));

      if (fleetId) {
        const remainingFleet = this.fleetSystem.getFleet(fleetId);
        if (remainingFleet) {
          this.broadcastFleetUpdate(remainingFleet);
        }
      }

      this.sendFleetStateToClient(client.playerId, null, ws);
    } catch (err) {
      console.error('Fleet leave error:', err);
    }
  }

  private handleFleetFormation(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { formation } = decodeFleetFormation(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.fleetSystem) return;

      const fleet = this.fleetSystem.getPlayerFleet(client.playerId);
      if (!fleet) return;

      if (!this.fleetSystem.setFormation(client.playerId, formation)) {
        this.broadcastFleetUpdate(fleet);
      }
    } catch (err) {
      console.error('Fleet formation error:', err);
    }
  }

  private handleMissionAccept(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { missionId } = decodeMissionAccept(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.missionSystem) return;

      const player = this.players.get(client.playerId);
      if (!player) return;

      const success = this.missionSystem.acceptMission(missionId, player);
      if (!success) {
        return;
      }

      const activeMission = this.missionSystem.getPlayerActiveMission(player.id);
      if (!activeMission) return;

      this.sendMissionUpdate(activeMission.mission, activeMission.progress, ws);
    } catch (err) {
      console.error('Mission accept error:', err);
    }
  }

  private handleMissionAbandon(data: Uint8Array, clientId: string, ws: WebSocket): void {
    try {
      const { missionId } = decodeMissionAbandon(data);
      const client = this.clients.get(clientId);
      if (!client?.playerId || !this.missionSystem) return;

      const mission = this.missionSystem.abandonMission(client.playerId);
      if (!mission) {
        return;
      }
    } catch (err) {
      console.error('Mission abandon error:', err);
    }
  }

  private sendPlayerInitialState(player: PlayerState, ws: WebSocket): void {
    if (this.missionSystem) {
      const availableMissions = this.missionSystem.getAvailableMissions();
      if (availableMissions.length > 0) {
        const encoded = encodeMissionList(availableMissions);
        ws.send(encoded);
      }
    }

    if (this.fleetSystem) {
      const fleet = this.fleetSystem.getPlayerFleet(player.id);
      if (fleet) {
        const encoded = encodeFleetState(fleet);
        ws.send(encoded);
      }
    }
  }

  private sendFleetStateToClient(playerId: string, fleet: Fleet | null, ws: WebSocket): void {
    const encoded = encodeFleetState(fleet);
    ws.send(encoded);
  }

  private broadcastFleetUpdate(fleet: Fleet): void {
    const encoded = encodeFleetState(fleet);

    for (const client of this.clients.values()) {
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(encoded);
      }
    }
  }

  private broadcastFactionEvent(event: FactionWarEvent): void {
    const encoded = encodeFactionEvent(event);

    for (const client of this.clients.values()) {
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(encoded);
      }
    }
  }

  private sendMissionUpdate(mission: any, progress: number, ws: WebSocket): void {
    const encoded = encodeMissionUpdate(mission, progress);
    ws.send(encoded);
  }

  private findClientByPlayerId(playerId: string): ClientConnection | undefined {
    for (const client of this.clients.values()) {
      if (client.playerId === playerId) {
        return client;
      }
    }
    return undefined;
  }

  private sendTradeResponseWs(
    success: boolean,
    credits: number,
    cargo: CommodityInventory[],
    stationInventory: CommodityInventory[],
    message: string | undefined,
    ws: WebSocket
  ): void {
    const response: TradeResponse = {
      success,
      playerCredits: credits,
      playerCargo: cargo,
      stationInventory,
      message
    };
    const encoded = encodeTradeResponse(response);
    ws.send(encoded);
  }

  private setupUdpSocket(): void {
    this.udpSocket.on('message', (data, rinfo) => {
      try {
        const buffer = new Uint8Array(data);
        const msgType = getMessageType(buffer);

        switch (msgType) {
          case MessageType.INPUT:
            this.handleUdpInput(buffer, rinfo.address, rinfo.port);
            break;
          case MessageType.PING:
            this.handlePing(buffer, rinfo.address, rinfo.port);
            break;
          case MessageType.DISCONNECT:
            this.handleDisconnect(rinfo.address, rinfo.port);
            break;
        }
      } catch (err) {
        console.error('UDP message error:', err);
      }
    });

    this.udpSocket.bind(this.udpPort);
  }

  private handleUdpInput(data: Uint8Array, address: string, port: number): void {
    const input = decodeInput(data);

    const client = this.findOrCreateClient(address, port);
    client.lastSeen = Date.now();

    const player = this.players.get(input.playerId);
    if (!player) return;

    if (input.sequence > client.inputSequence) {
      client.inputSequence = input.sequence;
      
      const inputHistory = this.playerInputHistory.get(player.id);
      if (inputHistory) {
        inputHistory.set(input.sequence, input);
        if (inputHistory.size > 100) {
          const oldestKey = Math.min(...inputHistory.keys());
          inputHistory.delete(oldestKey);
        }
      }

      const now = Date.now();
      const deltaTime = Math.min(now - player.lastUpdate, 100);
      player.lastUpdate = now;

      PhysicsEngine.updateShip(player.ship, input, deltaTime);
      this.updateDocking(player);
    }
  }

  private findOrCreateClient(address: string, port: number): ClientConnection {
    let client: ClientConnection | undefined;

    for (const [, c] of this.clients) {
      if (c.address === address && c.port === port) {
        client = c;
        break;
      }
    }

    if (!client) {
      const clientId = uuidv4();
      client = {
        id: clientId,
        address,
        port,
        lastSeen: Date.now(),
        inputSequence: 0
      };
      this.clients.set(clientId, client);
    }

    return client;
  }

  private updateDocking(player: PlayerState): void {
    for (const [stationId, station] of this.stations) {
      const distance = vec2Distance(player.ship.position, station.position);

      if (distance <= DOCKING_DISTANCE && vec2Length(player.ship.velocity) < 10) {
        player.ship.dockingStationId = station.id;
        player.ship.currentStarId = station.starId;
      } else if (player.ship.dockingStationId === station.id) {
        player.ship.dockingStationId = null;
      }
    }
  }

  private async executeTrade(
    player: PlayerState,
    station: Station,
    request: TradeRequest
  ): Promise<{
    success: boolean;
    credits: number;
    cargo: CommodityInventory[];
    stationInventory: CommodityInventory[];
    message?: string;
  }> {
    const quantity = request.quantity;
    const commodity = getCommodity(request.commodity);

    if (quantity <= 0) {
      return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Invalid quantity' };
    }

    if (request.isBuy) {
      if (!EconomySystem.canBuy(station, request.commodity, quantity)) {
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Station out of stock' };
      }

      const pricePerUnit = EconomySystem.getBuyPrice(station, request.commodity);
      const totalPrice = pricePerUnit * quantity;

      if (player.ship.credits < totalPrice) {
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Insufficient credits' };
      }

      const currentWeight = calculateCargoWeight(player.ship.currentCargo);
      const additionalWeight = quantity * commodity.weight;
      if (currentWeight + additionalWeight > player.ship.cargoCapacity) {
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Insufficient cargo space' };
      }

      EconomySystem.executeBuy(station, request.commodity, quantity);
      player.ship.credits -= totalPrice;
      
      this.addCargo(player.ship.currentCargo, request.commodity, quantity);

      const success = await database.executeTrade(
        player.id,
        station.id,
        request.commodity,
        quantity,
        pricePerUnit,
        totalPrice,
        true,
        player.ship.credits,
        player.ship.currentCargo
      );

      if (success) {
        console.log(`Player ${player.name} bought ${quantity} ${request.commodity} for ${totalPrice} credits`);
        return { success: true, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station) };
      } else {
        EconomySystem.executeSell(station, request.commodity, quantity);
        player.ship.credits += totalPrice;
        this.addCargo(player.ship.currentCargo, request.commodity, -quantity);
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Database error' };
      }
    } else {
      const playerQuantity = this.getCargoQuantity(player.ship.currentCargo, request.commodity);
      if (playerQuantity < quantity) {
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Insufficient cargo' };
      }

      if (!EconomySystem.canSell(station, request.commodity, quantity)) {
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Station inventory full' };
      }

      const pricePerUnit = EconomySystem.getSellPrice(station, request.commodity);
      const totalPrice = pricePerUnit * quantity;

      EconomySystem.executeSell(station, request.commodity, quantity);
      player.ship.credits += totalPrice;
      this.addCargo(player.ship.currentCargo, request.commodity, -quantity);

      const success = await database.executeTrade(
        player.id,
        station.id,
        request.commodity,
        quantity,
        pricePerUnit,
        totalPrice,
        false,
        player.ship.credits,
        player.ship.currentCargo
      );

      if (success) {
        console.log(`Player ${player.name} sold ${quantity} ${request.commodity} for ${totalPrice} credits`);
        return { success: true, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station) };
      } else {
        EconomySystem.executeBuy(station, request.commodity, quantity);
        player.ship.credits -= totalPrice;
        this.addCargo(player.ship.currentCargo, request.commodity, quantity);
        return { success: false, credits: player.ship.credits, cargo: player.ship.currentCargo, stationInventory: this.getStationInventory(station), message: 'Database error' };
      }
    }
  }

  private getCargoQuantity(cargo: CommodityInventory[], type: string): number {
    const item = cargo.find(c => c.type === type);
    return item ? item.quantity : 0;
  }

  private addCargo(cargo: CommodityInventory[], type: string, quantity: number): void {
    const item = cargo.find(c => c.type === type);
    if (item) {
      item.quantity += quantity;
      if (item.quantity <= 0) {
        const index = cargo.indexOf(item);
        cargo.splice(index, 1);
      }
    } else if (quantity > 0) {
      cargo.push({ type: type as any, quantity });
    }
  }

  private getStationInventory(station: Station): CommodityInventory[] {
    const inventory: CommodityInventory[] = [];
    for (const [type, quantity] of station.inventory) {
      inventory.push({ type, quantity });
    }
    return inventory;
  }

  private sendTradeResponse(
    success: boolean,
    credits: number,
    cargo: CommodityInventory[],
    stationInventory: CommodityInventory[],
    message: string | undefined,
    address: string,
    port: number
  ): void {
    const response: TradeResponse = {
      success,
      playerCredits: credits,
      playerCargo: cargo,
      stationInventory,
      message
    };
    const encoded = encodeTradeResponse(response);
    this.sendUdpMessage(encoded, address, port);
  }

  private handlePing(data: Uint8Array, address: string, port: number): void {
    try {
      const timestamp = decodePing(data);
      const pong = encodePong(timestamp);
      this.sendUdpMessage(pong, address, port);
    } catch (err) {
      console.error('Ping error:', err);
    }
  }

  private handleDisconnect(address: string, port: number): void {
    const clientId = this.findClientId(address, port);
    if (clientId) {
      this.saveAllPlayers();
      this.clients.delete(clientId);
      console.log(`Client ${clientId} disconnected`);
    }
  }

  private findClientId(address: string, port: number): string | null {
    for (const [id, client] of this.clients) {
      if (client.address === address && client.port === port) {
        return id;
      }
    }
    return null;
  }

  private sendUdpMessage(data: Uint8Array, address: string, port: number): void {
    this.udpSocket.send(Buffer.from(data), port, address);
  }

  private startGameLoop(): void {
    this.lastTickTime = Date.now();

    this.snapshotInterval = setInterval(() => {
      this.sendSnapshots();
    }, SNAPSHOT_INTERVAL);

    setInterval(() => {
      this.sendOtherPlayerSnapshots();
    }, OTHER_SNAPSHOT_INTERVAL);

    this.economyInterval = setInterval(() => {
      this.updateEconomy();
    }, ECONOMY_TICK_INTERVAL);

    setInterval(() => {
      this.cleanupDisconnectedClients();
    }, 5000);

    setInterval(() => {
      this.saveAllPlayers();
    }, 60000);

    setInterval(() => {
      if (this.factionSystem) {
        this.factionSystem.update(FACTION_AI_INTERVAL);
      }
    }, FACTION_AI_INTERVAL);

    setInterval(() => {
      if (this.fleetSystem) {
        this.fleetSystem.cleanupExpiredInvites();
      }
    }, 10000);
  }

  private sendSnapshots(): void {
    this.snapshotSequence++;

    for (const [clientId, client] of this.clients) {
      if (!client.playerId) continue;

      const player = this.players.get(client.playerId);
      if (!player) continue;

      const snapshot: EntitySnapshot = {
        playerId: player.id,
        position: player.ship.position,
        velocity: player.ship.velocity,
        rotation: player.ship.rotation,
        angularVelocity: player.ship.angularVelocity,
        sequence: client.inputSequence,
        timestamp: Date.now(),
        fleetId: player.ship.fleetId,
        shield: player.ship.shield,
        factionId: player.ship.factionId
      };

      const encoded = encodeSnapshot(snapshot);
      
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(encoded);
        } catch (err) {
          console.error('Failed to send snapshot via WebSocket:', err);
        }
      } else {
        this.sendUdpMessage(encoded, client.address, client.port);
      }
    }
  }

  private sendOtherPlayerSnapshots(): void {
    for (const [playerId, player] of this.players) {
      for (const [clientId, client] of this.clients) {
        if (client.playerId === playerId || !client.ws) continue;

        const distance = vec2Distance(
          this.players.get(client.playerId!)?.ship.position || { x: 0, y: 0 },
          player.ship.position
        ) || 0;

        if (distance > MAX_RADAR_RANGE) continue;

        const snapshot: EntitySnapshot & { playerName: string } = {
          playerId: player.id,
          playerName: player.name,
          position: player.ship.position,
          velocity: player.ship.velocity,
          rotation: player.ship.rotation,
          angularVelocity: player.ship.angularVelocity,
          sequence: 0,
          timestamp: Date.now(),
          fleetId: player.ship.fleetId,
          shield: player.ship.shield,
          factionId: player.ship.factionId
        };

        const encoded = encodeOtherPlayerSnapshot(snapshot, player.name);
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(encoded);
          } catch (err) {
            console.error('Failed to send other snapshot:', err);
          }
        }
      }
    }
  }

  private updateEconomy(): void {
    const now = Date.now();
    const deltaTime = Math.min(now - this.lastTickTime, 2000);
    this.lastTickTime = now;

    for (const station of this.stations.values()) {
      EconomySystem.updateStationEconomy(station, deltaTime);
    }

    if (this.missionSystem) {
      this.missionSystem.update(deltaTime, now);
    }
  }

  private cleanupDisconnectedClients(): void {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.lastSeen > CLIENT_TIMEOUT) {
        this.handleClientDisconnect(id);
      }
    }
  }

  private async saveAllPlayers(): Promise<void> {
    for (const player of this.players.values()) {
      try {
        await database.savePlayerState({
          id: player.id,
          name: player.name,
          credits: player.ship.credits,
          positionX: player.ship.position.x,
          positionY: player.ship.position.y,
          rotation: player.ship.rotation,
          cargo: player.ship.currentCargo,
          currentStarId: player.ship.currentStarId,
          dockingStationId: player.ship.dockingStationId,
          updatedAt: new Date(),
          factionId: player.ship.factionId,
          reputation: this.playerReputation.get(player.id) || new Map()
        });
      } catch (err) {
        console.error(`Error saving player ${player.id}:`, err);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    if (this.economyInterval) clearInterval(this.economyInterval);
    
    await this.saveAllPlayers();
    this.udpSocket.close();
    await database.close();
    console.log('Server stopped');
  }
}
