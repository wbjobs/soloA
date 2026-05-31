CREATE DATABASE IF NOT EXISTS message_gateway DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE message_gateway;

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL UNIQUE COMMENT '消息唯一ID',
    business_id VARCHAR(64) NOT NULL COMMENT '业务方ID',
    channel_type VARCHAR(20) NOT NULL COMMENT '渠道类型: EMAIL/SMS/PUSH',
    provider_name VARCHAR(50) COMMENT '使用的供应商名称',
    recipient VARCHAR(255) NOT NULL COMMENT '接收者: 邮箱/手机号/设备ID',
    subject VARCHAR(255) COMMENT '消息主题',
    content TEXT NOT NULL COMMENT '消息内容',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SENDING/SUCCESS/FAILED',
    callback_url VARCHAR(500) COMMENT '回调URL',
    error_message TEXT COMMENT '错误信息',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    sent_at DATETIME COMMENT '发送时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_business_id (business_id),
    INDEX idx_status (status),
    INDEX idx_channel_type (channel_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息记录表';

CREATE TABLE IF NOT EXISTS message_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
    provider_name VARCHAR(50) NOT NULL COMMENT '供应商名称',
    status VARCHAR(20) NOT NULL COMMENT '发送状态',
    response TEXT COMMENT '响应内容',
    error_message TEXT COMMENT '错误信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息发送日志';

CREATE TABLE IF NOT EXISTS callback_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
    callback_url VARCHAR(500) NOT NULL COMMENT '回调URL',
    request_body TEXT COMMENT '请求体',
    response_body TEXT COMMENT '响应体',
    status VARCHAR(20) NOT NULL COMMENT '回调状态',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    error_message TEXT COMMENT '错误信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='回调日志';

CREATE TABLE IF NOT EXISTS message_templates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_code VARCHAR(64) NOT NULL UNIQUE COMMENT '模板编码',
    template_name VARCHAR(100) NOT NULL COMMENT '模板名称',
    business_id VARCHAR(64) COMMENT '业务方ID(空表示全局可用)',
    channel_type VARCHAR(20) NOT NULL COMMENT '渠道类型: EMAIL/SMS/PUSH',
    subject_template VARCHAR(255) COMMENT '主题模板',
    content_template TEXT NOT NULL COMMENT '内容模板',
    variables TEXT COMMENT '变量定义(JSON格式)',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: ACTIVE/DISABLED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(64) COMMENT '创建人',
    INDEX idx_business_id (business_id),
    INDEX idx_channel_type (channel_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息模板表';

CREATE TABLE IF NOT EXISTS metrics_stats (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    stat_date DATE NOT NULL COMMENT '统计日期',
    stat_hour INT COMMENT '统计小时(可选，用于小时级统计)',
    channel_type VARCHAR(20) NOT NULL COMMENT '渠道类型',
    provider_name VARCHAR(50) COMMENT '供应商名称',
    business_id VARCHAR(64) COMMENT '业务方ID',
    total_count INT DEFAULT 0 COMMENT '总发送数',
    success_count INT DEFAULT 0 COMMENT '成功数',
    failed_count INT DEFAULT 0 COMMENT '失败数',
    avg_latency_ms BIGINT DEFAULT 0 COMMENT '平均延迟(毫秒)',
    max_latency_ms BIGINT DEFAULT 0 COMMENT '最大延迟(毫秒)',
    p95_latency_ms BIGINT DEFAULT 0 COMMENT 'P95延迟(毫秒)',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_unique_stat (stat_date, stat_hour, channel_type, provider_name, business_id),
    INDEX idx_stat_date (stat_date),
    INDEX idx_channel_type (channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息统计指标表';

CREATE TABLE IF NOT EXISTS metrics_latency (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
    channel_type VARCHAR(20) NOT NULL COMMENT '渠道类型',
    provider_name VARCHAR(50) NOT NULL COMMENT '供应商名称',
    business_id VARCHAR(64) COMMENT '业务方ID',
    latency_ms BIGINT NOT NULL COMMENT '延迟(毫秒)',
    status VARCHAR(20) NOT NULL COMMENT '状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_created_at (created_at),
    INDEX idx_channel_type (channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='延迟明细数据表';
