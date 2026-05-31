import { CommodityType, vec2Distance } from '@space-trade/shared';
import { StationData, GalaxyData } from './types';

interface GraphNode {
  stationId: string;
  distance: number;
  previous: string | null;
}

interface RouteResult {
  stationId: string;
  stationName: string;
  distance: number;
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  path: string[];
}

export class RoutePlanner {
  private galaxy: GalaxyData | null = null;
  private adjacencyList: Map<string, Map<string, number>> = new Map();

  setGalaxy(galaxy: GalaxyData): void {
    this.galaxy = galaxy;
    this.buildGraph();
  }

  private buildGraph(): void {
    if (!this.galaxy) return;

    this.adjacencyList.clear();

    for (const station of this.galaxy.stations) {
      this.adjacencyList.set(station.id, new Map());
    }

    for (let i = 0; i < this.galaxy.stations.length; i++) {
      for (let j = i + 1; j < this.galaxy.stations.length; j++) {
        const stationA = this.galaxy.stations[i];
        const stationB = this.galaxy.stations[j];
        
        const distance = vec2Distance(stationA.position, stationB.position);
        const maxDistance = 1000;

        if (distance < maxDistance || stationA.id === stationB.id) {
          const edgesA = this.adjacencyList.get(stationA.id);
          const edgesB = this.adjacencyList.get(stationB.id);
          
          if (edgesA) edgesA.set(stationB.id, distance);
          if (edgesB) edgesB.set(stationA.id, distance);
        }
      }
    }

    this.connectDisconnectedComponents();
  }

  private connectDisconnectedComponents(): void {
    if (!this.galaxy) return;

    const visited = new Set<string>();
    const components: string[][] = [];

    for (const station of this.galaxy.stations) {
      if (!visited.has(station.id)) {
        const component = this.bfs(station.id, visited);
        components.push(component);
      }
    }

    for (let i = 0; i < components.length - 1; i++) {
      let minDistance = Infinity;
      let fromStation = '';
      let toStation = '';

      for (const fromId of components[i]) {
        for (const toId of components[i + 1]) {
          const from = this.galaxy.stations.find(s => s.id === fromId);
          const to = this.galaxy.stations.find(s => s.id === toId);
          
          if (from && to) {
            const dist = vec2Distance(from.position, to.position);
            if (dist < minDistance) {
              minDistance = dist;
              fromStation = fromId;
              toStation = toId;
            }
          }
        }
      }

      if (fromStation && toStation) {
        const edgesFrom = this.adjacencyList.get(fromStation);
        const edgesTo = this.adjacencyList.get(toStation);
        
        if (edgesFrom) edgesFrom.set(toStation, minDistance);
        if (edgesTo) edgesTo.set(fromStation, minDistance);
      }
    }
  }

  private bfs(startId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const queue: string[] = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        for (const neighborId of neighbors.keys()) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }

    return component;
  }

  findShortestPath(fromStationId: string, toStationId: string): string[] {
    if (!this.galaxy) return [];

    const distances: Map<string, number> = new Map();
    const previous: Map<string, string | null> = new Map();
    const unvisited: Set<string> = new Set();

    for (const station of this.galaxy.stations) {
      distances.set(station.id, Infinity);
      previous.set(station.id, null);
      unvisited.add(station.id);
    }

    distances.set(fromStationId, 0);

    while (unvisited.size > 0) {
      let minDistance = Infinity;
      let current = '';

      for (const stationId of unvisited) {
        const dist = distances.get(stationId) || Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          current = stationId;
        }
      }

      if (minDistance === Infinity || current === toStationId) break;
      unvisited.delete(current);

      const neighbors = this.adjacencyList.get(current);
      if (!neighbors) continue;

      for (const [neighborId, distance] of neighbors) {
        const alt = (distances.get(current) || 0) + distance;
        if (alt < (distances.get(neighborId) || Infinity)) {
          distances.set(neighborId, alt);
          previous.set(neighborId, current);
        }
      }
    }

    const path: string[] = [];
    let current: string | null = toStationId;

    while (current !== null) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    if (path[0] !== fromStationId) return [];

    return path;
  }

  calculateShortestDistance(fromStationId: string, toStationId: string): number {
    const path = this.findShortestPath(fromStationId, toStationId);
    if (path.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const from = this.galaxy?.stations.find(s => s.id === path[i]);
      const to = this.galaxy?.stations.find(s => s.id === path[i + 1]);
      
      if (from && to) {
        totalDistance += vec2Distance(from.position, to.position);
      }
    }

    return totalDistance;
  }

  findBestTradeRoutes(
    currentStationId: string,
    commodity: CommodityType
  ): RouteResult[] {
    if (!this.galaxy) return [];

    const currentStation = this.galaxy.stations.find(s => s.id === currentStationId);
    if (!currentStation) return [];

    const results: RouteResult[] = [];
    const buyPriceAtCurrent = currentStation.buyPrices.get(commodity) || 0;

    for (const targetStation of this.galaxy.stations) {
      if (targetStation.id === currentStationId) continue;

      const path = this.findShortestPath(currentStationId, targetStation.id);
      const distance = this.calculateShortestDistance(currentStationId, targetStation.id);
      const sellPriceAtTarget = targetStation.sellPrices.get(commodity) || 0;
      const profitPerUnit = sellPriceAtTarget - buyPriceAtCurrent;

      results.push({
        stationId: targetStation.id,
        stationName: targetStation.name,
        distance,
        buyPrice: buyPriceAtCurrent,
        sellPrice: sellPriceAtTarget,
        profitPerUnit,
        path
      });
    }

    results.sort((a, b) => b.profitPerUnit - a.profitPerUnit);

    return results;
  }

  findMostProfitableCommodity(currentStationId: string): { commodity: CommodityType; profit: number } | null {
    if (!this.galaxy) return null;

    const commodities: CommodityType[] = ['fuel', 'food', 'minerals', 'tech', 'luxuries', 'weapons'];
    let bestCommodity: CommodityType | null = null;
    let maxProfit = -Infinity;

    for (const commodity of commodities) {
      const routes = this.findBestTradeRoutes(currentStationId, commodity);
      if (routes.length > 0) {
        const bestRoute = routes[0];
        if (bestRoute.profitPerUnit > maxProfit) {
          maxProfit = bestRoute.profitPerUnit;
          bestCommodity = commodity;
        }
      }
    }

    return bestCommodity ? { commodity: bestCommodity, profit: maxProfit } : null;
  }

  getStationById(stationId: string): StationData | null {
    return this.galaxy?.stations.find(s => s.id === stationId) || null;
  }

  getAllStations(): StationData[] {
    return this.galaxy?.stations || [];
  }
}
