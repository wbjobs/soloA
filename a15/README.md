# 多人在线回合制策略对战游戏后端服务

基于 Java + Spring Boot + Netty 的多人在线回合制策略对战游戏完整后端实现。

## 技术栈

- **后端框架**: Spring Boot 2.7.x
- **网络通信**: Netty 4.1.x (WebSocket)
- **数据序列化**: Protocol Buffers 3.x
- **关系型数据库**: MySQL 8.0 (用户信息/游戏数据持久化)
- **缓存**: Redis (房间/会话缓存)
- **ORM**: MyBatis-Plus 3.5.x
- **安全**: Spring Security + JWT
- **连接池**: Druid

## 核心功能模块

### 1. 用户系统
- 用户注册、登录、登出
- JWT Token 认证
- 玩家信息管理 (昵称、头像、等级)
- 积分/等级系统
- 战绩统计 (胜场、败场、总场次)

### 2. 房间系统
- 创建房间、加入房间、退出房间
- 房间密码保护
- 房间状态管理 (等待中/准备中/游戏中/已结束)
- 最多4人同时在线
- 玩家准备状态同步
- 房间列表查询

### 3. 回合制对战
- 回合同步机制
- 回合顺序基于英雄速度值
- 玩家操作处理 (移动、攻击、技能、结束回合)
- 游戏状态实时广播
- 30秒回合超时机制

### 4. 战斗系统
- 技能释放系统 (单体、群体、区域、自身)
- 伤害计算 (物理、魔法、真实伤害)
- 状态效果管理 (眩晕、中毒、燃烧、减速、护盾、攻防增减)
- 技能优先级和冷却机制
- 护盾吸收伤害
- 暴击和随机伤害波动

### 5. 游戏回放
- 对战过程实时记录
- 回放文件 GZIP 压缩存储
- 回放列表查询
- 支持后续回放播放

### 6. 断线重连
- 玩家断线检测
- 重新连接房间
- 恢复当前游戏状态
- 会话管理和心跳保活

## 项目结构

```
turn-based-strategy-game/
├── src/main/
│   ├── java/com/game/
│   │   ├── GameApplication.java          # Spring Boot 主入口
│   │   ├── config/                       # 配置类
│   │   │   ├── GameConfig.java
│   │   │   ├── MybatisPlusMetaHandler.java
│   │   │   ├── RedisConfig.java
│   │   │   └── SecurityConfig.java
│   │   ├── controller/                   # REST API 控制器
│   │   │   └── GameApiController.java
│   │   ├── entity/                       # 数据库实体类
│   │   │   ├── GameMatch.java
│   │   │   ├── Hero.java
│   │   │   ├── MatchPlayer.java
│   │   │   ├── PlayerStats.java
│   │   │   └── User.java
│   │   ├── mapper/                       # MyBatis-Plus Mapper
│   │   │   ├── GameMatchMapper.java
│   │   │   ├── HeroMapper.java
│   │   │   ├── MatchPlayerMapper.java
│   │   │   ├── PlayerStatsMapper.java
│   │   │   └── UserMapper.java
│   │   ├── model/                        # 游戏核心模型
│   │   │   ├── ActionRecord.java
│   │   │   ├── ActionResult.java
│   │   │   ├── GameState.java
│   │   │   ├── HeroInstance.java
│   │   │   ├── PlayerInfo.java
│   │   │   ├── Position.java
│   │   │   ├── ReplayData.java
│   │   │   ├── Room.java
│   │   │   ├── Skill.java
│   │   │   ├── StatusEffect.java
│   │   │   └── StatusEffectTemplate.java
│   │   ├── netty/                        # Netty WebSocket 服务
│   │   │   ├── GameMessageHandler.java
│   │   │   ├── NettyWebSocketServer.java
│   │   │   └── ProtobufWebSocketFrameHandler.java
│   │   └── service/                      # 业务服务层
│   │       ├── GameService.java
│   │       ├── RedisService.java
│   │       ├── ReplayService.java
│   │       ├── RoomService.java
│   │       └── UserService.java
│   ├── proto/                            # Protobuf 协议定义
│   │   └── game.proto
│   └── resources/
│       ├── application.yml               # 应用配置
│       └── schema.sql                    # 数据库初始化脚本
└── pom.xml                               # Maven 配置
```

## 通信协议说明

所有通信基于 Protocol Buffers 二进制序列化，通过 WebSocket Binary Frame 传输。

### 消息类型

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| MSG_LOGIN_REQ/RES | C->S/S->C | 登录请求/响应 |
| MSG_REGISTER_REQ/RES | C->S/S->C | 注册请求/响应 |
| MSG_LOGOUT_REQ/RES | C->S/S->C | 登出请求/响应 |
| MSG_HEARTBEAT_REQ/RES | C->S/S->C | 心跳保活 |
| MSG_CREATE_ROOM_REQ/RES | C->S/S->C | 创建房间 |
| MSG_JOIN_ROOM_REQ/RES | C->S/S->C | 加入房间 |
| MSG_LEAVE_ROOM_REQ/RES | C->S/S->C | 退出房间 |
| MSG_ROOM_LIST_REQ/RES | C->S/S->C | 房间列表 |
| MSG_ROOM_UPDATE_NOTIFY | S->C | 房间状态更新广播 |
| MSG_SELECT_HERO_REQ/RES | C->S/S->C | 选择英雄 |
| MSG_START_GAME_REQ/RES | C->S/S->C | 开始游戏 |
| MSG_GAME_START_NOTIFY | S->C | 游戏开始广播 |
| MSG_TURN_START_NOTIFY | S->C | 回合开始通知 |
| MSG_ACTION_REQ/RES | C->S/S->C | 玩家操作 |
| MSG_ACTION_BROADCAST | S->C | 操作结果广播 |
| MSG_GAME_STATE_NOTIFY | S->C | 游戏状态同步 |
| MSG_RECONNECT_REQ/RES | C->S/S->C | 断线重连 |
| MSG_GAME_END_NOTIFY | S->C | 游戏结束广播 |
| MSG_REPLAY_LIST_REQ/RES | C->S/S->C | 回放列表 |
| MSG_REPLAY_PLAY_REQ/RES | C->S/S->C | 回放播放 |

