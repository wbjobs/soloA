package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"audit-service/internal/api"
	"audit-service/internal/config"
	"audit-service/internal/messaging"
	"audit-service/internal/projection"
	"audit-service/internal/store"

	"github.com/gin-gonic/gin"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	eventStore, err := store.NewMongoEventStore(&cfg.MongoDB)
	if err != nil {
		log.Fatalf("Failed to create event store: %v", err)
	}
	defer eventStore.Close(context.Background())

	snapshotStore, err := store.NewMongoSnapshotStore(&cfg.MongoDB)
	if err != nil {
		log.Fatalf("Failed to create snapshot store: %v", err)
	}
	defer snapshotStore.Close(context.Background())

	projector, err := projection.NewProjector(&cfg.Redis, eventStore, snapshotStore, cfg.Snapshot.Threshold)
	if err != nil {
		log.Fatalf("Failed to create projector: %v", err)
	}
	defer projector.Close()

	consumer, err := messaging.NewKafkaConsumer(&cfg.Kafka, eventStore, projector)
	if err != nil {
		log.Fatalf("Failed to create Kafka consumer: %v", err)
	}
	defer consumer.Close()

	producer, err := messaging.NewKafkaProducer(&cfg.Kafka)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}
	defer producer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	consumer.Start(ctx)

	router := gin.Default()
	handler := api.NewHandler(eventStore, snapshotStore, projector)
	handler.RegisterRoutes(router)

	go func() {
		addr := ":" + strconv.Itoa(cfg.Server.Port)
		log.Printf("Starting server on port %d", cfg.Server.Port)
		if err := router.Run(addr); err != nil {
			log.Printf("Server error: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down gracefully...")
	cancel()
}
