const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'scada.db');

let db = null;

const historyData = [];
const configData = {
  devices: [],
  tags: [],
  rules: []
};

const initDatabase = () => {
  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS history_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id TEXT NOT NULL,
        value REAL,
        quality INTEGER DEFAULT 1,
        timestamp TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS alarm_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id TEXT NOT NULL,
        level TEXT,
        message TEXT,
        acknowledged INTEGER DEFAULT 0,
        acknowledged_at TEXT,
        timestamp TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT,
        protocol TEXT,
        config TEXT,
        status TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_history_tag ON history_data(tag_id);
      CREATE INDEX IF NOT EXISTS idx_history_time ON history_data(timestamp);
    `);
    
    console.log('SQLite 数据库初始化成功:', dbPath);
  } catch (err) {
    console.warn('未找到 better-sqlite3 模块，使用内存存储:', err.message);
    console.log('如需使用 SQLite 数据库，请运行: npm rebuild better-sqlite3');
    db = null;
  }
};

const saveHistoryData = (tagId, value, quality = 1) => {
  const timestamp = new Date().toISOString();
  
  if (db) {
    try {
      const stmt = db.prepare('INSERT INTO history_data (tag_id, value, quality, timestamp) VALUES (?, ?, ?, ?)');
      stmt.run(tagId, value, quality, timestamp);
    } catch (err) {
      console.error('保存历史数据失败:', err.message);
    }
  }
  
  historyData.push({ tagId, value, quality, timestamp });
  if (historyData.length > 10000) {
    historyData.shift();
  }
};

const getHistoryData = (tagId, startTime, endTime, limit = 1000) => {
  if (db) {
    try {
      let sql = 'SELECT * FROM history_data WHERE tag_id = ?';
      const params = [tagId];
      
      if (startTime) {
        sql += ' AND timestamp >= ?';
        params.push(startTime);
      }
      if (endTime) {
        sql += ' AND timestamp <= ?';
        params.push(endTime);
      }
      
      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
      const stmt = db.prepare(sql);
      return stmt.all(...params).map(row => ({
        tagId: row.tag_id,
        value: row.value,
        quality: row.quality,
        timestamp: row.timestamp
      })).reverse();
    } catch (err) {
      console.error('查询历史数据失败:', err.message);
    }
  }
  
  return historyData
    .filter(d => d.tagId === tagId)
    .filter(d => !startTime || d.timestamp >= startTime)
    .filter(d => !endTime || d.timestamp <= endTime)
    .slice(-limit);
};

const saveAlarm = (alarm) => {
  if (db) {
    try {
      const stmt = db.prepare('INSERT INTO alarm_log (tag_id, level, message, acknowledged, timestamp) VALUES (?, ?, ?, ?, ?)');
      stmt.run(
        alarm.tagId || alarm.tag_id,
        alarm.level,
        alarm.message,
        alarm.acknowledged ? 1 : 0,
        alarm.timestamp
      );
    } catch (err) {
      console.error('保存报警失败:', err.message);
    }
  }
};

const getAlarms = (limit = 100, includeAcknowledged = true) => {
  if (db) {
    try {
      let sql = 'SELECT * FROM alarm_log';
      const params = [];
      
      if (!includeAcknowledged) {
        sql += ' WHERE acknowledged = 0';
      }
      
      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error('查询报警失败:', err.message);
    }
  }
  return [];
};

initDatabase();

module.exports = {
  saveHistoryData,
  getHistoryData,
  saveAlarm,
  getAlarms,
  db
};
