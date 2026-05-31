import { 
  PlayerInput, 
  EntitySnapshot, 
  TradeRequest, 
  TradeResponse,
  CommodityType,
  CommodityInventory,
  Vec2,
  FactionId,
  FleetFormation,
  Fleet,
  Mission,
  MissionType,
  MissionStatus,
  RadarContact,
  RelationshipType,
  FactionWarEvent
} from './types';

export enum MessageType {
  HELLO = 0,
  HELLO_ACK = 1,
  INPUT = 2,
  SNAPSHOT = 3,
  TRADE_REQUEST = 4,
  TRADE_RESPONSE = 5,
  STATION_STATE = 6,
  GALAXY_DATA = 7,
  PING = 8,
  PONG = 9,
  DISCONNECT = 10,
  RADAR_SCAN_REQUEST = 11,
  RADAR_SCAN_RESULT = 12,
  FLEET_CREATE = 13,
  FLEET_INVITE = 14,
  FLEET_ACCEPT = 15,
  FLEET_DECLINE = 16,
  FLEET_LEAVE = 17,
  FLEET_KICK = 18,
  FLEET_FORMATION = 19,
  FLEET_STATE = 20,
  MISSION_LIST = 21,
  MISSION_ACCEPT = 22,
  MISSION_ABANDON = 23,
  MISSION_UPDATE = 24,
  MISSION_COMPLETE = 25,
  FACTION_EVENT = 26,
  PLAYER_STATE = 27,
  OTHER_SNAPSHOT = 28
}

export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor(initialSize: number = 2048) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  private ensureCapacity(size: number): void {
    if (this.offset + size > this.buffer.byteLength) {
      const newBuffer = new ArrayBuffer(Math.max(this.buffer.byteLength * 2, this.offset + size));
      const newView = new DataView(newBuffer);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer, 0, this.offset));
      this.buffer = newBuffer;
      this.view = newView;
    }
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeInt8(value: number): void {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset, value);
    this.offset += 1;
  }

  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeInt16(value: number): void {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
  }

  writeString(value: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    this.writeUint16(bytes.length);
    this.ensureCapacity(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.view.setUint8(this.offset + i, bytes[i]);
    }
    this.offset += bytes.length;
  }

  writeVec2(v: Vec2): void {
    this.writeFloat32(v.x);
    this.writeFloat32(v.y);
  }

  writeCommodityType(type: CommodityType): void {
    const typeMap: Record<CommodityType, number> = {
      fuel: 0,
      food: 1,
      minerals: 2,
      tech: 3,
      luxuries: 4,
      weapons: 5
    };
    this.writeUint8(typeMap[type]);
  }

  writeCargoInventory(inventory: CommodityInventory[]): void {
    this.writeUint8(inventory.length);
    for (const item of inventory) {
      this.writeCommodityType(item.type);
      this.writeUint16(item.quantity);
    }
  }

  writeFactionId(factionId: FactionId): void {
    const map: Record<FactionId, number> = {
      galactic_federation: 0,
      pirate_kingdom: 1,
      independent: 2,
      merchant_gilde: 3
    };
    this.writeUint8(map[factionId] ?? 2);
  }

  writeFleetFormation(formation: FleetFormation): void {
    const map: Record<FleetFormation, number> = {
      single: 0,
      formation: 1,
      defensive: 2,
      offensive: 3
    };
    this.writeUint8(map[formation] ?? 0);
  }

  writeMissionType(type: MissionType): void {
    const map: Record<MissionType, number> = {
      escort: 0,
      raid: 1,
      patrol: 2,
      deliver: 3
    };
    this.writeUint8(map[type] ?? 0);
  }

  writeMissionStatus(status: MissionStatus): void {
    const map: Record<MissionStatus, number> = {
      available: 0,
      active: 1,
      completed: 2,
      failed: 3,
      expired: 4
    };
    this.writeUint8(map[status] ?? 0);
  }

  writeRelationshipType(rel: RelationshipType): void {
    const map: Record<RelationshipType, number> = {
      enemy: 0,
      neutral: 1,
      ally: 2
    };
    this.writeUint8(map[rel] ?? 1);
  }

  writeMission(mission: Mission): void {
    this.writeString(mission.id);
    this.writeMissionType(mission.type);
    this.writeString(mission.title);
    this.writeString(mission.description);
    this.writeFactionId(mission.factionId);
    this.writeString(mission.targetStationId);
    if (mission.sourceStationId) {
      this.writeUint8(1);
      this.writeString(mission.sourceStationId);
    } else {
      this.writeUint8(0);
    }
    this.writeFloat64(mission.rewardCredits);
    this.writeInt32(mission.rewardReputation);
    if (mission.cargo) {
      this.writeUint8(1);
      this.writeCargoInventory(mission.cargo);
    } else {
      this.writeUint8(0);
    }
    this.writeUint8(mission.difficulty);
    if (mission.timeLimit) {
      this.writeUint8(1);
      this.writeUint32(mission.timeLimit);
    } else {
      this.writeUint8(0);
    }
    this.writeMissionStatus(mission.status);
    this.writeFloat64(mission.createdAt);
    if (mission.acceptedBy) {
      this.writeUint8(1);
      this.writeString(mission.acceptedBy);
    } else {
      this.writeUint8(0);
    }
    if (mission.completedAt) {
      this.writeUint8(1);
      this.writeFloat64(mission.completedAt);
    } else {
      this.writeUint8(0);
    }
  }

  writeRadarContact(contact: RadarContact): void {
    this.writeString(contact.playerId);
    this.writeString(contact.name);
    this.writeVec2(contact.position);
    this.writeVec2(contact.velocity);
    this.writeFactionId(contact.factionId);
    this.writeRelationshipType(contact.relationship);
    this.writeFloat32(contact.distance);
    this.writeFloat32(contact.shield);
    if (contact.fleetId) {
      this.writeUint8(1);
      this.writeString(contact.fleetId);
    } else {
      this.writeUint8(0);
    }
  }

  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  getLength(): number {
    return this.offset;
  }
}

