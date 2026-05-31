package config

import (
	"os"
	"gopkg.in/yaml.v3"
)

type DatabaseType string

const (
	MySQL      DatabaseType = "mysql"
	PostgreSQL DatabaseType = "postgresql"
	MongoDB    DatabaseType = "mongodb"
)

type DatabaseConfig struct {
	Type     DatabaseType `yaml:"type"`
	Host     string       `yaml:"host"`
	Port     int          `yaml:"port"`
	Username string       `yaml:"username"`
	Password string       `yaml:"password"`
	Database string       `yaml:"database"`
	DSN      string       `yaml:"dsn"`
}

type RedisConfig struct {
	Host     string   `yaml:"host"`
	Port     int      `yaml:"port"`
	Password string   `yaml:"password"`
	DB       int      `yaml:"db"`
	Nodes    []string `yaml:"nodes"`
}

type GRPCConfig struct {
	Address   string `yaml:"address"`
	NodeID    string `yaml:"node_id"`
	ClusterID string `yaml:"cluster_id"`
}

type Config struct {
	Environments map[string]DatabaseConfig `yaml:"environments"`
	Redis        RedisConfig               `yaml:"redis"`
	GRPC         GRPCConfig                `yaml:"grpc"`
	Migrations   struct {
		Directory string `yaml:"directory"`
		BatchSize int    `yaml:"batch_size"`
	} `yaml:"migrations"`
	OnlineDDL struct {
		MySQLTool string `yaml:"mysql_tool"`
	} `yaml:"online_ddl"`
}

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) GetDatabase(env string) *DatabaseConfig {
	if db, ok := c.Environments[env]; ok {
		return &db
	}
	return nil
}
