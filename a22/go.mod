module e-commerce-fulfillment

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/golang-jwt/jwt/v5 v5.2.0
	google.golang.org/grpc v1.59.0
	google.golang.org/protobuf v1.31.0
	github.com/go-sql-driver/mysql v1.7.1
	github.com/redis/go-redis/v9 v9.3.0
	github.com/segmentio/kafka-go v0.4.46
	go.etcd.io/etcd/client/v3 v3.5.10
	gorm.io/driver/mysql v1.5.1
	gorm.io/gorm v1.25.5
	github.com/spf13/viper v1.18.2
	go.uber.org/zap v1.26.0
	golang.org/x/crypto v0.17.0
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.21.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/otel/trace v1.21.0
)
