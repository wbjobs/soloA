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
	"e-commerce-fulfillment/proto/payment"
	"e-commerce-fulfillment/services/payment-service/handler"
	"e-commerce-fulfillment/services/payment-service/models"
	"e-commerce-fulfillment/services/payment-service/repository"
	"e-commerce-fulfillment/services/payment-service/service"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	db := database.InitMySQL()
	if err := db.AutoMigrate(&models.Payment{}, &models.PaymentLog{}); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to migrate payment schema: %v", err))
	}

	paymentRepo := repository.NewPaymentRepository(db)
	paymentService := service.NewPaymentService(paymentRepo)
	paymentHandler := handler.NewPaymentHandler(paymentService)

	cfg := config.AppConfig
	port := cfg.Server.GRPCPaymentPort
	address := "127.0.0.1"

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to listen: %v", err))
	}

	grpcServer := grpc.NewServer()
	payment.RegisterPaymentServiceServer(grpcServer, paymentHandler)

	registry := discovery.NewServiceRegistry()
	serviceInstance := &discovery.ServiceInstance{
		ServiceName: cfg.ServiceNames.PaymentService,
		Address:     address,
		Port:        port,
		Weight:      1,
	}
	if err := registry.Register(cfg.ServiceNames.PaymentService, serviceInstance); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to register service: %v", err))
	}

	go func() {
		logger.GetLogger().Info(fmt.Sprintf("Payment Service gRPC server listening on :%d", port))
		if err := grpcServer.Serve(lis); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to serve: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down Payment Service...")
	registry.Deregister(cfg.ServiceNames.PaymentService, address, port)
	grpcServer.GracefulStop()
}