export class BinaryReader {
  private view: DataView;
  private offset: number;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    if (buffer instanceof Uint8Array) {
      this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      this.view = new DataView(buffer);
    }
    this.offset = 0;
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8(): number {
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readString(): string {
    const length = this.readUint16();
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.view.getUint8(this.offset + i);
    }
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  readVec2(): Vec2 {
    return {
      x: this.readFloat32(),
      y: this.readFloat32()
    };
  }

  readCommodityType(): CommodityType {
    const value = this.readUint8();
    const typeMap: Record<number, CommodityType> = {
      0: 'fuel',
      1: 'food',
      2: 'minerals',
      3: 'tech',
      4: 'luxuries',
      5: 'weapons'
    };
    return typeMap[value] || 'fuel';
  }

  readCargoInventory(): CommodityInventory[] {
    const count = this.readUint8();
    const inventory: CommodityInventory[] = [];
    for (let i = 0; i < count; i++) {
      inventory.push({
        type: this.readCommodityType(),
        quantity: this.readUint16()
      });
    }
    return inventory;
  }

  readFactionId(): FactionId {
    const value = this.readUint8();
    const map: Record<number, FactionId> = {
      0: 'galactic_federation',
      1: 'pirate_kingdom',
      2: 'independent',
      3: 'merchant_gilde'
    };
    return map[value] || 'independent';
  }

  readFleetFormation(): FleetFormation {
    const value = this.readUint8();
    const map: Record<number, FleetFormation> = {
      0: 'single',
      1: 'formation',
      2: 'defensive',
      3: 'offensive'
    };
    return map[value] || 'single';
  }

  readMissionType(): MissionType {
    const value = this.readUint8();
    const map: Record<number, MissionType> = {
      0: 'escort',
      1: 'raid',
      2: 'patrol',
      3: 'deliver'
    };
    return map[value] || 'escort';
  }

  readMissionStatus(): MissionStatus {
    const value = this.readUint8();
    const map: Record<number, MissionStatus> = {
      0: 'available',
      1: 'active',
      2: 'completed',
      3: 'failed',
      4: 'expired'
    };
    return map[value] || 'available';
  }

  readRelationshipType(): RelationshipType {
    const value = this.readUint8();
    const map: Record<number, RelationshipType> = {
      0: 'enemy',
      1: 'neutral',
      2: 'ally'
    };
    return map[value] || 'neutral';
  }

  readMission(): Mission {
    const id = this.readString();
    const type = this.readMissionType();
    const title = this.readString();
    const description = this.readString();
    const factionId = this.readFactionId();
    const targetStationId = this.readString();
    
    const hasSource = this.readUint8() === 1;
    const sourceStationId = hasSource ? this.readString() : undefined;
    
    const rewardCredits = this.readFloat64();
    const rewardReputation = this.readInt32();
    
    const hasCargo = this.readUint8() === 1;
    const cargo = hasCargo ? this.readCargoInventory() : undefined;
    
    const difficulty = this.readUint8();
    
    const hasTimeLimit = this.readUint8() === 1;
    const timeLimit = hasTimeLimit ? this.readUint32() : undefined;
    
    const status = this.readMissionStatus();
    const createdAt = this.readFloat64();
    
    const hasAcceptedBy = this.readUint8() === 1;
    const acceptedBy = hasAcceptedBy ? this.readString() : undefined;
    
    const hasCompletedAt = this.readUint8() === 1;
    const completedAt = hasCompletedAt ? this.readFloat64() : undefined;

    return {
      id,
      type,
      title,
      description,
      factionId,
      targetStationId,
      sourceStationId,
      rewardCredits,
      rewardReputation,
      cargo,
      difficulty,
      timeLimit,
      status,
      createdAt,
      acceptedBy,
      completedAt
    };
  }

  readRadarContact(): RadarContact {
    const playerId = this.readString();
    const name = this.readString();
    const position = this.readVec2();
    const velocity = this.readVec2();
    const factionId = this.readFactionId();
    const relationship = this.readRelationshipType();
    const distance = this.readFloat32();
    const shield = this.readFloat32();
    const hasFleetId = this.readUint8() === 1;
    const fleetId = hasFleetId ? this.readString() : undefined;

    return {
      playerId,
      name,
      position,
      velocity,
      factionId,
      relationship,
      distance,
      shield,
      fleetId
    };
  }

  getOffset(): number {
    return this.offset;
  }

  getRemaining(): number {
    return this.view.byteLength - this.offset;
  }
}

export function encodeHello(playerName: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.HELLO);
  writer.writeString(playerName);
  return writer.getBuffer();
}

