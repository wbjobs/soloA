import {
  Mission,
  MissionId,
  MissionType,
  MissionStatus,
  FactionId,
  Galaxy,
  CommodityType,
  FACTIONS,
  PlayerState
} from '@space-trade/shared';
import { AleaRNG } from './AleaRNG';

export interface ActiveMissionState {
  mission: Mission;
  acceptTime: number;
  progress: number;
  lastCheckTime: number;
}

export class MissionSystem {
  private missions: Map<MissionId, Mission> = new Map();
  private activeMissions: Map<string, ActiveMissionState> = new Map();
  private galaxy: Galaxy;
  private rng: AleaRNG;
  private lastUpdate: number;
  private missionListeners: ((missions: Mission[]) => void)[] = [];

  private readonly MAX_AVAILABLE_MISSIONS = 20;
  private readonly MISSION_CHECK_INTERVAL = 5000;
  private readonly MISSION_EXPIRE_TIME = 300000;
  private readonly MISSION_GENERATION_INTERVAL = 15000;

  private missionGenerationTimer: number = 0;
  private lastMissionCheck: number = 0;

  constructor(galaxy: Galaxy, seed: number = Date.now()) {
    this.galaxy = galaxy;
    this.rng = new AleaRNG(seed);
    this.lastUpdate = Date.now();
    this.generateInitialMissions();
  }

  private generateInitialMissions(): void {
    for (let i = 0; i < 10; i++) {
      this.generateRandomMission();
    }
    console.log(`[MissionSystem] Generated ${this.missions.size} initial missions`);
  }

  update(deltaTimeMs: number, now: number = Date.now()): void {
    this.missionGenerationTimer += deltaTimeMs;
    
    if (this.missionGenerationTimer >= this.MISSION_GENERATION_INTERVAL) {
      this.missionGenerationTimer = 0;
      this.refillMissions();
    }

    this.lastMissionCheck += deltaTimeMs;
    if (this.lastMissionCheck >= this.MISSION_CHECK_INTERVAL) {
      this.lastMissionCheck = 0;
      this.checkActiveMissionProgress();
      this.cleanupExpiredMissions();
    }

    this.lastUpdate = now;
  }

  private generateRandomMission(): Mission | null {
    const availableCount = Array.from(this.missions.values())
      .filter(m => m.status === 'available').length;
    
    if (availableCount >= this.MAX_AVAILABLE_MISSIONS) {
      return null;
    }

    const factionIds: FactionId[] = ['galactic_federation', 'pirate_kingdom', 'merchant_gilde', 'independent'];
    const factionId = factionIds[Math.floor(this.rng.next() * factionIds.length)];
    
    const missionTypes: MissionType[] = ['escort', 'raid', 'patrol', 'deliver'];
    const missionType = missionTypes[Math.floor(this.rng.next() * missionTypes.length)];

    const targetStation = this.galaxy.stations[Math.floor(this.rng.next() * this.galaxy.stations.length)];
    const sourceStation = this.galaxy.stations[Math.floor(this.rng.next() * this.galaxy.stations.length)];

    if (!targetStation) return null;

    const difficulty = Math.floor(this.rng.next() * 5) + 1;
    const baseReward = difficulty * 1000;
    const rewardCredits = baseReward + Math.floor(this.rng.next() * baseReward);
    const rewardReputation = difficulty * 50;

    const missionTitles: Record<MissionType, string[]> = {
      escort: [
        'Merchant Convoy Escort',
        'VIP Transport Guard',
        'Supply Line Protection',
        'Diplomatic Escort'
      ],
      raid: [
        'Enemy Supply Raid',
        'Convoy Intercept',
        'Outpost Attack',
        'Cargo Heist'
      ],
      patrol: [
        'Trade Route Patrol',
        'Border Security',
        'Piracy Suppression',
        'System Sweep'
      ],
      deliver: [
        'Emergency Supplies',
        'Valuable Cargo Transport',
        'Diplomatic Package',
        'Medical Delivery'
      ]
    };

    const missionDescriptions: Record<MissionType, string[]> = {
      escort: [
        'Escort a merchant convoy safely to its destination',
        'Protect a high-value transport from pirate attacks',
        'Ensure safe passage for critical supplies'
      ],
      raid: [
        'Intercept and raid enemy supply convoys',
        'Attack and destroy hostile outposts',
        'Seize high-value cargo from enemy vessels'
      ],
      patrol: [
        'Patrol the designated trade route and eliminate pirates',
        'Secure the border against incursions',
        'Sweep the system for hostile forces'
      ],
      deliver: [
        'Deliver emergency medical supplies to the station',
        'Transport valuable goods without damage',
        'Deliver sensitive diplomatic documents'
      ]
    };

    const title = missionTitles[missionType][Math.floor(this.rng.next() * missionTitles[missionType].length)];
    const description = missionDescriptions[missionType][
      Math.floor(this.rng.next() * missionDescriptions[missionType].length)
    ];

    let cargo: { type: CommodityType; quantity: number }[] | undefined;
    if (missionType === 'deliver') {
      const cargoTypes: CommodityType[] = ['fuel', 'food', 'minerals', 'tech', 'luxuries', 'weapons'];
      const cargoType = cargoTypes[Math.floor(this.rng.next() * cargoTypes.length)];
      const quantity = Math.floor(this.rng.next() * 20) + 5;
      cargo = [{ type: cargoType, quantity }];
    }

    const now = Date.now();
    const mission: Mission = {
      id: `mission_${now}_${Math.floor(this.rng.next() * 1000)}`,
      type: missionType,
      title,
      description,
      factionId,
      targetStationId: targetStation.id,
      sourceStationId: missionType === 'deliver' ? sourceStation.id : undefined,
      rewardCredits,
      rewardReputation,
      cargo,
      difficulty,
      timeLimit: missionType === 'deliver' ? 300000 : undefined,
      status: 'available',
      createdAt: now
    };

    this.missions.set(mission.id, mission);
    return mission;
  }

