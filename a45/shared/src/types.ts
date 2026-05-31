export interface Vec2 {
  x: number;
  y: number;
}

export type CommodityType = 'fuel' | 'food' | 'minerals' | 'tech' | 'luxuries' | 'weapons';

export interface Commodity {
  type: CommodityType;
  name: string;
  basePrice: number;
  weight: number;
}

export interface CommodityInventory {
  type: CommodityType;
  quantity: number;
}

export type FactionId = 'galactic_federation' | 'pirate_kingdom' | 'independent' | 'merchant_gilde';

export interface Faction {
  id: FactionId;
  name: string;
  color: number;
  friendlyFactions: FactionId[];
  hostileFactions: FactionId[];
  controlledStarIds: string[];
  militaryStrength: number;
  influence: number;
  stance: FactionStance;
}

export type FactionStance = 'peaceful' | 'neutral' | 'aggressive' | 'war';

export interface FactionRelation {
  factionId: FactionId;
  targetFactionId: FactionId;
  relation: number;
}

export interface Reputation {
  factionId: FactionId;
  score: number;
  rank: ReputationRank;
}

export type ReputationRank = 'hated' | 'hostile' | 'neutral' | 'friendly' | 'honored' | 'exalted';

export type RelationshipType = 'enemy' | 'neutral' | 'ally';

export interface Star {
  id: string;
  position: Vec2;
  color: number;
  size: number;
  name: string;
  controllingFaction?: FactionId;
  militaryPresence: number;
}

export interface Planet {
  id: string;
  starId: string;
  position: Vec2;
  radius: number;
  color: number;
  name: string;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
}

export interface Station {
  id: string;
  planetId: string;
  starId: string;
  position: Vec2;
  name: string;
  inventory: Map<CommodityType, number>;
  basePrices: Map<CommodityType, number>;
  buyPrices: Map<CommodityType, number>;
  sellPrices: Map<CommodityType, number>;
  maxInventory: Map<CommodityType, number>;
  productionRates: Map<CommodityType, number>;
  consumptionRates: Map<CommodityType, number>;
  lastPriceUpdate: number;
  factionId: FactionId;
}

export interface Galaxy {
  seed: number;
  stars: Star[];
  planets: Planet[];
  stations: Station[];
  factions: Faction[];
}

export type FleetId = string;

export interface Fleet {
  id: FleetId;
  leaderId: string;
  members: string[];
  formation: FleetFormation;
  name: string;
  createdAt: number;
  sharedShield: number;
  sharedFirepower: number;
}

export type FleetFormation = 'single' | 'formation' | 'defensive' | 'offensive';

export interface FleetMember {
  playerId: string;
  formationOffset: Vec2;
  position: Vec2;
  velocity: Vec2;
  shield: number;
  firepower: number;
}

export type MissionId = string;
export type MissionType = 'escort' | 'raid' | 'patrol' | 'deliver';
export type MissionStatus = 'available' | 'active' | 'completed' | 'failed' | 'expired';

export interface Mission {
  id: MissionId;
  type: MissionType;
  title: string;
  description: string;
  factionId: FactionId;
  targetStationId: string;
  sourceStationId?: string;
  rewardCredits: number;
  rewardReputation: number;
  cargo?: CommodityInventory[];
  difficulty: number;
  timeLimit?: number;
  status: MissionStatus;
  createdAt: number;
  acceptedBy?: string;
  completedAt?: number;
}

export interface ActiveMission {
  missionId: MissionId;
  playerId: string;
  progress: number;
  startTime: number;
  lastUpdate: number;
}

export interface PlayerShip {
  id: string;
  playerId: string;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  angularVelocity: number;
  currentStarId: string | null;
  dockingStationId: string | null;
  maxSpeed: number;
  maxAcceleration: number;
  maxAngularSpeed: number;
  cargoCapacity: number;
  currentCargo: CommodityInventory[];
  credits: number;
  factionId: FactionId;
  fleetId?: FleetId;
  shield: number;
  maxShield: number;
  firepower: number;
  maxFirepower: number;
}

export interface PlayerState {
  id: string;
  name: string;
  ship: PlayerShip;
  lastUpdate: number;
  reputation: Map<FactionId, Reputation>;
  activeMissionIds: MissionId[];
}

export interface PlayerInput {
  playerId: string;
  timestamp: number;
  throttle: number;
  turn: number;
  fire: boolean;
  sequence: number;
}

export interface EntitySnapshot {
  playerId: string;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  angularVelocity: number;
  sequence: number;
  timestamp: number;
  fleetId?: FleetId;
  shield: number;
  factionId: FactionId;
}

export interface TradeRequest {
  playerId: string;
  stationId: string;
  commodity: CommodityType;
  quantity: number;
  isBuy: boolean;
  timestamp: number;
}

export interface TradeResponse {
  success: boolean;
  playerCredits: number;
  playerCargo: CommodityInventory[];
  stationInventory: CommodityInventory[];
  message?: string;
}

export interface WorldState {
  tick: number;
  timestamp: number;
  players: Map<string, PlayerState>;
  stations: Station[];
  factions: Faction[];
  fleets: Map<FleetId, Fleet>;
  missions: Map<MissionId, Mission>;
}

export interface TradeHistoryEntry {
  id: string;
  playerId: string;
  stationId: string;
  commodity: CommodityType;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
  isBuy: boolean;
  timestamp: number;
}

export interface SavedPlayerState {
  id: string;
  name: string;
  credits: number;
  positionX: number;
  positionY: number;
  rotation: number;
  cargo: CommodityInventory[];
  currentStarId: string | null;
  dockingStationId: string | null;
  updatedAt: Date;
  factionId: FactionId;
  reputation: Map<FactionId, number>;
}

