package lock

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

const (
	lockScript = `
		if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2]) then
			return 1
		end
		return 0
	`

	unlockScript = `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("DEL", KEYS[1])
		else
			return 0
		end
	`

	refreshScript = `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("PEXPIRE", KEYS[1], ARGV[2])
		else
			return 0
		end
	`
)

type DistributedLock struct {
	client *redis.Client
}

func NewDistributedLock(client *redis.Client) *DistributedLock {
	return &DistributedLock{client: client}
}

type Lock struct {
	client    *redis.Client
	key       string
	value     string
	ttl       time.Duration
	acquired  bool
	stopRenew chan struct{}
}

func (d *DistributedLock) Acquire(ctx context.Context, key string, value string, ttl time.Duration) (*Lock, error) {
	result, err := d.client.Eval(ctx, lockScript, []string{key}, value, int(ttl.Milliseconds())).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to acquire lock: %w", err)
	}

	if result.(int64) != 1 {
		return nil, fmt.Errorf("lock is already held")
	}

	lock := &Lock{
		client:    d.client,
		key:       key,
		value:     value,
		ttl:       ttl,
		acquired:  true,
		stopRenew: make(chan struct{}),
	}

	lock.startRenewal()

	return lock, nil
}

func (l *Lock) startRenewal() {
	renewInterval := l.ttl / 3
	ticker := time.NewTicker(renewInterval)

	go func() {
		for {
			select {
			case <-ticker.C:
				if !l.acquired {
					return
				}
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				result, err := l.client.Eval(ctx, refreshScript, []string{l.key}, l.value, int(l.ttl.Milliseconds())).Result()
				cancel()

				if err != nil || result.(int64) != 1 {
					l.acquired = false
					return
				}
			case <-l.stopRenew:
				ticker.Stop()
				return
			}
		}
	}()
}

func (l *Lock) Release(ctx context.Context) error {
	if !l.acquired {
		return nil
	}

	select {
	case l.stopRenew <- struct{}{}:
	default:
	}

	result, err := l.client.Eval(ctx, unlockScript, []string{l.key}, l.value).Result()
	if err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}

	l.acquired = result.(int64) == 1
	return nil
}

func (l *Lock) IsAcquired() bool {
	return l.acquired
}

func (d *DistributedLock) TryAcquire(ctx context.Context, key string, value string, ttl time.Duration, attempts int, interval time.Duration) (*Lock, error) {
	var lastErr error

	for i := 0; i < attempts; i++ {
		lock, err := d.Acquire(ctx, key, value, ttl)
		if err == nil {
			return lock, nil
		}
		lastErr = err

		if i < attempts-1 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(interval):
			}
		}
	}

	return nil, lastErr
}
