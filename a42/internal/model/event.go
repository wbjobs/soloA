package model

import (
	"encoding/json"
	"sort"
	"time"

	pb "audit-service/internal/pb"
)

type VectorClock map[string]int64

type EventMetadata struct {
	TraceID        string            `bson:"trace_id" json:"trace_id"`
	ServiceName    string            `bson:"service_name" json:"service_name"`
	Timestamp      int64             `bson:"timestamp" json:"timestamp"`
	Version        string            `bson:"version" json:"version"`
	Extra          map[string]string `bson:"extra,omitempty" json:"extra,omitempty"`
	VectorClock    VectorClock       `bson:"vector_clock,omitempty" json:"vector_clock,omitempty"`
	ParentEventIDs []string          `bson:"parent_event_ids,omitempty" json:"parent_event_ids,omitempty"`
}

type EventPayload interface{}

type AuditEvent struct {
	ID            string                 `bson:"_id,omitempty" json:"id"`
	EventID       string                 `bson:"event_id" json:"event_id"`
	AggregateID   string                 `bson:"aggregate_id" json:"aggregate_id"`
	AggregateType string                 `bson:"aggregate_type" json:"aggregate_type"`
	EventType     string                 `bson:"event_type" json:"event_type"`
	Sequence      int64                  `bson:"sequence" json:"sequence"`
	Metadata      EventMetadata          `bson:"metadata" json:"metadata"`
	Payload       map[string]interface{} `bson:"payload" json:"payload"`
	CreatedAt     time.Time              `bson:"created_at" json:"created_at"`
}

type Snapshot struct {
	ID            string                 `bson:"_id,omitempty" json:"id"`
	AggregateID   string                 `bson:"aggregate_id" json:"aggregate_id"`
	AggregateType string                 `bson:"aggregate_type" json:"aggregate_type"`
	LastSequence  int64                  `bson:"last_sequence" json:"last_sequence"`
	State         map[string]interface{} `bson:"state" json:"state"`
	CreatedAt     time.Time              `bson:"created_at" json:"created_at"`
}

type OrderState struct {
	OrderID       string `json:"order_id"`
	UserID        string `json:"user_id"`
	Amount        float64 `json:"amount"`
	Status        string `json:"status"`
	PaymentID     string `json:"payment_id,omitempty"`
	PaymentMethod string `json:"payment_method,omitempty"`
	Paid          bool   `json:"paid"`
	Sequence      int64  `json:"sequence"`
}

type InventoryState struct {
	ProductID string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
	Sequence  int64  `json:"sequence"`
}

type CausalityGraph struct {
	Nodes []*CausalityNode `json:"nodes"`
	Edges []*CausalityEdge `json:"edges"`
}

type CausalityNode struct {
	EventID     string      `json:"event_id"`
	EventType   string      `json:"event_type"`
	ServiceName string      `json:"service_name"`
	Timestamp   int64       `json:"timestamp"`
	Sequence    int64       `json:"sequence"`
	VectorClock VectorClock `json:"vector_clock,omitempty"`
	Payload     map[string]interface{} `json:"payload,omitempty"`
}

type CausalityEdge struct {
	FromEventID string `json:"from_event_id"`
	ToEventID   string `json:"to_event_id"`
	Type        string `json:"type"`
}

type Anomaly struct {
	Type        string `json:"type"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	Event1      string `json:"event_1"`
	Event2      string `json:"event_2"`
}

type CausalityAnalysisResult struct {
	Graph      *CausalityGraph `json:"graph"`
	Anomalies  []*Anomaly      `json:"anomalies"`
	EventCount int             `json:"event_count"`
	EdgeCount  int             `json:"edge_count"`
}

func NewVectorClock() VectorClock {
	return make(VectorClock)
}

func (vc VectorClock) Increment(serviceName string) {
	vc[serviceName]++
}

func (vc VectorClock) Set(serviceName string, value int64) {
	vc[serviceName] = value
}

func (vc VectorClock) Get(serviceName string) int64 {
	return vc[serviceName]
}

func (vc VectorClock) Merge(other VectorClock) {
	for service, clock := range other {
		if current, exists := vc[service]; !exists || clock > current {
			vc[service] = clock
		}
	}
}

func (vc VectorClock) Compare(other VectorClock) int {
	hasGreater := false
	hasLess := false

	services := make(map[string]bool)
	for s := range vc {
		services[s] = true
	}
	for s := range other {
		services[s] = true
	}

	for service := range services {
		a := vc[service]
		b := other[service]
		if a > b {
			hasGreater = true
		} else if a < b {
			hasLess = true
		}
	}

	if hasGreater && hasLess {
		return 0
	}
	if hasGreater {
		return 1
	}
	if hasLess {
		return -1
	}
	return 0
}

func (vc VectorClock) HappensBefore(other VectorClock) bool {
	return vc.Compare(other) == -1
}

func (vc VectorClock) HappensAfter(other VectorClock) bool {
	return vc.Compare(other) == 1
}

func (vc VectorClock) Concurrent(other VectorClock) bool {
	return vc.Compare(other) == 0
}

func (vc VectorClock) Copy() VectorClock {
	result := make(VectorClock)
	for k, v := range vc {
		result[k] = v
	}
	return result
}

func (vc VectorClock) String() string {
	keys := make([]string, 0, len(vc))
	for k := range vc {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	pairs := make([]string, len(keys))
	for i, k := range keys {
		pairs[i] = k + ":" + string(rune(vc[k]))
	}
	result, _ := json.Marshal(pairs)
	return string(result)
}

func FromProto(pbEvent *pb.AuditEvent) *AuditEvent {
	event := &AuditEvent{
		EventID:       pbEvent.EventId,
		AggregateID:   pbEvent.AggregateId,
		AggregateType: pbEvent.AggregateType,
		EventType:     pbEvent.EventType,
		Sequence:      pbEvent.Sequence,
		Metadata: EventMetadata{
			TraceID:        pbEvent.Metadata.TraceId,
			ServiceName:    pbEvent.Metadata.ServiceName,
			Timestamp:      pbEvent.Metadata.Timestamp,
			Version:        pbEvent.Metadata.Version,
			Extra:          pbEvent.Metadata.Extra,
			ParentEventIDs: pbEvent.Metadata.ParentEventIds,
		},
		Payload:   make(map[string]interface{}),
		CreatedAt: time.Now(),
	}

	if pbEvent.Metadata.VectorClock != nil {
		event.Metadata.VectorClock = make(VectorClock)
		for k, v := range pbEvent.Metadata.VectorClock.Clocks {
			event.Metadata.VectorClock[k] = v
		}
	}

	switch payload := pbEvent.Payload.(type) {
	case *pb.AuditEvent_OrderCreated:
		event.Payload["order_id"] = payload.OrderCreated.OrderId
		event.Payload["user_id"] = payload.OrderCreated.UserId
		event.Payload["amount"] = payload.OrderCreated.Amount
		event.Payload["status"] = payload.OrderCreated.Status
	case *pb.AuditEvent_InventoryDeducted:
		event.Payload["product_id"] = payload.InventoryDeducted.ProductId
		event.Payload["quantity"] = payload.InventoryDeducted.Quantity
		event.Payload["remaining"] = payload.InventoryDeducted.Remaining
	case *pb.AuditEvent_PaymentCompleted:
		event.Payload["payment_id"] = payload.PaymentCompleted.PaymentId
		event.Payload["order_id"] = payload.PaymentCompleted.OrderId
		event.Payload["amount"] = payload.PaymentCompleted.Amount
		event.Payload["method"] = payload.PaymentCompleted.Method
	}

	return event
}
