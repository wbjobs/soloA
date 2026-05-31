import {
  Fleet,
  FleetId,
  FleetFormation,
  PlayerState,
  getFleetFormationOffsets,
  vec2Add,
  vec2Sub,
  vec2Scale
} from '@space-trade/shared';
import { v4 as uuidv4 } from 'uuid';

interface FleetState {
  fleet: Fleet;
  invites: Map<string, number>;
}

export class FleetSystem {
  private fleets: Map<FleetId, FleetState> = new Map();
  private playerFleetMap: Map<string, FleetId> = new Map();
  private fleetListeners: ((fleet: Fleet | null) => void)[] = [];
  private globalFleetListeners: ((fleets: Fleet[]) => void)[] = [];

  private readonly MAX_FLEET_SIZE = 8;
  private readonly INVITE_TIMEOUT = 30000;
  private readonly SHIELD_SHARING_RATIO = 0.5;
  private readonly FIREPOWER_SHARING_RATIO = 0.3;

  createFleet(
    leader: PlayerState, 
    name: string, 
    formation: FleetFormation = 'single',
    getPlayer: (id: string) => PlayerState | undefined = (id) => undefined
  ): Fleet | null {
    if (this.playerFleetMap.has(leader.id)) {
      return null;
    }

    const fleetId: FleetId = uuidv4();
    const fleet: Fleet = {
      id: fleetId,
      leaderId: leader.id,
      members: [leader.id],
      formation,
      name,
      createdAt: Date.now(),
      sharedShield: 0,
      sharedFirepower: 0
    };

    this.fleets.set(fleetId, {
      fleet,
      invites: new Map()
    });

    this.playerFleetMap.set(leader.id, fleetId);
    leader.ship.fleetId = fleetId;

    this.updateFleetStats(fleetId, getPlayer);
    this.notifyFleetChange(leader.id, fleet);
    this.notifyGlobalChange();

    console.log(`[FleetSystem] Fleet ${fleetId} created by ${leader.name}`);
    return fleet;
  }

  inviteToFleet(
    leaderId: string,
    targetPlayerId: string,
    getPlayer: (id: string) => PlayerState | undefined
  ): boolean {
    const fleetId = this.playerFleetMap.get(leaderId);
    if (!fleetId) return false;

    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return false;

    if (fleetState.fleet.leaderId !== leaderId) return false;
    if (fleetState.fleet.members.includes(targetPlayerId)) return false;
    if (fleetState.fleet.members.length >= this.MAX_FLEET_SIZE) return false;
    if (this.playerFleetMap.has(targetPlayerId)) return false;

    const target = getPlayer(targetPlayerId);
    if (!target) return false;

    fleetState.invites.set(targetPlayerId, Date.now());

    console.log(`[FleetSystem] Invite sent from ${leaderId} to ${targetPlayerId} for fleet ${fleetId}`);
    return true;
  }

  acceptInvite(
    player: PlayerState,
    fleetId: FleetId,
    getPlayer: (id: string) => PlayerState | undefined = (id) => undefined
  ): Fleet | null {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return null;

    if (!fleetState.invites.has(player.id)) return null;

    const inviteTime = fleetState.invites.get(player.id)!;
    if (Date.now() - inviteTime > this.INVITE_TIMEOUT) {
      fleetState.invites.delete(player.id);
      return null;
    }

    if (this.playerFleetMap.has(player.id)) return null;
    if (fleetState.fleet.members.length >= this.MAX_FLEET_SIZE) return null;

    fleetState.invites.delete(player.id);
    fleetState.fleet.members.push(player.id);
    this.playerFleetMap.set(player.id, fleetId);
    player.ship.fleetId = fleetId;

    this.updateFleetStats(fleetId, getPlayer);
    this.notifyAllFleetMembers(fleetId);
    this.notifyGlobalChange();

    console.log(`[FleetSystem] Player ${player.name} joined fleet ${fleetId}`);
    return fleetState.fleet;
  }

  declineInvite(playerId: string, fleetId: FleetId): boolean {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return false;

    if (!fleetState.invites.has(playerId)) return false;

    fleetState.invites.delete(playerId);
    console.log(`[FleetSystem] Player ${playerId} declined invite to fleet ${fleetId}`);
    return true;
  }

