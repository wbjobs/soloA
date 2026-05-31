import { 
  Faction, 
  FactionId, 
  FactionStance,
  FactionWarEvent,
  Galaxy,
  getRelationship,
  FACTIONS
} from '@space-trade/shared';
import { AleaRNG } from './AleaRNG';

interface FactionState {
  faction: Faction;
  targetStars: Map<string, number>;
  warTargets: FactionId[];
  lastActionTime: number;
  aiDecisionTimer: number;
}

export class FactionSystem {
  private factions: Map<FactionId, FactionState> = new Map();
  private galaxy: Galaxy;
  private events: FactionWarEvent[] = [];
  private rng: AleaRNG;
  private lastUpdate: number;
  private eventListeners: ((event: FactionWarEvent) => void)[] = [];

  private readonly AI_DECISION_INTERVAL = 30000;
  private readonly WAR_CHECK_INTERVAL = 60000;
  private readonly MINIMUM_MILITARY_RATIO = 0.7;
  private readonly MAX_FACTION_WARS = 2;

  constructor(galaxy: Galaxy, seed: number = Date.now()) {
    this.galaxy = galaxy;
    this.rng = new AleaRNG(seed);
    this.lastUpdate = Date.now();
    this.initializeFactions();
  }

  private initializeFactions(): void {
    for (const factionTemplate of FACTIONS) {
      const faction: Faction = {
        ...factionTemplate,
        controlledStarIds: [],
        militaryStrength: factionTemplate.militaryStrength
      };

      this.factions.set(faction.id, {
        faction,
        targetStars: new Map(),
        warTargets: [],
        lastActionTime: Date.now(),
        aiDecisionTimer: 0
      });
    }

    this.distributeStarControl();
  }

  private distributeStarControl(): void {
    const factionIds: FactionId[] = ['galactic_federation', 'pirate_kingdom', 'merchant_gilde'];
    const shuffledStars = [...this.galaxy.stars].sort(() => this.rng.next() - 0.5);
    const independentStars: string[] = [];

    for (let i = 0; i < shuffledStars.length; i++) {
      const star = shuffledStars[i];
      
      if (this.rng.next() < 0.2) {
        independentStars.push(star.id);
        star.controllingFaction = 'independent';
        star.militaryPresence = this.rng.nextRange(10, 30);
        continue;
      }

      const factionIndex = i % factionIds.length;
      const factionId = factionIds[factionIndex];
      const factionState = this.factions.get(factionId)!;

      factionState.faction.controlledStarIds.push(star.id);
      star.controllingFaction = factionId;
      star.militaryPresence = this.rng.nextRange(30, 100);

      factionState.faction.influence += 0.01;
      factionState.faction.militaryStrength += star.militaryPresence;
    }

    this.galaxy.stars.forEach(star => {
      if (!star.controllingFaction) {
        star.controllingFaction = 'independent';
        star.militaryPresence = this.rng.nextRange(5, 20);
      }
    });

    console.log('[FactionSystem] Star distribution complete:');
    this.factions.forEach((state, id) => {
      console.log(`  ${id}: ${state.faction.controlledStarIds.length} stars, ` +
                  `strength: ${state.faction.militaryStrength}`);
    });
  }

  update(deltaTimeMs: number, now: number = Date.now()): void {
    for (const [, state] of this.factions) {
      state.aiDecisionTimer += deltaTimeMs;
      
      if (state.aiDecisionTimer >= this.AI_DECISION_INTERVAL) {
        state.aiDecisionTimer = 0;
        this.runFactionAI(state, now);
      }
    }

    this.updateEconomies(deltaTimeMs);
    this.lastUpdate = now;
  }

  private runFactionAI(state: FactionState, now: number): void {
    const faction = state.faction;

    if (faction.stance === 'war') {
      this.executeWarStrategy(state);
      return;
    }

    const decision = this.rng.next();
    const targetCount = state.warTargets.length;
    const canStartWar = targetCount < this.MAX_FACTION_WARS;

    if (faction.stance === 'aggressive' && decision < 0.4 && canStartWar) {
      this.tryStartWar(state);
    } else if (faction.stance === 'peaceful') {
      this.tryTradeDiplomacy(state);
    } else {
      if (decision < 0.3) {
        this.reinforceFrontlines(state);
      } else if (decision < 0.5 && canStartWar) {
        this.tryStartWar(state);
      } else {
        this.tryTradeDiplomacy(state);
      }
    }
  }

