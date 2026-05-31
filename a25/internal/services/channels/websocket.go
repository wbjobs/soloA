package channels

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/message-push-center/internal/common/models"
)

type WebSocketChannel struct {
	connections map[string]*UserConnection
	mu          sync.RWMutex
	upgrader    websocket.Upgrader
}

type UserConnection struct {
	conn     *websocket.Conn
	userID   string
	tenantID string
	sendChan chan []byte
}

func NewWebSocketChannel() *WebSocketChannel {
	return &WebSocketChannel{
		connections: make(map[string]*UserConnection),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

func (c *WebSocketChannel) ChannelType() string {
	return models.ChannelTypeWebSocket
}

func (c *WebSocketChannel) Send(ctx context.Context, payload interface{}) (string, error) {
	wsMsg, ok := payload.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid payload type")
	}

	userID, _ := wsMsg["user_id"].(string)
	tenantID, _ := wsMsg["tenant_id"].(string)
	message, _ := wsMsg["message"].(map[string]interface{})

	connKey := fmt.Sprintf("%s:%s", tenantID, userID)

	c.mu.RLock()
	uc, exists := c.connections[connKey]
	c.mu.RUnlock()

	if !exists {
		return "", fmt.Errorf("user not connected")
	}

	payloadBytes, err := json.Marshal(message)
	if err != nil {
		return "", err
	}

	select {
	case uc.sendChan <- payloadBytes:
		return fmt.Sprintf("ws_%d", time.Now().UnixNano()), nil
	case <-time.After(5 * time.Second):
		return "", fmt.Errorf("send timeout")
	}
}

func (c *WebSocketChannel) RegisterConnection(userID, tenantID string, conn *websocket.Conn) {
	connKey := fmt.Sprintf("%s:%s", tenantID, userID)

	c.mu.Lock()
	if oldConn, exists := c.connections[connKey]; exists {
		oldConn.conn.Close()
	}

	uc := &UserConnection{
		conn:     conn,
		userID:   userID,
		tenantID: tenantID,
		sendChan: make(chan []byte, 100),
	}

	c.connections[connKey] = uc
	c.mu.Unlock()

	go c.handleConnection(uc)
}

func (c *WebSocketChannel) handleConnection(uc *UserConnection) {
	defer func() {
		c.mu.Lock()
		connKey := fmt.Sprintf("%s:%s", uc.tenantID, uc.userID)
		if conn, exists := c.connections[connKey]; exists && conn == uc {
			delete(c.connections, connKey)
		}
		c.mu.Unlock()
		uc.conn.Close()
	}()

	go func() {
		for {
			_, msg, err := uc.conn.ReadMessage()
			if err != nil {
				return
			}

			var heartBeat struct {
				Type string `json:"type"`
			}
			json.Unmarshal(msg, &heartBeat)

			if heartBeat.Type == "ping" {
				response, _ := json.Marshal(map[string]string{"type": "pong"})
				uc.conn.WriteMessage(websocket.TextMessage, response)
			}
		}
	}()

	for {
		select {
		case msg, ok := <-uc.sendChan:
			if !ok {
				return
			}
			err := uc.conn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				return
			}
		case <-time.After(60 * time.Second):
			uc.conn.WriteMessage(websocket.PingMessage, nil)
		}
	}
}

func (c *WebSocketChannel) Broadcast(tenantID string, message map[string]interface{}) error {
	payloadBytes, err := json.Marshal(message)
	if err != nil {
		return err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, uc := range c.connections {
		if uc.tenantID == tenantID {
			select {
			case uc.sendChan <- payloadBytes:
			default:
			}
		}
	}

	return nil
}

func (c *WebSocketChannel) GetConnectionCount(tenantID string) int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	count := 0
	for _, uc := range c.connections {
		if uc.tenantID == tenantID {
			count++
		}
	}
	return count
}

func (c *WebSocketChannel) IsUserOnline(tenantID, userID string) bool {
	connKey := fmt.Sprintf("%s:%s", tenantID, userID)
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, exists := c.connections[connKey]
	return exists
}

func (c *WebSocketChannel) DisconnectUser(tenantID, userID string) {
	connKey := fmt.Sprintf("%s:%s", tenantID, userID)
	c.mu.Lock()
	if uc, exists := c.connections[connKey]; exists {
		uc.conn.Close()
		delete(c.connections, connKey)
	}
	c.mu.Unlock()
}
