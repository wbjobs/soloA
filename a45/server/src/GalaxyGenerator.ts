import { createNoise2D } from 'simplex-noise';
import { alea } from './AleaRNG';
import { 
  Galaxy, 
  Star, 
  Planet, 
  Station, 
  CommodityType, 
  Vec2,
  COMMODITIES,
  FACTIONS,
  FactionId
} from '@space-trade/shared';
import { v4 as uuidv4 } from 'uuid';

const STAR_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
const STAR_SUFFIXES = ['Centauri', 'Cygni', 'Lyrae', 'Orionis', 'Pegasi', 'Tauri', 'Vega', 'Polaris', 'Sirius', 'Arcturus', 'Capella', 'Aldebaran', 'Antares', 'Betelgeuse', 'Rigel', 'Vega', 'Deneb', 'Altair', 'Procyon', 'Canopus'];

const PLANET_PREFIXES = ['New', 'Old', 'Glorious', 'Dark', 'Bright', 'Red', 'Blue', 'Green', 'Golden', 'Silver', 'Iron', 'Crystal', 'Jade', 'Amber', 'Ruby', 'Sapphire'];
const PLANET_SUFFIXES = ['-Prime', '-II', '-III', '-IV', '-V', '-VI', '-VII', '-VIII', '-IX', '-X', ' Minor', ' Major', ' World', ' Colony', ' Outpost'];

const STATION_NAMES = ['Station Alpha', 'Trade Hub', 'Commerce Port', 'Freeport', 'Exchange', 'Market City', 'Harbor', 'Dockyard', 'Bazaar', 'Emporium'];

