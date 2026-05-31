package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/database"
	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/pkg/tracing"
	"e-commerce-fulfillment/proto/inventory"
	"e-commerce-fulfillment/services/inventory-service/handler"
	"e-commerce-fulfillment/services/inventory-service/models"
	"e-commerce-fulfillment/services/inventory-service/repository"
	"e-commerce-fulfillment/services/inventory-service/service"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	var tracer trace.Tracer
	var tracerManager *tracing.TracerManager

	if config.AppConfig.Tracing.Enabled {
		tracingConfig := tracing.TracingConfig{
			ServiceName:    config.AppConfig.ServiceNames.InventoryService,
			ServiceVersion: config.AppConfig.Tracing.ServiceVersion,
			Environment:    config.AppConfig.Tracing.Environment,
			Endpoint:       config.AppConfig.Tracing.Endpoint,
			Protocol:       config.AppConfig.Tracing.Protocol,
			Enabled:        config.AppConfig.Tracing.Enabled,
		}
		var err error
		tracerManager, err = tracing.NewTracerManager(tracingConfig)
		if err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to initialize tracing: %v, will continue without tracing", err))
		} else {
			tracer = tracing.GetTracer(config.AppConfig.ServiceNames.InventoryService)
			defer tracerManager.Shutdown(context.Background())
		}
	}

	db := database.InitMySQL()
	if err := db.AutoMigrate(&models.Inventory{}, &models.InventoryOperation{}, &models.Warehouse{}, &models.WarehouseInventory{}); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to migrate inventory schema: %v", err))
	}

	redis := database.InitRedis()

	inventoryRepo := repository.NewInventoryRepository(db)
	warehouseRepo := repository.NewWarehouseRepository(db)

	inventoryService := service.NewInventoryService(inventoryRepo, redis)
	warehouseRoutingService := service.NewWarehouseRoutingService(warehouseRepo, inventoryRepo)

	inventoryHandler := handler.NewInventoryHandler(inventoryService, warehouseRoutingService)

	cfg := config.AppConfig
	port := cfg.Server.GRPCInventoryPort
	address := "127.0.0.1"

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to listen: %v", err))
	}

	var grpcServer *grpc.Server
	if tracer != nil {
		grpcServer = grpc.NewServer(
			grpc.UnaryInterceptor(tracing.UnaryServerInterceptor(tracer)),
			grpc.StreamInterceptor(tracing.StreamServerInterceptor(tracer)),
		)
	} else {
		grpcServer = grpc.NewServer()
	}
	inventory.RegisterInventoryServiceServer(grpcServer, inventoryHandler)

	registry := discovery.NewServiceRegistry()
	serviceInstance := &discovery.ServiceInstance{
		ServiceName: cfg.ServiceNames.InventoryService,
		Address:     address,
		Port:        port,
		Weight:      1,
	}
	if err := registry.Register(cfg.ServiceNames.InventoryService, serviceInstance); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to register service: %v", err))
	}

	go func() {
		logger.GetLogger().Info(fmt.Sprintf("Inventory Service gRPC server listening on :%d", port))
		if err := grpcServer.Serve(lis); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to serve: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down Inventory Service...")
	registry.Deregister(cfg.ServiceNames.InventoryService, address, port)
	grpcServer.GracefulStop()
}
