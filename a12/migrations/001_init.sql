CREATE DATABASE IF NOT EXISTS task_scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE task_scheduler;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    task_type ENUM('shell', 'http', 'go') NOT NULL,
    task_config JSON NOT NULL,
    timeout INT DEFAULT 300 COMMENT 'Timeout in seconds',
    retry_count INT DEFAULT 0,
    retry_interval INT DEFAULT 60 COMMENT 'Retry interval in seconds',
    status ENUM('enabled', 'disabled') DEFAULT 'enabled',
    description VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tasks_name (name),
    INDEX idx_tasks_status (status),
    INDEX idx_tasks_type (task_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task definitions';

CREATE TABLE IF NOT EXISTS task_execution_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT UNSIGNED NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    execution_node VARCHAR(100),
    status ENUM('running', 'success', 'failed', 'timeout') NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    duration BIGINT COMMENT 'Duration in milliseconds',
    retry_count INT DEFAULT 0,
    error_message TEXT,
    output LONGTEXT,
    trigger_type VARCHAR(20) COMMENT 'scheduled or manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_logs_task_id (task_id),
    INDEX idx_logs_status (status),
    INDEX idx_logs_start_time (start_time),
    INDEX idx_logs_task_time (task_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task execution logs';

CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(100) PRIMARY KEY,
    host VARCHAR(100) NOT NULL,
    grpc_port INT NOT NULL,
    status ENUM('active', 'inactive', 'offline') DEFAULT 'active',
    last_heartbeat DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nodes_status (status),
    INDEX idx_nodes_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cluster nodes';