  private refillMissions(): void {
    const availableCount = Array.from(this.missions.values())
      .filter(m => m.status === 'available').length;
    
    const toGenerate = Math.min(5, this.MAX_AVAILABLE_MISSIONS - availableCount);
    
    for (let i = 0; i < toGenerate; i++) {
      this.generateRandomMission();
    }

    this.notifyListeners();
  }

  private cleanupExpiredMissions(): void {
    const now = Date.now();
    
    for (const [id, mission] of this.missions) {
      if (mission.status === 'available') {
        const age = now - mission.createdAt;
        if (age > this.MISSION_EXPIRE_TIME) {
          mission.status = 'expired';
        }
      }
      
      if (mission.status === 'active' && mission.acceptedBy) {
        const activeState = this.activeMissions.get(mission.acceptedBy);
        if (activeState && mission.timeLimit) {
          const elapsed = now - activeState.acceptTime;
          if (elapsed > mission.timeLimit) {
            mission.status = 'failed';
            if (mission.acceptedBy) {
              this.activeMissions.delete(mission.acceptedBy);
            }
          }
        }
      }
    }

    const expiredThreshold = this.MISSION_EXPIRE_TIME * 3;
    const expiredMissions = Array.from(this.missions.entries())
      .filter(([, m]) => m.status === 'failed' || m.status === 'completed' || m.status === 'expired')
      .filter(([, m]) => {
        const time = m.completedAt || m.createdAt;
        return now - time > expiredThreshold;
      })
      .map(([id]) => id);

    for (const id of expiredMissions) {
      this.missions.delete(id);
    }
  }

  private checkActiveMissionProgress(): void {
    for (const [playerId, activeState] of this.activeMissions) {
      const mission = activeState.mission;
      activeState.progress = Math.min(100, activeState.progress + 5);
    }
  }

  acceptMission(missionId: MissionId, player: PlayerState): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== 'available') {
      return false;
    }

    const playerActiveMission = this.activeMissions.get(player.id);
    if (playerActiveMission) {
      return false;
    }

    mission.status = 'active';
    mission.acceptedBy = player.id;

    this.activeMissions.set(player.id, {
      mission,
      acceptTime: Date.now(),
      progress: 0,
      lastCheckTime: Date.now()
    });

    console.log(`[MissionSystem] Player ${player.name} accepted mission: ${mission.title}`);
    this.notifyListeners();
    return true;
  }

  abandonMission(playerId: string): Mission | null {
    const activeState = this.activeMissions.get(playerId);
    if (!activeState) {
      return null;
    }

    const mission = activeState.mission;
    mission.status = 'failed';
    mission.acceptedBy = undefined;

    this.activeMissions.delete(playerId);

    console.log(`[MissionSystem] Player ${playerId} abandoned mission: ${mission.title}`);
    this.notifyListeners();
    return mission;
  }

  completeMission(playerId: string): { success: boolean; credits: number; reputation: number; mission?: Mission } {
    const activeState = this.activeMissions.get(playerId);
    if (!activeState) {
      return { success: false, credits: 0, reputation: 0 };
    }

    const mission = activeState.mission;
    
    if (activeState.progress < 80) {
      return { 
        success: false, 
        credits: 0, 
        reputation: 0, 
        mission 
      };
    }

    mission.status = 'completed';
    mission.completedAt = Date.now();

    this.activeMissions.delete(playerId);

    console.log(`[MissionSystem] Player ${playerId} completed mission: ${mission.title}`);
    this.notifyListeners();

    return {
      success: true,
      credits: mission.rewardCredits,
      reputation: mission.rewardReputation,
      mission
    };
  }

  getPlayerActiveMission(playerId: string): ActiveMissionState | null {
    return this.activeMissions.get(playerId) || null;
  }

  getAvailableMissions(): Mission[] {
    return Array.from(this.missions.values())
      .filter(m => m.status === 'available')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getMissionsForStation(stationId: string): Mission[] {
    return Array.from(this.missions.values())
      .filter(m => m.status === 'available' && 
                   (m.targetStationId === stationId || m.sourceStationId === stationId));
  }

  getMissionsForFaction(factionId: FactionId): Mission[] {
    return Array.from(this.missions.values())
      .filter(m => m.status === 'available' && m.factionId === factionId);
  }

  getMission(missionId: MissionId): Mission | undefined {
    return this.missions.get(missionId);
  }

  updateMissionProgress(playerId: string, progressIncrement: number): number {
    const activeState = this.activeMissions.get(playerId);
    if (!activeState) {
      return 0;
    }

    activeState.progress = Math.min(100, activeState.progress + progressIncrement);
    return activeState.progress;
  }

  private notifyListeners(): void {
    const missions = this.getAvailableMissions();
    for (const listener of this.missionListeners) {
      listener(missions);
    }
  }

  onMissionsChanged(listener: (missions: Mission[]) => void): () => void {
    this.missionListeners.push(listener);
    return () => {
      this.missionListeners = this.missionListeners.filter(l => l !== listener);
    };
  }

  getAllMissions(): Mission[] {
    return Array.from(this.missions.values());
  }
}
