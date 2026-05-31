package db

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"

	"task-scheduler/internal/config"
	"task-scheduler/internal/logger"
)

var RedisClient *redis.Client
var ctx = context.Background()
var currentNodeID string

func InitRedis(cfg *config.RedisConfig) error {
	RedisClient = redis.NewClient(&redis.Options{
		Addr:         cfg.Addr(),
		Password:     cfg.Password,
		DB:           cfg.DB,
		PoolSize:     cfg.PoolSize,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	})

	if err := RedisClient.Ping(ctx).Err(); err != nil {
		return err
	}

	logger.Logger.Info("Redis connected successfully")
	return nil
}

func SetNodeID(nodeID string) {
	currentNodeID = nodeID
}

const (
	lockPrefix         = "task:lock:"
	nodeRegistryKey    = "task:nodes"
	heartbeatPrefix    = "task:heartbeat:"
	taskOwnerPrefix    = "task:owner:"
)

func LockKey(taskID uint) string {
	return lockPrefix + uintToString(taskID)
}

func TaskOwnerKey(taskID uint) string {
	return taskOwnerPrefix + uintToString(taskID)
}

func uintToString(n uint) string {
	return fmt.Sprintf("%d", n)
}

type DistributedLock struct {
	client       *redis.Client
	key          string
	value        string
	ttl          time.Duration
	refreshStop  chan struct{}
	refreshWG    sync.WaitGroup
	isAcquired   bool
	mu           sync.Mutex
}

func NewDistributedLock(taskID uint, ttl time.Duration) *DistributedLock {
	return &DistributedLock{
		client:      RedisClient,
		key:         LockKey(taskID),
		value:       currentNodeID,
		ttl:         ttl,
		refreshStop: make(chan struct{}),
		isAcquired:  false,
	}
}

func (l *DistributedLock) Acquire() (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	ownerKey := TaskOwnerKey(l.getTaskID())
	pipe := l.client.TxPipeline()
	
	getOwner := pipe.Get(ctx, ownerKey)
	setNX := pipe.SetNX(ctx, l.key, l.value, l.ttl)
	
	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return false, err
	}

	ownerValue, _ := getOwner.Result()
	if ownerValue != "" && ownerValue != l.value {
		logger.Sugar.Debugf("Task %d already owned by %s, skipping", l.getTaskID(), ownerValue)
		return false, nil
	}

	acquired, err := setNX.Result()
	if err != nil {
		return false, err
	}

	if !acquired {
		return false, nil
	}

	pipe2 := l.client.TxPipeline()
	pipe2.Set(ctx, ownerKey, l.value, l.ttl*2)
	_, err = pipe2.Exec(ctx)
	if err != nil {
		l.client.Del(ctx, l.key)
		return false, err
	}

	l.isAcquired = true
	l.startAutoRefresh()
	return true, nil
}

func (l *DistributedLock) Release() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.isAcquired {
		return nil
	}

	close(l.refreshStop)
	l.refreshWG.Wait()

	ownerKey := TaskOwnerKey(l.getTaskID())
	
	script := `
	local lock_val = redis.call("get", KEYS[1])
	local owner_val = redis.call("get", KEYS[2])
	
	if lock_val == ARGV[1] then
		redis.call("del", KEYS[1])
	end
	
	if owner_val == ARGV[1] then
		redis.call("del", KEYS[2])
	end
	
	return 1
	`
	
	err := l.client.Eval(ctx, script, []string{l.key, ownerKey}, l.value).Err()
	l.isAcquired = false
	return err
}

func (l *DistributedLock) IsHeld() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.isAcquired
}

func (l *DistributedLock) startAutoRefresh() {
	refreshInterval := l.ttl / 3
	
	l.refreshWG.Add(1)
	go func() {
		defer l.refreshWG.Done()
		
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		
		for {
			select {
			case <-l.refreshStop:
				return
			case <-ticker.C:
				if err := l.refresh(); err != nil {
					logger.Sugar.Warnf("Failed to refresh lock %s: %v", l.key, err)
				}
			}
		}
	}()
}

func (l *DistributedLock) refresh() error {
	script := `
	if redis.call("get", KEYS[1]) == ARGV[1] then
		redis.call("expire", KEYS[1], ARGV[2])
		redis.call("expire", KEYS[2], ARGV[3])
		return 1
	else
		return 0
	end
	`
	
	ownerKey := TaskOwnerKey(l.getTaskID())
	ttlSeconds := int(l.ttl.Seconds())
	ownerTTLSeconds := int((l.ttl * 2).Seconds())
	
	result, err := l.client.Eval(ctx, script, []string{l.key, ownerKey}, l.value, ttlSeconds, ownerTTLSeconds).Result()
	if err != nil {
		return err
	}
	
	if result.(int64) == 0 {
		l.mu.Lock()
		l.isAcquired = false
		l.mu.Unlock()
		return fmt.Errorf("lock lost, refresh failed")
	}
	
	return nil
}

func (l *DistributedLock) getTaskID() uint {
	idStr := l.key[len(lockPrefix):]
	var id uint
	fmt.Sscanf(idStr, "%d", &id)
	return id
}

func UpdateHeartbeat(nodeID string, ttl time.Duration) error {
	key := heartbeatPrefix + nodeID
	return RedisClient.Set(ctx, key, time.Now().Unix(), ttl).Err()
}

func GetActiveNodes() ([]string, error) {
	var cursor uint64
	var nodes []string

	for {
		var keys []string
		var err error
		keys, cursor, err = RedisClient.Scan(ctx, cursor, heartbeatPrefix+"*", 10).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			nodeID := key[len(heartbeatPrefix):]
			nodes = append(nodes, nodeID)
		}

		if cursor == 0 {
			break
		}
	}

	return nodes, nil
}
