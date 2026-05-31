module iot-platform

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/gin-contrib/cors v1.7.1
	gorm.io/gorm v1.25.5
	gorm.io/driver/mysql v1.5.2
	github.com/influxdata/influxdb-client-go/v2 v2.13.0
	github.com/segmentio/kafka-go v0.4.46
	github.com/eclipse/paho.mqtt.golang v1.4.2
	github.com/golang-jwt/jwt/v5 v5.2.0
	gopkg.in/ini.v1 v1.67.0
	github.com/go-redis/redis/v8 v8.11.5
	github.com/spf13/viper v1.18.2
	go.uber.org/zap v1.26.0
	gopkg.in/gomail.v2 v2.0.0-20160411212932-81ebce5c23df
)
