package projection

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"audit-service/internal/config"
	"audit-service/internal/model"
	"audit-service/internal/store"

	"github.com/redis/go-redis/v9"
)

var (
	ErrOptimisticLockFailed = errors.New("optimistic lock check failed, retry required")
	ErrEventAlreadyApplied   = errors.New("event already applied to projection")
	ErrEventOutOfOrder       = errors.New("event sequence is older than current projection")
)

const (
	defaultLockTimeout   = 5 * time.Second
	defaultRetryAttempts = 3
	defaultRetryDelay    = 100 * time.Millisecond
)

type aggregateLock struct {
	sync.Mutex
	refCount int
}

type Projector struct {
	redisClient       *redis.Client
	eventStore        store.EventStore
	snapshotStore     store.SnapshotStore
	snapshotThreshold int

	locks      map[string]*aggregateLock
	locksMutex sync.RWMutex
}

func NewProjector(cfg *config.RedisConfig, eventStore store.EventStore, snapshotStore store.SnapshotStore, snapshotThreshold int) (*Projector, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Address,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &Projector{
		redisClient:       client,
		eventStore:        eventStore,
		snapshotStore:     snapshotStore,
		snapshotThreshold: snapshotThreshold,
		locks:             make(map[string]*aggregateLock),
	}, nil
}

func (p *Projector) Close() error {
	return p.redisClient.Close()
}

func (p *Projector) acquireLock(aggregateID string) func() {
	p.locksMutex.Lock()
	lock, exists := p.locks[aggregateID]
	if !exists {
		lock = &aggregateLock{refCount: 0}
		p.locks[aggregateID] = lock
	}
	lock.refCount++
	p.locksMutex.Unlock()

	lock.Lock()

	return func() {
		lock.Unlock()
		p.locksMutex.Lock()
		lock.refCount--
		if lock.refCount == 0 {
			delete(p.locks, aggregateID)
		}
		p.locksMutex.Unlock()
	}
}

func (p *Projector) Process(ctx context.Context, event *model.AuditEvent) error {
	release := p.acquireLock(event.AggregateID)
	defer release()

	log.Printf("Projecting event: %s (seq: %d) for aggregate: %s", event.EventType, event.Sequence, event.AggregateID)

	var lastErr error
	for attempt := 0; attempt < defaultRetryAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(defaultRetryDelay * time.Duration(attempt)):
			}
			log.Printf("Retrying projection for aggregate %s, attempt %d", event.AggregateID, attempt+1)
		}

		err := p.processWithOptimisticLock(ctx, event)
		if err == nil {
			return nil
		}

		if errors.Is(err, ErrEventAlreadyApplied) {
			log.Printf("Event %s already applied to projection, skipping", event.EventID)
			return nil
		}

		if errors.Is(err, ErrOptimisticLockFailed) || errors.Is(err, ErrEventOutOfOrder) {
			lastErr = err
			continue
		}

		return fmt.Errorf("failed to process event: %w", err)
	}

	return fmt.Errorf("failed to process event after %d attempts: %w", defaultRetryAttempts, lastErr)
}

func (p *Projector) processWithOptimisticLock(ctx context.Context, event *model.AuditEvent) error {
	state, version, err := p.getStateWithVersion(ctx, event.AggregateID)
	if err != nil {
		return err
	}

	currentSeq := int64(0)
	if seq, ok := state["last_sequence"].(int64); ok {
		currentSeq = seq
	}

	if event.Sequence <= currentSeq {
		if event.Sequence == currentSeq {
			return ErrEventAlreadyApplied
		}
		return ErrEventOutOfOrder
	}

	if event.Sequence > currentSeq+1 {
		log.Printf("Gap detected for aggregate %s: expected seq %d, got %d. Rebuilding from event store...",
			event.AggregateID, currentSeq+1, event.Sequence)
		state, err = p.rebuildFromEventStore(ctx, event.AggregateID)
		if err != nil {
			return fmt.Errorf("failed to rebuild from event store: %w", err)
		}

		if seq, ok := state["last_sequence"].(int64); ok && seq >= event.Sequence {
			return ErrEventAlreadyApplied
		}
	}

	p.applyEvent(state, event)

	if err := p.cacheStateWithVersion(ctx, event.AggregateID, state, version); err != nil {
		if errors.Is(err, ErrOptimisticLockFailed) {
			return err
		}
		return fmt.Errorf("failed to cache state: %w", err)
	}

	if err := p.checkAndCreateSnapshot(ctx, event.AggregateID, state); err != nil {
		log.Printf("Warning: failed to handle snapshot: %v", err)
	}

	return nil
}

