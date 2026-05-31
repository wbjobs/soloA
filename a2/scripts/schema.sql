CREATE DATABASE IF NOT EXISTS task_scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE task_scheduler;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT '任务名称',
    type ENUM('once', 'interval', 'cron') NOT NULL COMMENT '任务类型: 一次性, 间隔, Cron',
    handler VARCHAR(255) NOT NULL COMMENT '任务处理器名称',
    payload JSON COMMENT '任务参数',
    status ENUM('pending', 'running', 'success', 'failed', 'paused', 'waiting') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
    cron_expr VARCHAR(100) COMMENT 'Cron 表达式',
    interval_seconds INT COMMENT '间隔执行秒数',
    run_at DATETIME COMMENT '一次性任务执行时间',
    max_retry INT NOT NULL DEFAULT 3 COMMENT '最大重试次数',
    retry_count INT NOT NULL DEFAULT 0 COMMENT '已重试次数',
    timeout_seconds INT NOT NULL DEFAULT 60 COMMENT '超时秒数',
    last_run_at DATETIME COMMENT '上次执行时间',
    next_run_at DATETIME COMMENT '下次执行时间',
    parent_task_id BIGINT DEFAULT NULL COMMENT '父任务ID（任务依赖）',
    dependency_status ENUM('all_success', 'any_success', 'all_complete') DEFAULT 'all_success' COMMENT '依赖满足条件',
    notify_on_success TINYINT(1) DEFAULT 0 COMMENT '是否成功通知',
    notify_on_failure TINYINT(1) DEFAULT 1 COMMENT '是否失败通知',
    notify_channels JSON COMMENT '通知渠道列表',
    priority INT NOT NULL DEFAULT 0 COMMENT '任务优先级（值越大优先级越高）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status_next_run (status, next_run_at),
    INDEX idx_type (type),
    INDEX idx_next_run_at (next_run_at),
    INDEX idx_parent_task_id (parent_task_id),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务表';

CREATE TABLE IF NOT EXISTS task_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL COMMENT '任务ID',
    status ENUM('success', 'failed', 'running') NOT NULL COMMENT '执行状态',
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    duration_ms BIGINT COMMENT '执行耗时毫秒',
    result TEXT COMMENT '执行结果',
    error_msg TEXT COMMENT '错误信息',
    worker_id VARCHAR(64) COMMENT '执行节点ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_created_at (created_at),
    INDEX idx_task_id_created_at (task_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务执行日志表';

CREATE TABLE IF NOT EXISTS task_dependencies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL COMMENT '子任务ID',
    parent_task_id BIGINT NOT NULL COMMENT '父任务ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_task_parent (task_id, parent_task_id),
    INDEX idx_parent_task_id (parent_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务依赖关系表';

CREATE TABLE IF NOT EXISTS notify_configs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT '配置名称',
    channel_type ENUM('email', 'wechat_work') NOT NULL COMMENT '通知渠道类型',
    config JSON NOT NULL COMMENT '渠道配置',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认渠道',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知配置表';

CREATE TABLE IF NOT EXISTS autoscale_configs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL DEFAULT 'default' COMMENT '配置名称',
    min_workers INT NOT NULL DEFAULT 1 COMMENT '最小Worker数',
    max_workers INT NOT NULL DEFAULT 20 COMMENT '最大Worker数',
    scale_up_threshold INT NOT NULL DEFAULT 100 COMMENT '扩容阈值（队列积压任务数）',
    scale_down_threshold INT NOT NULL DEFAULT 10 COMMENT '缩容阈值（队列积压任务数）',
    scale_up_step INT NOT NULL DEFAULT 2 COMMENT '扩容步长',
    scale_down_step INT NOT NULL DEFAULT 1 COMMENT '缩容步长',
    cooldown_seconds INT NOT NULL DEFAULT 60 COMMENT '扩容冷却时间（秒）',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用自动扩缩容',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自动扩缩容配置表';

INSERT INTO autoscale_configs (name, min_workers, max_workers, scale_up_threshold, scale_down_threshold, scale_up_step, scale_down_step, cooldown_seconds, enabled)
VALUES ('default', 2, 20, 50, 10, 2, 1, 60, 1);
