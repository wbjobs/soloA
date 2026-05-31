package game

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

type GameManager struct {
	rooms map[string]*GameRoom
	mu    sync.RWMutex
}

func NewGameManager() *GameManager {
	return &GameManager{
		rooms: make(map[string]*GameRoom),
	}
}

func (gm *GameManager) Start() {
	go gm.gameLoop()
}

func (gm *GameManager) gameLoop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		gm.updateRooms()
	}
}

func (gm *GameManager) updateRooms() {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	for _, room := range gm.rooms {
		if room.Status == RoomPlaying {
			gm.updateRoom(room)
		}
	}
}

func (gm *GameManager) updateRoom(room *GameRoom) {
	for _, player := range room.Players {
		if player.IsAlive {
			gm.checkPlayerFloorChange(player, room)
			gm.updatePoisonEffect(player, room)
		}
	}

	gm.updateTrapCooldowns(room)
	gm.cleanupExpiredMarkers(room)
}

func (gm *GameManager) updatePoisonEffect(player *Player, room *GameRoom) {
	if player.PoisonDuration > 0 && player.PoisonDamage > 0 {
		player.Health -= player.PoisonDamage
		player.PoisonDuration--

		log.Printf("Player %s took %d poison damage, remaining duration: %d",
			player.Name, player.PoisonDamage, player.PoisonDuration)

		if player.Health <= 0 {
			player.Health = 0
			player.IsAlive = false
			player.State = PlayerStateGhost
			room.TotalDeaths++
			if room.GameStats != nil {
				room.GameStats.TotalDeaths++
			}
			log.Printf("Player %s died from poison, now in ghost mode", player.Name)
		}
	}
}

func (gm *GameManager) updateTrapCooldowns(room *GameRoom) {
	for _, floor := range room.Dungeon.Floors {
		for i := range floor.Traps {
			trap := &floor.Traps[i]
			if trap.Status == TrapStatusCooldown {
				trap.Cooldown--
				if trap.Cooldown <= 0 {
					trap.Status = TrapStatusActive
					trap.Cooldown = gm.getDefaultCooldown(trap.Type)
				}
			}
		}
	}
}

func (gm *GameManager) getDefaultCooldown(trapType TrapType) int {
	switch trapType {
	case TrapTypePressurePlate:
		return 30
	case TrapTypePoisonFog:
		return 45
	case TrapTypeFallingRock:
		return 60
	default:
		return 30
	}
}

func (gm *GameManager) cleanupExpiredMarkers(room *GameRoom) {
	now := time.Now()
	validMarkers := []Marker{}

	for _, marker := range room.Markers {
		if now.Sub(marker.CreatedAt) < 5*time.Minute {
			validMarkers = append(validMarkers, marker)
		}
	}

	room.Markers = validMarkers
}

func (gm *GameManager) checkPlayerFloorChange(player *Player, room *GameRoom) {
	floor := room.Dungeon.Floors[player.Floor]
	if player.Position.X == floor.ExitPos.X && player.Position.Y == floor.ExitPos.Y {
		if player.Floor < len(room.Dungeon.Floors)-1 {
			player.Floor++
			newFloor := room.Dungeon.Floors[player.Floor]
			player.Position = newFloor.StartPos
			log.Printf("Player %s moved to floor %d", player.Name, player.Floor)

			if room.MaxFloorReached < player.Floor+1 {
				room.MaxFloorReached = player.Floor + 1
			}

			if room.GameStats != nil {
				room.GameStats.FloorsCleared++
			}

			gm.checkFloorAchievement(player, room)
		}
	}
}

func (gm *GameManager) CreateRoom() *GameRoom {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	roomID := generateUUID()
	mapGen := NewMapGenerator(time.Now().UnixNano())

	room := &GameRoom{
		ID:             roomID,
		Players:        make(map[string]*Player),
		Dungeon:        mapGen.GenerateDungeon(3),
		MaxPlayers:     4,
		Status:         RoomWaiting,
		CreatedAt:      time.Now(),
		TotalKills:     0,
		TotalDeaths:    0,
		MaxFloorReached: 1,
		Markers:        []Marker{},
		GameStats: &GameStatistics{
			StartTime: time.Now(),
		},
	}

	gm.rooms[roomID] = room
	log.Printf("Room %s created", roomID)
	return room
}

