package coordination

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"schemasync/internal/config"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type NodeStatus struct {
	NodeID        string
	Address       string
	IsLeader      bool
	LastHeartbeat time.Time
	Status        string
}

type ClusterCoordinator struct {
	cfg          *config.GRPCConfig
	nodes        map[string]*NodeStatus
	leaderID     string
	mu           sync.RWMutex
	onLeaderElected func(string)
}

func NewClusterCoordinator(cfg *config.GRPCConfig) *ClusterCoordinator {
	return &ClusterCoordinator{
		cfg:   cfg,
		nodes: make(map[string]*NodeStatus),
	}
}

func (c *ClusterCoordinator) RegisterNode(nodeID, address string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.nodes[nodeID] = &NodeStatus{
		NodeID:        nodeID,
		Address:       address,
		IsLeader:      false,
		LastHeartbeat: time.Now(),
		Status:        "active",
	}
}

func (c *ClusterCoordinator) SetLeader(nodeID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.leaderID != "" {
		if node, exists := c.nodes[c.leaderID]; exists {
			node.IsLeader = false
		}
	}

	c.leaderID = nodeID
	if node, exists := c.nodes[nodeID]; exists {
		node.IsLeader = true
	}

	if c.onLeaderElected != nil {
		go c.onLeaderElected(nodeID)
	}
}

func (c *ClusterCoordinator) GetLeader() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.leaderID
}

func (c *ClusterCoordinator) GetNodes() []*NodeStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()

	nodes := make([]*NodeStatus, 0, len(c.nodes))
	for _, node := range c.nodes {
		nodes = append(nodes, node)
	}
	return nodes
}

func (c *ClusterCoordinator) Heartbeat(nodeID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if node, exists := c.nodes[nodeID]; exists {
		node.LastHeartbeat = time.Now()
	}
}

func (c *ClusterCoordinator) CleanupStaleNodes(timeout time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	cutoff := time.Now().Add(-timeout)
	for id, node := range c.nodes {
		if node.LastHeartbeat.Before(cutoff) {
			delete(c.nodes, id)
			if id == c.leaderID {
				c.leaderID = ""
			}
		}
	}
}

type GRPCServer struct {
	coordinator *ClusterCoordinator
	server      *grpc.Server
	address     string
	nodeID      string
}

func NewGRPCServer(coordinator *ClusterCoordinator, cfg *config.GRPCConfig) *GRPCServer {
	return &GRPCServer{
		coordinator: coordinator,
		address:     cfg.Address,
		nodeID:      cfg.NodeID,
	}
}

func (s *GRPCServer) Start(ctx context.Context) error {
	lis, err := net.Listen("tcp", s.address)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.server = grpc.NewServer()

	s.coordinator.RegisterNode(s.nodeID, s.address)

	go func() {
		<-ctx.Done()
		s.server.GracefulStop()
	}()

	return s.server.Serve(lis)
}

type GRPCClient struct {
	nodeID    string
	clusterID string
	conn      *grpc.ClientConn
}

func NewGRPCClient(address, nodeID, clusterID string) (*GRPCClient, error) {
	conn, err := grpc.Dial(
		address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithTimeout(10*time.Second),
	)
	if err != nil {
		return nil, err
	}

	return &GRPCClient{
		nodeID:    nodeID,
		clusterID: clusterID,
		conn:      conn,
	}, nil
}

func (c *GRPCClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

type DistributedCoordinator struct {
	cfg             *config.Config
	grpcServer      *GRPCServer
	clusterCoord    *ClusterCoordinator
	distributedLock *DistributedLock
	leaderElect     *LeaderElection
	mu              sync.RWMutex
	isRunning       bool
}

func NewDistributedCoordinator(cfg *config.Config) (*DistributedCoordinator, error) {
	lock, err := NewDistributedLock(&cfg.Redis, nil)
	if err != nil {
		return nil, err
	}

	clusterCoord := NewClusterCoordinator(&cfg.GRPC)
	leaderElect := NewLeaderElection(lock, cfg.GRPC.NodeID, cfg.GRPC.ClusterID)
	grpcServer := NewGRPCServer(clusterCoord, &cfg.GRPC)

	return &DistributedCoordinator{
		cfg:             cfg,
		grpcServer:      grpcServer,
		clusterCoord:    clusterCoord,
		distributedLock: lock,
		leaderElect:     leaderElect,
	}, nil
}

func (dc *DistributedCoordinator) Start(ctx context.Context) error {
	dc.mu.Lock()
	dc.isRunning = true
	dc.mu.Unlock()

	go func() {
		if err := dc.grpcServer.Start(ctx); err != nil {
			fmt.Printf("gRPC server error: %v\n", err)
		}
	}()

	go dc.heartbeatLoop(ctx)
	go dc.leaderLoop(ctx)

	return nil
}

func (dc *DistributedCoordinator) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			dc.clusterCoord.Heartbeat(dc.cfg.GRPC.NodeID)
			dc.clusterCoord.CleanupStaleNodes(30 * time.Second)
		}
	}
}

func (dc *DistributedCoordinator) leaderLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !dc.leaderElect.IsLeader() {
				_, _ = dc.leaderElect.Elect(ctx)
			}
		}
	}
}

func (dc *DistributedCoordinator) IsLeader() bool {
	dc.mu.RLock()
	defer dc.mu.RUnlock()
	return dc.leaderElect.IsLeader()
}

func (dc *DistributedCoordinator) AcquireClusterLock(ctx context.Context) (bool, error) {
	return dc.distributedLock.Acquire(ctx, DefaultClusterLockKey)
}

func (dc *DistributedCoordinator) ReleaseClusterLock(ctx context.Context) error {
	return dc.distributedLock.Release(ctx, DefaultClusterLockKey)
}

func (dc *DistributedCoordinator) Stop(ctx context.Context) error {
	dc.mu.Lock()
	dc.isRunning = false
	dc.mu.Unlock()

	if dc.leaderElect.IsLeader() {
		_ = dc.leaderElect.StepDown(ctx)
	}

	return nil
}
