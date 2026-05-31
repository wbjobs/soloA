package delayqueue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"e-commerce-fulfillment/pkg/logger"
)

type DelayedMessage struct {
	ID        string                 `json:"id"`
	Topic     string                 `json:"topic"`
	Payload   map[string]interface{} `json:"payload"`
	DelayMs   int64                  `json:"delay_ms"`
	Timestamp int64                  `json:"timestamp"`
}

type DelayQueue struct {
	redis *redis.Client
}

func NewDelayQueue(redis *redis.Client) *DelayQueue {
	return &DelayQueue{redis: redis}
}

func (dq *DelayQueue) Enqueue(ctx context.Context, msg *DelayedMessage) error {
	if msg.ID == "" {
		return fmt.Errorf("message id is required")
	}
	if msg.Topic == "" {
		return fmt.Errorf("topic is required")
	}

	score := float64(time.Now().UnixMilli() + msg.DelayMs)
	msg.Timestamp = time.Now().UnixMilli()

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	_, err = dq.redis.ZAdd(ctx, dq.getKey(msg.Topic), redis.Z{
		Score:  score,
		Member: string(payload),
	}).Result()
	if err != nil {
		return fmt.Errorf("failed to add to delay queue: %v", err)
	}

	logger.GetLogger().Info(fmt.Sprintf("Enqueued delayed message: topic=%s, id=%s, delay_ms=%d", msg.Topic, msg.ID, msg.DelayMs))
	return nil
}

func (dq *DelayQueue) EnqueueWithRetry(ctx context.Context, msg *DelayedMessage, maxRetries int) error {
	var lastErr error
	retryInterval := 100 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		if err := dq.Enqueue(ctx, msg); err == nil {
			return nil
		} else {
			lastErr = err
			if i < maxRetries-1 {
				time.Sleep(retryInterval)
				retryInterval *= 2
			}
		}
	}

	return lastErr
}

func (dq *DelayQueue) Dequeue(ctx context.Context, topic string, batchSize int) ([]*DelayedMessage, error) {
	now := float64(time.Now().UnixMilli())
	key := dq.getKey(topic)

	results, err := dq.redis.ZRangeByScore(ctx, key, &redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%f", now),
		Count: int64(batchSize),
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get delayed messages: %v", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	msgs := make([]*DelayedMessage, 0, len(results))
	for _, result := range results {
		var msg DelayedMessage
		if err := json.Unmarshal([]byte(result), &msg); err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to unmarshal delayed message: %v", err))
			continue
		}

		count, err := dq.redis.ZRem(ctx, key, result).Result()
		if err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to remove message from queue: %v", err))
			continue
		}
		if count == 0 {
			continue
		}

		msgs = append(msgs, &msg)
	}

	if len(msgs) > 0 {
		logger.GetLogger().Info(fmt.Sprintf("Dequeued %d messages from topic=%s", len(msgs), topic))
	}

	return msgs, nil
}

func (dq *DelayQueue) Remove(ctx context.Context, topic string, msgID string) error {
	key := dq.getKey(topic)

	results, err := dq.redis.ZRange(ctx, key, 0, -1).Result()
	if err != nil {
		return fmt.Errorf("failed to scan queue: %v", err)
	}

	for _, result := range results {
		var msg DelayedMessage
		if err := json.Unmarshal([]byte(result), &msg); err != nil {
			continue
		}
		if msg.ID == msgID {
			_, err := dq.redis.ZRem(ctx, key, result).Result()
			if err != nil {
				return fmt.Errorf("failed to remove message: %v", err)
			}
			logger.GetLogger().Info(fmt.Sprintf("Removed delayed message: topic=%s, id=%s", topic, msgID))
			return nil
		}
	}

	return nil
}

func (dq *DelayQueue) StartConsumer(
	ctx context.Context,
	topic string,
	interval time.Duration,
	batchSize int,
	handler func(context.Context, *DelayedMessage) error,
) {
	logger.GetLogger().Info(fmt.Sprintf("Starting delay queue consumer for topic=%s, interval=%v", topic, interval))

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.GetLogger().Info(fmt.Sprintf("Delay queue consumer stopped for topic=%s", topic))
			return
		case <-ticker.C:
			msgs, err := dq.Dequeue(ctx, topic, batchSize)
			if err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to dequeue from topic=%s: %v", topic, err))
				continue
			}

			for _, msg := range msgs {
				if err := handler(ctx, msg); err != nil {
					logger.GetLogger().Error(fmt.Sprintf("Failed to process message: topic=%s, id=%s, error=%v", topic, msg.ID, err))
				}
			}
		}
	}
}

func (dq *DelayQueue) getKey(topic string) string {
	return fmt.Sprintf("delay_queue:%s", topic)
}