func (gm *GameManager) GetRoom(roomID string) *GameRoom {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.rooms[roomID]
}

func (gm *GameManager) JoinRoom(roomID string, playerName string) (*GameRoom, *Player, error) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	room, exists := gm.rooms[roomID]
	if !exists {
		return nil, nil, ErrRoomNotFound
	}

	if len(room.Players) >= room.MaxPlayers {
		return nil, nil, ErrRoomFull
	}

	player := gm.createPlayer(playerName, room)
	room.Players[player.ID] = player

	log.Printf("Player %s (%s) joined room %s", playerName, player.ID, roomID)

	if len(room.Players) >= 2 {
		room.Status = RoomPlaying
		log.Printf("Room %s game started", roomID)
	}

	return room, player, nil
}

func (gm *GameManager) createPlayer(name string, room *GameRoom) *Player {
	startFloor := room.Dungeon.Floors[0]
	return &Player{
		ID:            generateUUID(),
		Name:          name,
		Position:      startFloor.StartPos,
		Health:        100,
		MaxHealth:     100,
		Attack:        10,
		Defense:       5,
		Speed:         10,
		Level:         1,
		Exp:           0,
		Gold:          0,
		Inventory:     []Item{},
		Equipment:     Equipment{},
		Floor:         0,
		IsAlive:       true,
		State:         PlayerStateAlive,
		MarkedEnemies: []string{},
		PoisonDamage:  0,
		PoisonDuration: 0,
	}
}

func (gm *GameManager) MovePlayer(roomID, playerID string, targetX, targetY int) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	room, exists := gm.rooms[roomID]
	if !exists {
		return ErrRoomNotFound
	}

	player, exists := room.Players[playerID]
	if !exists {
		return ErrPlayerNotFound
	}

	if player.State == PlayerStateDead {
		return ErrPlayerDead
	}

	if player.State == PlayerStateGhost {
		return gm.moveGhost(room, player, targetX, targetY)
	}

	floor := room.Dungeon.Floors[player.Floor]
	if targetX < 0 || targetX >= floor.Width || targetY < 0 || targetY >= floor.Height {
		return ErrInvalidPosition
	}

	if !floor.Tiles[targetY][targetX].Walkable {
		return ErrPositionBlocked
	}

	if !isAdjacent(player.Position, Position{X: targetX, Y: targetY}) {
		return ErrPositionTooFar
	}

	for _, p := range room.Players {
		if p.ID != playerID && p.IsAlive && p.Floor == player.Floor && p.Position.X == targetX && p.Position.Y == targetY {
			return ErrPositionBlocked
		}
	}

	player.Position = Position{X: targetX, Y: targetY}

	gm.checkItemPickup(player, room, floor)
	gm.checkTrapTrigger(player, room, floor)

	return nil
}

func (gm *GameManager) moveGhost(room *GameRoom, player *Player, targetX, targetY int) error {
	floor := room.Dungeon.Floors[player.Floor]
	if targetX < 0 || targetX >= floor.Width || targetY < 0 || targetY >= floor.Height {
		return ErrInvalidPosition
	}

	if !floor.Tiles[targetY][targetX].Walkable {
		return ErrPositionBlocked
	}

	distance := 3
	if abs(player.Position.X-targetX) > distance || abs(player.Position.Y-targetY) > distance {
		return ErrPositionTooFar
	}

	player.Position = Position{X: targetX, Y: targetY}
	return nil
}

func (gm *GameManager) checkTrapTrigger(player *Player, room *GameRoom, floor *Floor) *Trap {
	for i := range floor.Traps {
		trap := &floor.Traps[i]
		if trap.Status != TrapStatusActive {
			continue
		}

		if gm.isInTrapRange(player.Position, trap) {
			gm.triggerTrap(trap, player, room, floor)
			return trap
		}
	}
	return nil
}