export function decodeHello(data: Uint8Array): { playerName: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.HELLO) throw new Error('Invalid HELLO message');
  return { playerName: reader.readString() };
}

export function encodeHelloAck(playerId: string, factionId: FactionId = 'independent'): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.HELLO_ACK);
  writer.writeString(playerId);
  writer.writeFactionId(factionId);
  return writer.getBuffer();
}

export function decodeHelloAck(data: Uint8Array): { playerId: string; factionId: FactionId } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.HELLO_ACK) throw new Error('Invalid HELLO_ACK message');
  const playerId = reader.readString();
  const factionId = reader.readFactionId();
  return { playerId, factionId };
}

export function encodeInput(input: PlayerInput): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.INPUT);
  writer.writeString(input.playerId);
  writer.writeFloat64(input.timestamp);
  writer.writeFloat32(input.throttle);
  writer.writeFloat32(input.turn);
  writer.writeUint8(input.fire ? 1 : 0);
  writer.writeUint32(input.sequence);
  return writer.getBuffer();
}

export function decodeInput(data: Uint8Array): PlayerInput {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.INPUT) throw new Error('Invalid INPUT message');
  return {
    playerId: reader.readString(),
    timestamp: reader.readFloat64(),
    throttle: reader.readFloat32(),
    turn: reader.readFloat32(),
    fire: reader.readUint8() === 1,
    sequence: reader.readUint32()
  };
}

export function encodeSnapshot(snapshot: EntitySnapshot): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.SNAPSHOT);
  writer.writeString(snapshot.playerId);
  writer.writeVec2(snapshot.position);
  writer.writeVec2(snapshot.velocity);
  writer.writeFloat32(snapshot.rotation);
  writer.writeFloat32(snapshot.angularVelocity);
  writer.writeUint32(snapshot.sequence);
  writer.writeFloat64(snapshot.timestamp);
  if (snapshot.fleetId) {
    writer.writeUint8(1);
    writer.writeString(snapshot.fleetId);
  } else {
    writer.writeUint8(0);
  }
  writer.writeFloat32(snapshot.shield);
  writer.writeFactionId(snapshot.factionId);
  return writer.getBuffer();
}