### 消息格式

```protobuf
message GameMessage {
    int32 sequence = 1;                    // 消息序号，用于响应匹配
    MessageType type = 2;                  // 消息类型
    int64 sender_id = 3;                   // 发送者ID
    int64 timestamp = 4;                   // 时间戳
    oneof payload { ... }                  // 消息体
}
```

## 快速开始

### 前置要求

- JDK 11+
- Maven 3.6+
- MySQL 8.0+
- Redis 5.0+

### 数据库配置

1. 创建数据库并执行初始化脚本：
```bash
mysql -u root -p < src/main/resources/schema.sql
```

2. 修改 `application.yml` 中的数据库连接配置：
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/game_db
    username: your_username
    password: your_password
  redis:
    host: localhost
    port: 6379
    password: your_redis_password
```

### 编译与运行

1. 编译项目 (自动生成 Protobuf 代码):
```bash
mvn clean compile
```

2. 运行应用:
```bash
mvn spring-boot:run
```

或者打包后运行:
```bash
mvn clean package
java -jar target/turn-based-strategy-game-1.0.0.jar
```

### 服务端口

- **HTTP REST API**: 8080
- **WebSocket**: 9000 (路径: `/ws`)

## REST API 接口

### 用户相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 用户注册 |
| POST | `/api/login` | 用户登录 |

### 房间相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/rooms/create` | 创建房间 (需JWT) |
| POST | `/api/rooms/join` | 加入房间 (需JWT) |
| POST | `/api/rooms/leave` | 退出房间 (需JWT) |
| GET | `/api/rooms` | 房间列表 |
| GET | `/api/rooms/{roomId}` | 房间详情 |

### 游戏相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/players/{userId}` | 玩家信息 |
| GET | `/api/game/{matchId}` | 游戏状态 |

### 回放相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/replays` | 回放列表 |
| GET | `/api/replays/{matchId}` | 回放详情 |

## 英雄系统

内置4个预设英雄：

| 英雄ID | 名称 | 特点 |
|--------|------|------|
| warrior_001 | 战士 | 高生命、高防御、近战，有眩晕控制 |
| mage_001 | 法师 | 高魔法伤害、远程、范围攻击、燃烧效果 |
| healer_001 | 治疗师 | 治疗能力、团队增益、中等移动 |
| archer_001 | 弓箭手 | 高速度、超远射程、持续中毒 |

## 状态效果

| 效果 | 类型 | 说明 |
|------|------|------|
| 眩晕 (STUN) | 控制 | 跳过下一回合 |
| 中毒 (POISON) | 减益 | 回合开始时受到持续伤害 |
| 燃烧 (BURN) | 减益 | 回合开始时受到火焰伤害 |
| 减速 (SLOW) | 减益 | 行动顺序降低30% |
| 护盾 (SHIELD) | 增益 | 吸收伤害 |
| 攻击提升 (ATK_UP) | 增益 | 攻击力增加 |
| 攻击降低 (ATK_DOWN) | 减益 | 攻击力降低 |
| 防御提升 (DEF_UP) | 增益 | 防御力增加 |
| 防御降低 (DEF_DOWN) | 减益 | 防御力降低 |

## 部署建议

### 生产环境配置

1. 修改 JWT 密钥:
```yaml
jwt:
  secret: your-production-secret-key-at-least-256-bits
  expiration: 86400000
```

2. 配置 Redis 集群:
```yaml
spring:
  redis:
    cluster:
      nodes:
        - redis1:6379
        - redis2:6379
```

3. 数据库连接池调优:
```yaml
spring:
  datasource:
    druid:
      max-active: 50
      min-idle: 10
```

### Docker 部署

```dockerfile
FROM openjdk:11-jre-slim
COPY target/turn-based-strategy-game-1.0.0.jar app.jar
EXPOSE 8080 9000
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

## 扩展开发指南

### 添加新英雄

1. 在数据库 `heroes` 表中插入英雄数据
2. 在 `GameService.createHeroSkills()` 中添加技能定义
3. 实现英雄独特的被动效果（如需要）

### 添加新技能

1. 在 `game.proto` 中扩展协议（如需要新类型）
2. 在 `Skill` 模型中配置技能参数
3. 在 `GameState.useSkill()` 中实现技能逻辑

### 自定义游戏模式

1. 创建新的 `GameMode` 枚举
2. 扩展 `GameService.initializeGameState()` 中的初始化逻辑
3. 修改房间创建接口支持新模式参数

## License

MIT License
