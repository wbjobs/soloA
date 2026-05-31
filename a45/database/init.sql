-- Space Trade Simulator Database Initialization
-- Run this script to set up the PostgreSQL database

CREATE DATABASE IF NOT EXISTS spacetrade;

\c spacetrade;

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
);

CREATE TABLE IF NOT EXISTS cargo (
  id SERIAL PRIMARY KEY,
  player_id VARCHAR(36) REFERENCES players(id) ON DELETE CASCADE,
  commodity_type VARCHAR(20) NOT NULL,
  quantity INTEGER DEFAULT 0,
  UNIQUE(player_id, commodity_type)
);

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
);

CREATE INDEX IF NOT EXISTS idx_trade_history_player ON trade_history(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_station ON trade_history(station_id);

INSERT INTO players (id, name, credits, position_x, position_y)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Admin',
  100000.00,
  0,
  0
) ON CONFLICT (id) DO NOTHING;
