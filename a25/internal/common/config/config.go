package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server     ServerConfig     `mapstructure:"server"`
	Database   DatabaseConfig   `mapstructure:"database"`
	Redis      RedisConfig      `mapstructure:"redis"`
	Kafka      KafkaConfig      `mapstructure:"kafka"`
	ClickHouse ClickHouseConfig `mapstructure:"clickhouse"`
	APNs       APNsConfig       `mapstructure:"apns"`
	FCM        FCMConfig        `mapstructure:"fcm"`
	SMS        SMSConfig        `mapstructure:"sms"`
	Email      EmailConfig      `mapstructure:"email"`
	Limits     LimitsConfig     `mapstructure:"limits"`
}

type ServerConfig struct {
	Port     int `mapstructure:"port"`
	GRPCPort int `mapstructure:"grpc_port"`
}

type DatabaseConfig struct {
	MySQL MySQLConfig `mapstructure:"mysql"`
}

type MySQLConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	Username     string `mapstructure:"username"`
	Password     string `mapstructure:"password"`
	Database     string `mapstructure:"database"`
	Charset      string `mapstructure:"charset"`
	MaxOpenConns int    `mapstructure:"max_open_conns"`
	MaxIdleConns int    `mapstructure:"max_idle_conns"`
}

func (m MySQLConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=Local",
		m.Username, m.Password, m.Host, m.Port, m.Database, m.Charset)
}

type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
	PoolSize int    `mapstructure:"pool_size"`
}

func (r RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%d", r.Host, r.Port)
}

type KafkaConfig struct {
	Brokers  []string          `mapstructure:"brokers"`
	Topics   map[string]string `mapstructure:"topics"`
	GroupID  string            `mapstructure:"group_id"`
}

type ClickHouseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	Database string `mapstructure:"database"`
}

type APNsConfig struct {
	KeyID         string `mapstructure:"key_id"`
	TeamID        string `mapstructure:"team_id"`
	BundleID      string `mapstructure:"bundle_id"`
	PrivateKeyPath string `mapstructure:"private_key_path"`
	Production    bool   `mapstructure:"production"`
}

type FCMConfig struct {
	ServerKey string `mapstructure:"server_key"`
	SenderID  string `mapstructure:"sender_id"`
}

type SMSConfig struct {
	Aliyun  AliyunSMSConfig  `mapstructure:"aliyun"`
	Tencent TencentSMSConfig `mapstructure:"tencent"`
}

type AliyunSMSConfig struct {
	AccessKeyID     string `mapstructure:"access_key_id"`
	AccessKeySecret string `mapstructure:"access_key_secret"`
	SignName        string `mapstructure:"sign_name"`
}

type TencentSMSConfig struct {
	SecretID  string `mapstructure:"secret_id"`
	SecretKey string `mapstructure:"secret_key"`
	Sign      string `mapstructure:"sign"`
}

type EmailConfig struct {
	SMTP SMTPConfig `mapstructure:"smtp"`
}

type SMTPConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	FromName string `mapstructure:"from_name"`
}

type LimitsConfig struct {
	DefaultQPS        int `mapstructure:"default_qps"`
	DefaultDailyLimit int `mapstructure:"default_daily_limit"`
	Burst             int `mapstructure:"burst"`
}

var AppConfig *Config

func LoadConfig(path string) (*Config, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	config := &Config{}
	if err := viper.Unmarshal(config); err != nil {
		return nil, err
	}

	AppConfig = config
	return config, nil
}

func GetConfig() *Config {
	return AppConfig
}
