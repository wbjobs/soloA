package projection

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"audit-service/internal/model"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockEventStore struct {
	events map[string][]*model.AuditEvent
	mu     sync.RWMutex
}

func newMockEventStore() *mockEventStore {
	return &mockEventStore{
		events: make(map[string][]*model.AuditEvent),
	}
}

func (m *mockEventStore) Append(ctx context.Context, event *model.AuditEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events[event.AggregateID] = append(m.events[event.AggregateID], event)
	return nil
}

func (m *mockEventStore) GetEventsByAggregate(ctx context.Context, aggregateID string, fromSeq int64) ([]*model.AuditEvent, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	events := m.events[aggregateID]
	if fromSeq <= 0 {
		return events, nil
	}
	var result []*model.AuditEvent
	for _, e := range events {
		if e.Sequence > fromSeq {
			result = append(result, e)
		}
	}
	return result, nil
}

func (m *mockEventStore) GetEventsByAggregateWithFilter(ctx context.Context, aggregateID string, fromSeq int64, eventTypes []string, startTime, endTime time.Time) ([]*model.AuditEvent, error) {
	return m.GetEventsByAggregate(ctx, aggregateID, fromSeq)
}

func (m *mockEventStore) GetEventByID(ctx context.Context, eventID string) (*model.AuditEvent, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, events := range m.events {
		for _, e := range events {
			if e.EventID == eventID {
				return e, nil
			}
		}
	}
	return nil, nil
}

func (m *mockEventStore) GetNextSequence(ctx context.Context, aggregateID string) (int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	events := m.events[aggregateID]
	if len(events) == 0 {
		return 1, nil
	}
	return events[len(events)-1].Sequence + 1, nil
}

func (m *mockEventStore) GetEventCount(ctx context.Context, aggregateID string) (int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return int64(len(m.events[aggregateID])), nil
}

type mockSnapshotStore struct {
	snapshots map[string]*model.Snapshot
	mu        sync.RWMutex
}

func newMockSnapshotStore() *mockSnapshotStore {
	return &mockSnapshotStore{
		snapshots: make(map[string]*model.Snapshot),
	}
}

func (m *mockSnapshotStore) Save(ctx context.Context, snapshot *model.Snapshot) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.snapshots[snapshot.AggregateID] = snapshot
	return nil
}

func (m *mockSnapshotStore) GetLatest(ctx context.Context, aggregateID string) (*model.Snapshot, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.snapshots[aggregateID], nil
}

func (m *mockSnapshotStore) Delete(ctx context.Context, aggregateID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.snapshots, aggregateID)
	return nil
}

func setupTestProjector(t *testing.T) (*Projector, *miniredis.Miniredis, *mockEventStore, *mockSnapshotStore) {
	mr, err := miniredis.Run()
	require.NoError(t, err)

	redisClient := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	eventStore := newMockEventStore()
	snapshotStore := newMockSnapshotStore()

	projector := &Projector{
		redisClient:       redisClient,
		eventStore:        eventStore,
		snapshotStore:     snapshotStore,
		snapshotThreshold: 1000,
		locks:             make(map[string]*aggregateLock),
	}

	return projector, mr, eventStore, snapshotStore
}

func TestProjector_ConcurrentProcessing_NoDataRace(t *testing.T) {
	projector, mr, eventStore, _ := setupTestProjector(t)
	defer mr.Close()
	defer projector.redisClient.Close()

	ctx := context.Background()
	aggregateID := "order-concurrent-001"

	eventCount := 100
	var wg sync.WaitGroup
	var processedCount int32
	var errorCount int32

	for i := 1; i <= eventCount; i++ {
		event := &model.AuditEvent{
			EventID:       fmt.Sprintf("evt-%d", i),
			AggregateID:   aggregateID,
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      int64(i),
			Metadata: model.EventMetadata{
				TraceID:     fmt.Sprintf("trace-%d", i),
				ServiceName: "test-service",
				Timestamp:   time.Now().UnixMilli(),
				Version:     "1.0",
			},
			Payload: map[string]interface{}{
				"order_id": aggregateID,
				"user_id":  fmt.Sprintf("user-%d", i),
				"amount":   float64(i) * 10.0,
				"status":   "CREATED",
			},
		}

		_ = eventStore.Append(ctx, event)

		wg.Add(1)
		go func(e *model.AuditEvent) {
			defer wg.Done()
			err := projector.Process(ctx, e)
			if err != nil {
				atomic.AddInt32(&errorCount, 1)
				t.Logf("Error processing event %d: %v", e.Sequence, err)
			} else {
				atomic.AddInt32(&processedCount, 1)
			}
		}(event)
	}

	wg.Wait()

	t.Logf("Processed: %d, Errors: %d", processedCount, errorCount)

	state, err := projector.GetProjection(ctx, aggregateID)
	require.NoError(t, err)
	require.NotNil(t, state)

	lastSeq, ok := state["last_sequence"].(int64)
	require.True(t, ok, "last_sequence should be present")
	assert.Equal(t, int64(eventCount), lastSeq, "last_sequence should be equal to event count")

	lastEventID, ok := state["last_event_id"].(string)
	require.True(t, ok)
	assert.True(t, strings.HasPrefix(lastEventID, "evt-"), "last_event_id should be valid")
}