export class GalaxyGenerator {
  private seed: number;
  private rng: ReturnType<typeof alea>;
  private noise2D: ReturnType<typeof createNoise2D>;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = alea(seed.toString());
    this.noise2D = createNoise2D(this.rng);
  }

  generateGalaxy(): Galaxy {
    console.log(`Generating galaxy with seed: ${this.seed}`);
    
    const stars = this.generateStars();
    const planets = this.generatePlanets(stars);
    const stations = this.generateStations(planets, stars);
    
    console.log(`Generated ${stars.length} stars, ${planets.length} planets, ${stations.length} stations`);
    
    return {
      seed: this.seed,
      stars,
      planets,
      stations,
      factions: FACTIONS
    };
  }

  private generateStars(): Star[] {
    const stars: Star[] = [];
    const numStars = 15 + Math.floor(this.rng() * 10);
    const starColors = [0xFFD700, 0xFFFFFF, 0xADD8E6, 0xFFA500, 0xFF4500];
    
    for (let i = 0; i < numStars; i++) {
      const position = this.generateStarPosition(stars, i);
      const size = 20 + this.rng() * 30;
      const star: Star = {
        id: uuidv4(),
        position,
        color: starColors[Math.floor(this.rng() * starColors.length)],
        size,
        name: this.generateStarName(),
        militaryPresence: Math.floor(this.rng() * 100)
      };
      stars.push(star);
    }
    
    return stars;
  }

  private generateStarPosition(existingStars: Star[], index: number): Vec2 {
    const galaxyRadius = 2000;
    const minDistance = 300;
    
    let attempts = 0;
    while (attempts < 100) {
      const angle = this.rng() * Math.PI * 2;
      const radius = galaxyRadius * Math.sqrt(this.rng());
      const spiralOffset = this.noise2D(
        Math.cos(angle) * radius * 0.01,
        Math.sin(angle) * radius * 0.01
      ) * 200;
      
      const x = Math.cos(angle) * (radius + spiralOffset);
      const y = Math.sin(angle) * (radius + spiralOffset);
      
      const valid = existingStars.every(star => {
        const dist = Math.sqrt(
          Math.pow(star.position.x - x, 2) + 
          Math.pow(star.position.y - y, 2)
        );
        return dist > minDistance;
      });
      
      if (valid || attempts > 50) {
        return { x, y };
      }
      attempts++;
    }
    
    const angle = (index / 15) * Math.PI * 2;
    const radius = galaxyRadius * 0.5;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  private generatePlanets(stars: Star[]): Planet[] {
    const planets: Planet[] = [];
    const planetColors = [
      0x4A90D9, 0xD94A4A, 0x4AD94A, 0xD9A44A,
      0x9A4AD9, 0xD94AD9, 0x808080, 0x654321,
      0x87CEEB, 0xFF6347, 0x228B22, 0xCD853F
    ];
    
    for (const star of stars) {
      const numPlanets = 1 + Math.floor(this.rng() * 4);
      
      for (let i = 0; i < numPlanets; i++) {
        const orbitRadius = 150 + (i * 120) + (this.rng() * 50);
        const orbitAngle = this.rng() * Math.PI * 2;
        const orbitSpeed = 0.0002 + this.rng() * 0.0005;
        const radius = 15 + this.rng() * 25;
        
        const position = {
          x: star.position.x + Math.cos(orbitAngle) * orbitRadius,
          y: star.position.y + Math.sin(orbitAngle) * orbitRadius
        };
        
        const planet: Planet = {
          id: uuidv4(),
          starId: star.id,
          position,
          radius,
          color: planetColors[Math.floor(this.rng() * planetColors.length)],
          name: this.generatePlanetName(star.name),
          orbitRadius,
          orbitAngle,
          orbitSpeed
        };
        planets.push(planet);
      }
    }
    
    return planets;
  }

  private generateStations(planets: Planet[], stars: Star[]): Station[] {
    const stations: Station[] = [];
    
    for (const planet of planets) {
      if (this.rng() > 0.3) continue;
      
      const star = stars.find(s => s.id === planet.starId);
      if (!star) continue;
      
      const stationAngle = this.rng() * Math.PI * 2;
      const stationDistance = planet.radius + 30;
      const position = {
        x: planet.position.x + Math.cos(stationAngle) * stationDistance,
        y: planet.position.y + Math.sin(stationAngle) * stationDistance
      };
      
      const factionIds: FactionId[] = ['galactic_federation', 'pirate_kingdom', 'merchant_gilde', 'independent'];
      const station: Station = {
        id: uuidv4(),
        planetId: planet.id,
        starId: planet.starId,
        position,
        name: `${planet.name} ${STATION_NAMES[Math.floor(this.rng() * STATION_NAMES.length)]}`,
        inventory: new Map(),
        basePrices: new Map(),
        buyPrices: new Map(),
        sellPrices: new Map(),
        maxInventory: new Map(),
        productionRates: new Map(),
        consumptionRates: new Map(),
        lastPriceUpdate: Date.now(),
        factionId: factionIds[Math.floor(this.rng() * factionIds.length)]
      };
      
      for (const commodity of COMMODITIES) {
        const maxInv = 50 + Math.floor(this.rng() * 150);
        const initialInventory = Math.floor(this.rng() * maxInv);
        const production = (this.rng() - 0.3) * 0.05;
        const consumption = (this.rng() - 0.3) * 0.05;
        
        station.inventory.set(commodity.type, initialInventory);
        station.maxInventory.set(commodity.type, maxInv);
        station.basePrices.set(commodity.type, commodity.basePrice);
        station.buyPrices.set(commodity.type, commodity.basePrice);
        station.sellPrices.set(commodity.type, commodity.basePrice);
        station.productionRates.set(commodity.type, production);
        station.consumptionRates.set(commodity.type, Math.max(0, consumption));
      }
      
      stations.push(station);
    }
    
    return stations;
  }

  private generateStarName(): string {
    const prefix = STAR_PREFIXES[Math.floor(this.rng() * STAR_PREFIXES.length)];
    const suffix = STAR_SUFFIXES[Math.floor(this.rng() * STAR_SUFFIXES.length)];
    return `${prefix} ${suffix}`;
  }

  private generatePlanetName(starName: string): string {
    if (this.rng() > 0.5) {
      const prefix = PLANET_PREFIXES[Math.floor(this.rng() * PLANET_PREFIXES.length)];
      const suffix = PLANET_SUFFIXES[Math.floor(this.rng() * PLANET_SUFFIXES.length)];
      return `${prefix}${suffix}`;
    }
    return starName.split(' ')[0] + PLANET_SUFFIXES[Math.floor(this.rng() * PLANET_SUFFIXES.length)];
  }

  getSeed(): number {
    return this.seed;
  }
}