export function decodeSnapshot(data: Uint8Array): EntitySnapshot {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.SNAPSHOT) throw new Error('Invalid SNAPSHOT message');
  const playerId = reader.readString();
  const position = reader.readVec2();
  const velocity = reader.readVec2();
  const rotation = reader.readFloat32();
  const angularVelocity = reader.readFloat32();
  const sequence = reader.readUint32();
  const timestamp = reader.readFloat64();
  const hasFleetId = reader.readUint8() === 1;
  const fleetId = hasFleetId ? reader.readString() : undefined;
  const shield = reader.readFloat32();
  const factionId = reader.readFactionId();

  return {
    playerId,
    position,
    velocity,
    rotation,
    angularVelocity,
    sequence,
    timestamp,
    fleetId,
    shield,
    factionId
  };
}

export function encodeTradeRequest(request: TradeRequest): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.TRADE_REQUEST);
  writer.writeString(request.playerId);
  writer.writeString(request.stationId);
  writer.writeCommodityType(request.commodity);
  writer.writeUint16(request.quantity);
  writer.writeUint8(request.isBuy ? 1 : 0);
  writer.writeFloat64(request.timestamp);
  return writer.getBuffer();
}

export function decodeTradeRequest(data: Uint8Array): TradeRequest {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.TRADE_REQUEST) throw new Error('Invalid TRADE_REQUEST message');
  return {
    playerId: reader.readString(),
    stationId: reader.readString(),
    commodity: reader.readCommodityType(),
    quantity: reader.readUint16(),
    isBuy: reader.readUint8() === 1,
    timestamp: reader.readFloat64()
  };
}

export function encodeTradeResponse(response: TradeResponse): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.TRADE_RESPONSE);
  writer.writeUint8(response.success ? 1 : 0);
  writer.writeFloat64(response.playerCredits);
  writer.writeCargoInventory(response.playerCargo);
  writer.writeCargoInventory(response.stationInventory);
  if (response.message) {
    writer.writeUint8(1);
    writer.writeString(response.message);
  } else {
    writer.writeUint8(0);
  }
  return writer.getBuffer();
}

export function decodeTradeResponse(data: Uint8Array): TradeResponse {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.TRADE_RESPONSE) throw new Error('Invalid TRADE_RESPONSE message');
  
  const success = reader.readUint8() === 1;
  const playerCredits = reader.readFloat64();
  const playerCargo = reader.readCargoInventory();
  const stationInventory = reader.readCargoInventory();
  const hasMessage = reader.readUint8() === 1;
  const message = hasMessage ? reader.readString() : undefined;
  
  return {
    success,
    playerCredits,
    playerCargo,
    stationInventory,
    message
  };
}

export function encodeRadarScanRequest(range: number): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.RADAR_SCAN_REQUEST);
  writer.writeFloat32(range);
  return writer.getBuffer();
}

export function decodeRadarScanRequest(data: Uint8Array): { range: number } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.RADAR_SCAN_REQUEST) throw new Error('Invalid RADAR_SCAN_REQUEST message');
  return { range: reader.readFloat32() };
}

export function encodeRadarScanResult(contacts: RadarContact[], scanTime: number): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.RADAR_SCAN_RESULT);
  writer.writeFloat64(scanTime);
  writer.writeUint8(contacts.length);
  for (const contact of contacts) {
    writer.writeRadarContact(contact);
  }
  return writer.getBuffer();
}

export function decodeRadarScanResult(data: Uint8Array): { scanTime: number; contacts: RadarContact[] } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.RADAR_SCAN_RESULT) throw new Error('Invalid RADAR_SCAN_RESULT message');
  const scanTime = reader.readFloat64();
  const count = reader.readUint8();
  const contacts: RadarContact[] = [];
  for (let i = 0; i < count; i++) {
    contacts.push(reader.readRadarContact());
  }
  return { scanTime, contacts };
}

export function encodeFleetCreate(name: string, formation: FleetFormation): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_CREATE);
  writer.writeString(name);
  writer.writeFleetFormation(formation);
  return writer.getBuffer();
}

export function decodeFleetCreate(data: Uint8Array): { name: string; formation: FleetFormation } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_CREATE) throw new Error('Invalid FLEET_CREATE message');
  return {
    name: reader.readString(),
    formation: reader.readFleetFormation()
  };
}

export function encodeFleetInvite(targetPlayerId: string, fleetId: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_INVITE);
  writer.writeString(targetPlayerId);
  writer.writeString(fleetId);
  return writer.getBuffer();
}

