import './styles.css';
import { 
  CommodityType, 
  CommodityInventory, 
  EntitySnapshot, 
  getCommodity, 
  calculateCargoWeight,
  COMMODITIES,
  vec2Distance,
  RadarContact,
  Fleet,
  Mission,
  FactionWarEvent,
  FactionId,
  getFaction,
  FACTIONS,
  FleetFormation
} from '@space-trade/shared';
import { NetworkClient } from './NetworkClient';
import { GameRenderer } from './GameRenderer';
import { RoutePlanner } from './RoutePlanner';
import { ClientPhysics, PredictionBuffer, PhysicsState } from './ClientPhysics';
import { DebugOverlay } from './DebugOverlay';
import { ClientPlayerState, OtherPlayerState, GalaxyData, StarData, PlanetData, StationData } from './types';

const SERVER_HOST = 'localhost';
const TCP_PORT = 3000;
const UDP_PORT = 3001;

const MAX_SPEED = 200;
const MAX_ACCELERATION = 150;
const MAX_ANGULAR_SPEED = 3;
const CARGO_CAPACITY = 100;
const DEFAULT_SHIELD = 100;
const DEFAULT_FIREPOWER = 50;
const DEFAULT_FACTION: FactionId = 'independent';
const RADAR_SCAN_COOLDOWN = 3000;

const FACTION_NAMES: Record<FactionId, string> = {
  galactic_federation: 'Galactic Federation',
  pirate_kingdom: 'Pirate Kingdom',
  merchant_gilde: 'Merchant Gilde',
  independent: 'Independent'
};

const MISSION_TYPE_NAMES: Record<string, string> = {
  escort: 'Escort',
  raid: 'Raid',
  patrol: 'Patrol',
  deliver: 'Delivery'
};

const FORMATION_NAMES: Record<FleetFormation, string> = {
  single: 'Single',
  formation: 'Formation',
  defensive: 'Defensive',
  offensive: 'Offensive'
};

class GameClient {
  private network: NetworkClient;
  private renderer: GameRenderer;
  private routePlanner: RoutePlanner;

  private playerId: string | null = null;
  private playerState: ClientPlayerState | null = null;
  private galaxy: GalaxyData | null = null;

  private keys: Set<string> = new Set();
  private lastInputTime: number = 0;
  private lastFrameTime: number = 0;

  private throttle: number = 0;
  private turn: number = 0;

  private predictionBuffer: PredictionBuffer;
  private displayState: PhysicsState | null = null;
  private lastProcessedSnapshotSequence: number = 0;
  private consecutiveLargeErrors: number = 0;
  private lastCorrectionStrength: number = 0;
  private debugOverlay: DebugOverlay;

  private tradeUIOpen: boolean = false;
  private routeUIOpen: boolean = false;
  private radarUIOpen: boolean = false;
  private fleetUIOpen: boolean = false;
  private missionUIOpen: boolean = false;

  private radarContacts: RadarContact[] = [];
  private lastRadarScan: number = 0;
  private currentFleet: Fleet | null = null;
  private pendingFleetInvites: Fleet[] = [];
  private availableMissions: Mission[] = [];
  private activeMission: { mission: Mission; progress: number } | null = null;
  private factionEvents: FactionWarEvent[] = [];
  private otherPlayers: Map<string, OtherPlayerState> = new Map();

  constructor() {
    this.network = new NetworkClient(SERVER_HOST, TCP_PORT, UDP_PORT);
    this.renderer = new GameRenderer(document.getElementById('game-container')!);
    this.routePlanner = new RoutePlanner();
    this.predictionBuffer = ClientPhysics.createPredictionBuffer();
    this.debugOverlay = new DebugOverlay();
    this.debugOverlay.setNetworkClient(this.network);

    this.setupEventListeners();
    this.generateLocalGalaxy();
  }

