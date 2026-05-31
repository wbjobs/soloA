package game

import "time"

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type PlayerState string

const (
	PlayerStateAlive PlayerState = "alive"
	PlayerStateGhost PlayerState = "ghost"
	PlayerStateDead  PlayerState = "dead"
)

type Player struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Position Position    `json:"position"`
	Health   int         `json:"health"`
	MaxHealth int       `json:"maxHealth"`
	Attack   int         `json:"attack"`
	Defense  int         `json:"defense"`
	Speed    int         `json:"speed"`
	Level    int         `json:"level"`
	Exp      int         `json:"exp"`
	Gold     int         `json:"gold"`
	Inventory []Item     `json:"inventory"`
	Equipment Equipment  `json:"equipment"`
	Floor    int         `json:"floor"`
	IsAlive  bool        `json:"isAlive"`
	State    PlayerState `json:"state"`
	MarkedEnemies []string `json:"markedEnemies,omitempty"`
	PoisonDamage int     `json:"poisonDamage,omitempty"`
	PoisonDuration int   `json:"poisonDuration,omitempty"`
}

type TrapType string

const (
	TrapTypePressurePlate TrapType = "pressure_plate"
	TrapTypePoisonFog    TrapType = "poison_fog"
	TrapTypeFallingRock  TrapType = "falling_rock"
)

type TrapStatus string

const (
	TrapStatusInactive TrapStatus = "inactive"
	TrapStatusActive   TrapStatus = "active"
	TrapStatusTriggered TrapStatus = "triggered"
	TrapStatusCooldown TrapStatus = "cooldown"
)

type Trap struct {
	ID         string     `json:"id"`
	Type       TrapType   `json:"type"`
	Position   Position   `json:"position"`
	Status     TrapStatus `json:"status"`
	Damage     int        `json:"damage"`
	Radius     int        `json:"radius"`
	Effect     string     `json:"effect,omitempty"`
	Cooldown   int        `json:"cooldown"`
	TriggeredBy string    `json:"triggeredBy,omitempty"`
	TriggeredAt time.Time `json:"triggeredAt,omitempty"`
	Duration   int        `json:"duration,omitempty"`
	Visible    bool       `json:"visible"`
}

type Marker struct {
	ID         string    `json:"id"`
	TargetType string    `json:"targetType"`
	TargetID   string    `json:"targetId"`
	Position   Position  `json:"position"`
	MarkedBy   string    `json:"markedBy"`
	CreatedAt  time.Time `json:"createdAt"`
}

type GameRoom struct {
	ID        string            `json:"id"`
	Players   map[string]*Player `json:"players"`
	Dungeon   *Dungeon          `json:"dungeon"`
	MaxPlayers int              `json:"maxPlayers"`
	Status    RoomStatus        `json:"status"`
	CreatedAt time.Time         `json:"createdAt"`
	CompletedAt *time.Time      `json:"completedAt,omitempty"`
	TotalKills int              `json:"totalKills"`
	TotalDeaths int             `json:"totalDeaths"`
	MaxFloorReached int         `json:"maxFloorReached"`
	Markers   []Marker          `json:"markers,omitempty"`
	GameStats *GameStatistics   `json:"gameStats,omitempty"`
}

type GameStatistics struct {
	StartTime   time.Time   `json:"startTime"`
	EndTime     *time.Time  `json:"endTime,omitempty"`
	Duration    int64       `json:"duration,omitempty"`
	TotalKills  int         `json:"totalKills"`
	TotalDamage int         `json:"totalDamage"`
	TotalDeaths int         `json:"totalDeaths"`
	TotalGold   int         `json:"totalGold"`
	TotalExp    int         `json:"totalExp"`
	TrapsTriggered int      `json:"trapsTriggered"`
	FloorsCleared int       `json:"floorsCleared"`
	ItemsFound  int         `json:"itemsFound"`
}

type PlayerStatistics struct {
	PlayerID    string    `json:"playerId"`
	PlayerName  string    `json:"playerName"`
	TotalGames  int       `json:"totalGames"`
	Wins        int       `json:"wins"`
	TotalKills  int       `json:"totalKills"`
	TotalDeaths int       `json:"totalDeaths"`
	TotalDamage int       `json:"totalDamage"`
	TotalGold   int       `json:"totalGold"`
	TotalExp    int       `json:"totalExp"`
	BestFloor   int       `json:"bestFloor"`
	BestTime    int64     `json:"bestTime"`
	PlayTime    int64     `json:"playTime"`
}

type RankTier string

