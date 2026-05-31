package events

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/logger"
)

type EventProducer struct {
	writer *kafka.Writer
}

type EventConsumer struct {
	reader         *kafka.Reader
	dlqWriter      *kafka.Writer
	redisClient    *redis.Client
	dedupeTTL      time.Duration
	maxRetries     int
	retryInterval  time.Duration
}

type Event struct {
	EventID     string      `json:"event_id"`
	EventType   string      `json:"event_type"`
	Payload     interface{} `json:"payload"`
	Timestamp   time.Time   `json:"timestamp"`
	RetryCount  int         `json:"retry_count,omitempty"`
	FirstFailed *time.Time  `json:"first_failed,omitempty"`
}

type OrderCreatedEvent struct {
	OrderID     string                  `json:"order_id"`
	UserID      int64                   `json:"user_id"`
	OrderItems  []OrderCreatedEventItem `json:"order_items"`
	TotalAmount float64                 `json:"total_amount"`
}

type OrderCreatedEventItem struct {
	SKUCode   string `json:"sku_code"`
	Quantity  int32  `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}

type InventoryDeductedEvent struct {
	OrderID string `json:"order_id"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type InventoryRolledBackEvent struct {
	OrderID string `json:"order_id"`
	Success bool   `json:"success"`
}

type OrderPaidEvent struct {
	OrderID string `json:"order_id"`
}

type OrderCancelledEvent struct {
	OrderID string `json:"order_id"`
	Reason  string `json:"reason"`
}

type DeadLetterMessage struct {
	OriginalTopic string    `json:"original_topic"`
	Partition     int       `json:"partition"`
	Offset        int64     `json:"offset"`
	Error         string    `json:"error"`
	FailedAt      time.Time `json:"failed_at"`
	Event         *Event    `json:"event"`
}

type ConsumerOption func(*EventConsumer)

func WithRedisDeduplication(redisClient *redis.Client, ttl time.Duration) ConsumerOption {
	return func(c *EventConsumer) {
		c.redisClient = redisClient
		c.dedupeTTL = ttl
	}
}

func WithRetry(maxRetries int, interval time.Duration) ConsumerOption {
	return func(c *EventConsumer) {
		c.maxRetries = maxRetries
		c.retryInterval = interval
	}
}

func WithDeadLetterQueue(dlqTopic string) ConsumerOption {
	return func(c *EventConsumer) {
		cfg := config.AppConfig
		c.dlqWriter = &kafka.Writer{
			Addr:     kafka.TCP(cfg.Kafka.Brokers...),
			Topic:    dlqTopic,
			Balancer: &kafka.LeastBytes{},
		}
	}
}

func NewEventProducer() *EventProducer {
	cfg := config.AppConfig

	writer := &kafka.Writer{
		Addr:     kafka.TCP(cfg.Kafka.Brokers...),
		Balancer: &kafka.LeastBytes{},
	}

	logger.GetLogger().Info("Kafka producer initialized")
	return &EventProducer{writer: writer}
}

func (p *EventProducer) Publish(ctx context.Context, topic string, event *Event) error {
	if event.EventID == "" {
		event.EventID = generateEventID(event.EventType, event.Payload)
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %v", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(event.EventID),
		Value: payload,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "event_id", Value: []byte(event.EventID)},
			{Key: "event_type", Value: []byte(event.EventType)},
		},
	}

	if err := p.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("failed to write message: %v", err)
	}

	logger.GetLogger().Info(fmt.Sprintf("Event published to %s: %s (id: %s)", topic, event.EventType, event.EventID))
	return nil
}

func (p *EventProducer) PublishWithKey(ctx context.Context, topic string, key string, event *Event) error {
	if event.EventID == "" {
		event.EventID = generateEventID(event.EventType, event.Payload)
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %v", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: payload,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "event_id", Value: []byte(event.EventID)},
			{Key: "event_type", Value: []byte(event.EventType)},
		},
	}

	if err := p.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("failed to write message: %v", err)
	}

	logger.GetLogger().Info(fmt.Sprintf("Event published to %s with key %s: %s (id: %s)", topic, key, event.EventType, event.EventID))
	return nil
}

func (p *EventProducer) Close() error {
	if p.writer != nil {
		return p.writer.Close()
	}
	return nil
}

func NewEventConsumer(topic, groupID string, opts ...ConsumerOption) *EventConsumer {
	cfg := config.AppConfig

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  cfg.Kafka.Brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 10e3,
		MaxBytes: 10e6,
	})

	consumer := &EventConsumer{
		reader:        reader,
		maxRetries:    3,
		retryInterval: 1 * time.Second,
		dedupeTTL:     24 * time.Hour,
	}

	for _, opt := range opts {
		opt(consumer)
	}

	logger.GetLogger().Info(fmt.Sprintf("Kafka consumer initialized for topic: %s, group: %s", topic, groupID))
	return consumer
}

