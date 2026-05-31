package infrastructure

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/segmentio/kafka-go"

	"iot-platform/internal/config"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

var (
	deviceDataProducer *kafka.Writer
	alertsProducer     *kafka.Writer
	consumers          map[string]*kafka.Reader
	consumersMutex     sync.RWMutex
)

func InitKafka(cfg *config.KafkaConfig) error {
	deviceDataProducer = &kafka.Writer{
		Addr:     kafka.TCP(cfg.Brokers...),
		Topic:    cfg.TopicDeviceData,
		Balancer: &kafka.LeastBytes{},
		Async:    true,
	}

	alertsProducer = &kafka.Writer{
		Addr:     kafka.TCP(cfg.Brokers...),
		Topic:    cfg.TopicAlerts,
		Balancer: &kafka.LeastBytes{},
		Async:    false,
	}

	consumers = make(map[string]*kafka.Reader)

	logger.Info("Kafka connected successfully")
	return nil
}

func ProduceDeviceData(data *model.DeviceData) error {
	if deviceDataProducer == nil {
		return fmt.Errorf("kafka device data producer not initialized")
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	return deviceDataProducer.WriteMessages(context.Background(),
		kafka.Message{
			Key:   []byte(data.DeviceKey),
			Value: payload,
		},
	)
}

func ProduceAlert(alert *model.Alert) error {
	if alertsProducer == nil {
		return fmt.Errorf("kafka alerts producer not initialized")
	}

	payload, err := json.Marshal(alert)
	if err != nil {
		return err
	}

	return alertsProducer.WriteMessages(context.Background(),
		kafka.Message{
			Key:   []byte(fmt.Sprintf("%d", alert.ID)),
			Value: payload,
		},
	)
}

func CreateConsumer(topic string, groupID string, cfg *config.KafkaConfig) *kafka.Reader {
	consumersMutex.Lock()
	defer consumersMutex.Unlock()

	key := fmt.Sprintf("%s:%s", topic, groupID)
	if consumer, exists := consumers[key]; exists {
		return consumer
	}

	consumer := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  cfg.Brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 10e3,
		MaxBytes: 10e6,
	})

	consumers[key] = consumer
	return consumer
}

func CloseKafka() {
	if deviceDataProducer != nil {
		deviceDataProducer.Close()
	}
	if alertsProducer != nil {
		alertsProducer.Close()
	}

	consumersMutex.Lock()
	defer consumersMutex.Unlock()
	for _, consumer := range consumers {
		consumer.Close()
	}
}
