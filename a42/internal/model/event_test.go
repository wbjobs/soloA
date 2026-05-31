package model

import (
	"testing"
	"time"

	pb "audit-service/internal/pb"

	"github.com/stretchr/testify/assert"
)

func TestFromProto_OrderCreated(t *testing.T) {
	pbEvent := &pb.AuditEvent{
		EventId:       "evt-123",
		AggregateId:   "order-001",
		AggregateType: "Order",
		EventType:     "OrderCreated",
		Sequence:      1,
		Metadata: &pb.EventMetadata{
			TraceId:     "trace-001",
			ServiceName: "order-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: &pb.AuditEvent_OrderCreated{
			OrderCreated: &pb.OrderCreatedEvent{
				OrderId: "order-001",
				UserId:  "user-123",
				Amount:  99.99,
				Status:  "CREATED",
			},
		},
	}

	event := FromProto(pbEvent)

	assert.Equal(t, "evt-123", event.EventID)
	assert.Equal(t, "order-001", event.AggregateID)
	assert.Equal(t, "Order", event.AggregateType)
	assert.Equal(t, "OrderCreated", event.EventType)
	assert.Equal(t, int64(1), event.Sequence)
	assert.Equal(t, "trace-001", event.Metadata.TraceID)
	assert.Equal(t, "order-service", event.Metadata.ServiceName)
	assert.Equal(t, "1.0", event.Metadata.Version)

	assert.Equal(t, "order-001", event.Payload["order_id"])
	assert.Equal(t, "user-123", event.Payload["user_id"])
	assert.Equal(t, 99.99, event.Payload["amount"])
	assert.Equal(t, "CREATED", event.Payload["status"])
}

func TestFromProto_InventoryDeducted(t *testing.T) {
	pbEvent := &pb.AuditEvent{
		EventId:       "evt-456",
		AggregateId:   "product-001",
		AggregateType: "Inventory",
		EventType:     "InventoryDeducted",
		Sequence:      5,
		Metadata: &pb.EventMetadata{
			TraceId:     "trace-002",
			ServiceName: "inventory-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: &pb.AuditEvent_InventoryDeducted{
			InventoryDeducted: &pb.InventoryDeductedEvent{
				ProductId: "product-001",
				Quantity:  2,
				Remaining: 98,
			},
		},
	}

	event := FromProto(pbEvent)

	assert.Equal(t, "evt-456", event.EventID)
	assert.Equal(t, "product-001", event.AggregateID)
	assert.Equal(t, "InventoryDeducted", event.EventType)
	assert.Equal(t, int64(5), event.Sequence)
	assert.Equal(t, "product-001", event.Payload["product_id"])
	assert.Equal(t, int32(2), event.Payload["quantity"])
	assert.Equal(t, int32(98), event.Payload["remaining"])
}
