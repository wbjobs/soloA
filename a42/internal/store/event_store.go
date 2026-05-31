package store

import (
	"context"
	"errors"
	"time"

	"audit-service/internal/config"
	"audit-service/internal/model"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var ErrDuplicateEvent = errors.New("duplicate event")
var ErrSequenceConflict = errors.New("sequence conflict")

type EventStore interface {
	Append(ctx context.Context, event *model.AuditEvent) error
	GetEventsByAggregate(ctx context.Context, aggregateID string, fromSeq int64) ([]*model.AuditEvent, error)
	GetEventsByAggregateWithFilter(ctx context.Context, aggregateID string, fromSeq int64, eventTypes []string, startTime, endTime time.Time) ([]*model.AuditEvent, error)
	GetEventByID(ctx context.Context, eventID string) (*model.AuditEvent, error)
	GetNextSequence(ctx context.Context, aggregateID string) (int64, error)
	GetEventCount(ctx context.Context, aggregateID string) (int64, error)
}

type MongoEventStore struct {
	client     *mongo.Client
	database   *mongo.Database
	eventsColl *mongo.Collection
}

func NewMongoEventStore(cfg *config.MongoDBConfig) (*MongoEventStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.URI))
	if err != nil {
		return nil, err
	}

	database := client.Database(cfg.Database)
	eventsColl := database.Collection(cfg.EventsCollection)

	_, err = eventsColl.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "aggregate_id", Value: 1}, {Key: "sequence", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "event_id", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "metadata.timestamp", Value: 1}},
		},
		{
			Keys: bson.D{{Key: "event_type", Value: 1}},
		},
	})
	if err != nil {
		return nil, err
	}

	return &MongoEventStore{
		client:     client,
		database:   database,
		eventsColl: eventsColl,
	}, nil
}

func (s *MongoEventStore) Close(ctx context.Context) error {
	return s.client.Disconnect(ctx)
}

func (s *MongoEventStore) Append(ctx context.Context, event *model.AuditEvent) error {
	_, err := s.eventsColl.InsertOne(ctx, event)
	if mongo.IsDuplicateKeyError(err) {
		return ErrDuplicateEvent
	}
	return err
}

func (s *MongoEventStore) GetEventsByAggregate(ctx context.Context, aggregateID string, fromSeq int64) ([]*model.AuditEvent, error) {
	filter := bson.M{"aggregate_id": aggregateID}
	if fromSeq > 0 {
		filter["sequence"] = bson.M{"$gt": fromSeq}
	}

	opts := options.Find().SetSort(bson.D{{Key: "sequence", Value: 1}})
	cursor, err := s.eventsColl.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var events []*model.AuditEvent
	for cursor.Next(ctx) {
		var event model.AuditEvent
		if err := cursor.Decode(&event); err != nil {
			return nil, err
		}
		events = append(events, &event)
	}

	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return events, nil
}

func (s *MongoEventStore) GetEventsByAggregateWithFilter(ctx context.Context, aggregateID string, fromSeq int64, eventTypes []string, startTime, endTime time.Time) ([]*model.AuditEvent, error) {
	filter := bson.M{"aggregate_id": aggregateID}

	if fromSeq > 0 {
		filter["sequence"] = bson.M{"$gt": fromSeq}
	}

	if len(eventTypes) > 0 {
		filter["event_type"] = bson.M{"$in": eventTypes}
	}

	if !startTime.IsZero() || !endTime.IsZero() {
		timeFilter := bson.M{}
		if !startTime.IsZero() {
			timeFilter["$gte"] = startTime.UnixMilli()
		}
		if !endTime.IsZero() {
			timeFilter["$lte"] = endTime.UnixMilli()
		}
		filter["metadata.timestamp"] = timeFilter
	}

	opts := options.Find().SetSort(bson.D{{Key: "sequence", Value: 1}})
	cursor, err := s.eventsColl.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var events []*model.AuditEvent
	for cursor.Next(ctx) {
		var event model.AuditEvent
		if err := cursor.Decode(&event); err != nil {
			return nil, err
		}
		events = append(events, &event)
	}

	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return events, nil
}

func (s *MongoEventStore) GetEventByID(ctx context.Context, eventID string) (*model.AuditEvent, error) {
	filter := bson.M{"event_id": eventID}
	var event model.AuditEvent
	err := s.eventsColl.FindOne(ctx, filter).Decode(&event)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (s *MongoEventStore) GetNextSequence(ctx context.Context, aggregateID string) (int64, error) {
	filter := bson.M{"aggregate_id": aggregateID}
	opts := options.FindOne().SetSort(bson.D{{Key: "sequence", Value: -1}})

	var lastEvent model.AuditEvent
	err := s.eventsColl.FindOne(ctx, filter, opts).Decode(&lastEvent)
	if err == mongo.ErrNoDocuments {
		return 1, nil
	}
	if err != nil {
		return 0, err
	}

	return lastEvent.Sequence + 1, nil
}

func (s *MongoEventStore) GetEventCount(ctx context.Context, aggregateID string) (int64, error) {
	filter := bson.M{"aggregate_id": aggregateID}
	return s.eventsColl.CountDocuments(ctx, filter)
}

func ObjectIDToString(id primitive.ObjectID) string {
	return id.Hex()
}