  leaveFleet(
    player: PlayerState,
    getPlayer: (id: string) => PlayerState | undefined = (id) => undefined
  ): boolean {
    const fleetId = this.playerFleetMap.get(player.id);
    if (!fleetId) return false;

    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return false;

    fleetState.fleet.members = fleetState.fleet.members.filter(m => m !== player.id);
    this.playerFleetMap.delete(player.id);
    player.ship.fleetId = undefined;

    if (fleetState.fleet.members.length === 0) {
      this.fleets.delete(fleetId);
      this.notifyGlobalChange();
      console.log(`[FleetSystem] Fleet ${fleetId} disbanded`);
      return true;
    }

    if (fleetState.fleet.leaderId === player.id) {
      fleetState.fleet.leaderId = fleetState.fleet.members[0];
      console.log(`[FleetSystem] Fleet ${fleetId} leadership passed to ${fleetState.fleet.leaderId}`);
    }

    this.updateFleetStats(fleetId, getPlayer);
    this.notifyAllFleetMembers(fleetId);
    this.notifyFleetChange(player.id, null);
    this.notifyGlobalChange();

    console.log(`[FleetSystem] Player ${player.name} left fleet ${fleetId}`);
    return true;
  }

  kickFromFleet(
    leaderId: string,
    targetPlayerId: string,
    getPlayer: (id: string) => PlayerState | undefined
  ): boolean {
    const fleetId = this.playerFleetMap.get(leaderId);
    if (!fleetId) return false;

    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return false;

    if (fleetState.fleet.leaderId !== leaderId) return false;
    if (leaderId === targetPlayerId) return false;
    if (!fleetState.fleet.members.includes(targetPlayerId)) return false;

    const target = getPlayer(targetPlayerId);
    if (!target) return false;

    fleetState.fleet.members = fleetState.fleet.members.filter(m => m !== targetPlayerId);
    this.playerFleetMap.delete(targetPlayerId);
    target.ship.fleetId = undefined;

    this.updateFleetStats(fleetId, getPlayer);
    this.notifyAllFleetMembers(fleetId);
    this.notifyFleetChange(targetPlayerId, null);
    this.notifyGlobalChange();

    console.log(`[FleetSystem] Player ${targetPlayerId} kicked from fleet ${fleetId}`);
    return true;
  }

  setFormation(leaderId: string, formation: FleetFormation): boolean {
    const fleetId = this.playerFleetMap.get(leaderId);
    if (!fleetId) return false;

    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return false;

    if (fleetState.fleet.leaderId !== leaderId) return false;

    fleetState.fleet.formation = formation;
    this.notifyAllFleetMembers(fleetId);
    this.notifyGlobalChange();

    console.log(`[FleetSystem] Fleet ${fleetId} formation changed to ${formation}`);
    return true;
  }

  getFleet(fleetId: FleetId): Fleet | null {
    const fleetState = this.fleets.get(fleetId);
    return fleetState?.fleet || null;
  }

  getPlayerFleet(playerId: string): Fleet | null {
    const fleetId = this.playerFleetMap.get(playerId);
    if (!fleetId) return null;

    const fleetState = this.fleets.get(fleetId);
    return fleetState?.fleet || null;
  }

  getFleetMembersPositions(
    fleetId: FleetId,
    getPlayer: (id: string) => PlayerState | undefined
  ): Map<string, { position: { x: number; y: number }; offset: { x: number; y: number } }> {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return new Map();

    const fleet = fleetState.fleet;
    const offsets = getFleetFormationOffsets(fleet.formation, fleet.members.length);
    const positions = new Map<string, { position: { x: number; y: number }; offset: { x: number; y: number } }>();

    const leader = getPlayer(fleet.leaderId);
    if (!leader) return positions;

    const leaderPos = leader.ship.position;
    const leaderRot = leader.ship.rotation;

    for (let i = 0; i < fleet.members.length; i++) {
      const memberId = fleet.members[i];
      const offset = offsets[i] || { x: 0, y: 0 };

      const rotatedOffset = {
        x: offset.x * Math.cos(leaderRot) - offset.y * Math.sin(leaderRot),
        y: offset.x * Math.sin(leaderRot) + offset.y * Math.cos(leaderRot)
      };

      const member = getPlayer(memberId);
      const position = member ? member.ship.position : vec2Add(leaderPos, rotatedOffset);

      positions.set(memberId, {
        position,
        offset: rotatedOffset
      });
    }

    return positions;
  }

