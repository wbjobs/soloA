package game

import (
	"math"
	"math/rand"
	"sort"
)

type MapGenerator struct {
	seed   int64
	random *rand.Rand
}

func NewMapGenerator(seed int64) *MapGenerator {
	return &MapGenerator{
		seed:   seed,
		random: rand.New(rand.NewSource(seed)),
	}
}

func (mg *MapGenerator) GenerateDungeon(numFloors int) *Dungeon {
	dungeon := &Dungeon{
		Floors:        make([]*Floor, 0, numFloors),
		CurrentFloor:  0,
	}

	for i := 0; i < numFloors; i++ {
		floor := mg.GenerateFloor(i)
		dungeon.Floors = append(dungeon.Floors, floor)
	}

	return dungeon
}

func (mg *MapGenerator) GenerateFloor(level int) *Floor {
	width := 60 + level*5
	height := 40 + level*3

	tiles := make([][]Tile, height)
	for y := range tiles {
		tiles[y] = make([]Tile, width)
		for x := range tiles[y] {
			tiles[y][x] = Tile{Type: TileWall, Walkable: false}
		}
	}

	rooms := mg.generateRooms(width, height, level)
	corridors := mg.connectRoomsMST(rooms)
	mg.carveRooms(tiles, rooms)
	mg.carveCorridors(tiles, corridors)

	mg.ensureConnectivity(tiles, rooms, corridors, width, height)

	enemies := mg.generateEnemies(rooms, level)
	items := mg.generateItems(rooms, level)
	traps := mg.generateTraps(rooms, corridors, level, tiles)

	startRoom := mg.findRoomAtEdge(rooms, width, height, "start")
	exitRoom := mg.findRoomAtEdge(rooms, width, height, "exit")

	startPos := startRoom.Center
	exitPos := exitRoom.Center

	if !mg.isPathConnected(tiles, startPos, exitPos) {
		mg.createDirectCorridor(tiles, startPos, exitPos)
	}

	tiles[exitPos.Y][exitPos.X] = Tile{Type: TileStairs, Walkable: true}

	return &Floor{
		Level:     level,
		Rooms:     rooms,
		Corridors: corridors,
		Tiles:     tiles,
		Enemies:   enemies,
		Items:     items,
		Traps:     traps,
		Width:     width,
		Height:    height,
		StartPos:  startPos,
		ExitPos:   exitPos,
	}
}

func (mg *MapGenerator) generateTraps(rooms []Room, corridors []Corridor, level int, tiles [][]Tile) []Trap {
	var traps []Trap
	trapCount := 3 + level*2

	trapTypes := []TrapType{TrapTypePressurePlate, TrapTypePoisonFog, TrapTypeFallingRock}
	trapWeights := []int{40, 35, 25}

	for i := 0; i < trapCount; i++ {
		var pos Position
		var validPosition bool

		for attempt := 0; attempt < 50 && !validPosition; attempt++ {
			if mg.random.Intn(2) == 0 && len(rooms) > 2 {
				roomIdx := mg.random.Intn(len(rooms)-1) + 1
				room := rooms[roomIdx]
				pos = Position{
					X: room.X + 1 + mg.random.Intn(room.Width-2),
					Y: room.Y + 1 + mg.random.Intn(room.Height-2),
				}
			} else if len(corridors) > 0 {
				corridor := corridors[mg.random.Intn(len(corridors))]
				if corridor.Start.X == corridor.End.X {
					pos = Position{
						X: corridor.Start.X,
						Y: corridor.Start.Y + mg.random.Intn(corridor.End.Y-corridor.Start.Y+1),
					}
				} else {
					pos = Position{
						X: corridor.Start.X + mg.random.Intn(corridor.End.X-corridor.Start.X+1),
						Y: corridor.Start.Y,
					}
				}
			} else {
				continue
			}

			if pos.Y >= 0 && pos.Y < len(tiles) && pos.X >= 0 && pos.X < len(tiles[0]) {
				if tiles[pos.Y][pos.X].Walkable {
					validPosition = true
				}
			}
		}

		if !validPosition {
			continue
		}

		trapType := mg.weightedRandomTrapType(trapTypes, trapWeights)
		trap := mg.createTrap(trapType, pos, level)

		traps = append(traps, *trap)
	}

	return traps
}

func (mg *MapGenerator) weightedRandomTrapType(types []TrapType, weights []int) TrapType {
	total := 0
	for _, w := range weights {
		total += w
	}

	roll := mg.random.Intn(total)
	cumulative := 0

	for i, w := range weights {
		cumulative += w
		if roll < cumulative {
			return types[i]
		}
	}

	return types[0]
}

