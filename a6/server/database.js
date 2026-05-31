const Database = require('better-sqlite3')
const path = require('path')

class GameDatabase {
  constructor() {
    const dbPath = path.join(__dirname, 'game.db')
    this.db = new Database(dbPath)
    this.init()
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        elo INTEGER DEFAULT 1000,
        matches_played INTEGER DEFAULT 0,
        matches_won INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host_id INTEGER NOT NULL,
        guest_id INTEGER NOT NULL,
        song_title TEXT,
        beatmap_id INTEGER,
        host_score INTEGER,
        guest_score INTEGER,
        winner_id INTEGER,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES players(id),
        FOREIGN KEY (guest_id) REFERENCES players(id),
        FOREIGN KEY (winner_id) REFERENCES players(id),
        FOREIGN KEY (beatmap_id) REFERENCES beatmaps(id)
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS beatmaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT,
        creator_id INTEGER,
        creator_name TEXT,
        bpm INTEGER,
        duration REAL,
        difficulty TEXT DEFAULT 'normal',
        description TEXT,
        notes_count INTEGER DEFAULT 0,
        is_public INTEGER DEFAULT 1,
        audio_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES players(id)
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beatmap_id INTEGER NOT NULL,
        note_time REAL NOT NULL,
        lane INTEGER NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'tap',
        duration REAL,
        end_time REAL,
        note_index INTEGER,
        FOREIGN KEY (beatmap_id) REFERENCES beatmaps(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(host_id, guest_id)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_beatmap ON notes(beatmap_id)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_beatmaps_creator ON beatmaps(creator_id)
    `)
  }

  createPlayer(name) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO players (name) VALUES (?)
      `)
      const result = stmt.run(name)
      return this.getPlayer(result.lastInsertRowid)
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT') {
        return this.getPlayerByName(name)
      }
      throw e
    }
  }

  getPlayer(id) {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id)
  }

  getPlayerByName(name) {
    return this.db.prepare('SELECT * FROM players WHERE name = ?').get(name)
  }

  updatePlayerElo(playerId, newElo) {
    this.db.prepare('UPDATE players SET elo = ? WHERE id = ?').run(newElo, playerId)
  }

  createBeatmap(beatmapData, notes) {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO beatmaps (title, artist, creator_id, creator_name, bpm, duration, difficulty, description, notes_count, is_public, audio_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      const result = stmt.run(
        beatmapData.title,
        beatmapData.artist,
        beatmapData.creatorId,
        beatmapData.creatorName,
        beatmapData.bpm,
        beatmapData.duration,
        beatmapData.difficulty || 'normal',
        beatmapData.description || '',
        notes.length,
        beatmapData.isPublic !== false ? 1 : 0,
        beatmapData.audioHash || null
      )

      const beatmapId = result.lastInsertRowid

      const noteStmt = this.db.prepare(`
        INSERT INTO notes (beatmap_id, note_time, lane, note_type, duration, end_time, note_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      notes.forEach((note, index) => {
        noteStmt.run(
          beatmapId,
          note.time,
          note.lane,
          note.type || 'tap',
          note.duration || null,
          note.endTime || null,
          index
        )
      })

      return beatmapId
    })

    try {
      return transaction()
    } catch (e) {
      throw e
    }
  }

  updateBeatmap(beatmapId, beatmapData, notes) {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM notes WHERE beatmap_id = ?').run(beatmapId)

      this.db.prepare(`
        UPDATE beatmaps 
        SET title = ?, artist = ?, bpm = ?, duration = ?, difficulty = ?, description = ?, 
            notes_count = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        beatmapData.title,
        beatmapData.artist,
        beatmapData.bpm,
        beatmapData.duration,
        beatmapData.difficulty || 'normal',
        beatmapData.description || '',
        notes.length,
        beatmapData.isPublic !== false ? 1 : 0,
        beatmapId
      )

      const noteStmt = this.db.prepare(`
        INSERT INTO notes (beatmap_id, note_time, lane, note_type, duration, end_time, note_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      notes.forEach((note, index) => {
        noteStmt.run(
          beatmapId,
          note.time,
          note.lane,
          note.type || 'tap',
          note.duration || null,
          note.endTime || null,
          index
        )
      })

      return true
    })

    try {
      return transaction()
    } catch (e) {
      throw e
    }
  }

  getBeatmap(id) {
    const beatmap = this.db.prepare('SELECT * FROM beatmaps WHERE id = ?').get(id)
    if (!beatmap) return null

    const notes = this.db.prepare(`
      SELECT * FROM notes 
      WHERE beatmap_id = ? 
      ORDER BY note_index ASC
    `).all(id)

    return {
      ...beatmap,
      isPublic: beatmap.is_public === 1,
      notes: notes.map(note => ({
        id: `note_${note.note_index}`,
        time: note.note_time,
        lane: note.lane,
        type: note.note_type,
        duration: note.duration,
        endTime: note.end_time
      }))
    }
  }

  getBeatmapList(options = {}) {
    let query = 'SELECT * FROM beatmaps WHERE 1=1'
    const params = []

    if (options.creatorId) {
      query += ' AND creator_id = ?'
      params.push(options.creatorId)
    }

    if (options.publicOnly !== false) {
      query += ' AND is_public = 1'
    }

    query += ' ORDER BY created_at DESC'

    if (options.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
    }

    const beatmaps = this.db.prepare(query).all(...params)

    return beatmaps.map(beatmap => ({
      ...beatmap,
      isPublic: beatmap.is_public === 1
    }))
  }

  searchBeatmaps(keyword, options = {}) {
    let query = `
      SELECT b.*, 
             (SELECT COUNT(*) FROM matches m WHERE m.beatmap_id = b.id) as play_count
      FROM beatmaps b 
      WHERE (title LIKE ? OR artist LIKE ? OR creator_name LIKE ?)
    `
    const params = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]

    if (options.publicOnly !== false) {
      query += ' AND is_public = 1'
    }

    query += ' ORDER BY play_count DESC, created_at DESC LIMIT 50'

    const beatmaps = this.db.prepare(query).all(...params)

    return beatmaps.map(beatmap => ({
      ...beatmap,
      isPublic: beatmap.is_public === 1
    }))
  }

  deleteBeatmap(beatmapId, creatorId) {
    const beatmap = this.db.prepare('SELECT * FROM beatmaps WHERE id = ?').get(beatmapId)
    
    if (!beatmap) return false
    if (beatmap.creator_id !== creatorId) return false

    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM notes WHERE beatmap_id = ?').run(beatmapId)
      this.db.prepare('DELETE FROM beatmaps WHERE id = ?').run(beatmapId)
      return true
    })

    return transaction()
  }

  createMatch(matchData) {
    const stmt = this.db.prepare(`
      INSERT INTO matches (host_id, guest_id, song_title, beatmap_id, host_score, guest_score, winner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    const result = stmt.run(
      matchData.hostId,
      matchData.guestId,
      matchData.songTitle,
      matchData.beatmapId || null,
      matchData.hostScore,
      matchData.guestScore,
      matchData.winnerId
    )

    this.db.prepare(`
      UPDATE players SET 
        matches_played = matches_played + 1,
        matches_won = matches_won + (CASE WHEN id = ? THEN 1 ELSE 0 END)
      WHERE id IN (?, ?)
    `).run(
      matchData.winnerId,
      matchData.hostId,
      matchData.guestId
    )

    return { id: result.lastInsertRowid }
  }

  getMatchHistory(playerId) {
    const matches = this.db.prepare(`
      SELECT 
        m.*,
        p1.name as host_name,
        p1.elo as host_elo,
        p2.name as guest_name,
        p2.elo as guest_elo,
        b.title as beatmap_title
      FROM matches m
      JOIN players p1 ON m.host_id = p1.id
      JOIN players p2 ON m.guest_id = p2.id
      LEFT JOIN beatmaps b ON m.beatmap_id = b.id
      WHERE m.host_id = ? OR m.guest_id = ?
      ORDER BY m.played_at DESC
      LIMIT 20
    `).all(playerId, playerId)

    return matches.map(match => ({
      ...match,
      isHost: match.host_id === playerId,
      won: match.winner_id === playerId
    }))
  }

  getLeaderboard(limit = 10) {
    return this.db.prepare(`
      SELECT * FROM players
      ORDER BY elo DESC
      LIMIT ?
    `).all(limit)
  }

  close() {
    this.db.close()
  }
}

module.exports = GameDatabase
