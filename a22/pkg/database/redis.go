package database

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/logger"
)

func InitRedis() *redis.Client {
	cfg := config.AppConfig

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Database.Redis.Addr,
		Password: cfg.Database.Redis.Password,
		DB:       cfg.Database.Redis.DB,
		PoolSize: 100,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	maxRetries := 5
	var err error

	for i := 0; i < maxRetries; i++ {
		err = rdb.Ping(ctx).Err()
		if err == nil {
			break
		}
		logger.GetLogger().Warn(fmt.Sprintf("Failed to connect Redis, retrying (%d/%d): %v", i+1, maxRetries, err))
		time.Sleep(time.Second * 2)
	}

	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to connect Redis after %d retries: %v", maxRetries, err))
	}

	logger.GetLogger().Info("Redis connected successfully")
	return rdb
}
