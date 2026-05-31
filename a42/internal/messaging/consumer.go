package messaging

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"audit-service/internal/config"
	"audit-service/internal/model"
	"audit-service/internal/store"

	"github.com/Shopify/sarama"
)

type EventProcessor interface {
	Process(ctx context.Context, event *model.AuditEvent) error
}

type KafkaConsumer struct {
	consumerGroup sarama.ConsumerGroup
	topic         string
	eventStore    store.EventStore
	processors    []EventProcessor
	processedIDs  *processedSet
}

type processedSet struct {
	sync.RWMutex
	ids map[string]time.Time
}

func newProcessedSet() *processedSet {
	return &processedSet{
		ids: make(map[string]time.Time),
	}
}

func (p *processedSet) add(id string) bool {
	p.Lock()
	defer p.Unlock()
	if _, exists := p.ids[id]; exists {
		return false
	}
	p.ids[id] = time.Now()
	return true
}

func (p *processedSet) cleanup() {
	p.Lock()
	defer p.Unlock()
	cutoff := time.Now().Add(-1 * time.Hour)
	for id, t := range p.ids {
		if t.Before(cutoff) {
			delete(p.ids, id)
		}
	}
}

func NewKafkaConsumer(cfg *config.KafkaConfig, eventStore store.EventStore, processors ...EventProcessor) (*KafkaConsumer, error) {
	config := sarama.NewConfig()
	config.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRange
	config.Consumer.Offsets.Initial = sarama.OffsetOldest
	config.Consumer.Offsets.AutoCommit.Enable = true
	config.Consumer.Offsets.AutoCommit.Interval = 1 * time.Second

	consumerGroup, err := sarama.NewConsumerGroup(cfg.Brokers, cfg.ConsumerGroup, config)
	if err != nil {
		return nil, err
	}

	return &KafkaConsumer{
		consumerGroup: consumerGroup,
		topic:         cfg.Topic,
		eventStore:    eventStore,
		processors:    processors,
		processedIDs:  newProcessedSet(),
	}, nil
}

func (c *KafkaConsumer) Start(ctx context.Context) {
	handler := &consumerGroupHandler{
		consumer: c,
	}

	go func() {
		for {
			if err := c.consumerGroup.Consume(ctx, []string{c.topic}, handler); err != nil {
				log.Printf("Error from consumer: %v", err)
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.processedIDs.cleanup()
			case <-ctx.Done():
				return
			}
		}
	}()

	log.Printf("Kafka consumer started, listening on topic: %s", c.topic)
}

func (c *KafkaConsumer) Close() error {
	return c.consumerGroup.Close()
}

func (c *KafkaConsumer) processMessage(ctx context.Context, msg *sarama.ConsumerMessage) error {
	var event model.AuditEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		return nil
	}

	if !c.processedIDs.add(event.EventID) {
		log.Printf("Duplicate event detected, skipping: %s", event.EventID)
		return nil
	}

	existing, err := c.eventStore.GetEventByID(ctx, event.EventID)
	if err != nil {
		log.Printf("Error checking for existing event: %v", err)
		return err
	}
	if existing != nil {
		log.Printf("Event already processed (idempotency): %s", event.EventID)
		return nil
	}

	if err := c.eventStore.Append(ctx, &event); err != nil {
		if err == store.ErrDuplicateEvent {
			log.Printf("Event already exists (idempotency): %s", event.EventID)
			return nil
		}
		log.Printf("Failed to store event: %v", err)
		return err
	}

	log.Printf("Stored event: %s (seq: %d, aggregate: %s)", event.EventID, event.Sequence, event.AggregateID)

	for _, processor := range c.processors {
		if err := processor.Process(ctx, &event); err != nil {
			log.Printf("Processor error: %v", err)
			return err
		}
	}

	return nil
}

type consumerGroupHandler struct {
	consumer *KafkaConsumer
}

func (h *consumerGroupHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (h *consumerGroupHandler) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		ctx := context.Background()
		if err := h.consumer.processMessage(ctx, msg); err != nil {
			log.Printf("Error processing message: %v", err)
			continue
		}
		sess.MarkMessage(msg, "")
	}
	return nil
}
