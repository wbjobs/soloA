package store

import (
	"context"
	"time"

	"audit-service/internal/config"
	"audit-service/internal/model"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SnapshotStore interface {
	Save(ctx context.Context, snapshot *model.Snapshot) error
	GetLatest(ctx context.Context, aggregateID string) (*model.Snapshot, error)
	Delete(ctx context.Context, aggregateID string) error
}

type MongoSnapshotStore struct {
	client           *mongo.Client
	database         *mongo.Database
	snapshotsColl    *mongo.Collection
}

func NewMongoSnapshotStore(cfg *config.MongoDBConfig) (*MongoSnapshotStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.URI))
	if err != nil {
		return nil, err
	}

	database := client.Database(cfg.Database)
	snapshotsColl := database.Collection(cfg.SnapshotsCollection)

	_, err = snapshotsColl.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "aggregate_id", Value: 1}, {Key: "last_sequence", Value: -1}},
		},
	})
	if err != nil {
		return nil, err
	}

	return &MongoSnapshotStore{
		client:        client,
		database:      database,
		snapshotsColl: snapshotsColl,
	}, nil
}

func (s *MongoSnapshotStore) Close(ctx context.Context) error {
	return s.client.Disconnect(ctx)
}

func (s *MongoSnapshotStore) Save(ctx context.Context, snapshot *model.Snapshot) error {
	snapshot.CreatedAt = time.Now()
	_, err := s.snapshotsColl.InsertOne(ctx, snapshot)
	return err
}

func (s *MongoSnapshotStore) GetLatest(ctx context.Context, aggregateID string) (*model.Snapshot, error) {
	filter := bson.M{"aggregate_id": aggregateID}
	opts := options.FindOne().SetSort(bson.D{{Key: "last_sequence", Value: -1}})

	var snapshot model.Snapshot
	err := s.snapshotsColl.FindOne(ctx, filter, opts).Decode(&snapshot)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &snapshot, nil
}

func (s *MongoSnapshotStore) Delete(ctx context.Context, aggregateID string) error {
	filter := bson.M{"aggregate_id": aggregateID}
	_, err := s.snapshotsColl.DeleteMany(ctx, filter)
	return err
}