func (gm *GameManager) isInTrapRange(pos Position, trap *Trap) bool {
	if trap.Radius == 0 {
		return pos.X == trap.Position.X && pos.Y == trap.Position.Y
	}

	dx := abs(pos.X - trap.Position.X)
	dy := abs(pos.Y - trap.Position.Y)
	return dx <= trap.Radius && dy <= trap.Radius
}

func (gm *GameManager) triggerTrap(trap *Trap, player *Player, room *GameRoom, floor *Floor) {
	trap.Status = TrapStatusTriggered
	trap.TriggeredBy = player.ID
	trap.TriggeredAt = time.Now()

	log.Printf("Player %s triggered trap %s (%s)", player.Name, trap.ID, trap.Type)

	if room.GameStats != nil {
		room.GameStats.TrapsTriggered++
	}

	affectedPlayers := []*Player{player}
	for _, p := range room.Players {
		if p.ID != player.ID && p.State == PlayerStateAlive && p.Floor == player.Floor {
			if gm.isInTrapRange(p.Position, trap) {
				affectedPlayers = append(affectedPlayers, p)
			}
		}
	}

	for _, ap := range affectedPlayers {
		switch trap.Type {
		case TrapTypePressurePlate:
			gm.applyDirectDamage(ap, trap.Damage, room)
		case TrapTypePoisonFog:
			ap.PoisonDamage = trap.Damage
			ap.PoisonDuration = trap.Duration
			log.Printf("Player %s poisoned by fog: %d damage for %d turns",
				ap.Name, trap.Damage, trap.Duration)
		case TrapTypeFallingRock:
			gm.applyDirectDamage(ap, trap.Damage, room)
		}
	}

	trap.Status = TrapStatusCooldown
}

func (gm *GameManager) checkItemPickup(player *Player, room *GameRoom, floor *Floor) {
	for i, item := range floor.Items {
		if item.Position != nil && item.Position.X == player.Position.X && item.Position.Y == player.Position.Y {
			player.Inventory = append(player.Inventory, item)
			floor.Items = append(floor.Items[:i], floor.Items[i+1:]...)
			log.Printf("Player %s picked up %s", player.Name, item.Name)
		}
	}
}

func (gm *GameManager) AttackEnemy(roomID, playerID, enemyID string) (*Enemy, error) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	room, exists := gm.rooms[roomID]
	if !exists {
		return nil, ErrRoomNotFound
	}

	player, exists := room.Players[playerID]
	if !exists {
		return nil, ErrPlayerNotFound
	}

	if !player.IsAlive {
		return nil, ErrPlayerDead
	}

	floor := room.Dungeon.Floors[player.Floor]

	var targetEnemy *Enemy
	for i := range floor.Enemies {
		if floor.Enemies[i].ID == enemyID {
			targetEnemy = &floor.Enemies[i]
			break
		}
	}

	if targetEnemy == nil {
		return nil, ErrEnemyNotFound
	}

	if !targetEnemy.IsAlive {
		return nil, ErrEnemyDead
	}

	if !isAdjacent(player.Position, targetEnemy.Position) {
		return nil, ErrEnemyTooFar
	}

	damage := CalculateDamage(player.GetTotalAttack(), targetEnemy.Defense)
	targetEnemy.Health -= damage

	log.Printf("Player %s attacked %s for %d damage", player.Name, targetEnemy.Name, damage)

	if targetEnemy.Health <= 0 {
		targetEnemy.IsAlive = false
		player.Exp += targetEnemy.ExpReward
		player.Gold += targetEnemy.GoldReward
		gm.checkLevelUp(player)
		log.Printf("Enemy %s killed! Player %s gained %d exp and %d gold", targetEnemy.Name, player.Name, targetEnemy.ExpReward, targetEnemy.GoldReward)
	} else {
		enemyDamage := CalculateDamage(targetEnemy.Attack, player.GetTotalDefense())
		player.Health -= enemyDamage
		log.Printf("Enemy %s attacked back for %d damage", targetEnemy.Name, enemyDamage)

		if player.Health <= 0 {
			player.Health = 0
			player.IsAlive = false
			log.Printf("Player %s died", player.Name)
		}
	}

	return targetEnemy, nil
}

