package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/database"
	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/events"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/pkg/tracing"
	"e-commerce-fulfillment/proto/order"
	"e-commerce-fulfillment/services/order-service/handler"
	"e-commerce-fulfillment/services/order-service/models"
	"e-commerce-fulfillment/services/order-service/repository"
	"e-commerce-fulfillment/services/order-service/service"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var tracer trace.Tracer
	var tracerManager *tracing.TracerManager

	if config.AppConfig.Tracing.Enabled {
		tracingConfig := tracing.TracingConfig{
			ServiceName:    config.AppConfig.ServiceNames.OrderService,
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
			tracer = tracing.GetTracer(config.AppConfig.ServiceNames.OrderService)
			defer tracerManager.Shutdown(ctx)
		}
	}

	db := database.InitMySQL()
	if err := db.AutoMigrate(&models.Order{}, &models.OrderItem{}, &models.OrderStatusLog{}, &models.SagaTransaction{}); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to migrate order schema: %v", err))
	}

	redis := database.InitRedis()

	producer := events.NewEventProducer()
	defer producer.Close()

	orderRepo := repository.NewOrderRepository(db)
	sagaService := service.NewSagaService(orderRepo, producer)
	orderService := service.NewOrderService(orderRepo, sagaService)

	paymentTimeout := 30 * time.Minute
	if config.AppConfig.Order.PaymentTimeoutMinutes > 0 {
		paymentTimeout = time.Duration(config.AppConfig.Order.PaymentTimeoutMinutes) * time.Minute
	}

	autoCancelService := service.NewAutoCancelService(orderRepo, sagaService, redis, paymentTimeout)
	orderService.SetAutoCancelService(autoCancelService)

	autoCancelService.Start(ctx)

	orderHandler := handler.NewOrderHandler(orderService)

	cfg := config.AppConfig
	port := cfg.Server.GRPCOrderPort
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
	order.RegisterOrderServiceServer(grpcServer, orderHandler)

	registry := discovery.NewServiceRegistry()
	serviceInstance := &discovery.ServiceInstance{
		ServiceName: cfg.ServiceNames.OrderService,
		Address:     address,
		Port:        port,
		Weight:      1,
	}
	if err := registry.Register(cfg.ServiceNames.OrderService, serviceInstance); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to register service: %v", err))
	}

	go func() {
		logger.GetLogger().Info(fmt.Sprintf("Order Service gRPC server listening on :%d", port))
		if err := grpcServer.Serve(lis); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to serve: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down Order Service...")
	cancel()
	registry.Deregister(cfg.ServiceNames.OrderService, address, port)
	grpcServer.GracefulStop()
}