const (
	RankBronze   RankTier = "bronze"
	RankSilver   RankTier = "silver"
	RankGold     RankTier = "gold"
	RankPlatinum RankTier = "platinum"
	RankDiamond  RankTier = "diamond"
	RankMaster   RankTier = "master"
	RankChampion RankTier = "champion"
)

type LeaderboardEntry struct {
	Rank         int       `json:"rank"`
	PlayerID     string    `json:"playerId"`
	PlayerName   string    `json:"playerName"`
	Rating       int       `json:"rating"`
	Tier         RankTier  `json:"tier"`
	Division     int       `json:"division"`
	Wins         int       `json:"wins"`
	Losses       int       `json:"losses"`
	BestFloor    int       `json:"bestFloor"`
	BestTime     int64     `json:"bestTime"`
	TotalKills   int       `json:"totalKills"`
	LastUpdated  time.Time `json:"lastUpdated"`
}

type AchievementType string

const (
	AchievementFirstBlood      AchievementType = "first_blood"
	AchievementFloor3         AchievementType = "floor_3"
	AchievementFloor5         AchievementType = "floor_5"
	AchievementFloor10        AchievementType = "floor_10"
	AchievementKillStreak5    AchievementType = "kill_streak_5"
	AchievementKillStreak10   AchievementType = "kill_streak_10"
	AchievementGoldHunter    AchievementType = "gold_hunter"
	AchievementItemCollector AchievementType = "item_collector"
	AchievementTrapMaster    AchievementType = "trap_master"
	AchievementSpeedRunner   AchievementType = "speed_runner"
	AchievementTeamPlayer    AchievementType = "team_player"
	AchievementLegendaryItem AchievementType = "legendary_item"
	AchievementFullCleared   AchievementType = "full_cleared"
	AchievementSurvivor      AchievementType = "survivor"
	AchievementGhostHelper   AchievementType = "ghost_helper"
)

