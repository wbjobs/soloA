package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/api-gateway/router"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	registry := discovery.NewServiceRegistry()

	r := router.SetupRouter(registry)

	cfg := config.AppConfig
	port := cfg.Server.HTTPPort

	go func() {
		addr := fmt.Sprintf(":%d", port)
		logger.GetLogger().Info(fmt.Sprintf("API Gateway HTTP server listening on %s", addr))
		if err := r.Run(addr); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to start HTTP server: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down API Gateway...")
}