  private tryStartWar(state: FactionState): void {
    const faction = state.faction;
    const possibleTargets: FactionId[] = [];

    for (const [targetId, targetState] of this.factions) {
      if (targetId === faction.id) continue;
      if (targetId === 'independent') continue;
      if (state.warTargets.includes(targetId)) continue;
      if (faction.friendlyFactions.includes(targetId)) continue;

      const militaryRatio = faction.militaryStrength / Math.max(targetState.faction.militaryStrength, 1);
      if (militaryRatio >= this.MINIMUM_MILITARY_RATIO) {
        possibleTargets.push(targetId);
      }
    }

    if (possibleTargets.length === 0) return;

    const targetFactionId = possibleTargets[Math.floor(this.rng.next() * possibleTargets.length)];
    const targetFaction = this.factions.get(targetFactionId)!.faction;

    if (!faction.hostileFactions.includes(targetFactionId)) {
      faction.hostileFactions.push(targetFactionId);
    }
    if (!targetFaction.hostileFactions.includes(faction.id)) {
      targetFaction.hostileFactions.push(faction.id);
    }

    state.warTargets.push(targetFactionId);
    faction.stance = 'war';

    const frontlineStar = this.findNearestContestedStar(faction, targetFaction);
    const event: FactionWarEvent = {
      id: `war_${Date.now()}_${faction.id}`,
      type: 'war_declared',
      timestamp: Date.now(),
      factionA: faction.id,
      factionB: targetFactionId,
      location: frontlineStar?.position || { x: 0, y: 0 },
      description: `${faction.name} has declared war on ${targetFaction.name}!`
    };

    this.emitEvent(event);
    console.log(`[FactionSystem] WAR: ${faction.name} vs ${targetFaction.name}`);
  }

  private executeWarStrategy(state: FactionState): void {
    const faction = state.faction;

    for (const targetFactionId of state.warTargets) {
      const targetFaction = this.factions.get(targetFactionId);
      if (!targetFaction) continue;

      if (this.rng.next() < 0.3) {
        this.attemptStarCapture(state, targetFactionId);
      }
    }

    if (this.rng.next() < 0.1) {
      this.checkPeaceCondition(state);
    }
  }

  private attemptStarCapture(
    attackerState: FactionState,
    defenderFactionId: FactionId
  ): void {
    const attacker = attackerState.faction;
    const defender = this.factions.get(defenderFactionId)!.faction;

    const contestedStars = this.galaxy.stars.filter(star => {
      if (star.controllingFaction === defenderFactionId) {
        for (const neighbor of this.getAdjacentStars(star.id)) {
          if (neighbor.controllingFaction === attacker.id) {
            return true;
          }
        }
      }
      return false;
    });

    if (contestedStars.length === 0) return;

    const targetStar = contestedStars[Math.floor(this.rng.next() * contestedStars.length)];
    const attackerStrength = this.rng.nextRange(
      attacker.militaryStrength * 0.1,
      attacker.militaryStrength * 0.3
    );
    const defenderStrength = targetStar.militaryPresence;

    const successRatio = attackerStrength / (attackerStrength + defenderStrength);
    const success = this.rng.next() < successRatio;

    const battleEvent: FactionWarEvent = {
      id: `battle_${Date.now()}_${targetStar.id}`,
      type: 'battle',
      timestamp: Date.now(),
      factionA: attacker.id,
      factionB: defenderFactionId,
      location: { ...targetStar.position },
      description: success
        ? `${attacker.name} captured ${targetStar.name} from ${defender.name}`
        : `${defender.name} repelled ${attacker.name} attack on ${targetStar.name}`
    };

    this.emitEvent(battleEvent);

    if (success) {
      targetStar.militaryPresence = Math.floor(attackerStrength * 0.5);
      
      const oldController = this.factions.get(defenderFactionId);
      if (oldController) {
        oldController.faction.controlledStarIds = 
          oldController.faction.controlledStarIds.filter(id => id !== targetStar.id);
      }

      targetStar.controllingFaction = attacker.id;
      attacker.controlledStarIds.push(targetStar.id);
    } else {
      targetStar.militaryPresence = Math.floor(defenderStrength * 0.5);
      attacker.militaryStrength = Math.max(0, attacker.militaryStrength - attackerStrength);
    }
  }

