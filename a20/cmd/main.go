package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/router"
	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/service"
	"iot-platform/pkg/logger"
)

func main() {
	configPath := getConfigPath()

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	logger.Init(cfg.Server.Mode)
	logger.Info("Starting IoT Platform...")

	gin.SetMode(cfg.Server.Mode)

	if err := infrastructure.InitMySQL(&cfg.MySQL); err != nil {
		logger.Fatal("Failed to initialize MySQL", logger.ErrorField(err))
	}

	if err := infrastructure.InitInfluxDB(&cfg.InfluxDB); err != nil {
		logger.Fatal("Failed to initialize InfluxDB", logger.ErrorField(err))
	}

	if err := infrastructure.InitKafka(&cfg.Kafka); err != nil {
		logger.Warn("Failed to initialize Kafka, running without message queue", logger.ErrorField(err))
	}

	if err := infrastructure.InitMQTT(&cfg.MQTT); err != nil {
		logger.Fatal("Failed to initialize MQTT", logger.ErrorField(err))
	}

	mqttService := service.NewMQTTService()
	if err := mqttService.Start(); err != nil {
		logger.Fatal("Failed to start MQTT service", logger.ErrorField(err))
	}

	r := router.SetupRouter()

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: r,
	}

	go startBackgroundTasks()

	go func() {
		logger.Info("HTTP Server starting", logger.Int("port", cfg.Server.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start HTTP server", logger.ErrorField(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down IoT Platform...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server shutdown error", logger.ErrorField(err))
	}

	infrastructure.DisconnectMQTT()
	infrastructure.CloseKafka()
	infrastructure.CloseInfluxDB()

	logger.Info("IoT Platform stopped successfully")
}

func getConfigPath() string {
	if len(os.Args) > 1 {
		return os.Args[1]
	}

	exePath, err := os.Executable()
	if err == nil {
		configPath := filepath.Join(filepath.Dir(exePath), "config", "config.yaml")
		if _, err := os.Stat(configPath); err == nil {
			return configPath
		}
	}

	wd, err := os.Getwd()
	if err == nil {
		configPath := filepath.Join(wd, "config", "config.yaml")
		if _, err := os.Stat(configPath); err == nil {
			return configPath
		}
	}

	return "config/config.yaml"
}

func startBackgroundTasks() {
	deviceService := service.NewDeviceService()
	controlService := service.NewDeviceControlService()
	heartbeatCfg := config.AppConfig.DeviceHeartbeat

	heartbeatTicker := time.NewTicker(time.Duration(heartbeatCfg.CheckIntervalSeconds) * time.Second)
	defer heartbeatTicker.Stop()

	commandTimeoutTicker := time.NewTicker(5 * time.Minute)
	defer commandTimeoutTicker.Stop()

	for {
		select {
		case <-heartbeatTicker.C:
			deviceService.CheckDeviceStatus()
		case <-commandTimeoutTicker.C:
			controlService.CheckCommandTimeout(300)
		}
	}
}
