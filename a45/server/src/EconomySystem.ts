import { Station, CommodityType, COMMODITIES } from '@space-trade/shared';

export class EconomySystem {
  private static readonly PRICE_UPDATE_INTERVAL = 10000;
  private static readonly MIN_PRICE_MULTIPLIER = 0.5;
  private static readonly MAX_PRICE_MULTIPLIER = 3.0;
  private static readonly INVENTORY_OPTIMUM_RATIO = 0.5;

  static updateStationEconomy(station: Station, deltaTimeMs: number): void {
    this.updateInventory(station, deltaTimeMs);
    
    const now = Date.now();
    if (now - station.lastPriceUpdate >= this.PRICE_UPDATE_INTERVAL) {
      this.updatePrices(station);
      station.lastPriceUpdate = now;
    }
  }

  private static updateInventory(station: Station, deltaTimeMs: number): void {
    const deltaTimeSeconds = deltaTimeMs / 1000;

    for (const commodity of COMMODITIES) {
      const production = station.productionRates.get(commodity.type) || 0;
      const consumption = station.consumptionRates.get(commodity.type) || 0;
      const netProduction = (production - consumption) * deltaTimeSeconds;

      const currentInventory = station.inventory.get(commodity.type) || 0;
      const maxInventory = station.maxInventory.get(commodity.type) || 100;

      let newInventory = currentInventory + netProduction;
      newInventory = Math.max(0, Math.min(maxInventory, newInventory));

      station.inventory.set(commodity.type, Math.floor(newInventory));
    }
  }

  private static updatePrices(station: Station): void {
    for (const commodity of COMMODITIES) {
      const inventory = station.inventory.get(commodity.type) || 0;
      const maxInventory = station.maxInventory.get(commodity.type) || 100;
      const basePrice = station.basePrices.get(commodity.type) || commodity.basePrice;

      const inventoryRatio = inventory / maxInventory;
      const distanceFromOptimum = Math.abs(inventoryRatio - this.INVENTORY_OPTIMUM_RATIO);
      const imbalanceFactor = 1 + (distanceFromOptimum * 2);

      if (inventoryRatio < this.INVENTORY_OPTIMUM_RATIO) {
        station.buyPrices.set(
          commodity.type,
          Math.round(basePrice * this.MAX_PRICE_MULTIPLIER * imbalanceFactor)
        );
        station.sellPrices.set(
          commodity.type,
          Math.round(basePrice * (1 / this.MAX_PRICE_MULTIPLIER) / imbalanceFactor)
        );
      } else {
        station.buyPrices.set(
          commodity.type,
          Math.round(basePrice * this.MIN_PRICE_MULTIPLIER / imbalanceFactor)
        );
        station.sellPrices.set(
          commodity.type,
          Math.round(basePrice * (1 / this.MIN_PRICE_MULTIPLIER) * imbalanceFactor)
        );
      }

      station.buyPrices.set(
        commodity.type,
        Math.max(
          Math.round(basePrice * this.MIN_PRICE_MULTIPLIER),
          Math.min(
            Math.round(basePrice * this.MAX_PRICE_MULTIPLIER),
            station.buyPrices.get(commodity.type) || basePrice
          )
        )
      );

      station.sellPrices.set(
        commodity.type,
        Math.max(
          Math.round(basePrice * this.MIN_PRICE_MULTIPLIER * 0.9),
          Math.min(
            Math.round(basePrice * this.MAX_PRICE_MULTIPLIER * 0.9),
            station.sellPrices.get(commodity.type) || basePrice * 0.9
          )
        )
      );
    }
  }

  static getBuyPrice(station: Station, commodity: CommodityType): number {
    return station.buyPrices.get(commodity) || 0;
  }

  static getSellPrice(station: Station, commodity: CommodityType): number {
    return station.sellPrices.get(commodity) || 0;
  }

  static canBuy(station: Station, commodity: CommodityType, quantity: number): boolean {
    const inventory = station.inventory.get(commodity) || 0;
    return inventory >= quantity;
  }

  static canSell(station: Station, commodity: CommodityType, quantity: number): boolean {
    const inventory = station.inventory.get(commodity) || 0;
    const maxInventory = station.maxInventory.get(commodity) || 100;
    return inventory + quantity <= maxInventory;
  }

  static executeBuy(station: Station, commodity: CommodityType, quantity: number): number {
    const price = this.getBuyPrice(station, commodity);
    const currentInventory = station.inventory.get(commodity) || 0;
    station.inventory.set(commodity, currentInventory - quantity);
    return price * quantity;
  }

  static executeSell(station: Station, commodity: CommodityType, quantity: number): number {
    const price = this.getSellPrice(station, commodity);
    const currentInventory = station.inventory.get(commodity) || 0;
    station.inventory.set(commodity, currentInventory + quantity);
    return price * quantity;
  }
}
