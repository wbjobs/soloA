package causality

import (
	"testing"
	"time"

	"audit-service/internal/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAnalyzer_BuildCausalityGraph_ExplicitEdges(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-1",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "order-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
				ParentEventIDs: []string{},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
				"user_id":  "user-001",
				"amount":   99.99,
				"status":   "CREATED",
			},
		},
		{
			EventID:       "evt-2",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "InventoryDeducted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "inventory-service",
				Timestamp:   2000,
				VectorClock: model.VectorClock{
					"order-service":     1,
					"inventory-service": 1,
				},
				ParentEventIDs: []string{"evt-1"},
			},
			Payload: map[string]interface{}{
				"product_id": "product-001",
				"quantity":   1,
				"remaining":  99,
			},
		},
		{
			EventID:       "evt-3",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "PaymentCompleted",
			Sequence:      3,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "payment-service",
				Timestamp:   3000,
				VectorClock: model.VectorClock{
					"order-service":     1,
					"inventory-service": 1,
					"payment-service":   1,
				},
				ParentEventIDs: []string{"evt-2"},
			},
			Payload: map[string]interface{}{
				"payment_id": "pay-001",
				"order_id":   "order-001",
				"amount":     99.99,
				"method":     "ALIPAY",
			},
		},
	}

	graph := analyzer.BuildCausalityGraph(events, nil)

	require.NotNil(t, graph)
	assert.Equal(t, 3, len(graph.Nodes))
	assert.Equal(t, 2, len(graph.Edges))

	hasEvt1ToEvt2 := false
	hasEvt2ToEvt3 := false
	for _, edge := range graph.Edges {
		if edge.FromEventID == "evt-1" && edge.ToEventID == "evt-2" {
			hasEvt1ToEvt2 = true
			assert.Equal(t, "explicit", edge.Type)
		}
		if edge.FromEventID == "evt-2" && edge.ToEventID == "evt-3" {
			hasEvt2ToEvt3 = true
			assert.Equal(t, "explicit", edge.Type)
		}
	}
	assert.True(t, hasEvt1ToEvt2)
	assert.True(t, hasEvt2ToEvt3)
}

func TestAnalyzer_BuildCausalityGraph_ImplicitEdges(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-1",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "order-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
				ParentEventIDs: []string{},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
			},
		},
		{
			EventID:       "evt-2",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "PaymentCompleted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "payment-service",
				Timestamp:   3000,
				VectorClock: model.VectorClock{
					"order-service":   1,
					"payment-service": 1,
				},
				ParentEventIDs: []string{},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
			},
		},
	}

	graph := analyzer.BuildCausalityGraph(events, nil)

	require.NotNil(t, graph)
	assert.Equal(t, 2, len(graph.Nodes))
	assert.Equal(t, 1, len(graph.Edges))
	assert.Equal(t, "evt-1", graph.Edges[0].FromEventID)
	assert.Equal(t, "evt-2", graph.Edges[0].ToEventID)
	assert.Equal(t, "implicit", graph.Edges[0].Type)
}

func TestAnalyzer_AnalyzeAnomalies_PaymentBeforeOrder(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-payment",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "PaymentCompleted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "payment-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"payment-service": 1,
				},
			},
			Payload: map[string]interface{}{
				"payment_id": "pay-001",
				"order_id":   "order-001",
				"amount":     99.99,
				"method":     "ALIPAY",
			},
		},
		{
			EventID:       "evt-order",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "order-service",
				Timestamp:   2000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
				"user_id":  "user-001",
				"amount":   99.99,
				"status":   "CREATED",
			},
		},
	}

	graph := analyzer.BuildCausalityGraph(events, nil)
	anomalies := analyzer.AnalyzeAnomalies(graph, events)

	paymentBeforeOrderFound := false
	for _, anomaly := range anomalies {
		if anomaly.Type == "PAYMENT_BEFORE_ORDER" {
			paymentBeforeOrderFound = true
			assert.Equal(t, "high", anomaly.Severity)
		}
	}
	assert.True(t, paymentBeforeOrderFound)
}