func (gm *GameManager) checkLevelUp(player *Player) {
	expNeeded := player.Level * 100
	for player.Exp >= expNeeded {
		player.Exp -= expNeeded
		player.Level++
		player.MaxHealth += 20
		player.Health = player.MaxHealth
		player.Attack += 3
		player.Defense += 2
		expNeeded = player.Level * 100
		log.Printf("Player %s leveled up to %d!", player.Name, player.Level)
	}
}

func (gm *GameManager) GetGameState(roomID string) map[string]interface{} {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	room, exists := gm.rooms[roomID]
	if !exists {
		return nil
	}

	players := make([]Player, 0, len(room.Players))
	for _, p := range room.Players {
		players = append(players, *p)
	}

	var currentFloor *Floor
	if len(room.Dungeon.Floors) > 0 {
		playerFloors := make(map[int]bool)
		for _, p := range room.Players {
			playerFloors[p.Floor] = true
		}
		
		for f := range room.Dungeon.Floors {
			if playerFloors[f] {
				currentFloor = room.Dungeon.Floors[f]
				break
			}
		}
	}

	return map[string]interface{}{
		"room": map[string]interface{}{
			"id":         room.ID,
			"status":     room.Status,
			"maxPlayers": room.MaxPlayers,
		},
		"players": players,
		"floor":   currentFloor,
	}
}

func (p *Player) GetTotalAttack() int {
	total := p.Attack
	if p.Equipment.Weapon != nil {
		total += p.Equipment.Weapon.Stats.AttackBonus
	}
	return total
}

func (p *Player) GetTotalDefense() int {
	total := p.Defense
	if p.Equipment.Armor != nil {
		total += p.Equipment.Armor.Stats.DefenseBonus
	}
	if p.Equipment.Helmet != nil {
		total += p.Equipment.Helmet.Stats.DefenseBonus
	}
	return total
}

func generateUUID() string {
	return uuid.New().String()
}