func TestProjector_OptimisticLock_RetryOnConflict(t *testing.T) {
	projector, mr, eventStore, _ := setupTestProjector(t)
	defer mr.Close()
	defer projector.redisClient.Close()

	ctx := context.Background()
	aggregateID := "order-lock-001"

	initialState := map[string]interface{}{
		"aggregate_id":   aggregateID,
		"aggregate_type": "Order",
		"last_sequence":  int64(1),
		"status":         "CREATED",
		"paid":           false,
	}

	stateData, _ := json.Marshal(initialState)
	projector.redisClient.Set(ctx, fmt.Sprintf("projection:%s", aggregateID), stateData, 0)
	projector.redisClient.Set(ctx, fmt.Sprintf("projection_version:%s", aggregateID), "v1", 0)

	event := &model.AuditEvent{
		EventID:       "evt-2",
		AggregateID:   aggregateID,
		AggregateType: "Order",
		EventType:     "PaymentCompleted",
		Sequence:      2,
		Metadata: model.EventMetadata{
			TraceID:     "trace-2",
			ServiceName: "payment-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"payment_id": "pay-001",
			"order_id":   aggregateID,
			"amount":     99.99,
			"method":     "ALIPAY",
		},
	}
	_ = eventStore.Append(ctx, event)

	err := projector.Process(ctx, event)
	require.NoError(t, err)

	state, err := projector.GetProjection(ctx, aggregateID)
	require.NoError(t, err)

	assert.Equal(t, int64(2), state["last_sequence"])
	assert.Equal(t, true, state["paid"])
	assert.Equal(t, "PAID", state["status"])
	assert.Equal(t, "pay-001", state["payment_id"])
}

func TestProjector_EventSequenceCheck(t *testing.T) {
	projector, mr, eventStore, _ := setupTestProjector(t)
	defer mr.Close()
	defer projector.redisClient.Close()

	ctx := context.Background()
	aggregateID := "order-seq-001"

	event1 := &model.AuditEvent{
		EventID:       "evt-1",
		AggregateID:   aggregateID,
		AggregateType: "Order",
		EventType:     "OrderCreated",
		Sequence:      1,
		Metadata: model.EventMetadata{
			TraceID:     "trace-1",
			ServiceName: "order-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"order_id": aggregateID,
			"user_id":  "user-1",
			"amount":   99.99,
			"status":   "CREATED",
		},
	}
	_ = eventStore.Append(ctx, event1)

	event2 := &model.AuditEvent{
		EventID:       "evt-2",
		AggregateID:   aggregateID,
		AggregateType: "Order",
		EventType:     "PaymentCompleted",
		Sequence:      2,
		Metadata: model.EventMetadata{
			TraceID:     "trace-2",
			ServiceName: "payment-service",
			Timestamp:   time.Now().UnixMilli() + 1000,
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"payment_id": "pay-001",
			"order_id":   aggregateID,
			"amount":     99.99,
			"method":     "ALIPAY",
		},
	}
	_ = eventStore.Append(ctx, event2)

	err := projector.Process(ctx, event2)
	require.NoError(t, err)

	state, err := projector.GetProjection(ctx, aggregateID)
	require.NoError(t, err)

	assert.Equal(t, int64(2), state["last_sequence"])
	assert.Equal(t, "evt-2", state["last_event_id"])

	err = projector.Process(ctx, event1)
	require.NoError(t, err)

	state, err = projector.GetProjection(ctx, aggregateID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), state["last_sequence"], "Should not go back to older sequence")
}

func TestProjector_EventAlreadyApplied(t *testing.T) {
	projector, mr, eventStore, _ := setupTestProjector(t)
	defer mr.Close()
	defer projector.redisClient.Close()

	ctx := context.Background()
	aggregateID := "order-dup-001"

	event := &model.AuditEvent{
		EventID:       "evt-1",
		AggregateID:   aggregateID,
		AggregateType: "Order",
		EventType:     "OrderCreated",
		Sequence:      1,
		Metadata: model.EventMetadata{
			TraceID:     "trace-1",
			ServiceName: "order-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"order_id": aggregateID,
			"user_id":  "user-1",
			"amount":   99.99,
			"status":   "CREATED",
		},
	}
	_ = eventStore.Append(ctx, event)

	err := projector.Process(ctx, event)
	require.NoError(t, err)

	state1, _ := projector.GetProjection(ctx, aggregateID)
	seq1 := state1["last_sequence"]

	err = projector.Process(ctx, event)
	require.NoError(t, err)

	state2, _ := projector.GetProjection(ctx, aggregateID)
	seq2 := state2["last_sequence"]

	assert.Equal(t, seq1, seq2, "Sequence should not change when processing duplicate event")
}

func TestProjector_ReplayEvents_ClearsCache(t *testing.T) {
	projector, mr, eventStore, _ := setupTestProjector(t)
	defer mr.Close()
	defer projector.redisClient.Close()

	ctx := context.Background()
	aggregateID := "order-replay-001"

	for i := 1; i <= 5; i++ {
		event := &model.AuditEvent{
			EventID:       fmt.Sprintf("evt-%d", i),
			AggregateID:   aggregateID,
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      int64(i),
			Metadata: model.EventMetadata{
				TraceID:     fmt.Sprintf("trace-%d", i),
				ServiceName: "test-service",
				Timestamp:   time.Now().UnixMilli() + int64(i*1000),
				Version:     "1.0",
			},
			Payload: map[string]interface{}{
				"order_id": aggregateID,
				"user_id":  "user-1",
				"amount":   float64(i) * 10.0,
				"status":   "CREATED",
			},
		}
		_ = eventStore.Append(ctx, event)
	}

	state, err := projector.ReplayEvents(ctx, aggregateID)
	require.NoError(t, err)
	assert.Equal(t, int64(5), state["last_sequence"])
}
