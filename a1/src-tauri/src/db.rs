use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DailyStats {
    pub count: i32,
    pub total_seconds: i32,
}

#[derive(Serialize)]
pub struct TagStats {
    pub tag: String,
    pub count: i32,
    pub total_seconds: i32,
}

#[derive(Serialize)]
pub struct SavedTag {
    pub id: i32,
    pub name: String,
    pub color: String,
}

pub fn init_db(db_path: &PathBuf) -> Result<(), rusqlite::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(db_path)?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS saved_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#ef4444'
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS pomodoros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            duration INTEGER NOT NULL,
            completed_at TEXT NOT NULL,
            tag TEXT
        )",
        [],
    )?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM saved_tags")?;
    let count: i32 = stmt.query_row([], |row| row.get(0))?;
    
    if count == 0 {
        let default_tags = [
            ("工作", "#ef4444"),
            ("学习", "#3b82f6"),
            ("运动", "#22c55e"),
            ("阅读", "#f59e0b"),
            ("其他", "#8b5cf6"),
        ];
        
        for (name, color) in default_tags.iter() {
            conn.execute(
                "INSERT INTO saved_tags (name, color) VALUES (?1, ?2)",
                params![name, color],
            )?;
        }
    }

    Ok(())
}

pub fn save_pomodoro_with_tag(
    db_path: &PathBuf, 
    duration: i32, 
    tag: Option<&str>
) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO pomodoros (duration, completed_at, tag) VALUES (?1, ?2, ?3)",
        params![duration, now, tag],
    )?;
    Ok(())
}

pub fn get_today_stats(db_path: &PathBuf) -> Result<DailyStats, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        "SELECT COUNT(*), COALESCE(SUM(duration), 0) 
         FROM pomodoros 
         WHERE DATE(completed_at) = ?1",
    )?;
    let mut rows = stmt.query(params![today])?;
    if let Some(row) = rows.next()? {
        Ok(DailyStats {
            count: row.get(0)?,
            total_seconds: row.get(1)?,
        })
    } else {
        Ok(DailyStats {
            count: 0,
            total_seconds: 0,
        })
    }
}

pub fn get_today_tag_stats(db_path: &PathBuf) -> Result<Vec<TagStats>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        "SELECT 
            COALESCE(tag, '未分类') as tag_name,
            COUNT(*) as count,
            COALESCE(SUM(duration), 0) as total_seconds
         FROM pomodoros 
         WHERE DATE(completed_at) = ?1
         GROUP BY tag_name
         ORDER BY total_seconds DESC",
    )?;
    
    let rows = stmt.query_map(params![today], |row| {
        Ok(TagStats {
            tag: row.get(0)?,
            count: row.get(1)?,
            total_seconds: row.get(2)?,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

pub fn get_all_tag_stats(db_path: &PathBuf) -> Result<Vec<TagStats>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT 
            COALESCE(tag, '未分类') as tag_name,
            COUNT(*) as count,
            COALESCE(SUM(duration), 0) as total_seconds
         FROM pomodoros 
         GROUP BY tag_name
         ORDER BY total_seconds DESC",
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok(TagStats {
            tag: row.get(0)?,
            count: row.get(1)?,
            total_seconds: row.get(2)?,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

pub fn get_saved_tags(db_path: &PathBuf) -> Result<Vec<SavedTag>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, color FROM saved_tags ORDER BY id",
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok(SavedTag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

pub fn add_tag(db_path: &PathBuf, name: &str, color: &str) -> Result<i32, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "INSERT INTO saved_tags (name, color) VALUES (?1, ?2)",
        params![name, color],
    )?;
    Ok(conn.last_insert_rowid() as i32)
}

pub fn delete_tag(db_path: &PathBuf, id: i32) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM saved_tags WHERE id = ?1", params![id])?;
    Ok(())
}