func isAdjacent(a, b Position) bool {
	dx := abs(a.X - b.X)
	dy := abs(a.Y - b.Y)
	return (dx <= 1 && dy <= 1) && (dx+dy > 0)
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func (gm *GameManager) applyDirectDamage(player *Player, damage int, room *GameRoom) {
	player.Health -= damage
	log.Printf("Player %s took %d direct damage", player.Name, damage)

	if room.GameStats != nil {
		room.GameStats.TotalDamage += damage
	}

	if player.Health <= 0 {
		player.Health = 0
		player.IsAlive = false
		player.State = PlayerStateGhost
		room.TotalDeaths++
		if room.GameStats != nil {
			room.GameStats.TotalDeaths++
		}
		log.Printf("Player %s died, now in ghost mode", player.Name)
	}
}

func (gm *GameManager) checkFloorAchievement(player *Player, room *GameRoom) {
	floor := player.Floor + 1

	if floor >= 3 {
		gm.unlockAchievement(player, AchievementFloor3)
	}
	if floor >= 5 {
		gm.unlockAchievement(player, AchievementFloor5)
	}
	if floor >= 10 {
		gm.unlockAchievement(player, AchievementFloor10)
	}
}

func (gm *GameManager) unlockAchievement(player *Player, achievementType AchievementType) {
	def, exists := AchievementDefinitions[achievementType]
	if !exists {
		return
	}

	achievement := *def
	achievement.Unlocked = true
	now := time.Now()
	achievement.UnlockedAt = &now

	log.Printf("Achievement unlocked for player %s: %s (%s)",
		player.Name, achievement.Name, achievement.Description)
}

func (gm *GameManager) MarkEnemy(roomID, playerID, enemyID string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	room, exists := gm.rooms[roomID]
	if !exists {
		return ErrRoomNotFound
	}

	player, exists := room.Players[playerID]
	if !exists {
		return ErrPlayerNotFound
	}

	if player.State != PlayerStateGhost {
		return ErrInvalidAction
	}

	floor := room.Dungeon.Floors[player.Floor]

	var targetEnemy *Enemy
	for i := range floor.Enemies {
		if floor.Enemies[i].ID == enemyID && floor.Enemies[i].IsAlive {
			targetEnemy = &floor.Enemies[i]
			break
		}
	}

	if targetEnemy == nil {
		return ErrEnemyNotFound
	}

	distance := 10
	if abs(player.Position.X-targetEnemy.Position.X) > distance ||
		abs(player.Position.Y-targetEnemy.Position.Y) > distance {
		return ErrPositionTooFar
	}

	alreadyMarked := false
	for _, id := range player.MarkedEnemies {
		if id == enemyID {
			alreadyMarked = true
			break
		}
	}

	if !alreadyMarked {
		player.MarkedEnemies = append(player.MarkedEnemies, enemyID)

		marker := Marker{
			ID:         "marker_" + generateUUID(),
			TargetType: "enemy",
			TargetID:   enemyID,
			Position:   targetEnemy.Position,
			MarkedBy:   playerID,
			CreatedAt:  time.Now(),
		}
		room.Markers = append(room.Markers, marker)

		log.Printf("Ghost player %s marked enemy %s", player.Name, enemyID)
	}

	return nil
}

func (gm *GameManager) GetLeaderboard() []LeaderboardEntry {
	return []LeaderboardEntry{
		{
			Rank:       1,
			PlayerID:   "player_1",
			PlayerName: "地牢霸主",
			Rating:     2850,
			Tier:       RankChampion,
			Division:   1,
			Wins:       156,
			Losses:     23,
			BestFloor:  15,
			BestTime:   450,
			TotalKills: 1250,
			LastUpdated: time.Now(),
		},
		{
			Rank:       2,
			PlayerID:   "player_2",
			PlayerName: "深渊行者",
			Rating:     2650,
			Tier:       RankMaster,
			Division:   1,
			Wins:       142,
			Losses:     31,
			BestFloor:  12,
			BestTime:   520,
			TotalKills: 980,
			LastUpdated: time.Now(),
		},
		{
			Rank:       3,
			PlayerID:   "player_3",
			PlayerName: "幽灵猎手",
			Rating:     2500,
			Tier:       RankMaster,
			Division:   2,
			Wins:       128,
			Losses:     45,
			BestFloor:  10,
			BestTime:   580,
			TotalKills: 850,
			LastUpdated: time.Now(),
		},
		{
			Rank:       4,
			PlayerID:   "player_4",
			PlayerName: "新冒险者",
			Rating:     1800,
			Tier:       RankGold,
			Division:   1,
			Wins:       45,
			Losses:     28,
			BestFloor:  5,
			BestTime:   900,
			TotalKills: 280,
			LastUpdated: time.Now(),
		},
		{
			Rank:       5,
			PlayerID:   "player_5",
			PlayerName: "探索者",
			Rating:     1200,
			Tier:       RankBronze,
			Division:   3,
			Wins:       12,
			Losses:     18,
			BestFloor:  3,
			BestTime:   1200,
			TotalKills: 85,
			LastUpdated: time.Now(),
		},
	}
}

func (gm *GameManager) GetPlayerAchievements(playerID string) []*Achievement {
	achievements := []*Achievement{}

	for _, def := range AchievementDefinitions {
		achievement := *def
		achievement.ID = "achievement_" + def.Type
		achievements = append(achievements, &achievement)
	}

	return achievements
}

func CalculateTier(rating int) (RankTier, int) {
	switch {
	case rating >= 2800:
		return RankChampion, 1
	case rating >= 2500:
		div := 3 - (rating-2500)/100
		if div < 1 {
			div = 1
		}
		return RankMaster, div
	case rating >= 2200:
		div := 4 - (rating-2200)/75
		if div < 1 {
			div = 1
		}
		return RankDiamond, div
	case rating >= 1900:
		div := 4 - (rating-1900)/75
		if div < 1 {
			div = 1
		}
		return RankPlatinum, div
	case rating >= 1600:
		div := 4 - (rating-1600)/75
		if div < 1 {
			div = 1
		}
		return RankGold, div
	case rating >= 1300:
		div := 4 - (rating-1300)/75
		if div < 1 {
			div = 1
		}
		return RankSilver, div
	default:
		div := 4 - rating/100
		if div < 1 {
			div = 1
		}
		return RankBronze, div
	}
}
