import { 
  Vec2, 
  CommodityType, 
  CommodityInventory,
  EntitySnapshot,
  PlayerInput,
  TradeResponse,
  RadarContact,
  Fleet,
  Mission,
  FactionId,
  FactionWarEvent
} from '@space-trade/shared';

export interface ClientPlayerState {
  playerId: string;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  angularVelocity: number;
  credits: number;
  cargo: CommodityInventory[];
  cargoCapacity: number;
  dockingStationId: string | null;
  factionId: FactionId;
  shield: number;
  maxShield: number;
  firepower: number;
  maxFirepower: number;
  fleetId?: string;
}

export interface OtherPlayerState {
  playerId: string;
  playerName: string;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  factionId: FactionId;
  shield: number;
  fleetId?: string;
  lastSeen: number;
}

export interface StationData {
  id: string;
  name: string;
  position: Vec2;
  inventory: Map<CommodityType, number>;
  buyPrices: Map<CommodityType, number>;
  sellPrices: Map<CommodityType, number>;
  maxInventory: Map<CommodityType, number>;
}

export interface StarData {
  id: string;
  name: string;
  position: Vec2;
  color: number;
  size: number;
}

export interface PlanetData {
  id: string;
  name: string;
  starId: string;
  position: Vec2;
  radius: number;
  color: number;
}

export interface GalaxyData {
  seed: number;
  stars: StarData[];
  planets: PlanetData[];
  stations: StationData[];
}

export interface PendingInput {
  input: PlayerInput;
  timestamp: number;
}

export interface NetworkClientConfig {
  host: string;
  port: number;
}