func (c *EventConsumer) Consume(ctx context.Context, handler func(*Event) error) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := c.reader.FetchMessage(ctx)
			if err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to fetch message: %v", err))
				continue
			}

			var event Event
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				logger.GetLogger().Warn(fmt.Sprintf("Failed to unmarshal event: %v", err))
				c.sendToDLQ(ctx, msg, err)
				c.reader.CommitMessages(ctx, msg)
				continue
			}

			eventID := event.EventID
			if eventID == "" {
				for _, header := range msg.Headers {
					if string(header.Key) == "event_id" {
						eventID = string(header.Value)
						break
					}
				}
			}

			if eventID == "" {
				eventID = generateEventIDFromMessage(msg)
			}

			isDuplicate, err := c.checkAndMarkProcessed(ctx, eventID)
			if err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to check duplicate for event %s: %v", eventID, err))
			} else if isDuplicate {
				logger.GetLogger().Info(fmt.Sprintf("Skipping duplicate event: %s", eventID))
				c.reader.CommitMessages(ctx, msg)
				continue
			}

			if err := c.processWithRetry(ctx, &event, handler); err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to process event %s after retries: %v", eventID, err))

				if c.dlqWriter != nil {
					c.sendToDLQ(ctx, msg, err)
					c.clearProcessed(ctx, eventID)
				}
			}

			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to commit message: %v", err))
			}
		}
	}
}

func (c *EventConsumer) processWithRetry(ctx context.Context, event *Event, handler func(*Event) error) error {
	var lastErr error
	retryCount := event.RetryCount

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			logger.GetLogger().Warn(fmt.Sprintf("Retrying event %s (attempt %d/%d)", event.EventID, attempt+1, c.maxRetries+1))
			time.Sleep(c.retryInterval * time.Duration(attempt*attempt))
		}

		if err := handler(event); err == nil {
			return nil
		} else {
			lastErr = err
			retryCount++
			logger.GetLogger().Error(fmt.Sprintf("Event %s processing attempt %d failed: %v", event.EventID, attempt+1, err))
		}
	}

	return lastErr
}

func (c *EventConsumer) checkAndMarkProcessed(ctx context.Context, eventID string) (bool, error) {
	if c.redisClient == nil {
		return false, nil
	}

	key := fmt.Sprintf("kafka:dedupe:%s", eventID)

	ok, err := c.redisClient.SetNX(ctx, key, time.Now().Unix(), c.dedupeTTL).Result()
	if err != nil {
		return false, err
	}

	return !ok, nil
}

func (c *EventConsumer) clearProcessed(ctx context.Context, eventID string) {
	if c.redisClient == nil {
		return
	}

	key := fmt.Sprintf("kafka:dedupe:%s", eventID)
	c.redisClient.Del(ctx, key)
}

func (c *EventConsumer) sendToDLQ(ctx context.Context, msg kafka.Message, err error) {
	if c.dlqWriter == nil {
		return
	}

	var event Event
	json.Unmarshal(msg.Value, &event)

	dlqMsg := DeadLetterMessage{
		OriginalTopic: msg.Topic,
		Partition:     msg.Partition,
		Offset:        msg.Offset,
		Error:         err.Error(),
		FailedAt:      time.Now(),
		Event:         &event,
	}

	payload, _ := json.Marshal(dlqMsg)

	dlqKafkaMsg := kafka.Message{
		Key:   []byte(fmt.Sprintf("%d-%d", msg.Partition, msg.Offset)),
		Value: payload,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "original_topic", Value: []byte(msg.Topic)},
			{Key: "error", Value: []byte(err.Error())},
		},
	}

	if err := c.dlqWriter.WriteMessages(ctx, dlqKafkaMsg); err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to send to DLQ: %v", err))
	} else {
		logger.GetLogger().Warn(fmt.Sprintf("Message sent to DLQ: topic=%s, partition=%d, offset=%d", msg.Topic, msg.Partition, msg.Offset))
	}
}

func (c *EventConsumer) Close() error {
	var errs []error

	if c.reader != nil {
		if err := c.reader.Close(); err != nil {
			errs = append(errs, err)
		}
	}

	if c.dlqWriter != nil {
		if err := c.dlqWriter.Close(); err != nil {
			errs = append(errs, err)
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors closing consumer: %v", errs)
	}
	return nil
}

func generateEventID(eventType string, payload interface{}) string {
	payloadBytes, _ := json.Marshal(payload)
	hash := sha256.Sum256(append([]byte(eventType+"|"), payloadBytes...))
	return "evt_" + time.Now().Format("20060102150405") + "_" + hex.EncodeToString(hash[:8])
}

func generateEventIDFromMessage(msg kafka.Message) string {
	return "msg_" + uuid.New().String()
}

func NewEvent(payload interface{}, eventType string) *Event {
	event := &Event{
		EventType: eventType,
		Payload:   payload,
		Timestamp: time.Now(),
	}
	event.EventID = generateEventID(eventType, payload)
	return event
}
