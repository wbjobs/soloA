package database

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
}

var Producer *KafkaProducer

func InitKafka(cfg *config.KafkaConfig) {
	Producer = &KafkaProducer{
		writer: &kafka.Writer{
			Addr:                   kafka.TCP(cfg.Brokers...),
			Balancer:               &kafka.LeastBytes{},
			RequiredAcks:           kafka.RequireOne,
			MaxAttempts:            10,
			ReadTimeout:            10 * time.Second,
			WriteTimeout:           10 * time.Second,
			Compression:            kafka.Gzip,
			BatchTimeout:           10 * time.Millisecond,
			BatchSize:              100,
			Async:                  false,
			AllowAutoTopicCreation: true,
		},
	}
}

func (p *KafkaProducer) SendMessage(ctx context.Context, topic string, key, value []byte) error {
	return p.writer.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   key,
		Value: value,
	})
}

func (p *KafkaProducer) SendMessages(ctx context.Context, topic string, messages []kafka.Message) error {
	for i := range messages {
		messages[i].Topic = topic
	}
	return p.writer.WriteMessages(ctx, messages...)
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}

type KafkaConsumer struct {
	reader         *kafka.Reader
	dedupManager   *DeduplicationManager
	commitInterval time.Duration
}

func NewKafkaConsumer(cfg *config.KafkaConfig, topic string, dedupManager *DeduplicationManager) *KafkaConsumer {
	return &KafkaConsumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:        cfg.Brokers,
			Topic:          topic,
			GroupID:        cfg.GroupID,
			MaxBytes:       10e6,
			CommitInterval: 5 * time.Second,
		}),
		dedupManager:   dedupManager,
		commitInterval: 5 * time.Second,
	}
}

func (c *KafkaConsumer) ReadMessage(ctx context.Context) (kafka.Message, error) {
	return c.reader.ReadMessage(ctx)
}

func (c *KafkaConsumer) ReadMessageWithDedup(ctx context.Context, messageID string) (kafka.Message, error, bool) {
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			return kafka.Message{}, err, false
		}

		if messageID != "" {
			isDuplicate, err := c.dedupManager.IsProcessed(ctx, messageID)
			if err == nil && isDuplicate {
				c.reader.CommitMessages(ctx, msg)
				continue
			}
		}

		return msg, nil, false
	}
}

func (c *KafkaConsumer) CommitMessages(ctx context.Context, msgs ...kafka.Message) error {
	return c.reader.CommitMessages(ctx, msgs...)
}

func (c *KafkaConsumer) MarkProcessed(ctx context.Context, messageID string) error {
	if c.dedupManager != nil {
		return c.dedupManager.MarkProcessed(ctx, messageID)
	}
	return nil
}

func (c *KafkaConsumer) Close() error {
	return c.reader.Close()
}

type DeduplicationManager struct {
	redisClient *redis.Client
	ttl         time.Duration
	inflight    map[string]bool
	mu          sync.RWMutex
}

func NewDeduplicationManager(redisClient *redis.Client, ttl time.Duration) *DeduplicationManager {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &DeduplicationManager{
		redisClient: redisClient,
		ttl:         ttl,
		inflight:    make(map[string]bool),
	}
}

func (d *DeduplicationManager) IsProcessed(ctx context.Context, messageID string) (bool, error) {
	d.mu.RLock()
	if d.inflight[messageID] {
		d.mu.RUnlock()
		return true, nil
	}
	d.mu.RUnlock()

	if d.redisClient != nil {
		key := d.getKey(messageID)
		result, err := d.redisClient.Exists(ctx, key).Result()
		if err != nil {
			return false, err
		}
		return result > 0, nil
	}

	return false, nil
}

func (d *DeduplicationManager) MarkProcessed(ctx context.Context, messageID string) error {
	d.mu.Lock()
	d.inflight[messageID] = true
	d.mu.Unlock()

	if d.redisClient != nil {
		key := d.getKey(messageID)
		return d.redisClient.Set(ctx, key, "1", d.ttl).Err()
	}

	return nil
}

func (d *DeduplicationManager) UnmarkInflight(messageID string) {
	d.mu.Lock()
	delete(d.inflight, messageID)
	d.mu.Unlock()
}

func (d *DeduplicationManager) getKey(messageID string) string {
	return fmt.Sprintf("kafka_dedup:%s", messageID)
}

type ConsumerMessageHandler func(ctx context.Context, msg kafka.Message) error

type MessageConsumer struct {
	consumer     *KafkaConsumer
	handler      ConsumerMessageHandler
	dedupEnabled bool
}

func NewMessageConsumer(consumer *KafkaConsumer, handler ConsumerMessageHandler, dedupEnabled bool) *MessageConsumer {
	return &MessageConsumer{
		consumer:     consumer,
		handler:      handler,
		dedupEnabled: dedupEnabled,
	}
}

func (c *MessageConsumer) Start(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := c.consumer.ReadMessage(ctx)
			if err != nil {
				if err == context.Canceled {
					return nil
				}
				time.Sleep(100 * time.Millisecond)
				continue
			}

			handleErr := c.handler(ctx, msg)

			if handleErr == nil {
				if err := c.consumer.CommitMessages(ctx, msg); err != nil {
					continue
				}
			}
		}
	}
}
