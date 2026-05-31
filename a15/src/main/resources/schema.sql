CREATE DATABASE IF NOT EXISTS game_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE game_db;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码(加密)',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    nickname VARCHAR(50) DEFAULT NULL COMMENT '昵称',
    avatar VARCHAR(255) DEFAULT NULL COMMENT '头像URL',
    level INT NOT NULL DEFAULT 1 COMMENT '等级',
    experience INT NOT NULL DEFAULT 0 COMMENT '经验值',
    rating INT NOT NULL DEFAULT 1500 COMMENT '积分',
    matches_played INT NOT NULL DEFAULT 0 COMMENT '总场次',
    matches_won INT NOT NULL DEFAULT 0 COMMENT '胜利场次',
    matches_lost INT NOT NULL DEFAULT 0 COMMENT '失败场次',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态: 0-正常, 1-封禁',
    last_login_at DATETIME DEFAULT NULL COMMENT '最后登录时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    INDEX idx_username (username),
    INDEX idx_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

CREATE TABLE IF NOT EXISTS player_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL COMMENT '用户ID',
    hero_id VARCHAR(50) NOT NULL COMMENT '英雄ID',
    games_played INT NOT NULL DEFAULT 0,
    games_won INT NOT NULL DEFAULT 0,
    total_kills INT NOT NULL DEFAULT 0,
    total_deaths INT NOT NULL DEFAULT 0,
    total_assists INT NOT NULL DEFAULT 0,
    total_damage_dealt BIGINT NOT NULL DEFAULT 0,
    total_damage_taken BIGINT NOT NULL DEFAULT 0,
    total_healing BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_hero (user_id, hero_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='玩家统计';

CREATE TABLE IF NOT EXISTS game_matches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    match_id VARCHAR(64) NOT NULL UNIQUE COMMENT '对战唯一ID',
    room_id VARCHAR(64) NOT NULL COMMENT '房间ID',
    game_mode VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT '游戏模式',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态: 0-进行中, 1-已结束',
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME DEFAULT NULL COMMENT '结束时间',
    duration_seconds INT DEFAULT NULL COMMENT '持续时间(秒)',
    winner_id BIGINT DEFAULT NULL COMMENT '获胜者用户ID',
    replay_file_path VARCHAR(255) DEFAULT NULL COMMENT '回放文件路径',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_match_id (match_id),
    INDEX idx_room_id (room_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏对战';

CREATE TABLE IF NOT EXISTS match_players (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    match_id VARCHAR(64) NOT NULL COMMENT '对战ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    hero_id VARCHAR(50) NOT NULL COMMENT '选择的英雄',
    team_id TINYINT NOT NULL DEFAULT 1 COMMENT '队伍ID: 1-队伍1, 2-队伍2',
    is_ai TINYINT NOT NULL DEFAULT 0 COMMENT '是否AI',
    position INT NOT NULL DEFAULT 0 COMMENT '座位位置',
    result TINYINT DEFAULT NULL COMMENT '结果: 1-胜利, 0-失败',
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    assists INT DEFAULT 0,
    damage_dealt BIGINT DEFAULT 0,
    damage_taken BIGINT DEFAULT 0,
    healing BIGINT DEFAULT 0,
    rating_change INT DEFAULT 0 COMMENT '积分变化',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_match_user (match_id, user_id),
    INDEX idx_match_id (match_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对战玩家';

CREATE TABLE IF NOT EXISTS heroes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '英雄名称',
    description TEXT COMMENT '描述',
    avatar VARCHAR(255) DEFAULT NULL,
    base_health INT NOT NULL COMMENT '基础生命值',
    base_attack INT NOT NULL COMMENT '基础攻击力',
    base_defense INT NOT NULL COMMENT '基础防御力',
    base_speed INT NOT NULL COMMENT '基础速度(行动顺序)',
    move_range INT NOT NULL DEFAULT 2 COMMENT '移动范围',
    attack_range INT NOT NULL DEFAULT 1 COMMENT '攻击范围',
    skill_set JSON NOT NULL COMMENT '技能列表',
    passive_skill JSON DEFAULT NULL COMMENT '被动技能',
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='英雄表';

CREATE TABLE IF NOT EXISTS skills (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '技能名称',
    description TEXT COMMENT '描述',
    hero_id VARCHAR(50) NOT NULL COMMENT '所属英雄',
    skill_type VARCHAR(20) NOT NULL COMMENT '技能类型: ACTIVE/PASSIVE',
    target_type VARCHAR(20) NOT NULL COMMENT '目标类型: SINGLE/TEAM/AREA/SELF',
    damage_type VARCHAR(20) DEFAULT 'PHYSICAL' COMMENT '伤害类型: PHYSICAL/MAGICAL/TRUE',
    damage INT DEFAULT 0 COMMENT '伤害值',
    damage_per_level INT DEFAULT 0 COMMENT '每级伤害加成',
    healing INT DEFAULT 0 COMMENT '治疗值',
    cooldown INT NOT NULL DEFAULT 0 COMMENT '冷却回合数',
    range INT NOT NULL DEFAULT 1 COMMENT '技能范围',
    aoe_radius INT DEFAULT 0 COMMENT 'AOE半径',
    priority INT NOT NULL DEFAULT 0 COMMENT '技能优先级',
    status_effects JSON DEFAULT NULL COMMENT '状态效果列表',
    mana_cost INT DEFAULT 0 COMMENT '法力消耗',
    icon VARCHAR(255) DEFAULT NULL,
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at DATETOSTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能表';

CREATE TABLE IF NOT EXISTS status_effects (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    effect_type VARCHAR(20) NOT NULL COMMENT '类型: BUFF/DEBUFF/CONTROL',
    category VARCHAR(20) NOT NULL COMMENT '分类: STUN/POISON/BURN/SLOW/SHIELD/ATK_UP/etc',
    duration INT NOT NULL DEFAULT 2 COMMENT '持续回合',
    can_stack TINYINT NOT NULL DEFAULT 0 COMMENT '是否可叠加',
    max_stacks INT DEFAULT 1,
    icon VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='状态效果表';

CREATE TABLE IF NOT EXISTS friendships (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL COMMENT '用户ID',
    friend_id BIGINT NOT NULL COMMENT '好友ID',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态: 0-待确认, 1-已接受, 2-已拒绝, 3-已删除',
    alias VARCHAR(50) DEFAULT NULL COMMENT '好友备注',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_friend (user_id, friend_id),
    INDEX idx_user_id (user_id),
    INDEX idx_friend_id (friend_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表';

CREATE TABLE IF NOT EXISTS friend_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    from_user_id BIGINT NOT NULL COMMENT '发送者ID',
    to_user_id BIGINT NOT NULL COMMENT '接收者ID',
    message VARCHAR(200) DEFAULT NULL COMMENT '请求消息',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态: 0-待处理, 1-已接受, 2-已拒绝, 3-已过期',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_from_user (from_user_id),
    INDEX idx_to_user (to_user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友请求表';

CREATE TABLE IF NOT EXISTS game_invites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    invite_id VARCHAR(64) NOT NULL UNIQUE COMMENT '邀请ID',
    room_id VARCHAR(64) NOT NULL COMMENT '房间ID',
    inviter_id BIGINT NOT NULL COMMENT '邀请者ID',
    invitee_id BIGINT NOT NULL COMMENT '被邀请者ID',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态: 0-待处理, 1-已接受, 2-已拒绝, 3-已过期',
    ai_difficulty INT DEFAULT 0 COMMENT 'AI难度: 0-简单, 1-普通, 2-困难',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL COMMENT '过期时间',
    INDEX idx_invitee_id (invitee_id),
    INDEX idx_status (status),
    INDEX idx_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏邀请表';

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    snapshot_type VARCHAR(20) NOT NULL COMMENT '类型: RATING/LEVEL/WINS',
    snapshot_date DATE NOT NULL COMMENT '快照日期',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    rank INT NOT NULL COMMENT '排名',
    value INT NOT NULL COMMENT '值',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_snapshot_user (snapshot_type, snapshot_date, user_id),
    INDEX idx_snapshot_rank (snapshot_type, snapshot_date, rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='排行榜快照';
