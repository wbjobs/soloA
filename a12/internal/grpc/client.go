package grpcserver

import (
	"context"
	"fmt"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"task-scheduler/internal/config"
	"task-scheduler/internal/db"
	"task-scheduler/internal/logger"
	pb "task-scheduler/proto/pb"
)

type NodeClient struct {
	conn   *grpc.ClientConn
	client pb.NodeServiceClient
	nodeID string
	host   string
	port   int
}

var (
	nodeClients = make(map[string]*NodeClient)
	clientMutex sync.RWMutex
)

func NewNodeClient(nodeID, host string, port int) (*NodeClient, error) {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithTimeout(5*time.Second))
	if err != nil {
		return nil, err
	}

	return &NodeClient{
		conn:   conn,
		client: pb.NewNodeServiceClient(conn),
		nodeID: nodeID,
		host:   host,
		port:   port,
	}, nil
}

func (c *NodeClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *NodeClient) Heartbeat(ctx context.Context, cfg *config.NodeConfig) error {
	_, err := c.client.Heartbeat(ctx, &pb.HeartbeatRequest{
		NodeId:    cfg.ID,
		Timestamp: time.Now().Unix(),
	})
	return err
}

func (c *NodeClient) ExecuteTask(ctx context.Context, req *pb.ExecuteTaskRequest) (*pb.ExecuteTaskResponse, error) {
	return c.client.ExecuteTask(ctx, req)
}

func (c *NodeClient) GetStatus(ctx context.Context) (*pb.GetStatusResponse, error) {
	return c.client.GetStatus(ctx, &pb.GetStatusRequest{NodeId: c.nodeID})
}

func GetNodeClient(nodeID string) (*NodeClient, bool) {
	clientMutex.RLock()
	defer clientMutex.RUnlock()
	client, ok := nodeClients[nodeID]
	return client, ok
}

func RegisterNodeClient(nodeID, host string, port int) error {
	clientMutex.Lock()
	defer clientMutex.Unlock()

	if existing, ok := nodeClients[nodeID]; ok {
		existing.Close()
	}

	client, err := NewNodeClient(nodeID, host, port)
	if err != nil {
		return err
	}

	nodeClients[nodeID] = client
	return nil
}

func StartHeartbeat(cfg *config.Config) {
	ticker := time.NewTicker(time.Duration(cfg.Node.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := db.UpdateHeartbeat(cfg.Node.ID, time.Duration(cfg.Node.HeartbeatInterval*3)*time.Second); err != nil {
				logger.Sugar.Warnf("Failed to update heartbeat: %v", err)
			}
		}
	}
}
