package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"roguelike-server/internal/game"
)

type Client struct {
	conn     *websocket.Conn
	playerID string
	roomID   string
	send     chan []byte
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type CreateRoomRequest struct {
}

type JoinRoomRequest struct {
	RoomID string `json:"roomId"`
	Name   string `json:"name"`
}

type MoveRequest struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type AttackRequest struct {
	EnemyID string `json:"enemyId"`
}

type MarkEnemyRequest struct {
	EnemyID string `json:"enemyId"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.Mutex
)

func HandleWebSocket(w http.ResponseWriter, r *http.Request, gameManager *game.GameManager) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()

	log.Println("New client connected")

	go client.readPump(gameManager)
	go client.writePump()
}

func (c *Client) readPump(gameManager *game.GameManager) {
	defer func() {
		c.disconnect(gameManager)
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("JSON unmarshal error:", err)
			continue
		}

		c.handleMessage(msg, gameManager)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg Message, gameManager *game.GameManager) {
	switch msg.Type {
	case "create_room":
		c.handleCreateRoom(gameManager)
	case "join_room":
		c.handleJoinRoom(msg.Payload, gameManager)
	case "move":
		c.handleMove(msg.Payload, gameManager)
	case "attack":
		c.handleAttack(msg.Payload, gameManager)
	case "mark_enemy":
		c.handleMarkEnemy(msg.Payload, gameManager)
	case "get_state":
		c.handleGetState(gameManager)
	case "get_leaderboard":
		c.handleGetLeaderboard(gameManager)
	case "get_achievements":
		c.handleGetAchievements(gameManager)
	}
}

func (c *Client) handleCreateRoom(gameManager *game.GameManager) {
	room := gameManager.CreateRoom()
	c.roomID = room.ID

	response := map[string]interface{}{
		"type":   "room_created",
		"roomId": room.ID,
	}
	c.sendJSON(response)

	log.Printf("Room %s created for client", room.ID)
}

func (c *Client) handleJoinRoom(payload json.RawMessage, gameManager *game.GameManager) {
	var req JoinRoomRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		c.sendError("Invalid request")
		return
	}

	room, player, err := gameManager.JoinRoom(req.RoomID, req.Name)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	c.roomID = room.ID
	c.playerID = player.ID

	response := map[string]interface{}{
		"type":    "joined_room",
		"player":  player,
		"roomId":  room.ID,
		"players": getPlayerList(room),
	}
	c.sendJSON(response)

	broadcastToRoom(c.roomID, map[string]interface{}{
		"type":    "player_joined",
		"player":  player,
		"players": getPlayerList(room),
	}, c)

	log.Printf("Player %s joined room %s", player.Name, room.ID)
}

func (c *Client) handleMove(payload json.RawMessage, gameManager *game.GameManager) {
	if c.roomID == "" || c.playerID == "" {
		c.sendError("Not in a room")
		return
	}

	var req MoveRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		c.sendError("Invalid request")
		return
	}

	err := gameManager.MovePlayer(c.roomID, c.playerID, req.X, req.Y)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	state := gameManager.GetGameState(c.roomID)
	broadcastToRoom(c.roomID, map[string]interface{}{
		"type":  "state_update",
		"state": state,
	}, nil)
}

func (c *Client) handleAttack(payload json.RawMessage, gameManager *game.GameManager) {
	if c.roomID == "" || c.playerID == "" {
		c.sendError("Not in a room")
		return
	}

	var req AttackRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		c.sendError("Invalid request")
		return
	}

	enemy, err := gameManager.AttackEnemy(c.roomID, c.playerID, req.EnemyID)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	state := gameManager.GetGameState(c.roomID)
	broadcastToRoom(c.roomID, map[string]interface{}{
		"type":   "attack_result",
		"enemy":  enemy,
		"state":  state,
	}, nil)
}

func (c *Client) handleGetState(gameManager *game.GameManager) {
	if c.roomID == "" {
		c.sendError("Not in a room")
		return
	}

	state := gameManager.GetGameState(c.roomID)
	c.sendJSON(map[string]interface{}{
		"type":  "game_state",
		"state": state,
	})
}

func (c *Client) sendJSON(data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Println("JSON marshal error:", err)
		return
	}

	select {
	case c.send <- jsonData:
	default:
		log.Println("Client send buffer full")
	}
}

func (c *Client) sendError(message string) {
	c.sendJSON(map[string]interface{}{
		"type":  "error",
		"error": message,
	})
}

func (c *Client) disconnect(gameManager *game.GameManager) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	if _, ok := clients[c]; ok {
		delete(clients, c)
		close(c.send)
	}

	if c.roomID != "" {
		broadcastToRoom(c.roomID, map[string]interface{}{
			"type":     "player_left",
			"playerId": c.playerID,
		}, c)
	}

	log.Printf("Client disconnected (player: %s, room: %s)", c.playerID, c.roomID)
}

func broadcastToRoom(roomID string, data interface{}, exclude *Client) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Println("Broadcast JSON marshal error:", err)
		return
	}

	clientsMu.Lock()
	defer clientsMu.Unlock()

	for client := range clients {
		if client.roomID == roomID && client != exclude {
			select {
			case client.send <- jsonData:
			default:
				log.Println("Client send buffer full during broadcast")
			}
		}
	}
}

func getPlayerList(room *game.GameRoom) []game.Player {
	players := make([]game.Player, 0, len(room.Players))
	for _, p := range room.Players {
		players = append(players, *p)
	}
	return players
}

func (c *Client) handleMarkEnemy(payload json.RawMessage, gameManager *game.GameManager) {
	if c.roomID == "" || c.playerID == "" {
		c.sendError("Not in a room")
		return
	}

	var req MarkEnemyRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		c.sendError("Invalid request")
		return
	}

	err := gameManager.MarkEnemy(c.roomID, c.playerID, req.EnemyID)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	state := gameManager.GetGameState(c.roomID)
	broadcastToRoom(c.roomID, map[string]interface{}{
		"type":  "enemy_marked",
		"enemyId": req.EnemyID,
		"state": state,
	}, nil)
}

func (c *Client) handleGetLeaderboard(gameManager *game.GameManager) {
	leaderboard := gameManager.GetLeaderboard()
	c.sendJSON(map[string]interface{}{
		"type":        "leaderboard",
		"leaderboard": leaderboard,
	})
}

func (c *Client) handleGetAchievements(gameManager *game.GameManager) {
	achievements := gameManager.GetPlayerAchievements(c.playerID)
	c.sendJSON(map[string]interface{}{
		"type":         "achievements",
		"achievements": achievements,
	})
}
