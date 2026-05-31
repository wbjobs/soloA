package messaging

import (
	"encoding/json"
	"log"

	"audit-service/internal/config"
	"audit-service/internal/model"

	"github.com/Shopify/sarama"
)

type EventProducer interface {
	Publish(event *model.AuditEvent) error
	Close() error
}

type KafkaProducer struct {
	producer sarama.SyncProducer
	topic    string
}

func NewKafkaProducer(cfg *config.KafkaConfig) (*KafkaProducer, error) {
	config := sarama.NewConfig()
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 5
	config.Producer.Return.Successes = true
	config.Producer.Partitioner = sarama.NewHashPartitioner

	producer, err := sarama.NewSyncProducer(cfg.Brokers, config)
	if err != nil {
		return nil, err
	}

	return &KafkaProducer{
		producer: producer,
		topic:    cfg.Topic,
	}, nil
}

func (p *KafkaProducer) Publish(event *model.AuditEvent) error {
	eventBytes, err := json.Marshal(event)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: p.topic,
		Key:   sarama.StringEncoder(event.AggregateID),
		Value: sarama.ByteEncoder(eventBytes),
	}

	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		return err
	}

	log.Printf("Published event to partition %d, offset %d: %s", partition, offset, event.EventID)
	return nil
}

func (p *KafkaProducer) Close() error {
	return p.producer.Close()
}