func TestAnalyzer_AnalyzeAnomalies_TimestampReversal(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-1",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "order-service",
				Timestamp:   2000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
				ParentEventIDs: []string{},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
			},
		},
		{
			EventID:       "evt-2",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "PaymentCompleted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "payment-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"order-service":   1,
					"payment-service": 1,
				},
				ParentEventIDs: []string{"evt-1"},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
			},
		},
	}

	graph := analyzer.BuildCausalityGraph(events, nil)
	anomalies := analyzer.AnalyzeAnomalies(graph, events)

	timestampReversalFound := false
	for _, anomaly := range anomalies {
		if anomaly.Type == "TIMESTAMP_REVERSAL" {
			timestampReversalFound = true
			assert.Equal(t, "medium", anomaly.Severity)
		}
	}
	assert.True(t, timestampReversalFound)
}

func TestAnalyzer_TraceCausalityChain(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-1",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "order-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
				ParentEventIDs: []string{},
			},
			Payload: map[string]interface{}{},
		},
		{
			EventID:       "evt-2",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "InventoryDeducted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "inventory-service",
				Timestamp:   2000,
				VectorClock: model.VectorClock{
					"order-service":     1,
					"inventory-service": 1,
				},
				ParentEventIDs: []string{"evt-1"},
			},
			Payload: map[string]interface{}{},
		},
		{
			EventID:       "evt-3",
			AggregateID:   "order-001",
			AggregateType: "Order",
			EventType:     "PaymentCompleted",
			Sequence:      3,
			Metadata: model.EventMetadata{
				TraceID:     "trace-001",
				ServiceName: "payment-service",
				Timestamp:   3000,
				VectorClock: model.VectorClock{
					"order-service":     1,
					"inventory-service": 1,
					"payment-service":   1,
				},
				ParentEventIDs: []string{"evt-2"},
			},
			Payload: map[string]interface{}{},
		},
	}

	graph := analyzer.BuildCausalityGraph(events, nil)

	forwardChain := analyzer.TraceCausalityChain(graph, "evt-1", "forward")
	assert.Equal(t, 3, len(forwardChain))

	backwardChain := analyzer.TraceCausalityChain(graph, "evt-3", "backward")
	assert.Equal(t, 3, len(backwardChain))
}

func TestAnalyzer_BuildCausalityGraph_TimeFilter(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:  "evt-1",
			Sequence: 1,
			Metadata: model.EventMetadata{
				Timestamp: 1000,
			},
		},
		{
			EventID:  "evt-2",
			Sequence: 2,
			Metadata: model.EventMetadata{
				Timestamp: 2000,
			},
		},
		{
			EventID:  "evt-3",
			Sequence: 3,
			Metadata: model.EventMetadata{
				Timestamp: 3000,
			},
		},
	}

	opts := &BuildOptions{
		StartTime: time.UnixMilli(1500),
		EndTime:   time.UnixMilli(2500),
	}

	graph := analyzer.BuildCausalityGraph(events, opts)

	assert.Equal(t, 1, len(graph.Nodes))
	assert.Equal(t, "evt-2", graph.Nodes[0].EventID)
}

func TestAnalyzer_Analyze(t *testing.T) {
	analyzer := NewAnalyzer()

	events := []*model.AuditEvent{
		{
			EventID:       "evt-1",
			AggregateID:   "order-001",
			EventType:     "OrderCreated",
			Sequence:      1,
			Metadata: model.EventMetadata{
				ServiceName: "order-service",
				Timestamp:   1000,
				VectorClock: model.VectorClock{
					"order-service": 1,
				},
			},
			Payload: map[string]interface{}{
				"order_id": "order-001",
				"user_id":  "user-001",
				"amount":   99.99,
				"status":   "CREATED",
			},
		},
		{
			EventID:       "evt-2",
			AggregateID:   "order-001",
			EventType:     "PaymentCompleted",
			Sequence:      2,
			Metadata: model.EventMetadata{
				ServiceName: "payment-service",
				Timestamp:   2000,
				VectorClock: model.VectorClock{
					"order-service":   1,
					"payment-service": 1,
				},
			},
			Payload: map[string]interface{}{
				"payment_id": "pay-001",
				"order_id":   "order-001",
				"amount":     99.99,
				"method":     "ALIPAY",
			},
		},
	}

	result := analyzer.Analyze(events, nil)

	require.NotNil(t, result)
	assert.Equal(t, 2, result.EventCount)
	assert.Equal(t, 1, result.EdgeCount)
	assert.NotNil(t, result.Graph)
	assert.Empty(t, result.Anomalies)
}