func (p *Projector) getStateWithVersion(ctx context.Context, aggregateID string) (map[string]interface{}, string, error) {
	key := fmt.Sprintf("projection:%s", aggregateID)
	versionKey := fmt.Sprintf("projection_version:%s", aggregateID)

	pipe := p.redisClient.Pipeline()
	dataCmd := pipe.Get(ctx, key)
	versionCmd := pipe.Get(ctx, versionKey)

	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return nil, "", err
	}

	var state map[string]interface{}
	var version string

	if dataCmd.Err() == nil {
		data, err := dataCmd.Bytes()
		if err == nil {
			if err := json.Unmarshal(data, &state); err != nil {
				log.Printf("Warning: failed to unmarshal cached state: %v, will rebuild", err)
			}
		}
	}

	if versionCmd.Err() == nil {
		version = versionCmd.Val()
	}

	if state == nil {
		var err error
		state, err = p.rebuildState(ctx, aggregateID)
		if err != nil {
			return nil, "", err
		}
	}

	return state, version, nil
}

func (p *Projector) cacheStateWithVersion(ctx context.Context, aggregateID string, state map[string]interface{}, expectedVersion string) error {
	key := fmt.Sprintf("projection:%s", aggregateID)
	versionKey := fmt.Sprintf("projection_version:%s", aggregateID)

	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	newVersion := fmt.Sprintf("%d", time.Now().UnixNano())

	script := redis.NewScript(`
		local currentVersion = redis.call('GET', KEYS[2])
		if ARGV[2] ~= '' and currentVersion ~= ARGV[2] then
			return 0
		end
		redis.call('SET', KEYS[1], ARGV[1])
		redis.call('SET', KEYS[2], ARGV[3])
		return 1
	`)

	keys := []string{key, versionKey}
	args := []interface{}{string(data), expectedVersion, newVersion}

	result, err := script.Run(ctx, p.redisClient, keys, args...).Result()
	if err != nil {
		return err
	}

	if result.(int64) == 0 {
		return ErrOptimisticLockFailed
	}

	return nil
}

func (p *Projector) rebuildState(ctx context.Context, aggregateID string) (map[string]interface{}, error) {
	cached, err := p.getCachedState(ctx, aggregateID)
	if err == nil && cached != nil {
		return cached, nil
	}

	return p.rebuildFromEventStore(ctx, aggregateID)
}

func (p *Projector) rebuildFromEventStore(ctx context.Context, aggregateID string) (map[string]interface{}, error) {
	log.Printf("Rebuilding projection for aggregate %s from event store", aggregateID)

	snapshot, err := p.snapshotStore.GetLatest(ctx, aggregateID)
	if err != nil {
		return nil, err
	}

	var state map[string]interface{}
	var fromSeq int64 = 0

	if snapshot != nil {
		state = snapshot.State
		fromSeq = snapshot.LastSequence
		log.Printf("Using snapshot for aggregate %s at sequence %d", aggregateID, fromSeq)
	} else {
		state = make(map[string]interface{})
	}

	events, err := p.eventStore.GetEventsByAggregate(ctx, aggregateID, fromSeq)
	if err != nil {
		return nil, err
	}

	log.Printf("Applying %d events to projection for aggregate %s", len(events), aggregateID)
	for _, event := range events {
		p.applyEvent(state, event)
	}

	if len(events) > 0 {
		if err := p.cacheState(ctx, aggregateID, state); err != nil {
			log.Printf("Warning: failed to cache rebuilt state: %v", err)
		}
	}

	return state, nil
}