export interface RadarContact {
  playerId: string;
  name: string;
  position: Vec2;
  velocity: Vec2;
  factionId: FactionId;
  relationship: RelationshipType;
  distance: number;
  shield: number;
  fleetId?: FleetId;
}

export interface RadarScan {
  scanTime: number;
  contacts: RadarContact[];
  range: number;
}

export interface FactionWarEvent {
  id: string;
  type: 'war_declared' | 'battle' | 'control_change' | 'ceasefire';
  timestamp: number;
  factionA: FactionId;
  factionB?: FactionId;
  location: Vec2;
  description: string;
}

export const COMMODITIES: Commodity[] = [
  { type: 'fuel', name: 'Fuel', basePrice: 100, weight: 1 },
  { type: 'food', name: 'Food', basePrice: 50, weight: 0.5 },
  { type: 'minerals', name: 'Minerals', basePrice: 200, weight: 2 },
  { type: 'tech', name: 'Technology', basePrice: 500, weight: 0.25 },
  { type: 'luxuries', name: 'Luxuries', basePrice: 1000, weight: 0.1 },
  { type: 'weapons', name: 'Weapons', basePrice: 750, weight: 1.5 }
];

export const FACTIONS: Faction[] = [
  {
    id: 'galactic_federation',
    name: 'Galactic Federation',
    color: 0x4A90D9,
    friendlyFactions: ['merchant_gilde'],
    hostileFactions: ['pirate_kingdom'],
    controlledStarIds: [],
    militaryStrength: 1000,
    influence: 0.5,
    stance: 'neutral'
  },
  {
    id: 'pirate_kingdom',
    name: 'Pirate Kingdom',
    color: 0xD94A4A,
    friendlyFactions: [],
    hostileFactions: ['galactic_federation', 'merchant_gilde'],
    controlledStarIds: [],
    militaryStrength: 600,
    influence: 0.2,
    stance: 'aggressive'
  },
  {
    id: 'merchant_gilde',
    name: 'Merchant Guild',
    color: 0x4AD94A,
    friendlyFactions: ['galactic_federation'],
    hostileFactions: ['pirate_kingdom'],
    controlledStarIds: [],
    militaryStrength: 300,
    influence: 0.3,
    stance: 'peaceful'
  },
  {
    id: 'independent',
    name: 'Independent',
    color: 0x9A4AD9,
    friendlyFactions: [],
    hostileFactions: [],
    controlledStarIds: [],
    militaryStrength: 100,
    influence: 0.0,
    stance: 'neutral'
  }
];

export function getCommodity(type: CommodityType): Commodity {
  const c = COMMODITIES.find(cc => cc.type === type);
  if (!c) throw new Error(`Unknown commodity type: ${type}`);
  return c;
}

export function calculateCargoWeight(cargo: CommodityInventory[]): number {
  return cargo.reduce((sum, item) => {
    const c = getCommodity(item.type);
    return sum + (item.quantity * c.weight);
  }, 0);
}

export function getFaction(id: FactionId): Faction {
  const f = FACTIONS.find(ff => ff.id === id);
  if (!f) return FACTIONS[3];
  return f;
}

export function getReputationRank(score: number): ReputationRank {
  if (score <= -500) return 'hated';
  if (score <= -200) return 'hostile';
  if (score < 200) return 'neutral';
  if (score < 500) return 'friendly';
  if (score < 1000) return 'honored';
  return 'exalted';
}

export function getRelationship(
  playerFaction: FactionId,
  targetFaction: FactionId,
  playerReputation: number = 0
): RelationshipType {
  const playerFact = getFaction(playerFaction);
  const targetFact = getFaction(targetFaction);

  if (playerReputation <= -300) return 'enemy';
  if (playerReputation >= 300 && playerFaction !== 'independent') return 'ally';

  if (playerFact.hostileFactions.includes(targetFaction)) return 'enemy';
  if (playerFact.friendlyFactions.includes(targetFaction)) return 'ally';

  if (targetFact.hostileFactions.includes(playerFaction)) return 'enemy';
  if (targetFact.friendlyFactions.includes(playerFaction)) return 'ally';

  return 'neutral';
}

export function getFleetFormationOffsets(formation: FleetFormation, memberCount: number): Vec2[] {
  const offsets: Vec2[] = [];
  const spacing = 60;

  switch (formation) {
    case 'formation':
      for (let i = 0; i < memberCount; i++) {
        const row = Math.floor(Math.sqrt(i));
        const col = i - row * row;
        offsets.push({
          x: (col - row * 0.5) * spacing,
          y: row * spacing
        });
      }
      break;

    case 'defensive':
      const defenseAngle = (Math.PI * 2) / Math.max(memberCount, 1);
      for (let i = 0; i < memberCount; i++) {
        const angle = defenseAngle * i;
        offsets.push({
          x: Math.cos(angle) * spacing * 1.5,
          y: Math.sin(angle) * spacing * 1.5
        });
      }
      break;

    case 'offensive':
      for (let i = 0; i < memberCount; i++) {
        offsets.push({
          x: (i - memberCount / 2) * spacing * 0.7,
          y: -Math.abs(i - memberCount / 2) * spacing * 0.5
        });
      }
      break;

    case 'single':
    default:
      for (let i = 0; i < memberCount; i++) {
        offsets.push({
          x: (i % 3 - 1) * spacing,
          y: Math.floor(i / 3) * spacing
        });
      }
      break;
  }

  return offsets;
}
