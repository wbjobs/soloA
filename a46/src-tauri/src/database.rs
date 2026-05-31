use crate::types::*;
use crate::errors::*;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(path: &PathBuf) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock();
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                interface_name TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                packet_count INTEGER NOT NULL DEFAULT 0,
                promiscuous INTEGER NOT NULL DEFAULT 0,
                bpf_filter TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS packets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                packet_number INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                src_address TEXT NOT NULL,
                dst_address TEXT NOT NULL,
                src_port INTEGER,
                dst_port INTEGER,
                protocol TEXT NOT NULL,
                length INTEGER NOT NULL,
                info TEXT,
                raw_bytes BLOB NOT NULL,
                tree_json TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_packets_session_id ON packets(session_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_packets_protocol ON packets(protocol)",
            [],
        )?;

        Ok(())
    }

    pub fn create_session(&self, session: &CaptureSession) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO sessions (id, name, interface_name, start_time, end_time, packet_count, promiscuous, bpf_filter)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                session.id,
                session.name,
                session.interface_name,
                session.start_time,
                session.end_time,
                session.packet_count,
                if session.promiscuous { 1 } else { 0 },
                session.bpf_filter,
            ],
        )?;
        Ok(())
    }

    pub fn update_session(&self, session: &CaptureSession) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE sessions SET name=?2, interface_name=?3, start_time=?4, end_time=?5,
             packet_count=?6, promiscuous=?7, bpf_filter=?8 WHERE id=?1",
            params![
                session.id,
                session.name,
                session.interface_name,
                session.start_time,
                session.end_time,
                session.packet_count,
                if session.promiscuous { 1 } else { 0 },
                session.bpf_filter,
            ],
        )?;
        Ok(())
    }

    pub fn insert_packet(&self, packet: &PacketInfo, session_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let tree_json = serde_json::to_string(&packet.tree).ok();
        
        conn.execute(
            "INSERT INTO packets (session_id, packet_number, timestamp, src_address, dst_address,
             src_port, dst_port, protocol, length, info, raw_bytes, tree_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                session_id,
                packet.number,
                packet.timestamp,
                packet.src_address,
                packet.dst_address,
                packet.src_port,
                packet.dst_port,
                packet.protocol,
                packet.length,
                packet.info,
                packet.raw_bytes,
                tree_json,
            ],
        )?;
        Ok(())
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<CaptureSession>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, interface_name, start_time, end_time, packet_count, promiscuous, bpf_filter
             FROM sessions WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![session_id])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(CaptureSession {
                id: row.get(0)?,
                name: row.get(1)?,
                interface_name: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                packet_count: row.get(5)?,
                promiscuous: row.get::<_, i64>(6)? != 0,
                bpf_filter: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_sessions(&self) -> Result<Vec<CaptureSession>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, interface_name, start_time, end_time, packet_count, promiscuous, bpf_filter
             FROM sessions ORDER BY start_time DESC"
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok(CaptureSession {
                id: row.get(0)?,
                name: row.get(1)?,
                interface_name: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                packet_count: row.get(5)?,
                promiscuous: row.get::<_, i64>(6)? != 0,
                bpf_filter: row.get(7)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    pub fn get_packets(&self, session_id: Option<&str>) -> Result<Vec<PacketInfo>> {
        let conn = self.conn.lock();
        
        let query = if let Some(sid) = session_id {
            format!("SELECT packet_number, timestamp, src_address, dst_address, src_port, dst_port,
                    protocol, length, info, raw_bytes, tree_json FROM packets
                    WHERE session_id = '{}' ORDER BY packet_number ASC", sid)
        } else {
            "SELECT packet_number, timestamp, src_address, dst_address, src_port, dst_port,
             protocol, length, info, raw_bytes, tree_json FROM packets
             ORDER BY packet_number ASC".to_string()
        };

        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map([], |row| {
            let tree_json: Option<String> = row.get(10)?;
            let tree = tree_json
                .and_then(|j| serde_json::from_str::<ProtocolTreeNode>(&j).ok())
                .unwrap_or_else(|| ProtocolTreeNode {
                    name: "frame".to_string(),
                    description: "Frame".to_string(),
                    raw_value: None,
                    fields: None,
                    children: None,
                });

            let timestamp: i64 = row.get(1)?;
            let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0)
                .unwrap_or_else(|| chrono::Utc::now());
            let timestamp_str = dt.format("%H:%M:%S%.6f").to_string();

            Ok(PacketInfo {
                number: row.get(0)?,
                timestamp,
                timestamp_str,
                src_address: row.get(2)?,
                dst_address: row.get(3)?,
                src_port: row.get(4)?,
                dst_port: row.get(5)?,
                protocol: row.get(6)?,
                length: row.get(7)?,
                info: row.get(8).unwrap_or_default(),
                raw_bytes: row.get(9)?,
                tree,
            })
        })?;

        let mut packets = Vec::new();
        for row in rows {
            packets.push(row?);
        }
        Ok(packets)
    }

    pub fn clear_packets(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM packets", [])?;
        conn.execute("DELETE FROM sessions", [])?;
        Ok(())
    }
}