  private checkPeaceCondition(state: FactionState): void {
    const faction = state.faction;
    const remainingTargets: FactionId[] = [];

    for (const targetId of state.warTargets) {
      const targetFaction = this.factions.get(targetId);
      if (!targetFaction) continue;

      const strengthRatio = faction.militaryStrength / Math.max(targetFaction.faction.militaryStrength, 1);

      if (strengthRatio > 3 || strengthRatio < 0.3) {
        faction.stance = 'neutral';
        faction.hostileFactions = faction.hostileFactions.filter(f => f !== targetId);
        targetFaction.faction.hostileFactions = 
          targetFaction.faction.hostileFactions.filter(f => f !== faction.id);

        const event: FactionWarEvent = {
          id: `ceasefire_${Date.now()}_${faction.id}_${targetId}`,
          type: 'ceasefire',
          timestamp: Date.now(),
          factionA: faction.id,
          factionB: targetId,
          location: { x: 0, y: 0 },
          description: `Ceasefire between ${faction.name} and ${targetFaction.faction.name}`
        };
        this.emitEvent(event);
      } else {
        remainingTargets.push(targetId);
      }
    }

    state.warTargets = remainingTargets;
  }

  private tryTradeDiplomacy(state: FactionState): void {
    const faction = state.faction;
    
    faction.militaryStrength += this.rng.nextRange(0, 5);
    faction.influence += this.rng.nextRange(0, 0.005);
  }

  private reinforceFrontlines(state: FactionState): void {
    const faction = state.faction;
    
    for (const starId of faction.controlledStarIds) {
      const star = this.galaxy.stars.find(s => s.id === starId);
      if (!star) continue;

      if (this.isOnBorder(starId)) {
        star.militaryPresence += this.rng.nextRange(1, 5);
        star.militaryPresence = Math.min(star.militaryPresence, 200);
      }
    }
  }

  private updateEconomies(deltaTimeMs: number): void {
    const dt = deltaTimeMs / 1000;

    for (const [, state] of this.factions) {
      const starCount = state.faction.controlledStarIds.length;
      const economyGain = starCount * 0.1 * dt;
      state.faction.militaryStrength += economyGain;
    }
  }

  private findNearestContestedStar(
    attacker: Faction,
    defender: Faction
  ): typeof this.galaxy.stars[0] | undefined {
    for (const star of this.galaxy.stars) {
      if (star.controllingFaction === defender.id) {
        for (const neighbor of this.getAdjacentStars(star.id)) {
          if (neighbor.controllingFaction === attacker.id) {
            return star;
          }
        }
      }
    }
    return undefined;
  }

  private getAdjacentStars(starId: string): typeof this.galaxy.stars {
    const star = this.galaxy.stars.find(s => s.id === starId);
    if (!star) return [];

    return this.galaxy.stars.filter(other => {
      if (other.id === starId) return false;
      const dx = other.position.x - star.position.x;
      const dy = other.position.y - star.position.y;
      return Math.sqrt(dx * dx + dy * dy) < 500;
    });
  }

  private isOnBorder(starId: string): boolean {
    const star = this.galaxy.stars.find(s => s.id === starId);
    if (!star) return false;
    if (!star.controllingFaction) return false;

    for (const neighbor of this.getAdjacentStars(starId)) {
      if (neighbor.controllingFaction !== star.controllingFaction) {
        return true;
      }
    }
    return false;
  }

  private emitEvent(event: FactionWarEvent): void {
    this.events.push(event);
    if (this.events.length > 100) {
      this.events.shift();
    }
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  getFaction(id: FactionId): Faction | undefined {
    const state = this.factions.get(id);
    return state?.faction;
  }

  getAllFactions(): Faction[] {
    return Array.from(this.factions.values()).map(s => s.faction);
  }

  getRecentEvents(limit: number = 10): FactionWarEvent[] {
    return this.events.slice(-limit).reverse();
  }

  onEvent(listener: (event: FactionWarEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  getControllingFaction(starId: string): FactionId | undefined {
    const star = this.galaxy.stars.find(s => s.id === starId);
    return star?.controllingFaction;
  }

  getPlayerRelationship(
    playerFaction: FactionId,
    playerReputation: number,
    targetFaction: FactionId
  ): 'enemy' | 'neutral' | 'ally' {
    return getRelationship(playerFaction, targetFaction, playerReputation);
  }
}