func (p *Projector) applyEvent(state map[string]interface{}, event *model.AuditEvent) {
	state["aggregate_id"] = event.AggregateID
	state["aggregate_type"] = event.AggregateType
	state["last_sequence"] = event.Sequence
	state["last_event_time"] = event.Metadata.Timestamp
	state["last_event_id"] = event.EventID

	switch event.EventType {
	case "OrderCreated":
		state["order_id"] = p.getString(event.Payload, "order_id")
		state["user_id"] = p.getString(event.Payload, "user_id")
		state["amount"] = p.getFloat(event.Payload, "amount")
		state["status"] = p.getString(event.Payload, "status")
		state["paid"] = false
	case "InventoryDeducted":
		productID := p.getString(event.Payload, "product_id")
		products, ok := state["products"].(map[string]interface{})
		if !ok {
			products = make(map[string]interface{})
			state["products"] = products
		}
		products[productID] = map[string]interface{}{
			"quantity": p.getInt(event.Payload, "remaining"),
			"deducted": p.getInt(event.Payload, "quantity"),
		}
	case "PaymentCompleted":
		state["payment_id"] = p.getString(event.Payload, "payment_id")
		state["payment_method"] = p.getString(event.Payload, "method")
		state["paid"] = true
		state["status"] = "PAID"
	}
}

func (p *Projector) getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (p *Projector) getInt(m map[string]interface{}, key string) int64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case int64:
			return val
		case int32:
			return int64(val)
		case int:
			return int64(val)
		case float64:
			return int64(val)
		}
	}
	return 0
}

func (p *Projector) getFloat(m map[string]interface{}, key string) float64 {
	if v, ok := m[key]; ok {
		if f, ok := v.(float64); ok {
			return f
		}
	}
	return 0
}

func (p *Projector) cacheState(ctx context.Context, aggregateID string, state map[string]interface{}) error {
	key := fmt.Sprintf("projection:%s", aggregateID)
	versionKey := fmt.Sprintf("projection_version:%s", aggregateID)

	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	version := fmt.Sprintf("%d", time.Now().UnixNano())

	pipe := p.redisClient.Pipeline()
	pipe.Set(ctx, key, data, 0)
	pipe.Set(ctx, versionKey, version, 0)
	_, err = pipe.Exec(ctx)
	return err
}

func (p *Projector) getCachedState(ctx context.Context, aggregateID string) (map[string]interface{}, error) {
	key := fmt.Sprintf("projection:%s", aggregateID)
	data, err := p.redisClient.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var state map[string]interface{}
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return state, nil
}

func (p *Projector) GetProjection(ctx context.Context, aggregateID string) (map[string]interface{}, error) {
	release := p.acquireLock(aggregateID)
	defer release()

	return p.rebuildState(ctx, aggregateID)
}

func (p *Projector) checkAndCreateSnapshot(ctx context.Context, aggregateID string, state map[string]interface{}) error {
	count, err := p.eventStore.GetEventCount(ctx, aggregateID)
	if err != nil {
		return err
	}

	if count >= int64(p.snapshotThreshold) {
		existing, err := p.snapshotStore.GetLatest(ctx, aggregateID)
		if err != nil {
			return err
		}

		var latestSeq int64
		if existing != nil {
			latestSeq = existing.LastSequence
		}

		if seq, ok := state["last_sequence"].(int64); ok && seq > latestSeq {
			snapshot := &model.Snapshot{
				AggregateID:   aggregateID,
				AggregateType: p.getString(state, "aggregate_type"),
				LastSequence:  seq,
				State:         state,
			}

			if err := p.snapshotStore.Save(ctx, snapshot); err != nil {
				return err
			}

			log.Printf("Created snapshot for aggregate %s at sequence %d", aggregateID, seq)
		}
	}

	return nil
}

func (p *Projector) ReplayEvents(ctx context.Context, aggregateID string) (map[string]interface{}, error) {
	release := p.acquireLock(aggregateID)
	defer release()

	key := fmt.Sprintf("projection:%s", aggregateID)
	versionKey := fmt.Sprintf("projection_version:%s", aggregateID)

	pipe := p.redisClient.Pipeline()
	pipe.Del(ctx, key)
	pipe.Del(ctx, versionKey)
	_, _ = pipe.Exec(ctx)

	state, err := p.rebuildFromEventStore(ctx, aggregateID)
	if err != nil {
		return nil, err
	}

	return state, nil
}
