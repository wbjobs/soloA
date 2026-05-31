import { Pool, PoolClient } from 'pg';
import { 
  SavedPlayerState, 
  CommodityInventory,
  TradeHistoryEntry,
  CommodityType,
  FactionId
} from '@space-trade/shared';
import { v4 as uuidv4 } from 'uuid';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'spacetrade'
};

export class Database {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    this.pool = new Pool(DB_CONFIG);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.createTables();
    this.initialized = true;
    console.log('Database initialized successfully');
  }

  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(50) UNIQUE NOT NULL,
          credits DECIMAL(12, 2) DEFAULT 10000.00,
          position_x FLOAT DEFAULT 0,
          position_y FLOAT DEFAULT 0,
          rotation FLOAT DEFAULT 0,
          current_star_id VARCHAR(36),
          docking_station_id VARCHAR(36),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS cargo (
          id SERIAL PRIMARY KEY,
          player_id VARCHAR(36) REFERENCES players(id) ON DELETE CASCADE,
          commodity_type VARCHAR(20) NOT NULL,
          quantity INTEGER DEFAULT 0,
          UNIQUE(player_id, commodity_type)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS trade_history (
          id VARCHAR(36) PRIMARY KEY,
          player_id VARCHAR(36) REFERENCES players(id) ON DELETE CASCADE,
          station_id VARCHAR(36) NOT NULL,
          commodity VARCHAR(20) NOT NULL,
          quantity INTEGER NOT NULL,
          price_per_unit DECIMAL(10, 2) NOT NULL,
          total_price DECIMAL(12, 2) NOT NULL,
          is_buy BOOLEAN NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_trade_history_player ON trade_history(player_id);
        CREATE INDEX IF NOT EXISTS idx_trade_history_station ON trade_history(station_id);
      `);
    } finally {
      client.release();
    }
  }

  async getOrCreatePlayer(playerName: string): Promise<SavedPlayerState> {
    const client = await this.pool.connect();
    try {
      let result = await client.query(
        'SELECT * FROM players WHERE name = $1',
        [playerName]
      );

      if (result.rows.length === 0) {
        const id = uuidv4();
        result = await client.query(`
          INSERT INTO players (id, name, credits, position_x, position_y)
          VALUES ($1, $2, 10000.00, 0, 0)
          RETURNING *
        `, [id, playerName]);
      }

      const player = result.rows[0];
      const cargo = await this.getPlayerCargo(client, player.id);

      return {
        id: player.id,
        name: player.name,
        credits: parseFloat(player.credits),
        positionX: parseFloat(player.position_x),
        positionY: parseFloat(player.position_y),
        rotation: parseFloat(player.rotation),
        cargo,
        currentStarId: player.current_star_id,
        dockingStationId: player.docking_station_id,
        updatedAt: new Date(player.updated_at),
        factionId: (player.faction_id as FactionId) || 'independent',
        reputation: new Map()
      };
    } finally {
      client.release();
    }
  }

  private async getPlayerCargo(client: PoolClient, playerId: string): Promise<CommodityInventory[]> {
    const result = await client.query(
      'SELECT commodity_type, quantity FROM cargo WHERE player_id = $1',
      [playerId]
    );

    return result.rows.map(row => ({
      type: row.commodity_type as CommodityType,
      quantity: parseInt(row.quantity)
    }));
  }

  async savePlayerState(state: SavedPlayerState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE players 
        SET credits = $1, position_x = $2, position_y = $3, rotation = $4,
            current_star_id = $5, docking_station_id = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `, [
        state.credits,
        state.positionX,
        state.positionY,
        state.rotation,
        state.currentStarId,
        state.dockingStationId,
        state.id
      ]);

      await client.query('DELETE FROM cargo WHERE player_id = $1', [state.id]);

      for (const item of state.cargo) {
        await client.query(`
          INSERT INTO cargo (player_id, commodity_type, quantity)
          VALUES ($1, $2, $3)
        `, [state.id, item.type, item.quantity]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async executeTrade(
    playerId: string,
    stationId: string,
    commodity: CommodityType,
    quantity: number,
    pricePerUnit: number,
    totalPrice: number,
    isBuy: boolean,
    updatedCredits: number,
    updatedCargo: CommodityInventory[]
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const creditsResult = await client.query(
        'SELECT credits FROM players WHERE id = $1 FOR UPDATE',
        [playerId]
      );

      if (creditsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const currentCredits = parseFloat(creditsResult.rows[0].credits);
      
      if (isBuy && currentCredits < totalPrice) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query(`
        UPDATE players 
        SET credits = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [updatedCredits, playerId]);

      await client.query('DELETE FROM cargo WHERE player_id = $1', [playerId]);

      for (const item of updatedCargo) {
        await client.query(`
          INSERT INTO cargo (player_id, commodity_type, quantity)
          VALUES ($1, $2, $3)
        `, [playerId, item.type, item.quantity]);
      }

      const tradeId = uuidv4();
      await client.query(`
        INSERT INTO trade_history 
        (id, player_id, station_id, commodity, quantity, price_per_unit, total_price, is_buy)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [tradeId, playerId, stationId, commodity, quantity, pricePerUnit, totalPrice, isBuy]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Trade transaction failed:', error);
      return false;
    } finally {
      client.release();
    }
  }

  async getTradeHistory(playerId: string, limit: number = 50): Promise<TradeHistoryEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM trade_history 
        WHERE player_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `, [playerId, limit]);

      return result.rows.map(row => ({
        id: row.id,
        playerId: row.player_id,
        stationId: row.station_id,
        commodity: row.commodity as CommodityType,
        quantity: parseInt(row.quantity),
        pricePerUnit: parseFloat(row.price_per_unit),
        totalPrice: parseFloat(row.total_price),
        isBuy: row.is_buy,
        timestamp: new Date(row.timestamp).getTime()
      }));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const database = new Database();