func (mg *MapGenerator) createTrap(trapType TrapType, pos Position, level int) *Trap {
	baseDamage := 10 + level*5
	trap := &Trap{
		ID:       "trap_" + generateUUID(),
		Type:     trapType,
		Position: pos,
		Status:   TrapStatusActive,
		Visible:  false,
	}

	switch trapType {
	case TrapTypePressurePlate:
		trap.Damage = baseDamage + mg.random.Intn(10)
		trap.Radius = 0
		trap.Cooldown = 30
		trap.Effect = "damage"
		trap.Visible = true

	case TrapTypePoisonFog:
		trap.Damage = int(float64(baseDamage) * 0.3)
		trap.Radius = 2
		trap.Cooldown = 45
		trap.Duration = 5
		trap.Effect = "poison"
		trap.Visible = mg.random.Intn(2) == 0

	case TrapTypeFallingRock:
		trap.Damage = int(float64(baseDamage) * 1.5)
		trap.Radius = 1
		trap.Cooldown = 60
		trap.Effect = "stun"
		trap.Visible = false
	}

	return trap
}

func (mg *MapGenerator) generateRooms(width, height, level int) []Room {
	var rooms []Room
	numRooms := 8 + level*2
	maxAttempts := 500
	minRoomSize := 5
	maxRoomSize := 12

	for i := 0; i < maxAttempts && len(rooms) < numRooms; i++ {
		roomWidth := mg.random.Intn(maxRoomSize-minRoomSize+1) + minRoomSize
		roomHeight := mg.random.Intn(maxRoomSize-minRoomSize+1) + minRoomSize
		x := mg.random.Intn(width-roomWidth-2) + 1
		y := mg.random.Intn(height-roomHeight-2) + 1

		newRoom := Room{
			X:      x,
			Y:      y,
			Width:  roomWidth,
			Height: roomHeight,
			Center: Position{
				X: x + roomWidth/2,
				Y: y + roomHeight/2,
			},
		}

		overlaps := false
		for _, room := range rooms {
			if mg.roomsOverlap(newRoom, room, 2) {
				overlaps = true
				break
			}
		}

		if !overlaps {
			rooms = append(rooms, newRoom)
		}
	}

	sort.Slice(rooms, func(i, j int) bool {
		return rooms[i].Center.X < rooms[j].Center.X
	})

	return rooms
}

func (mg *MapGenerator) roomsOverlap(a, b Room, margin int) bool {
	return !(a.X+a.Width+margin < b.X ||
		b.X+b.Width+margin < a.X ||
		a.Y+a.Height+margin < b.Y ||
		b.Y+b.Height+margin < a.Y)
}

func (mg *MapGenerator) carveRooms(tiles [][]Tile, rooms []Room) {
	for _, room := range rooms {
		for y := room.Y; y < room.Y+room.Height; y++ {
			for x := room.X; x < room.X+room.Width; x++ {
				if y >= 0 && y < len(tiles) && x >= 0 && x < len(tiles[0]) {
					tiles[y][x] = Tile{Type: TileFloor, Walkable: true}
				}
			}
		}
	}
}

func (mg *MapGenerator) connectRooms(rooms []Room) []Corridor {
	var corridors []Corridor

	for i := 1; i < len(rooms); i++ {
		prev := rooms[i-1].Center
		curr := rooms[i].Center

		if mg.random.Intn(2) == 0 {
			corridors = append(corridors, mg.createHorizontalCorridor(prev.X, curr.X, prev.Y))
			corridors = append(corridors, mg.createVerticalCorridor(prev.Y, curr.Y, curr.X))
		} else {
			corridors = append(corridors, mg.createVerticalCorridor(prev.Y, curr.Y, prev.X))
			corridors = append(corridors, mg.createHorizontalCorridor(prev.X, curr.X, curr.Y))
		}
	}

	return corridors
}

func (mg *MapGenerator) createHorizontalCorridor(x1, x2, y int) Corridor {
	return Corridor{
		Start: Position{X: int(math.Min(float64(x1), float64(x2))), Y: y},
		End:   Position{X: int(math.Max(float64(x1), float64(x2))), Y: y},
	}
}

func (mg *MapGenerator) createVerticalCorridor(y1, y2, x int) Corridor {
	return Corridor{
		Start: Position{X: x, Y: int(math.Min(float64(y1), float64(y2)))},
		End:   Position{X: x, Y: int(math.Max(float64(y1), float64(y2)))},
	}
}

func (mg *MapGenerator) carveCorridors(tiles [][]Tile, corridors []Corridor) {
	for _, corridor := range corridors {
		if corridor.Start.Y == corridor.End.Y {
			for x := corridor.Start.X; x <= corridor.End.X; x++ {
				if corridor.Start.Y >= 0 && corridor.Start.Y < len(tiles) && x >= 0 && x < len(tiles[0]) {
					tiles[corridor.Start.Y][x] = Tile{Type: TileFloor, Walkable: true}
				}
			}
		} else {
			for y := corridor.Start.Y; y <= corridor.End.Y; y++ {
				if y >= 0 && y < len(tiles) && corridor.Start.X >= 0 && corridor.Start.X < len(tiles[0]) {
					tiles[y][corridor.Start.X] = Tile{Type: TileFloor, Walkable: true}
				}
			}
		}
	}
}