  getFleetPosition(
    fleetId: FleetId,
    playerId: string,
    getPlayer: (id: string) => PlayerState | undefined
  ): { x: number; y: number } | null {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return null;

    const fleet = fleetState.fleet;
    const memberIndex = fleet.members.indexOf(playerId);
    if (memberIndex === -1) return null;

    const leader = getPlayer(fleet.leaderId);
    if (!leader) return null;

    const offsets = getFleetFormationOffsets(fleet.formation, fleet.members.length);
    const offset = offsets[memberIndex] || { x: 0, y: 0 };

    const leaderPos = leader.ship.position;
    const leaderRot = leader.ship.rotation;

    const rotatedOffset = {
      x: offset.x * Math.cos(leaderRot) - offset.y * Math.sin(leaderRot),
      y: offset.x * Math.sin(leaderRot) + offset.y * Math.cos(leaderRot)
    };

    return vec2Add(leaderPos, rotatedOffset);
  }

  updateFleetStats(fleetId: FleetId, getPlayer: (id: string) => PlayerState | undefined): void {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return;

    const fleet = fleetState.fleet;

    let totalShield = 0;
    let totalFirepower = 0;

    for (const memberId of fleet.members) {
      const player = getPlayer(memberId);
      if (player) {
        totalShield += player.ship.shield;
        totalFirepower += player.ship.firepower;
      }
    }

    fleet.sharedShield = totalShield * this.SHIELD_SHARING_RATIO;
    fleet.sharedFirepower = totalFirepower * this.FIREPOWER_SHARING_RATIO;
  }

  private notifyFleetChange(playerId: string, fleet: Fleet | null): void {
    for (const listener of this.fleetListeners) {
      listener(fleet);
    }
  }

  private notifyAllFleetMembers(fleetId: FleetId): void {
    const fleetState = this.fleets.get(fleetId);
    if (!fleetState) return;

    for (const listener of this.fleetListeners) {
      listener(fleetState.fleet);
    }
  }

  private notifyGlobalChange(): void {
    const fleets = Array.from(this.fleets.values()).map(s => s.fleet);
    for (const listener of this.globalFleetListeners) {
      listener(fleets);
    }
  }

  onFleetChange(listener: (fleet: Fleet | null) => void): () => void {
    this.fleetListeners.push(listener);
    return () => {
      this.fleetListeners = this.fleetListeners.filter(l => l !== listener);
    };
  }

  onGlobalFleetChange(listener: (fleets: Fleet[]) => void): () => void {
    this.globalFleetListeners.push(listener);
    return () => {
      this.globalFleetListeners = this.globalFleetListeners.filter(l => l !== listener);
    };
  }

  isLeader(playerId: string): boolean {
    const fleetId = this.playerFleetMap.get(playerId);
    if (!fleetId) return false;

    const fleetState = this.fleets.get(fleetId);
    return fleetState?.fleet.leaderId === playerId;
  }

  isInFleet(playerId: string): boolean {
    return this.playerFleetMap.has(playerId);
  }

  getPlayerInvites(playerId: string): FleetId[] {
    const invites: FleetId[] = [];
    for (const [fleetId, state] of this.fleets) {
      if (state.invites.has(playerId)) {
        const inviteTime = state.invites.get(playerId)!;
        if (Date.now() - inviteTime <= this.INVITE_TIMEOUT) {
          invites.push(fleetId);
        } else {
          state.invites.delete(playerId);
        }
      }
    }
    return invites;
  }

  getAllFleets(): Fleet[] {
    return Array.from(this.fleets.values()).map(s => s.fleet);
  }

  cleanupExpiredInvites(): void {
    const now = Date.now();
    for (const [, state] of this.fleets) {
      const expired: string[] = [];
      for (const [playerId, inviteTime] of state.invites) {
        if (now - inviteTime > this.INVITE_TIMEOUT) {
          expired.push(playerId);
        }
      }
      for (const playerId of expired) {
        state.invites.delete(playerId);
      }
    }
  }
}