  private setupEventListeners(): void {
    const connectBtn = document.getElementById('connect-btn');
    const playerNameInput = document.getElementById('player-name') as HTMLInputElement;

    connectBtn?.addEventListener('click', async () => {
      const name = playerNameInput?.value.trim() || 'Trader';
      await this.connect(name);
    });

    playerNameInput?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const name = playerNameInput.value.trim() || 'Trader';
        await this.connect(name);
      }
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      
      if (e.code === 'KeyE' && !this.tradeUIOpen && !this.fleetUIOpen && !this.missionUIOpen) {
        if (this.playerState?.dockingStationId) {
          this.openTradeUI();
        }
      } else if (e.code === 'KeyM' && !this.routeUIOpen && !this.fleetUIOpen && !this.missionUIOpen) {
        this.openRouteUI();
      } else if (e.code === 'KeyR' && !this.tradeUIOpen && !this.routeUIOpen && !this.fleetUIOpen && !this.missionUIOpen) {
        this.toggleRadarUI();
      } else if (e.code === 'KeyF' && !this.tradeUIOpen && !this.routeUIOpen && !this.missionUIOpen) {
        this.toggleFleetUI();
      } else if (e.code === 'KeyQ' && !this.tradeUIOpen && !this.routeUIOpen && !this.fleetUIOpen) {
        this.toggleMissionUI();
      } else if (e.code === 'Escape') {
        this.closeTradeUI();
        this.closeRouteUI();
        this.closeRadarUI();
        this.closeFleetUI();
        this.closeMissionUI();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.getElementById('close-trade')?.addEventListener('click', () => {
      this.closeTradeUI();
    });

    document.getElementById('close-route')?.addEventListener('click', () => {
      this.closeRouteUI();
    });

    document.getElementById('close-radar')?.addEventListener('click', () => {
      this.closeRadarUI();
    });

    document.getElementById('close-fleet')?.addEventListener('click', () => {
      this.closeFleetUI();
    });

    document.getElementById('close-mission')?.addEventListener('click', () => {
      this.closeMissionUI();
    });

    document.getElementById('scan-btn')?.addEventListener('click', () => {
      this.performRadarScan();
    });

    document.getElementById('create-fleet-btn')?.addEventListener('click', () => {
      this.createFleet();
    });

    document.getElementById('leave-fleet-btn')?.addEventListener('click', () => {
      this.leaveFleet();
    });

    const changeFormation = document.getElementById('change-formation') as HTMLSelectElement;
    changeFormation?.addEventListener('change', () => {
      if (changeFormation.value && this.currentFleet) {
        this.network.sendFleetFormation(changeFormation.value as FleetFormation);
      }
    });

    const commoditySelect = document.getElementById('route-commodity-select') as HTMLSelectElement;
    commoditySelect?.addEventListener('change', () => {
      this.updateRouteUI();
    });

    this.network.onSnapshot((snapshot) => {
      this.handleServerSnapshot(snapshot);
    });

    this.network.onTradeResponse((response) => {
      this.handleTradeResponse(response);
    });

    this.network.onRadarResult((result) => {
      this.handleRadarResult(result);
    });

    this.network.onFleetState((fleet) => {
      this.handleFleetState(fleet);
    });

    this.network.onMissionList((missions) => {
      this.handleMissionList(missions);
    });

    this.network.onMissionUpdate((update) => {
      this.handleMissionUpdate(update);
    });

    this.network.onFactionEvent((event) => {
      this.handleFactionEvent(event);
    });

    this.network.onOtherPlayerSnapshot((snapshot) => {
      this.handleOtherPlayerSnapshot(snapshot);
    });

    this.network.onDisconnect(() => {
      console.log('Disconnected from server');
      alert('Disconnected from server. Please refresh.');
    });
  }

  private generateLocalGalaxy(): void {
    const stars: StarData[] = [];
    const planets: PlanetData[] = [];
    const stations: StationData[] = [];

    const starCount = 15;
    const starColors = [0xFFD700, 0xFFFFFF, 0xADD8E6, 0xFFA500, 0xFF4500];
    const planetColors = [0x4A90D9, 0xD94A4A, 0x4AD94A, 0xD9A44A, 0x9A4AD9, 0x808080];

    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2;
      const radius = 500 + Math.random() * 1000;
      
      const star: StarData = {
        id: `star_${i}`,
        name: `Star ${String.fromCharCode(65 + i)}`,
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        },
        color: starColors[i % starColors.length],
        size: 25 + Math.random() * 25
      };
      stars.push(star);