export function decodeFleetInvite(data: Uint8Array): { targetPlayerId: string; fleetId: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_INVITE) throw new Error('Invalid FLEET_INVITE message');
  return {
    targetPlayerId: reader.readString(),
    fleetId: reader.readString()
  };
}

export function encodeFleetAccept(fleetId: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_ACCEPT);
  writer.writeString(fleetId);
  return writer.getBuffer();
}

export function decodeFleetAccept(data: Uint8Array): { fleetId: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_ACCEPT) throw new Error('Invalid FLEET_ACCEPT message');
  return { fleetId: reader.readString() };
}

export function encodeFleetDecline(fleetId: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_DECLINE);
  writer.writeString(fleetId);
  return writer.getBuffer();
}

export function decodeFleetDecline(data: Uint8Array): { fleetId: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_DECLINE) throw new Error('Invalid FLEET_DECLINE message');
  return { fleetId: reader.readString() };
}

export function encodeFleetLeave(): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_LEAVE);
  return writer.getBuffer();
}

export function decodeFleetLeave(data: Uint8Array): void {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_LEAVE) throw new Error('Invalid FLEET_LEAVE message');
}

export function encodeFleetFormation(formation: FleetFormation): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_FORMATION);
  writer.writeFleetFormation(formation);
  return writer.getBuffer();
}

export function decodeFleetFormation(data: Uint8Array): { formation: FleetFormation } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_FORMATION) throw new Error('Invalid FLEET_FORMATION message');
  return { formation: reader.readFleetFormation() };
}

export function encodeFleetState(fleet: Fleet | null): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FLEET_STATE);
  if (fleet) {
    writer.writeUint8(1);
    writer.writeString(fleet.id);
    writer.writeString(fleet.leaderId);
    writer.writeString(fleet.name);
    writer.writeFleetFormation(fleet.formation);
    writer.writeFloat64(fleet.createdAt);
    writer.writeFloat32(fleet.sharedShield);
    writer.writeFloat32(fleet.sharedFirepower);
    writer.writeUint8(fleet.members.length);
    for (const member of fleet.members) {
      writer.writeString(member);
    }
  } else {
    writer.writeUint8(0);
  }
  return writer.getBuffer();
}

export function decodeFleetState(data: Uint8Array): Fleet | null {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FLEET_STATE) throw new Error('Invalid FLEET_STATE message');
  
  const hasFleet = reader.readUint8() === 1;
  if (!hasFleet) return null;

  const id = reader.readString();
  const leaderId = reader.readString();
  const name = reader.readString();
  const formation = reader.readFleetFormation();
  const createdAt = reader.readFloat64();
  const sharedShield = reader.readFloat32();
  const sharedFirepower = reader.readFloat32();
  const memberCount = reader.readUint8();
  const members: string[] = [];
  for (let i = 0; i < memberCount; i++) {
    members.push(reader.readString());
  }

  return {
    id,
    leaderId,
    members,
    formation,
    name,
    createdAt,
    sharedShield,
    sharedFirepower
  };
}

export function encodeMissionList(missions: Mission[]): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.MISSION_LIST);
  writer.writeUint8(missions.length);
  for (const mission of missions) {
    writer.writeMission(mission);
  }
  return writer.getBuffer();
}

export function decodeMissionList(data: Uint8Array): Mission[] {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.MISSION_LIST) throw new Error('Invalid MISSION_LIST message');
  const count = reader.readUint8();
  const missions: Mission[] = [];
  for (let i = 0; i < count; i++) {
    missions.push(reader.readMission());
  }
  return missions;
}

export function encodeMissionAccept(missionId: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.MISSION_ACCEPT);
  writer.writeString(missionId);
  return writer.getBuffer();
}

export function decodeMissionAccept(data: Uint8Array): { missionId: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.MISSION_ACCEPT) throw new Error('Invalid MISSION_ACCEPT message');
  return { missionId: reader.readString() };
}

export function encodeMissionAbandon(missionId: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.MISSION_ABANDON);
  writer.writeString(missionId);
  return writer.getBuffer();
}

export function decodeMissionAbandon(data: Uint8Array): { missionId: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.MISSION_ABANDON) throw new Error('Invalid MISSION_ABANDON message');
  return { missionId: reader.readString() };
}

export function encodeMissionUpdate(mission: Mission, progress: number): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.MISSION_UPDATE);
  writer.writeMission(mission);
  writer.writeUint8(progress);
  return writer.getBuffer();
}