type Achievement struct {
	ID          string          `json:"id"`
	Type        AchievementType `json:"type"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Icon        string          `json:"icon"`
	Rarity      ItemRarity      `json:"rarity"`
	Unlocked    bool            `json:"unlocked"`
	UnlockedAt  *time.Time      `json:"unlockedAt,omitempty"`
	Progress    int             `json:"progress"`
	Target      int             `json:"target"`
}

var AchievementDefinitions = map[AchievementType]*Achievement{
	AchievementFirstBlood: {
		Type:        AchievementFirstBlood,
		Name:        "初露锋芒",
		Description: "击杀第一个敌人",
		Icon:        "⚔️",
		Rarity:      RarityCommon,
		Target:      1,
	},
	AchievementFloor3: {
		Type:        AchievementFloor3,
		Name:        "深入探索",
		Description: "到达第3层",
		Icon:        "🏔️",
		Rarity:      RarityCommon,
		Target:      3,
	},
	AchievementFloor5: {
		Type:        AchievementFloor5,
		Name:        "勇者之路",
		Description: "到达第5层",
		Icon:        "🗻",
		Rarity:      RarityUncommon,
		Target:      5,
	},
	AchievementFloor10: {
		Type:        AchievementFloor10,
		Name:        "深渊探索者",
		Description: "到达第10层",
		Icon:        "🌋",
		Rarity:      RarityRare,
		Target:      10,
	},
	AchievementKillStreak5: {
		Type:        AchievementKillStreak5,
		Name:        "连杀达人",
		Description: "连续击杀5个敌人",
		Icon:        "💀",
		Rarity:      RarityUncommon,
		Target:      5,
	},
	AchievementKillStreak10: {
		Type:        AchievementKillStreak10,
		Name:        "杀戮机器",
		Description: "连续击杀10个敌人",
		Icon:        "☠️",
		Rarity:      RarityRare,
		Target:      10,
	},
	AchievementGoldHunter: {
		Type:        AchievementGoldHunter,
		Name:        "黄金猎手",
		Description: "累计获得1000金币",
		Icon:        "💰",
		Rarity:      RarityUncommon,
		Target:      1000,
	},
	AchievementItemCollector: {
		Type:        AchievementItemCollector,
		Name:        "物品收藏家",
		Description: "收集50件物品",
		Icon:        "🎒",
		Rarity:      RarityUncommon,
		Target:      50,
	},
	AchievementTrapMaster: {
		Type:        AchievementTrapMaster,
		Name:        "陷阱大师",
		Description: "触发10个陷阱",
		Icon:        "⚠️",
		Rarity:      RarityRare,
		Target:      10,
	},
	AchievementSpeedRunner: {
		Type:        AchievementSpeedRunner,
		Name:        "速通高手",
		Description: "5分钟内通关3层",
		Icon:        "⚡",
		Rarity:      RarityEpic,
		Target:      300,
	},
	AchievementTeamPlayer: {
		Type:        AchievementTeamPlayer,
		Name:        "团队协作",
		Description: "与4名玩家一起通关",
		Icon:        "👥",
		Rarity:      RarityRare,
		Target:      4,
	},
	AchievementLegendaryItem: {
		Type:        AchievementLegendaryItem,
		Name:        "传说装备",
		Description: "获得传说级装备",
		Icon:        "✨",
		Rarity:      RarityLegendary,
		Target:      1,
	},
	AchievementFullCleared: {
		Type:        AchievementFullCleared,
		Name:        "完美通关",
		Description: "通关所有楼层",
		Icon:        "🏆",
		Rarity:      RarityEpic,
		Target:      1,
	},
	AchievementSurvivor: {
		Type:        AchievementSurvivor,
		Name:        "生存大师",
		Description: "一次不死通关",
		Icon:        "🛡️",
		Rarity:      RarityEpic,
		Target:      1,
	},
	AchievementGhostHelper: {
		Type:        AchievementGhostHelper,
		Name:        "幽灵助手",
		Description: "作为幽灵标记50个敌人",
		Icon:        "👻",
		Rarity:      RarityRare,
		Target:      50,
	},
}

type Equipment struct {
	Weapon   *Item `json:"weapon"`
	Armor    *Item `json:"armor"`
	Helmet   *Item `json:"helmet"`
	Boots    *Item `json:"boots"`
}

type Item struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Type        ItemType     `json:"type"`
	Rarity      ItemRarity   `json:"rarity"`
	Stats       ItemStats    `json:"stats"`
	Position    *Position    `json:"position,omitempty"`
}

type ItemType string

const (
	ItemTypeWeapon ItemType = "weapon"
	ItemTypeArmor  ItemType = "armor"
	ItemTypeHelmet ItemType = "helmet"
	ItemTypeBoots  ItemType = "boots"
	ItemTypeConsumable ItemType = "consumable"
)

type ItemRarity string

const (
	RarityCommon    ItemRarity = "common"
	RarityUncommon  ItemRarity = "uncommon"
	RarityRare      ItemRarity = "rare"
	RarityEpic      ItemRarity = "epic"
	RarityLegendary ItemRarity = "legendary"
)

type ItemStats struct {
	AttackBonus  int `json:"attackBonus,omitempty"`
	DefenseBonus int `json:"defenseBonus,omitempty"`
	HealthBonus  int `json:"healthBonus,omitempty"`
	SpeedBonus   int `json:"speedBonus,omitempty"`
}

type Enemy struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Position   Position `json:"position"`
	Health     int      `json:"health"`
	MaxHealth  int      `json:"maxHealth"`
	Attack     int      `json:"attack"`
	Defense    int      `json:"defense"`
	ExpReward  int      `json:"expReward"`
	GoldReward int      `json:"goldReward"`
	IsAlive    bool     `json:"isAlive"`
	Type       string   `json:"type"`
}

type Dungeon struct {
	Floors   []*Floor `json:"floors"`
	CurrentFloor int  `json:"currentFloor"`
}

type Floor struct {
	Level     int        `json:"level"`
	Rooms     []Room     `json:"rooms"`
	Corridors []Corridor `json:"corridors"`
	Tiles     [][]Tile   `json:"tiles"`
	Enemies   []Enemy    `json:"enemies"`
	Items     []Item     `json:"items"`
	Traps     []Trap     `json:"traps"`
	Width     int        `json:"width"`
	Height    int        `json:"height"`
	StartPos  Position   `json:"startPos"`
	ExitPos   Position   `json:"exitPos"`
}

type Room struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
	Center Position `json:"center"`
}

type Corridor struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Tile struct {
	Type    TileType `json:"type"`
	Walkable bool    `json:"walkable"`
}

type TileType string

const (
	TileWall   TileType = "wall"
	TileFloor  TileType = "floor"
	TileDoor   TileType = "door"
	TileStairs TileType = "stairs"
)

type GameRoom struct {
	ID        string            `json:"id"`
	Players   map[string]*Player `json:"players"`
	Dungeon   *Dungeon          `json:"dungeon"`
	MaxPlayers int              `json:"maxPlayers"`
	Status    RoomStatus        `json:"status"`
}

type RoomStatus string

const (
	RoomWaiting RoomStatus = "waiting"
	RoomPlaying RoomStatus = "playing"
	RoomFinished RoomStatus = "finished"
)