func (mg *MapGenerator) generateEnemies(rooms []Room, level int) []Enemy {
	var enemies []Enemy
	enemyTypes := []string{"Goblin", "Skeleton", "Zombie", "Orc", "Demon"}
	enemyCount := 5 + level*3

	for i := 0; i < enemyCount; i++ {
		if i >= len(rooms)-1 {
			break
		}
		room := rooms[i+1]
		enemyType := enemyTypes[mg.random.Intn(len(enemyTypes))]
		baseStats := 10 + level*5

		posX := room.X + 1 + mg.random.Intn(room.Width-2)
		posY := room.Y + 1 + mg.random.Intn(room.Height-2)

		enemy := Enemy{
			ID:         "enemy_" + generateUUID(),
			Name:       enemyType,
			Position:   Position{X: posX, Y: posY},
			Health:     baseStats + mg.random.Intn(20),
			MaxHealth:  baseStats + mg.random.Intn(20),
			Attack:     3 + level*2 + mg.random.Intn(5),
			Defense:    1 + level + mg.random.Intn(3),
			ExpReward:  10 + level*5 + mg.random.Intn(10),
			GoldReward: 5 + level*3 + mg.random.Intn(10),
			IsAlive:    true,
			Type:       enemyType,
		}
		enemy.Health = enemy.MaxHealth
		enemies = append(enemies, enemy)
	}

	return enemies
}

func (mg *MapGenerator) generateItems(rooms []Room, level int) []Item {
	var items []Item
	itemCount := 3 + level*2

	itemNames := map[ItemType][]string{
		ItemTypeWeapon: {"Sword", "Axe", "Mace", "Dagger"},
		ItemTypeArmor:  {"Leather Armor", "Chainmail", "Plate Armor"},
		ItemTypeHelmet: {"Iron Helmet", "Steel Helmet", "Crown"},
		ItemTypeBoots:  {"Leather Boots", "Iron Boots", "Winged Boots"},
	}

	for i := 0; i < itemCount; i++ {
		if i >= len(rooms)-1 {
			break
		}
		room := rooms[i+1]
		itemTypes := []ItemType{ItemTypeWeapon, ItemTypeArmor, ItemTypeHelmet, ItemTypeBoots}
		itemType := itemTypes[mg.random.Intn(len(itemTypes))]
		rarity := mg.getWeightedRarity(level)

		posX := room.X + 1 + mg.random.Intn(room.Width-2)
		posY := room.Y + 1 + mg.random.Intn(room.Height-2)

		item := generateRandomItem(itemType, rarity, level)
		item.Position = &Position{X: posX, Y: posY}
		items = append(items, item)
	}

	return items
}

func (mg *MapGenerator) getWeightedRarity(level int) ItemRarity {
	roll := mg.random.Intn(1000)
	
	bonus := float64(level) * 0.5
	
	common := 500 - int(bonus*2)
	uncommon := 300 - int(bonus)
	rare := 150
	epic := 45
	legendary := 5
	
	if roll < common {
		return RarityCommon
	} else if roll < common+uncommon {
		return RarityUncommon
	} else if roll < common+uncommon+rare {
		return RarityRare
	} else if roll < common+uncommon+rare+epic {
		return RarityEpic
	} else {
		return RarityLegendary
	}
}

