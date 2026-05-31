package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server         ServerConfig
	MySQL          MySQLConfig
	InfluxDB       InfluxDBConfig
	Kafka          KafkaConfig
	MQTT           MQTTConfig
	JWT            JWTConfig
	Email          EmailConfig
	SMS            SMSConfig
	DeviceHeartbeat HeartbeatConfig
}

type ServerConfig struct {
	Port int
	Mode string
}

type MySQLConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	Database        string
	Charset         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime int
}

type InfluxDBConfig struct {
	URL     string
	Token   string
	Org     string
	Bucket  string
	Timeout int
}

type KafkaConfig struct {
	Brokers          []string
	TopicDeviceData  string
	TopicAlerts      string
	GroupID          string
	Partition        int
	ReplicationFactor int
}

type MQTTConfig struct {
	Broker             string
	ClientID           string
	Username           string
	Password           string
	TopicDeviceData    string
	TopicDeviceResponse string
	TopicDeviceCommand string
	QOS                int
}

type JWTConfig struct {
	Secret       string
	ExpireHours  int
}

type EmailConfig struct {
	SMTPHost    string
	SMTPPort    int
	Sender      string
	Password    string
	Recipients  []string
}

type SMSConfig struct {
	Provider        string
	AccessKeyID     string
	AccessKeySecret string
	SignName        string
	TemplateCode    string
	Phones          []string
}

type HeartbeatConfig struct {
	TimeoutSeconds      int
	CheckIntervalSeconds int
}

var AppConfig *Config

func LoadConfig(path string) (*Config, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	AppConfig = &Config{}
	if err := viper.Unmarshal(AppConfig); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	return AppConfig, nil
}

func (c *MySQLConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=Local",
		c.User, c.Password, c.Host, c.Port, c.Database, c.Charset)
}
