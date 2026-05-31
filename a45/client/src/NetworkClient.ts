import {
  PlayerInput,
  EntitySnapshot,
  TradeRequest,
  TradeResponse,
  getMessageType,
  MessageType,
  encodeHello,
  encodeInput,
  encodeTradeRequest,
  encodePing,
  decodeHelloAck,
  decodeSnapshot,
  decodeTradeResponse,
  decodePong,
  encodeRadarScanRequest,
  decodeRadarScanResult,
  RadarContact,
  Fleet,
  Mission,
  FactionWarEvent,
  encodeFleetCreate,
  encodeFleetInvite,
  encodeFleetAccept,
  encodeFleetDecline,
  encodeFleetLeave,
  encodeFleetFormation,
  encodeMissionAccept,
  encodeMissionAbandon,
  decodeFleetState,
  decodeMissionList,
  decodeMissionUpdate,
  decodeFactionEvent,
  decodeOtherPlayerSnapshot,
  FleetFormation
} from '@space-trade/shared';
import { PendingInput, ClientPlayerState } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface NetworkStats {
  lastPing: number;
  averagePing: number;
  packetLossEstimate: number;
  consecutiveLost: number;
  recoveredSnapshots: number;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private host: string;
  private udpPort: number;
  private tcpPort: number;
  private playerId: string | null = null;
  private connected: boolean = false;
  private inputSequence: number = 0;
  private pendingInputs: PendingInput[] = [];
  private serverSnapshots: EntitySnapshot[] = [];
  
  private lastSnapshotSequence: number = 0;
  private snapshotGapCount: number = 0;
  private totalSnapshotsExpected: number = 0;
  private totalSnapshotsReceived: number = 0;
  
  private lastPingTimes: number[] = [];
  private networkStats: NetworkStats = {
    lastPing: 0,
    averagePing: 0,
    packetLossEstimate: 0,
    consecutiveLost: 0,
    recoveredSnapshots: 0
  };

  private readonly MAX_PENDING_INPUTS = 60;
  private readonly MAX_SNAPSHOT_HISTORY = 120;
  private readonly INPUT_HISTORY_TIMEOUT = 5000;
  
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onSnapshotCallback: ((snapshot: EntitySnapshot) => void) | null = null;
  private onTradeResponseCallback: ((response: TradeResponse) => void) | null = null;
  private onPingCallback: ((ping: number) => void) | null = null;
  private onNetworkStatsCallback: ((stats: NetworkStats) => void) | null = null;
  private onRadarResultCallback: ((result: { scanTime: number; contacts: RadarContact[] }) => void) | null = null;
  private onFleetStateCallback: ((fleet: Fleet | null) => void) | null = null;
  private onMissionListCallback: ((missions: Mission[]) => void) | null = null;
  private onMissionUpdateCallback: ((result: { mission: Mission; progress: number }) => void) | null = null;
  private onFactionEventCallback: ((event: FactionWarEvent) => void) | null = null;
  private onOtherPlayerSnapshotCallback: ((snapshot: EntitySnapshot & { playerName: string }) => void) | null = null;

  constructor(host: string, tcpPort: number, udpPort: number) {
    this.host = host;
    this.tcpPort = tcpPort;
    this.udpPort = udpPort;
  }

  async connect(playerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${this.host}:${this.tcpPort}/ws`;
        this.ws = new WebSocket(wsUrl);

        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          const hello = encodeHello(playerName);
          this.ws!.send(hello);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('Connection error'));
        };

        this.ws.onclose = () => {
          this.connected = false;
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
        };

        this.onConnectCallback = () => {
          this.connected = true;
          this.resetNetworkState();
          resolve(this.playerId!);
          this.startPingLoop();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private resetNetworkState(): void {
    this.lastSnapshotSequence = 0;
    this.snapshotGapCount = 0;
    this.totalSnapshotsExpected = 0;
    this.totalSnapshotsReceived = 0;
    this.lastPingTimes = [];
    this.pendingInputs = [];
    this.serverSnapshots = [];
    this.networkStats = {
      lastPing: 0,
      averagePing: 0,
      packetLossEstimate: 0,
      consecutiveLost: 0,
      recoveredSnapshots: 0
    };
  }

  private handleMessage(data: ArrayBuffer | Blob): void {
    if (data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        this.processMessage(new Uint8Array(reader.result as ArrayBuffer));
      };
      reader.readAsArrayBuffer(data);
    } else {
      this.processMessage(new Uint8Array(data));
    }
  }

  private processMessage(data: Uint8Array): void {
    const msgType = getMessageType(data);

    switch (msgType) {
      case MessageType.HELLO_ACK:
        const helloAck = decodeHelloAck(data);
        this.playerId = helloAck.playerId;
        if (this.onConnectCallback) {
          this.onConnectCallback();
        }
        break;

      case MessageType.SNAPSHOT:
        const snapshot = decodeSnapshot(data);
        this.handleSnapshot(snapshot);
        break;

      case MessageType.TRADE_RESPONSE:
        const response = decodeTradeResponse(data);
        if (this.onTradeResponseCallback) {
          this.onTradeResponseCallback(response);
        }
        break;

      case MessageType.PONG:
        const timestamp = decodePong(data);
        this.handlePong(timestamp);
        break;

      case MessageType.RADAR_SCAN_RESULT:
        const radarResult = decodeRadarScanResult(data);
        if (this.onRadarResultCallback) {
          this.onRadarResultCallback(radarResult);
        }
        break;

      case MessageType.FLEET_STATE:
        const fleetState = decodeFleetState(data);
        if (this.onFleetStateCallback) {
          this.onFleetStateCallback(fleetState);
        }
        break;

      case MessageType.MISSION_LIST:
        const missionList = decodeMissionList(data);
        if (this.onMissionListCallback) {
          this.onMissionListCallback(missionList);
        }
        break;

      case MessageType.MISSION_UPDATE:
        const missionUpdate = decodeMissionUpdate(data);
        if (this.onMissionUpdateCallback) {
          this.onMissionUpdateCallback(missionUpdate);
        }
        break;

      case MessageType.FACTION_EVENT:
        const factionEvent = decodeFactionEvent(data);
        if (this.onFactionEventCallback) {
          this.onFactionEventCallback(factionEvent);
        }
        break;

      case MessageType.OTHER_SNAPSHOT:
        const otherSnapshot = decodeOtherPlayerSnapshot(data);
        if (this.onOtherPlayerSnapshotCallback) {
          this.onOtherPlayerSnapshotCallback(otherSnapshot);
        }
        break;
    }
  }

  private handleSnapshot(snapshot: EntitySnapshot): void {
    this.totalSnapshotsReceived++;

    if (this.lastSnapshotSequence > 0 && snapshot.sequence > this.lastSnapshotSequence + 1) {
      const missedCount = snapshot.sequence - this.lastSnapshotSequence - 1;
      this.snapshotGapCount += missedCount;
      this.totalSnapshotsExpected += missedCount;
      
      if (missedCount >= 5) {
        console.warn(
          `[Network] Large snapshot gap: missed ${missedCount} snapshots ` +
          `(seq ${this.lastSnapshotSequence + 1} to ${snapshot.sequence - 1})`
        );
      }
    }

    this.totalSnapshotsExpected++;

    if (this.totalSnapshotsExpected > 0) {
      this.networkStats.packetLossEstimate = 
        (this.totalSnapshotsExpected - this.totalSnapshotsReceived) / this.totalSnapshotsExpected;
    }

    if (snapshot.sequence > this.lastSnapshotSequence) {
      this.networkStats.consecutiveLost = 0;
    }

    this.lastSnapshotSequence = Math.max(this.lastSnapshotSequence, snapshot.sequence);

    this.serverSnapshots.push(snapshot);
    if (this.serverSnapshots.length > this.MAX_SNAPSHOT_HISTORY) {
      this.serverSnapshots.shift();
    }

    this.pendingInputs = this.pendingInputs.filter(
      pending => pending.input.sequence > snapshot.sequence
    );

    this.cleanupOldInputs();

    if (this.onSnapshotCallback) {
      this.onSnapshotCallback(snapshot);
    }

    if (this.onNetworkStatsCallback) {
      this.onNetworkStatsCallback({ ...this.networkStats });
    }
  }

  private handlePong(timestamp: number): void {
    const ping = Date.now() - timestamp;
    this.networkStats.lastPing = ping;
    
    this.lastPingTimes.push(ping);
    if (this.lastPingTimes.length > 10) {
      this.lastPingTimes.shift();
    }
    
    if (this.lastPingTimes.length > 0) {
      this.networkStats.averagePing = 
        this.lastPingTimes.reduce((a, b) => a + b, 0) / this.lastPingTimes.length;
    }

    if (this.onPingCallback) {
      this.onPingCallback(ping);
    }
  }

  private cleanupOldInputs(): void {
    const now = Date.now();
    const cutoffTime = now - this.INPUT_HISTORY_TIMEOUT;
    
    const oldCount = this.pendingInputs.length;
    this.pendingInputs = this.pendingInputs.filter(
      pending => pending.timestamp > cutoffTime
    );
    
    if (oldCount !== this.pendingInputs.length) {
      console.debug(
        `[Network] Cleaned up ${oldCount - this.pendingInputs.length} old inputs`
      );
    }
  }

  sendInput(input: Omit<PlayerInput, 'playerId' | 'sequence' | 'timestamp'>): void {
    if (!this.connected || !this.playerId || !this.ws) return;

    this.inputSequence++;
    const now = Date.now();
    const fullInput: PlayerInput = {
      ...input,
      playerId: this.playerId,
      sequence: this.inputSequence,
      timestamp: now
    };

    this.pendingInputs.push({
      input: fullInput,
      timestamp: now
    });

    while (this.pendingInputs.length > this.MAX_PENDING_INPUTS) {
      const removed = this.pendingInputs.shift();
      if (removed) {
        console.debug(
          `[Network] Dropped old input (seq ${removed.input.sequence}) to maintain buffer size`
        );
      }
    }

    const encoded = encodeInput(fullInput);
    this.ws.send(encoded);
  }

  sendTradeRequest(request: Omit<TradeRequest, 'playerId' | 'timestamp'>): void {
    if (!this.connected || !this.playerId || !this.ws) return;

    const fullRequest: TradeRequest = {
      ...request,
      playerId: this.playerId,
      timestamp: Date.now()
    };

    const encoded = encodeTradeRequest(fullRequest);
    this.ws.send(encoded);
  }

  sendRadarScanRequest(range: number = 2000): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeRadarScanRequest(range);
    this.ws.send(encoded);
  }

  sendFleetCreate(name: string, formation: FleetFormation = 'single'): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetCreate(name, formation);
    this.ws.send(encoded);
  }

  sendFleetInvite(targetPlayerId: string, fleetId: string): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetInvite(targetPlayerId, fleetId);
    this.ws.send(encoded);
  }

  sendFleetAccept(fleetId: string): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetAccept(fleetId);
    this.ws.send(encoded);
  }

  sendFleetDecline(fleetId: string): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetDecline(fleetId);
    this.ws.send(encoded);
  }

  sendFleetLeave(): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetLeave();
    this.ws.send(encoded);
  }

  sendFleetFormation(formation: FleetFormation): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeFleetFormation(formation);
    this.ws.send(encoded);
  }

  sendMissionAccept(missionId: string): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeMissionAccept(missionId);
    this.ws.send(encoded);
  }

  sendMissionAbandon(missionId: string): void {
    if (!this.connected || !this.ws) return;
    const encoded = encodeMissionAbandon(missionId);
    this.ws.send(encoded);
  }

  private startPingLoop(): void {
    setInterval(() => {
      if (this.connected && this.ws) {
        const ping = encodePing(Date.now());
        this.ws.send(ping);
      }
    }, 3000);
  }

  getPendingInputs(): PendingInput[] {
    return [...this.pendingInputs];
  }

  getLatestSnapshot(): EntitySnapshot | null {
    return this.serverSnapshots.length > 0 
      ? this.serverSnapshots[this.serverSnapshots.length - 1] 
      : null;
  }

  getSnapshotsSince(sequence: number): EntitySnapshot[] {
    return this.serverSnapshots.filter(s => s.sequence > sequence);
  }

  getNetworkStats(): NetworkStats {
    return { ...this.networkStats };
  }

  getInputSequence(): number {
    return this.inputSequence;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  onSnapshot(callback: (snapshot: EntitySnapshot) => void): void {
    this.onSnapshotCallback = callback;
  }

  onTradeResponse(callback: (response: TradeResponse) => void): void {
    this.onTradeResponseCallback = callback;
  }

  onPing(callback: (ping: number) => void): void {
    this.onPingCallback = callback;
  }

  onNetworkStats(callback: (stats: NetworkStats) => void): void {
    this.onNetworkStatsCallback = callback;
  }

  onRadarResult(callback: (result: { scanTime: number; contacts: RadarContact[] }) => void): void {
    this.onRadarResultCallback = callback;
  }

  onFleetState(callback: (fleet: Fleet | null) => void): void {
    this.onFleetStateCallback = callback;
  }

  onMissionList(callback: (missions: Mission[]) => void): void {
    this.onMissionListCallback = callback;
  }

  onMissionUpdate(callback: (result: { mission: Mission; progress: number }) => void): void {
    this.onMissionUpdateCallback = callback;
  }

  onFactionEvent(callback: (event: FactionWarEvent) => void): void {
    this.onFactionEventCallback = callback;
  }

  onOtherPlayerSnapshot(callback: (snapshot: EntitySnapshot & { playerName: string }) => void): void {
    this.onOtherPlayerSnapshotCallback = callback;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.connected = false;
  }
}