func (mg *MapGenerator) connectRoomsMST(rooms []Room) []Corridor {
	if len(rooms) < 2 {
		return []Corridor{}
	}

	type Edge struct {
		from, to int
		distance float64
	}

	var edges []Edge
	for i := 0; i < len(rooms); i++ {
		for j := i + 1; j < len(rooms); j++ {
			dist := math.Sqrt(
				math.Pow(float64(rooms[i].Center.X-rooms[j].Center.X), 2) +
				math.Pow(float64(rooms[i].Center.Y-rooms[j].Center.Y), 2),
			)
			edges = append(edges, Edge{i, j, dist})
		}
	}

	sort.Slice(edges, func(i, j int) bool {
		return edges[i].distance < edges[j].distance
	})

	parent := make([]int, len(rooms))
	for i := range parent {
		parent[i] = i
	}

	var find func(int) int
	find = func(x int) int {
		if parent[x] != x {
			parent[x] = find(parent[x])
		}
		return parent[x]
	}

	union := func(x, y int) {
		parent[find(x)] = find(y)
	}

	var corridors []Corridor
	for _, edge := range edges {
		if find(edge.from) != find(edge.to) {
			union(edge.from, edge.to)
			from := rooms[edge.from].Center
			to := rooms[edge.to].Center

			if mg.random.Intn(2) == 0 {
				corridors = append(corridors, mg.createHorizontalCorridor(from.X, to.X, from.Y))
				corridors = append(corridors, mg.createVerticalCorridor(from.Y, to.Y, to.X))
			} else {
				corridors = append(corridors, mg.createVerticalCorridor(from.Y, to.Y, from.X))
				corridors = append(corridors, mg.createHorizontalCorridor(from.X, to.X, to.Y))
			}
		}
	}

	if len(rooms) >= 4 {
		extraEdges := mg.random.Intn(3) + 1
		for i := 0; i < extraEdges; i++ {
			edge := edges[mg.random.Intn(len(edges))]
			from := rooms[edge.from].Center
			to := rooms[edge.to].Center

			if mg.random.Intn(2) == 0 {
				corridors = append(corridors, mg.createHorizontalCorridor(from.X, to.X, from.Y))
			} else {
				corridors = append(corridors, mg.createVerticalCorridor(from.Y, to.Y, from.X))
			}
		}
	}

	return corridors
}

func (mg *MapGenerator) findRoomAtEdge(rooms []Room, width, height int, position string) Room {
	if len(rooms) == 0 {
		return Room{}
	}

	var bestRoom Room
	bestScore := -1

	for _, room := range rooms {
		score := 0
		if position == "start" {
			score = (width - room.Center.X) + (height - room.Center.Y)
		} else {
			score = room.Center.X + room.Center.Y
		}

		if score > bestScore {
			bestScore = score
			bestRoom = room
		}
	}

	return bestRoom
}

func (mg *MapGenerator) isPathConnected(tiles [][]Tile, start, end Position) bool {
	if len(tiles) == 0 || len(tiles[0]) == 0 {
		return false
	}

	visited := make(map[Position]bool)
	queue := []Position{start}
	visited[start] = true

	directions := []Position{{X: 0, Y: -1}, {X: 0, Y: 1}, {X: -1, Y: 0}, {X: 1, Y: 0}}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if current.X == end.X && current.Y == end.Y {
			return true
		}

		for _, dir := range directions {
			next := Position{X: current.X + dir.X, Y: current.Y + dir.Y}

			if next.X < 0 || next.X >= len(tiles[0]) || next.Y < 0 || next.Y >= len(tiles) {
				continue
			}

			if visited[next] {
				continue
			}

			if tiles[next.Y][next.X].Walkable {
				visited[next] = true
				queue = append(queue, next)
			}
		}
	}

	return false
}

func (mg *MapGenerator) ensureConnectivity(tiles [][]Tile, rooms []Room, corridors []Corridor, width, height int) {
	roomCount := len(rooms)
	if roomCount < 2 {
		return
	}

	for i := 0; i < roomCount-1; i++ {
		if !mg.isPathConnected(tiles, rooms[i].Center, rooms[i+1].Center) {
			mg.createDirectCorridor(tiles, rooms[i].Center, rooms[i+1].Center)
		}
	}
}

func (mg *MapGenerator) createDirectCorridor(tiles [][]Tile, start, end Position) {
	if mg.random.Intn(2) == 0 {
		for x := int(math.Min(float64(start.X), float64(end.X))); x <= int(math.Max(float64(start.X), float64(end.X))); x++ {
			if start.Y >= 0 && start.Y < len(tiles) && x >= 0 && x < len(tiles[0]) {
				tiles[start.Y][x] = Tile{Type: TileFloor, Walkable: true}
			}
		}
		for y := int(math.Min(float64(start.Y), float64(end.Y))); y <= int(math.Max(float64(start.Y), float64(end.Y))); y++ {
			if y >= 0 && y < len(tiles) && end.X >= 0 && end.X < len(tiles[0]) {
				tiles[y][end.X] = Tile{Type: TileFloor, Walkable: true}
			}
		}
	} else {
		for y := int(math.Min(float64(start.Y), float64(end.Y))); y <= int(math.Max(float64(start.Y), float64(end.Y))); y++ {
			if y >= 0 && y < len(tiles) && start.X >= 0 && start.X < len(tiles[0]) {
				tiles[y][start.X] = Tile{Type: TileFloor, Walkable: true}
			}
		}
		for x := int(math.Min(float64(start.X), float64(end.X))); x <= int(math.Max(float64(start.X), float64(end.X))); x++ {
			if end.Y >= 0 && end.Y < len(tiles) && x >= 0 && x < len(tiles[0]) {
				tiles[end.Y][x] = Tile{Type: TileFloor, Walkable: true}
			}
		}
	}
}