export function decodeMissionUpdate(data: Uint8Array): { mission: Mission; progress: number } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.MISSION_UPDATE) throw new Error('Invalid MISSION_UPDATE message');
  const mission = reader.readMission();
  const progress = reader.readUint8();
  return { mission, progress };
}

export function encodeFactionEvent(
  event: FactionWarEvent
): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.FACTION_EVENT);
  writer.writeString(event.id);
  const typeMap: Record<string, number> = {
    war_declared: 0,
    battle: 1,
    control_change: 2,
    ceasefire: 3
  };
  writer.writeUint8(typeMap[event.type] ?? 1);
  writer.writeFloat64(event.timestamp);
  writer.writeFactionId(event.factionA);
  if (event.factionB) {
    writer.writeUint8(1);
    writer.writeFactionId(event.factionB);
  } else {
    writer.writeUint8(0);
  }
  writer.writeVec2(event.location);
  writer.writeString(event.description);
  return writer.getBuffer();
}

export function decodeFactionEvent(data: Uint8Array): FactionWarEvent {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.FACTION_EVENT) throw new Error('Invalid FACTION_EVENT message');
  
  const id = reader.readString();
  const eventTypeNum = reader.readUint8();
  const typeMap: Record<number, FactionWarEvent['type']> = {
    0: 'war_declared',
    1: 'battle',
    2: 'control_change',
    3: 'ceasefire'
  };
  const eventType = typeMap[eventTypeNum] ?? 'battle';
  const timestamp = reader.readFloat64();
  
  const factionA = reader.readFactionId();
  const hasFactionB = reader.readUint8() === 1;
  const factionB = hasFactionB ? reader.readFactionId() : undefined;
  const location = reader.readVec2();
  const description = reader.readString();

  return {
    id,
    type: eventType,
    timestamp,
    factionA,
    factionB,
    location,
    description
  };
}

export function encodeOtherPlayerSnapshot(snapshot: EntitySnapshot, playerName: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.OTHER_SNAPSHOT);
  writer.writeString(snapshot.playerId);
  writer.writeString(playerName);
  writer.writeVec2(snapshot.position);
  writer.writeVec2(snapshot.velocity);
  writer.writeFloat32(snapshot.rotation);
  writer.writeFloat32(snapshot.angularVelocity);
  writer.writeFloat64(snapshot.timestamp);
  if (snapshot.fleetId) {
    writer.writeUint8(1);
    writer.writeString(snapshot.fleetId);
  } else {
    writer.writeUint8(0);
  }
  writer.writeFloat32(snapshot.shield);
  writer.writeFactionId(snapshot.factionId);
  return writer.getBuffer();
}

export function decodeOtherPlayerSnapshot(data: Uint8Array): EntitySnapshot & { playerName: string } {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.OTHER_SNAPSHOT) throw new Error('Invalid OTHER_SNAPSHOT message');
  
  const playerId = reader.readString();
  const playerName = reader.readString();
  const position = reader.readVec2();
  const velocity = reader.readVec2();
  const rotation = reader.readFloat32();
  const angularVelocity = reader.readFloat32();
  const timestamp = reader.readFloat64();
  const hasFleetId = reader.readUint8() === 1;
  const fleetId = hasFleetId ? reader.readString() : undefined;
  const shield = reader.readFloat32();
  const factionId = reader.readFactionId();

  return {
    playerId,
    playerName,
    position,
    velocity,
    rotation,
    angularVelocity,
    sequence: 0,
    timestamp,
    fleetId,
    shield,
    factionId
  };
}

export function encodePing(timestamp: number): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.PING);
  writer.writeFloat64(timestamp);
  return writer.getBuffer();
}

export function decodePing(data: Uint8Array): number {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.PING) throw new Error('Invalid PING message');
  return reader.readFloat64();
}

export function encodePong(timestamp: number): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MessageType.PONG);
  writer.writeFloat64(timestamp);
  return writer.getBuffer();
}

export function decodePong(data: Uint8Array): number {
  const reader = new BinaryReader(data);
  const type = reader.readUint8();
  if (type !== MessageType.PONG) throw new Error('Invalid PONG message');
  return reader.readFloat64();
}

export function getMessageType(data: Uint8Array): MessageType {
  if (data.length < 1) throw new Error('Empty message');
  return data[0] as MessageType;
}
