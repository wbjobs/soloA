package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"schemasync/internal/config"

	"github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Connection interface {
	Close() error
	GetType() config.DatabaseType
}

type SQLConnection struct {
	*sql.DB
	dbType config.DatabaseType
}

type MongoConnection struct {
	*mongo.Client
	DB *mongo.Database
}

var (
	connections = make(map[string]interface{})
	mu          sync.Mutex
)

func GetConnection(cfg *config.DatabaseConfig) (interface{}, error) {
	mu.Lock()
	defer mu.Unlock()

	key := fmt.Sprintf("%s:%s:%d:%s", cfg.Type, cfg.Host, cfg.Port, cfg.Database)
	if conn, exists := connections[key]; exists {
		return conn, nil
	}

	var conn interface{}
	var err error

	switch cfg.Type {
	case config.MySQL:
		conn, err = openMySQL(cfg)
	case config.PostgreSQL:
		conn, err = openPostgreSQL(cfg)
	case config.MongoDB:
		conn, err = openMongoDB(cfg)
	default:
		return nil, fmt.Errorf("unsupported database type: %s", cfg.Type)
	}

	if err != nil {
		return nil, err
	}

	connections[key] = conn
	return conn, nil
}

func openMySQL(cfg *config.DatabaseConfig) (*SQLConnection, error) {
	dsn := cfg.DSN
	if dsn == "" {
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
			cfg.Username, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	_ = mysql.SetLogger(nil)
	return &SQLConnection{DB: db, dbType: config.MySQL}, nil
}

func openPostgreSQL(cfg *config.DatabaseConfig) (*SQLConnection, error) {
	dsn := cfg.DSN
	if dsn == "" {
		dsn = fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
			cfg.Host, cfg.Port, cfg.Username, cfg.Password, cfg.Database)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	_ = pq.QuoteIdentifier("")
	return &SQLConnection{DB: db, dbType: config.PostgreSQL}, nil
}

func openMongoDB(cfg *config.DatabaseConfig) (*MongoConnection, error) {
	uri := cfg.DSN
	if uri == "" {
		uri = fmt.Sprintf("mongodb://%s:%s@%s:%d",
			cfg.Username, cfg.Password, cfg.Host, cfg.Port)
	}

	client, err := mongo.Connect(context.Background(), options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	if err := client.Ping(context.Background(), nil); err != nil {
		return nil, err
	}

	return &MongoConnection{Client: client, DB: client.Database(cfg.Database)}, nil
}

func (c *SQLConnection) Close() error {
	return c.DB.Close()
}

func (c *SQLConnection) GetType() config.DatabaseType {
	return c.dbType
}

func (c *MongoConnection) Close() error {
	return c.Client.Disconnect(context.Background())
}

func (c *MongoConnection) GetType() config.DatabaseType {
	return config.MongoDB
}
