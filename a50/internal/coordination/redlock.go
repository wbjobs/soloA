package coordination

import (
	"context"
	"fmt"
	"sync"
	"time"

	"schemasync/internal/config"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

const (
	DefaultLockTTL         = 30 * time.Second
	DefaultRetryAttempts   = 3
	DefaultRetryDelay      = 200 * time.Millisecond
	DefaultDriftFactor     = 0.01
	DefaultClusterLockKey  = "schemasync:cluster:lock"
	DefaultLeaderKeyPrefix = "schemasync:leader"
)

type DistributedLock struct {
	nodes       []*redis.Client
	value       string
	ttl         time.Duration
	retryCount  int
	retryDelay  time.Duration
	driftFactor float64
	mu          sync.Mutex
}

type LockOptions struct {
	TTL         time.Duration
	RetryCount  int
	RetryDelay  time.Duration
	DriftFactor float64
}

func NewDistributedLock(cfg *config.RedisConfig, opts *LockOptions) (*DistributedLock, error) {
	if opts == nil {
		opts = &LockOptions{
			TTL:         DefaultLockTTL,
			RetryCount:  DefaultRetryAttempts,
			RetryDelay:  DefaultRetryDelay,
			DriftFactor: DefaultDriftFactor,
		}
	}

	var nodes []*redis.Client
	if len(cfg.Nodes) > 0 {
		for _, node := range cfg.Nodes {
			client := redis.NewClient(&redis.Options{
				Addr:     node,
				Password: cfg.Password,
				DB:       cfg.DB,
			})
			nodes = append(nodes, client)
		}
	} else {
		client := redis.NewClient(&redis.Options{
			Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
			Password: cfg.Password,
			DB:       cfg.DB,
		})
		nodes = append(nodes, client)
	}

	for _, client := range nodes {
		if err := client.Ping(context.Background()).Err(); err != nil {
			return nil, fmt.Errorf("redis connection failed: %w", err)
		}
	}

	return &DistributedLock{
		nodes:       nodes,
		ttl:         opts.TTL,
		retryCount:  opts.RetryCount,
		retryDelay:  opts.RetryDelay,
		driftFactor: opts.DriftFactor,
		value:       uuid.New().String(),
	}, nil
}

func (l *DistributedLock) Acquire(ctx context.Context, key string) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.nodes) == 0 {
		return false, fmt.Errorf("no redis nodes available")
	}

	quorum := len(l.nodes)/2 + 1

	for attempt := 0; attempt < l.retryCount; attempt++ {
		startTime := time.Now()
		successCount := 0

		for _, node := range l.nodes {
			if l.tryLockNode(ctx, node, key) {
				successCount++
			}
		}

		elapsed := time.Since(startTime)
		drift := time.Duration(float64(l.ttl) * l.driftFactor)
		validityTime := l.ttl - elapsed - drift

		if successCount >= quorum && validityTime > 0 {
			return true, nil
		}

		l.releaseAll(key)

		if attempt < l.retryCount-1 {
			select {
			case <-ctx.Done():
				return false, ctx.Err()
			case <-time.After(l.retryDelay):
			}
		}
	}

	return false, nil
}

func (l *DistributedLock) tryLockNode(ctx context.Context, client *redis.Client, key string) bool {
	cmd := client.SetNX(ctx, key, l.value, l.ttl)
	success, err := cmd.Result()
	return err == nil && success
}

func (l *DistributedLock) Release(ctx context.Context, key string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	releaseScript := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`

	for _, node := range l.nodes {
		_, _ = node.Eval(ctx, releaseScript, []string{key}, l.value).Result()
	}

	return nil
}

func (l *DistributedLock) releaseAll(key string) {
	for _, node := range l.nodes {
		_ = node.Del(context.Background(), key).Err()
	}
}

type LeaderElection struct {
	lock      *DistributedLock
	nodeID    string
	clusterID string
	isLeader  bool
	onLeader  func()
	mu        sync.RWMutex
}

func NewLeaderElection(lock *DistributedLock, nodeID, clusterID string) *LeaderElection {
	return &LeaderElection{
		lock:      lock,
		nodeID:    nodeID,
		clusterID: clusterID,
	}
}

func (le *LeaderElection) Elect(ctx context.Context) (bool, error) {
	leaderKey := fmt.Sprintf("%s:%s", DefaultLeaderKeyPrefix, le.clusterID)
	acquired, err := le.lock.Acquire(ctx, leaderKey)
	if err != nil {
		return false, err
	}

	le.mu.Lock()
	le.isLeader = acquired
	le.mu.Unlock()

	if acquired && le.onLeader != nil {
		go le.onLeader()
	}

	return acquired, nil
}

func (le *LeaderElection) IsLeader() bool {
	le.mu.RLock()
	defer le.mu.RUnlock()
	return le.isLeader
}

func (le *LeaderElection) SetOnLeader(fn func()) {
	le.onLeader = fn
}

func (le *LeaderElection) StepDown(ctx context.Context) error {
	leaderKey := fmt.Sprintf("%s:%s", DefaultLeaderKeyPrefix, le.clusterID)
	if err := le.lock.Release(ctx, leaderKey); err != nil {
		return err
	}

	le.mu.Lock()
	le.isLeader = false
	le.mu.Unlock()

	return nil
}

func (le *LeaderElection) Renew(ctx context.Context) (bool, error) {
	le.mu.RLock()
	if !le.isLeader {
		le.mu.RUnlock()
		return le.Elect(ctx)
	}
	le.mu.RUnlock()
	return true, nil
}
