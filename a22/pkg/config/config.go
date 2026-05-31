package config

import (
	"log"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server       ServerConfig       `mapstructure:"server"`
	Database     DatabaseConfig     `mapstructure:"database"`
	Etcd         EtcdConfig         `mapstructure:"etcd"`
	Kafka        KafkaConfig        `mapstructure:"kafka"`
	JWT          JWTConfig          `mapstructure:"jwt"`
	ServiceNames ServiceNamesConfig `mapstructure:"service_names"`
	Tracing      TracingConfig      `mapstructure:"tracing"`
	Order        OrderConfig       `mapstructure:"order"`
}

type ServerConfig struct {
	HTTPPort           int `mapstructure:"http_port"`
	GRPCUserPort       int `mapstructure:"grpc_user_port"`
	GRPCProductPort    int `mapstructure:"grpc_product_port"`
	GRPCInventoryPort  int `mapstructure:"grpc_inventory_port"`
	GRPCOrderPort      int `mapstructure:"grpc_order_port"`
	GRPCPaymentPort    int `mapstructure:"grpc_payment_port"`
}

type DatabaseConfig struct {
	MySQL MySQLConfig `mapstructure:"mysql"`
	Redis RedisConfig `mapstructure:"redis"`
}

type MySQLConfig struct {
	DSN string `mapstructure:"dsn"`
}

type RedisConfig struct {
	Addr     string `mapstructure:"addr"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

type EtcdConfig struct {
	Endpoints []string `mapstructure:"endpoints"`
}

type KafkaConfig struct {
	Brokers []string        `mapstructure:"brokers"`
	Topics  KafkaTopicsConfig `mapstructure:"topics"`
}

type KafkaTopicsConfig struct {
	OrderCreated      string `mapstructure:"order_created"`
	OrderPaid         string `mapstructure:"order_paid"`
	OrderCancelled    string `mapstructure:"order_cancelled"`
	InventoryDeducted string `mapstructure:"inventory_deducted"`
	InventoryRolledBack string `mapstructure:"inventory_rolled_back"`
}

type JWTConfig struct {
	Secret      string `mapstructure:"secret"`
	ExpireHours int    `mapstructure:"expire_hours"`
}

type ServiceNamesConfig struct {
	APIGateway       string `mapstructure:"api_gateway"`
	UserService      string `mapstructure:"user_service"`
	ProductService   string `mapstructure:"product_service"`
	InventoryService string `mapstructure:"inventory_service"`
	OrderService     string `mapstructure:"order_service"`
	PaymentService   string `mapstructure:"payment_service"`
}

type TracingConfig struct {
	Enabled        bool   `mapstructure:"enabled"`
	Endpoint       string `mapstructure:"endpoint"`
	Protocol       string `mapstructure:"protocol"`
	ServiceVersion string `mapstructure:"service_version"`
	Environment    string `mapstructure:"environment"`
}

type OrderConfig struct {
	PaymentTimeoutMinutes int `mapstructure:"payment_timeout_minutes"`
}

var AppConfig *Config

func LoadConfig() *Config {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath("./config")
	viper.AddConfigPath("../config")
	viper.AddConfigPath("../../config")

	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Warning: Config file not found, using defaults: %v", err)
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Fatalf("Unable to decode config: %v", err)
	}

	AppConfig = &config
	return &config
}
