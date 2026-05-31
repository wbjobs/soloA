package main

import (
	"flag"
	"log"
	"time"

	"audit-service/internal/config"
	"audit-service/internal/messaging"
	"audit-service/internal/model"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	producer, err := messaging.NewKafkaProducer(&cfg.Kafka)
	if err != nil {
		log.Fatalf("Failed to create producer: %v", err)
	}
	defer producer.Close()

	orderID := "order-1001"
	userID := "user-5001"
	productID := "product-100"

	orderCreatedEvent := &model.AuditEvent{
		EventID:       "evt-" + time.Now().Format("20060102150405") + "-001",
		AggregateID:   orderID,
		AggregateType: "Order",
		EventType:     "OrderCreated",
		Sequence:      1,
		Metadata: model.EventMetadata{
			TraceID:     "trace-" + time.Now().Format("20060102150405"),
			ServiceName: "order-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"order_id": orderID,
			"user_id":  userID,
			"amount":   299.99,
			"status":   "CREATED",
		},
	}

	if err := producer.Publish(orderCreatedEvent); err != nil {
		log.Fatalf("Failed to publish order created event: %v", err)
	}
	log.Printf("Published: %s", orderCreatedEvent.EventID)

	time.Sleep(500 * time.Millisecond)

	inventoryEvent := &model.AuditEvent{
		EventID:       "evt-" + time.Now().Format("20060102150405") + "-002",
		AggregateID:   orderID,
		AggregateType: "Order",
		EventType:     "InventoryDeducted",
		Sequence:      2,
		Metadata: model.EventMetadata{
			TraceID:     orderCreatedEvent.Metadata.TraceID,
			ServiceName: "inventory-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"product_id": productID,
			"quantity":   1,
			"remaining":  99,
		},
	}

	if err := producer.Publish(inventoryEvent); err != nil {
		log.Fatalf("Failed to publish inventory event: %v", err)
	}
	log.Printf("Published: %s", inventoryEvent.EventID)

	time.Sleep(500 * time.Millisecond)

	paymentEvent := &model.AuditEvent{
		EventID:       "evt-" + time.Now().Format("20060102150405") + "-003",
		AggregateID:   orderID,
		AggregateType: "Order",
		EventType:     "PaymentCompleted",
		Sequence:      3,
		Metadata: model.EventMetadata{
			TraceID:     orderCreatedEvent.Metadata.TraceID,
			ServiceName: "payment-service",
			Timestamp:   time.Now().UnixMilli(),
			Version:     "1.0",
		},
		Payload: map[string]interface{}{
			"payment_id": "pay-" + time.Now().Format("20060102150405"),
			"order_id":   orderID,
			"amount":     299.99,
			"method":     "ALIPAY",
		},
	}

	if err := producer.Publish(paymentEvent); err != nil {
		log.Fatalf("Failed to publish payment event: %v", err)
	}
	log.Printf("Published: %s", paymentEvent.EventID)

	log.Println("All events published successfully")
}
