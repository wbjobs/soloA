package ratelimit

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/redis/go-redis/v9"
	"github.com/sony/gobreaker"
)

const (
	redisNamespace = "mpc"
	keyPrefixRateLimitQPS   = "ratelimit:qps"
	keyPrefixRateLimitDaily = "ratelimit:daily"
)

var (
	ErrRateLimitExceeded = errors.New("rate limit exceeded")
	ErrDailyLimitExceeded = errors.New("daily limit exceeded")
	ErrCircuitBreakerOpen = errors.New("circuit breaker is open")
)

type RateLimiter struct {
	redisClient *redis.Client
	defaultQPS  int
	defaultBurst int
}

func NewRateLimiter(redisClient *redis.Client, cfg *config.LimitsConfig) *RateLimiter {
	return &RateLimiter{
		redisClient:  redisClient,
		defaultQPS:   cfg.DefaultQPS,
		defaultBurst: cfg.Burst,
	}
}

func buildQPSKey(tenantID string) string {
	return fmt.Sprintf("%s:%s:%s", redisNamespace, keyPrefixRateLimitQPS, tenantID)
}

func buildDailyKey(tenantID string, date string) string {
	return fmt.Sprintf("%s:%s:%s:%s", redisNamespace, keyPrefixRateLimitDaily, tenantID, date)
}

func (l *RateLimiter) Allow(ctx context.Context, tenantID string, maxQPS int) (bool, error) {
	if maxQPS <= 0 {
		maxQPS = l.defaultQPS
	}

	key := buildQPSKey(tenantID)
	now := time.Now().Unix()

	pipe := l.redisClient.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(now-1, 10))
	pipe.ZCard(ctx, key)
	results, err := pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	current := results[1].(*redis.IntCmd).Val()

	if current >= int64(maxQPS) {
		return false, ErrRateLimitExceeded
	}

	pipe = l.redisClient.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: strconv.FormatInt(time.Now().UnixNano(), 10)})
	pipe.Expire(ctx, key, time.Second*2)
	_, err = pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	return true, nil
}

func (l *RateLimiter) CheckDailyLimit(ctx context.Context, tenantID string, dailyLimit int64) (bool, int64, error) {
	if dailyLimit <= 0 {
		return true, 0, nil
	}

	today := time.Now().Format("20060102")
	key := buildDailyKey(tenantID, today)

	current, err := l.redisClient.Get(ctx, key).Int64()
	if err != nil && err != redis.Nil {
		return false, 0, err
	}

	if current >= dailyLimit {
		return false, current, ErrDailyLimitExceeded
	}

	return true, current, nil
}

func (l *RateLimiter) IncrementDaily(ctx context.Context, tenantID string) error {
	today := time.Now().Format("20060102")
	key := buildDailyKey(tenantID, today)

	pipe := l.redisClient.Pipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, time.Hour*24)
	_, err := pipe.Exec(ctx)
	return err
}

func (l *RateLimiter) GetCurrentQPS(ctx context.Context, tenantID string) (int64, error) {
	key := buildQPSKey(tenantID)
	now := time.Now().Unix()

	pipe := l.redisClient.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(now-1, 10))
	pipe.ZCard(ctx, key)
	results, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}

	return results[1].(*redis.IntCmd).Val(), nil
}

type ChannelCircuitBreaker struct {
	breakers map[string]*gobreaker.CircuitBreaker
}

func NewChannelCircuitBreaker() *ChannelCircuitBreaker {
	return &ChannelCircuitBreaker{
		breakers: make(map[string]*gobreaker.CircuitBreaker),
	}
}

func (c *ChannelCircuitBreaker) Get(channel string) *gobreaker.CircuitBreaker {
	if breaker, exists := c.breakers[channel]; exists {
		return breaker
	}

	c.breakers[channel] = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        channel,
		MaxRequests: 3,
		Interval:    30 * time.Second,
		Timeout:     60 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 5 && failureRatio >= 0.6
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			fmt.Printf("Circuit breaker %s changed from %s to %s\n", name, from, to)
		},
	})

	return c.breakers[channel]
}

func (c *ChannelCircuitBreaker) Execute(channel string, fn func() error) error {
	breaker := c.Get(channel)
	if breaker.State() == gobreaker.StateOpen {
		return ErrCircuitBreakerOpen
	}

	_, err := breaker.Execute(func() (interface{}, error) {
		return nil, fn()
	})
	return err
}

func (c *ChannelCircuitBreaker) State(channel string) gobreaker.State {
	return c.Get(channel).State()
}
