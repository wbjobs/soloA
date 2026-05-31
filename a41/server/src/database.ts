import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'distributed_computing',
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'offline',
        cpu_usage DECIMAL(5,2),
        memory_usage DECIMAL(5,2),
        network_bandwidth DECIMAL(10,2),
        current_task_id VARCHAR(36),
        current_task_priority INTEGER,
        last_heartbeat TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        priority INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_chunks INTEGER NOT NULL DEFAULT 0,
        completed_chunks INTEGER NOT NULL DEFAULT 0,
        data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_chunks (
        id VARCHAR(36) PRIMARY KEY,
        task_id VARCHAR(36) REFERENCES tasks(id),
        chunk_index INTEGER NOT NULL,
        data TEXT,
        assigned_to VARCHAR(36) REFERENCES nodes(id),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        intermediate_result TEXT,
        result TEXT,
        assigned_at TIMESTAMP,
        started_at TIMESTAMP,
        paused_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS execution_logs (
        id VARCHAR(36) PRIMARY KEY,
        task_id VARCHAR(36) REFERENCES tasks(id),
        node_id VARCHAR(36) REFERENCES nodes(id),
        chunk_id VARCHAR(36) REFERENCES task_chunks(id),
        log_level VARCHAR(20) NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_task ON task_chunks(task_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_status ON task_chunks(status);
      CREATE INDEX IF NOT EXISTS idx_logs_task ON execution_logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='priority') THEN
          ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_chunks' AND column_name='started_at') THEN
          ALTER TABLE task_chunks ADD COLUMN started_at TIMESTAMP;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_chunks' AND column_name='paused_at') THEN
          ALTER TABLE task_chunks ADD COLUMN paused_at TIMESTAMP;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_chunks' AND column_name='intermediate_result') THEN
          ALTER TABLE task_chunks ADD COLUMN intermediate_result TEXT;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='network_bandwidth') THEN
          ALTER TABLE nodes ADD COLUMN network_bandwidth DECIMAL(10,2);
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='current_task_priority') THEN
          ALTER TABLE nodes ADD COLUMN current_task_priority INTEGER;
        END IF;
      END $$;
    `);
    
  } finally {
    client.release();
  }
}

export default pool;
