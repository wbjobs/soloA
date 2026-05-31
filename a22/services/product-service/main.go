package main

import (
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/database"
	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/proto/product"
	"e-commerce-fulfillment/services/product-service/handler"
	"e-commerce-fulfillment/services/product-service/models"
	"e-commerce-fulfillment/services/product-service/repository"
	"e-commerce-fulfillment/services/product-service/service"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	db := database.InitMySQL()
	if err := db.AutoMigrate(&models.Product{}, &models.SKU{}); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to migrate product schema: %v", err))
	}

	productRepo := repository.NewProductRepository(db)
	productService := service.NewProductService(productRepo)
	productHandler := handler.NewProductHandler(productService)

	cfg := config.AppConfig
	port := cfg.Server.GRPCProductPort
	address := "127.0.0.1"

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to listen: %v", err))
	}

	grpcServer := grpc.NewServer()
	product.RegisterProductServiceServer(grpcServer, productHandler)

	registry := discovery.NewServiceRegistry()
	serviceInstance := &discovery.ServiceInstance{
		ServiceName: cfg.ServiceNames.ProductService,
		Address:     address,
		Port:        port,
		Weight:      1,
	}
	if err := registry.Register(cfg.ServiceNames.ProductService, serviceInstance); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to register service: %v", err))
	}

	go func() {
		logger.GetLogger().Info(fmt.Sprintf("Product Service gRPC server listening on :%d", port))
		if err := grpcServer.Serve(lis); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to serve: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down Product Service...")
	registry.Deregister(cfg.ServiceNames.ProductService, address, port)
	grpcServer.GracefulStop()
}