      const planetCount = 2 + Math.floor(Math.random() * 3);
      for (let j = 0; j < planetCount; j++) {
        const orbitRadius = 100 + j * 100 + Math.random() * 50;
        const orbitAngle = Math.random() * Math.PI * 2;
        
        const planet: PlanetData = {
          id: `planet_${i}_${j}`,
          name: `${star.name}-${j + 1}`,
          starId: star.id,
          position: {
            x: star.position.x + Math.cos(orbitAngle) * orbitRadius,
            y: star.position.y + Math.sin(orbitAngle) * orbitRadius
          },
          radius: 12 + Math.random() * 20,
          color: planetColors[(i + j) % planetColors.length]
        };
        planets.push(planet);

        if (Math.random() > 0.5) {
          const stationAngle = Math.random() * Math.PI * 2;
          const stationDistance = planet.radius + 30;
          
          const station: StationData = {
            id: `station_${i}_${j}`,
            name: `${planet.name} Station`,
            position: {
              x: planet.position.x + Math.cos(stationAngle) * stationDistance,
              y: planet.position.y + Math.sin(stationAngle) * stationDistance
            },
            inventory: new Map(),
            buyPrices: new Map(),
            sellPrices: new Map(),
            maxInventory: new Map()
          };

          for (const commodity of COMMODITIES) {
            const maxInv = 50 + Math.floor(Math.random() * 150);
            const inventory = Math.floor(Math.random() * maxInv);
            const basePrice = commodity.basePrice;
            const variability = 0.5 + Math.random();
            
            station.inventory.set(commodity.type, inventory);
            station.buyPrices.set(commodity.type, Math.round(basePrice * variability));
            station.sellPrices.set(commodity.type, Math.round(basePrice * (1 / variability) * 0.9));
            station.maxInventory.set(commodity.type, maxInv);
          }

          stations.push(station);
        }
      }
    }

    this.galaxy = {
      seed: 42,
      stars,
      planets,
      stations
    };

    this.renderer.setGalaxy(this.galaxy);
    this.routePlanner.setGalaxy(this.galaxy);
  }

  async connect(playerName: string): Promise<void> {
    try {
      const errorDiv = document.getElementById('login-error');
      if (errorDiv) errorDiv.textContent = '';

      this.playerId = await this.network.connect(playerName);
      console.log(`Connected as ${playerName} (${this.playerId})`);

      document.getElementById('login-screen')?.classList.add('hidden');
      document.getElementById('hud')?.classList.remove('hidden');

      this.initializePlayer();
      this.startGameLoop();
    } catch (err) {
      console.error('Connection error:', err);
      const errorDiv = document.getElementById('login-error');
      if (errorDiv) {
        errorDiv.textContent = 'Failed to connect to server. Make sure the server is running.';
      }
    }
  }

  private initializePlayer(): void {
    this.playerState = {
      playerId: this.playerId!,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      angularVelocity: 0,
      credits: 10000,
      cargo: [],
      cargoCapacity: CARGO_CAPACITY,
      dockingStationId: null,
      factionId: DEFAULT_FACTION,
      shield: DEFAULT_SHIELD,
      maxShield: DEFAULT_SHIELD,
      firepower: DEFAULT_FIREPOWER,
      maxFirepower: DEFAULT_FIREPOWER
    };

    this.displayState = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      angularVelocity: 0
    };

    this.predictionBuffer.clear();
    this.lastProcessedSnapshotSequence = 0;
    this.consecutiveLargeErrors = 0;
    this.radarContacts = [];
    this.currentFleet = null;
    this.pendingFleetInvites = [];
    this.availableMissions = [];
    this.activeMission = null;
    this.factionEvents = [];
    this.otherPlayers.clear();

    this.renderer.createPlayerShip(this.playerId!, this.playerState);
    this.updateHUD();
  }

  private startGameLoop(): void {
    this.lastFrameTime = performance.now();
    this.gameLoop();
  }

  private gameLoop(): void {
    const now = performance.now();
    const deltaTime = Math.min(now - this.lastFrameTime, 50);
    this.lastFrameTime = now;

    this.updateInput();
    this.updatePhysics(deltaTime);
    this.sendInputToServer();
    this.updateDocking();
    this.updateHUD();

    if (this.playerState && this.displayState) {
      const renderState: ClientPlayerState = {
        ...this.playerState,
        position: this.displayState.position,
        velocity: this.displayState.velocity,
        rotation: this.displayState.rotation,
        angularVelocity: this.displayState.angularVelocity
      };
      this.renderer.updatePlayerShip(this.playerId!, renderState);
      this.renderer.updatePlayerState(renderState);
      this.renderer.setCameraTarget(this.displayState.position);

      this.debugOverlay.update(
        this.displayState.velocity,
        this.lastProcessedSnapshotSequence,
        this.lastCorrectionStrength
      );

      this.lastCorrectionStrength *= 0.9;
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  private updateInput(): void {
    this.throttle = 0;
    this.turn = 0;

    if (this.tradeUIOpen || this.routeUIOpen) {
      return;
    }

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.throttle = 1;
    }

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.turn = -1;
    } else if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.turn = 1;
    }
  }

  private updatePhysics(deltaTimeMs: number): void {
    if (!this.playerState) return;

    if (this.throttle > 0 || this.turn !== 0) {
      const predictedState = ClientPhysics.predictState(
        this.playerState,
        {
          playerId: this.playerId!,
          timestamp: Date.now(),
          throttle: this.throttle,
          turn: this.turn,
          fire: false,
          sequence: 0
        },
        deltaTimeMs,
        MAX_SPEED,
        MAX_ACCELERATION,
        MAX_ANGULAR_SPEED
      );

      this.playerState.position = predictedState.position;
      this.playerState.velocity = predictedState.velocity;
      this.playerState.rotation = predictedState.rotation;
      this.playerState.angularVelocity = predictedState.angularVelocity;
    }
  }

  private sendInputToServer(): void {
    const now = Date.now();
    if (now - this.lastInputTime < 50) return;
    this.lastInputTime = now;

    if (this.throttle > 0 || this.turn !== 0) {
      this.network.sendInput({
        throttle: this.throttle,
        turn: this.turn,
        fire: false
      });
    }
  }

  private updateDocking(): void {
    if (!this.playerState || !this.galaxy) return;

    let closestStation: StationData | null = null;
    let closestDistance = Infinity;

    for (const station of this.galaxy.stations) {
      const distance = vec2Distance(this.playerState.position, station.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestStation = station;
      }
    }

    const DOCKING_DISTANCE = 50;
    if (closestStation && closestDistance < DOCKING_DISTANCE) {
      if (this.playerState.dockingStationId !== closestStation.id) {
        this.playerState.dockingStationId = closestStation.id;
        this.playerState.velocity = { x: 0, y: 0 };
        this.playerState.position = { ...closestStation.position };
        console.log(`Docked at ${closestStation.name}`);
      }
    } else if (this.playerState.dockingStationId && closestDistance > DOCKING_DISTANCE * 1.5) {
      console.log('Undocked');
      this.playerState.dockingStationId = null;
    }
  }

  private handleServerSnapshot(snapshot: EntitySnapshot): void {
    if (!this.playerState || !this.displayState || snapshot.playerId !== this.playerId) {
      return;
    }

    if (snapshot.sequence <= this.lastProcessedSnapshotSequence) {
      return;
    }
    this.lastProcessedSnapshotSequence = snapshot.sequence;

    const reconciliationResult = ClientPhysics.reconcileWithServer(
      this.displayState,
      snapshot,
      this.network.getPendingInputs(),
      MAX_SPEED,
      MAX_ACCELERATION,
      MAX_ANGULAR_SPEED,
      Date.now()
    );

    if (reconciliationResult.positionError > 50) {
      this.consecutiveLargeErrors++;
      if (this.consecutiveLargeErrors > 5) {
        console.warn(
          `[Reconciliation] Persistent large error (${reconciliationResult.positionError.toFixed(1)}px). ` +
          `Consider reducing prediction speed or checking network latency.`
        );
        this.consecutiveLargeErrors = 0;
      }
    } else {
      this.consecutiveLargeErrors = Math.max(0, this.consecutiveLargeErrors - 1);
    }

    this.displayState = reconciliationResult.state;
    this.lastCorrectionStrength = reconciliationResult.correctionStrength;

    this.playerState.position = { ...reconciliationResult.state.position };
    this.playerState.velocity = { ...reconciliationResult.state.velocity };
    this.playerState.rotation = reconciliationResult.state.rotation;
    this.playerState.angularVelocity = reconciliationResult.state.angularVelocity;

    if (snapshot.shield !== undefined) {
      this.playerState.shield = snapshot.shield;
    }
    if (snapshot.factionId) {
      this.playerState.factionId = snapshot.factionId;
    }
    this.playerState.fleetId = snapshot.fleetId;
  }

  private handleTradeResponse(response: { success: boolean; playerCredits: number; playerCargo: CommodityInventory[]; stationInventory: CommodityInventory[]; message?: string }): void {
    if (!this.playerState) return;

    if (response.success) {
      this.playerState.credits = response.playerCredits;
      this.playerState.cargo = response.playerCargo;
      
      if (this.tradeUIOpen && this.playerState.dockingStationId) {
        this.updateTradeUI();
      }
      
      this.updateHUD();
    } else {
      alert(response.message || 'Trade failed');
    }
  }

  private updateHUD(): void {
    if (!this.playerState) return;

    const creditsDisplay = document.getElementById('credits-display');
    const cargoDisplay = document.getElementById('cargo-display');
    const shieldDisplay = document.getElementById('shield-display');
    const stationDisplay = document.getElementById('station-display');
    const factionDisplay = document.getElementById('faction-display');

    if (creditsDisplay) {
      creditsDisplay.textContent = `${Math.round(this.playerState.credits)} cr`;
    }

    if (cargoDisplay) {
      const currentWeight = calculateCargoWeight(this.playerState.cargo);
      cargoDisplay.textContent = `${currentWeight.toFixed(1)}/${this.playerState.cargoCapacity}`;
    }

    if (shieldDisplay) {
      shieldDisplay.textContent = `${Math.round(this.playerState.shield)}/${this.playerState.maxShield}`;
    }

    if (stationDisplay) {
      if (this.playerState.dockingStationId) {
        const station = this.galaxy?.stations.find(s => s.id === this.playerState?.dockingStationId);
        stationDisplay.textContent = station?.name || 'Docked';
      } else {
        stationDisplay.textContent = 'None';
      }
    }

    if (factionDisplay) {
      factionDisplay.textContent = FACTION_NAMES[this.playerState.factionId] || 'Unknown';
    }
  }

  private openTradeUI(): void {
    if (!this.playerState?.dockingStationId) return;
    
    this.tradeUIOpen = true;
    document.getElementById('trade-ui')?.classList.remove('hidden');
    this.updateTradeUI();
  }

  private closeTradeUI(): void {
    this.tradeUIOpen = false;
    document.getElementById('trade-ui')?.classList.add('hidden');
  }

  private updateTradeUI(): void {
    if (!this.playerState || !this.playerState.dockingStationId || !this.galaxy) return;

    const station = this.galaxy.stations.find(s => s.id === this.playerState!.dockingStationId);
    if (!station) return;

    const stationNameEl = document.getElementById('trade-station-name');
    if (stationNameEl) {
      stationNameEl.textContent = station.name;
    }

    const commodityList = document.getElementById('commodity-list');
    if (commodityList) {
      commodityList.innerHTML = '';

      for (const commodity of COMMODITIES) {
        const inventory = station.inventory.get(commodity.type) || 0;
        const buyPrice = station.buyPrices.get(commodity.type) || 0;
        const sellPrice = station.sellPrices.get(commodity.type) || 0;
        const maxInv = station.maxInventory.get(commodity.type) || 100;

        const itemEl = document.createElement('div');
        itemEl.className = 'commodity-item';
        itemEl.innerHTML = `
          <div class="commodity-info">
            <div class="commodity-name">${commodity.name}</div>
            <div class="commodity-stock">Stock: ${inventory}/${maxInv}</div>
            <div class="commodity-prices">
              <span class="price-buy">Buy: ${buyPrice} cr</span>
              <span class="price-sell">Sell: ${sellPrice} cr</span>
            </div>
          </div>
          <div class="commodity-actions">
            <input type="number" id="qty_${commodity.type}" value="1" min="1" max="100" />
            <button class="trade-btn buy-btn" data-commodity="${commodity.type}" data-action="buy">Buy</button>
            <button class="trade-btn sell-btn" data-commodity="${commodity.type}" data-action="sell">Sell</button>
          </div>
        `;

        commodityList.appendChild(itemEl);
      }

      commodityList.querySelectorAll('.trade-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.target as HTMLButtonElement;
          const commodity = target.dataset.commodity as CommodityType;
          const action = target.dataset.action;
          const qtyInput = document.getElementById(`qty_${commodity}`) as HTMLInputElement;
          const quantity = parseInt(qtyInput?.value || '1');

          if (action === 'buy') {
            this.executeTrade(commodity, quantity, true);
          } else {
            this.executeTrade(commodity, quantity, false);
          }
        });
      });
    }

    const playerCargoList = document.getElementById('player-cargo-list');
    if (playerCargoList) {
      playerCargoList.innerHTML = '';

      if (this.playerState.cargo.length === 0) {
        playerCargoList.innerHTML = '<div style="color: #666; padding: 10px;">Empty cargo</div>';
      } else {
        for (const item of this.playerState.cargo) {
          const commodity = getCommodity(item.type);
          const cargoItem = document.createElement('div');
          cargoItem.className = 'cargo-item';
          cargoItem.innerHTML = `
            <span>${commodity.name}</span>
            <span>${item.quantity} (${(item.quantity * commodity.weight).toFixed(1)}t)</span>
          `;
          playerCargoList.appendChild(cargoItem);
        }
      }
    }
  }

  private executeTrade(commodity: CommodityType, quantity: number, isBuy: boolean): void {
    if (!this.playerState?.dockingStationId) return;

    this.network.sendTradeRequest({
      stationId: this.playerState.dockingStationId,
      commodity,
      quantity,
      isBuy
    });
  }

  private openRouteUI(): void {
    this.routeUIOpen = true;
    document.getElementById('route-ui')?.classList.remove('hidden');
    this.initializeRouteUI();
    this.updateRouteUI();
  }

  private closeRouteUI(): void {
    this.routeUIOpen = false;
    document.getElementById('route-ui')?.classList.add('hidden');
  }

  private initializeRouteUI(): void {
    const commoditySelect = document.getElementById('route-commodity-select') as HTMLSelectElement;
    if (!commoditySelect) return;

    commoditySelect.innerHTML = '';
    for (const commodity of COMMODITIES) {
      const option = document.createElement('option');
      option.value = commodity.type;
      option.textContent = commodity.name;
      commoditySelect.appendChild(option);
    }
  }

  private updateRouteUI(): void {
    if (!this.playerState?.dockingStationId) {
      const routeInfo = document.getElementById('route-info');
      if (routeInfo) {
        routeInfo.innerHTML = '<p>You must be docked at a station to use the route planner</p>';
      }
      return;
    }

    const commoditySelect = document.getElementById('route-commodity-select') as HTMLSelectElement;
    const selectedCommodity = (commoditySelect?.value as CommodityType) || 'fuel';

    const routes = this.routePlanner.findBestTradeRoutes(
      this.playerState.dockingStationId,
      selectedCommodity
    );

    const stationRoutes = document.getElementById('station-routes');
    if (stationRoutes) {
      stationRoutes.innerHTML = '';

      const topRoutes = routes.slice(0, 5);
      
      topRoutes.forEach((route, index) => {
        const routeEl = document.createElement('div');
        routeEl.className = `route-item ${index === 0 ? 'best' : ''}`;
        routeEl.innerHTML = `
          <div class="route-station">${index === 0 ? '★ ' : ''}${route.stationName}</div>
          <div class="route-profits">
            <div>Buy at current station: ${route.buyPrice} cr</div>
            <div>Sell at destination: ${route.sellPrice} cr</div>
            <div class="route-profit ${route.profitPerUnit >= 0 ? 'positive' : 'negative'}">
              Profit: ${route.profitPerUnit >= 0 ? '+' : ''}${route.profitPerUnit} cr/unit
            </div>
            <div>Distance: ${Math.round(route.distance)} units</div>
          </div>
        `;
        stationRoutes.appendChild(routeEl);
      });
    }

    const bestCommodity = this.routePlanner.findMostProfitableCommodity(this.playerState.dockingStationId);
    const routeInfo = document.getElementById('route-info');
    if (routeInfo && bestCommodity) {
      const commodity = getCommodity(bestCommodity.commodity);
      routeInfo.innerHTML = `
        <p><strong>Most profitable commodity:</strong> ${commodity.name} (${bestCommodity.profit >= 0 ? '+' : ''}${bestCommodity.profit.toFixed(0)} cr/unit profit)</p>
      `;
    }
  }

  private toggleRadarUI(): void {
    if (this.radarUIOpen) {
      this.closeRadarUI();
    } else {
      this.openRadarUI();
    }
  }

  private openRadarUI(): void {
    this.radarUIOpen = true;
    document.getElementById('radar-panel')?.classList.remove('hidden');
    this.updateRadarUI();
  }

  private closeRadarUI(): void {
    this.radarUIOpen = false;
    document.getElementById('radar-panel')?.classList.add('hidden');
  }

  private performRadarScan(): void {
    const now = Date.now();
    if (now - this.lastRadarScan < RADAR_SCAN_COOLDOWN) {
      const remaining = Math.ceil((RADAR_SCAN_COOLDOWN - (now - this.lastRadarScan)) / 1000);
      this.setScanStatus(`Cooldown: ${remaining}s`);
      return;
    }

    this.lastRadarScan = now;
    this.setScanStatus('Scanning...');
    this.network.sendRadarScanRequest(2000);
  }

  private setScanStatus(status: string): void {
    const statusEl = document.getElementById('scan-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  private handleRadarResult(result: { scanTime: number; contacts: RadarContact[] }): void {
    this.radarContacts = result.contacts;
    this.setScanStatus(`Found ${result.contacts.length} contacts`);
    if (this.radarUIOpen) {
      this.updateRadarUI();
    }
  }

  private updateRadarUI(): void {
    const contactsEl = document.getElementById('radar-contacts');
    if (!contactsEl) return;

    if (this.radarContacts.length === 0) {
      contactsEl.innerHTML = '<div class="no-data">No contacts found</div>';
      return;
    }

    contactsEl.innerHTML = '';
    for (const contact of this.radarContacts) {
      const contactEl = document.createElement('div');
      contactEl.className = `radar-contact ${contact.relationship}`;
      
      const relationLabel = contact.relationship.charAt(0).toUpperCase() + contact.relationship.slice(1);
      
      contactEl.innerHTML = `
        <div class="contact-header">
          <span class="contact-name">${contact.name}</span>
          <span class="contact-relation ${contact.relationship}">${relationLabel}</span>
        </div>
        <div class="contact-details">
          <span><span>Faction:</span> ${FACTION_NAMES[contact.factionId] || contact.factionId}</span>
          <span><span>Distance:</span> ${Math.round(contact.distance)}</span>
          <span><span>Shield:</span> ${Math.round(contact.shield)}</span>
          ${contact.fleetId ? '<span><span>In Fleet:</span> Yes</span>' : ''}
        </div>
      `;
      contactsEl.appendChild(contactEl);
    }
  }

  private toggleFleetUI(): void {
    if (this.fleetUIOpen) {
      this.closeFleetUI();
    } else {
      this.openFleetUI();
    }
  }

  private openFleetUI(): void {
    this.fleetUIOpen = true;
    document.getElementById('fleet-ui')?.classList.remove('hidden');
    this.updateFleetUI();
  }

  private closeFleetUI(): void {
    this.fleetUIOpen = false;
    document.getElementById('fleet-ui')?.classList.add('hidden');
  }

  private handleFleetState(fleet: Fleet | null): void {
    this.currentFleet = fleet;
    if (fleet && this.playerState) {
      this.playerState.fleetId = fleet.id;
    } else if (this.playerState) {
      this.playerState.fleetId = undefined;
    }
    if (this.fleetUIOpen) {
      this.updateFleetUI();
    }
  }

  private updateFleetUI(): void {
    const fleetInfo = document.getElementById('fleet-info');
    const fleetMembers = document.getElementById('fleet-members');
    const leaveBtn = document.getElementById('leave-fleet-btn') as HTMLButtonElement;
    const formationSelect = document.getElementById('change-formation') as HTMLSelectElement;
    const inviteList = document.getElementById('invite-list');

    if (this.currentFleet) {
      if (fleetInfo) {
        fleetInfo.className = 'fleet-info active';
        const isLeader = this.currentFleet.leaderId === this.playerId;
        fleetInfo.innerHTML = `
          <strong>${this.currentFleet.name}</strong><br/>
          Formation: ${FORMATION_NAMES[this.currentFleet.formation]}<br/>
          Shared Shield: ${Math.round(this.currentFleet.sharedShield)}<br/>
          Shared Firepower: ${Math.round(this.currentFleet.sharedFirepower)}<br/>
          ${isLeader ? '<span style="color: #ffd700;">You are the leader</span>' : ''}
        `;
      }

      if (fleetMembers) {
        fleetMembers.innerHTML = '';
        for (const memberId of this.currentFleet.members) {
          const memberEl = document.createElement('div');
          const isLeader = memberId === this.currentFleet.leaderId;
          const isMe = memberId === this.playerId;
          memberEl.className = `fleet-member ${isLeader ? 'leader' : ''}`;
          memberEl.innerHTML = `
            <span>${isMe ? 'You' : memberId.substring(0, 8)}</span>
            ${isLeader ? '<span class="role">Leader</span>' : ''}
          `;
          fleetMembers.appendChild(memberEl);
        }
      }

      if (leaveBtn) leaveBtn.disabled = false;
      if (formationSelect) {
        formationSelect.disabled = this.currentFleet.leaderId !== this.playerId;
        formationSelect.value = this.currentFleet.formation;
      }
    } else {
      if (fleetInfo) {
        fleetInfo.className = 'fleet-info';
        fleetInfo.textContent = 'Not in a fleet';
      }
      if (fleetMembers) fleetMembers.innerHTML = '';
      if (leaveBtn) leaveBtn.disabled = true;
      if (formationSelect) formationSelect.disabled = true;
    }

    if (inviteList) {
      if (this.pendingFleetInvites.length === 0) {
        inviteList.innerHTML = 'No pending invites';
      } else {
        inviteList.innerHTML = '';
        for (const fleet of this.pendingFleetInvites) {
          const inviteEl = document.createElement('div');
          inviteEl.className = 'invite-item';
          inviteEl.innerHTML = `
            <div class="invite-info">
              <strong>${fleet.name}</strong><br/>
              Members: ${fleet.members.length}
            </div>
            <div class="invite-actions">
              <button class="action-btn" data-fleet="${fleet.id}" data-action="accept">Accept</button>
              <button class="action-btn danger" data-fleet="${fleet.id}" data-action="decline">Decline</button>
            </div>
          `;
          inviteList.appendChild(inviteEl);
        }

        inviteList.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            const fleetId = target.dataset.fleet!;
            const action = target.dataset.action;
            if (action === 'accept') {
              this.network.sendFleetAccept(fleetId);
              this.pendingFleetInvites = this.pendingFleetInvites.filter(f => f.id !== fleetId);
            } else {
              this.network.sendFleetDecline(fleetId);
              this.pendingFleetInvites = this.pendingFleetInvites.filter(f => f.id !== fleetId);
            }
            this.updateFleetUI();
          });
        });
      }
    }
  }

  private createFleet(): void {
    const nameInput = document.getElementById('fleet-name') as HTMLInputElement;
    const formationSelect = document.getElementById('fleet-formation') as HTMLSelectElement;
    const name = nameInput?.value.trim() || 'My Fleet';
    const formation = (formationSelect?.value as FleetFormation) || 'single';
    this.network.sendFleetCreate(name, formation);
  }

  private leaveFleet(): void {
    this.network.sendFleetLeave();
  }

  private toggleMissionUI(): void {
    if (this.missionUIOpen) {
      this.closeMissionUI();
    } else {
      this.openMissionUI();
    }
  }

  private openMissionUI(): void {
    this.missionUIOpen = true;
    document.getElementById('mission-ui')?.classList.remove('hidden');
    this.updateMissionUI();
  }

  private closeMissionUI(): void {
    this.missionUIOpen = false;
    document.getElementById('mission-ui')?.classList.add('hidden');
  }

  private handleMissionList(missions: Mission[]): void {
    this.availableMissions = missions;
    if (this.missionUIOpen) {
      this.updateMissionUI();
    }
  }

  private handleMissionUpdate(update: { mission: Mission; progress: number }): void {
    this.activeMission = update;
    if (this.missionUIOpen) {
      this.updateMissionUI();
    }
  }

  private handleFactionEvent(event: FactionWarEvent): void {
    this.factionEvents.unshift(event);
    if (this.factionEvents.length > 10) {
      this.factionEvents.pop();
    }
    if (this.missionUIOpen) {
      this.updateMissionUI();
    }
  }

  private updateMissionUI(): void {
    const activeMissionInfo = document.getElementById('active-mission-info');
    const missionListEl = document.getElementById('mission-list');
    const eventListEl = document.getElementById('event-list');

    if (activeMissionInfo) {
      if (this.activeMission) {
        const { mission, progress } = this.activeMission;
        activeMissionInfo.innerHTML = `
          <div class="mission-item ${mission.type}">
            <div class="mission-title">${mission.title}</div>
            <span class="mission-type ${mission.type}">${MISSION_TYPE_NAMES[mission.type] || mission.type}</span>
            <div class="mission-desc">${mission.description}</div>
            <div class="mission-rewards">
              <span class="reward credits">💰 ${mission.rewardCredits} cr</span>
              <span class="reward reputation">⭐ ${mission.rewardReputation} rep</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div style="margin-top: 8px; color: #aaa; font-size: 12px;">Progress: ${Math.round(progress)}%</div>
            <button class="action-btn danger" style="margin-top: 10px;" id="abandon-mission-btn">Abandon Mission</button>
          </div>
        `;
        
        setTimeout(() => {
          document.getElementById('abandon-mission-btn')?.addEventListener('click', () => {
            if (this.activeMission) {
              this.network.sendMissionAbandon(this.activeMission.mission.id);
              this.activeMission = null;
              this.updateMissionUI();
            }
          });
        }, 0);
      } else {
        activeMissionInfo.innerHTML = '<div class="no-data">No active mission</div>';
      }
    }

    if (missionListEl) {
      const available = this.availableMissions.filter(m => m.status === 'available');
      if (available.length === 0) {
        missionListEl.innerHTML = '<div class="no-data">No available missions</div>';
      } else {
        missionListEl.innerHTML = '';
        for (const mission of available.slice(0, 5)) {
          const missionEl = document.createElement('div');
          missionEl.className = `mission-item ${mission.type}`;
          missionEl.innerHTML = `
            <div class="mission-title">${mission.title}</div>
            <span class="mission-type ${mission.type}">${MISSION_TYPE_NAMES[mission.type] || mission.type}</span>
            <div class="mission-desc">${mission.description}</div>
            <div class="mission-rewards">
              <span class="reward credits">💰 ${mission.rewardCredits} cr</span>
              <span class="reward reputation">⭐ ${mission.rewardReputation} rep</span>
            </div>
            <div class="mission-footer">
              <span class="mission-faction">${FACTION_NAMES[mission.factionId] || mission.factionId}</span>
              <button class="action-btn" data-mission="${mission.id}">Accept</button>
            </div>
          `;
          missionListEl.appendChild(missionEl);
        }

        missionListEl.querySelectorAll('[data-mission]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const missionId = (e.target as HTMLButtonElement).dataset.mission!;
            if (!this.activeMission) {
              this.network.sendMissionAccept(missionId);
            }
          });
        });
      }
    }

    if (eventListEl) {
      if (this.factionEvents.length === 0) {
        eventListEl.innerHTML = 'No recent events';
      } else {
        eventListEl.innerHTML = '';
        for (const event of this.factionEvents) {
          const eventEl = document.createElement('div');
          eventEl.className = `event-item ${event.type}`;
          const eventTime = new Date().toLocaleTimeString();
          eventEl.innerHTML = `
            <div class="event-header">
              <span class="event-type">${event.type.toUpperCase()}</span>
              <span class="event-time">${eventTime}</span>
            </div>
            <div class="event-desc">${event.description}</div>
          `;
          eventListEl.appendChild(eventEl);
        }
      }
    }
  }

  private handleOtherPlayerSnapshot(snapshot: EntitySnapshot & { playerName: string }): void {
    const otherPlayer: OtherPlayerState = {
      playerId: snapshot.playerId,
      playerName: snapshot.playerName,
      position: { ...snapshot.position },
      velocity: { ...snapshot.velocity },
      rotation: snapshot.rotation,
      factionId: snapshot.factionId || 'independent',
      shield: snapshot.shield || 0,
      fleetId: snapshot.fleetId,
      lastSeen: Date.now()
    };
    this.otherPlayers.set(snapshot.playerId, otherPlayer);
  }
}

const client = new GameClient();
