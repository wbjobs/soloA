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
	"e-commerce-fulfillment/proto/user"
	"e-commerce-fulfillment/services/user-service/handler"
	"e-commerce-fulfillment/services/user-service/models"
	"e-commerce-fulfillment/services/user-service/repository"
	"e-commerce-fulfillment/services/user-service/service"
)

func main() {
	config.LoadConfig()
	logger.InitLogger()

	db := database.InitMySQL()
	if err := db.AutoMigrate(&models.User{}); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to migrate user schema: %v", err))
	}

	userRepo := repository.NewUserRepository(db)
	userService := service.NewUserService(userRepo)
	userHandler := handler.NewUserHandler(userService)

	cfg := config.AppConfig
	port := cfg.Server.GRPCUserPort
	address := "127.0.0.1"

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to listen: %v", err))
	}

	grpcServer := grpc.NewServer()
	user.RegisterUserServiceServer(grpcServer, userHandler)

	registry := discovery.NewServiceRegistry()
	serviceInstance := &discovery.ServiceInstance{
		ServiceName: cfg.ServiceNames.UserService,
		Address:     address,
		Port:        port,
		Weight:      1,
	}
	if err := registry.Register(cfg.ServiceNames.UserService, serviceInstance); err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to register service: %v", err))
	}

	go func() {
		logger.GetLogger().Info(fmt.Sprintf("User Service gRPC server listening on :%d", port))
		if err := grpcServer.Serve(lis); err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to serve: %v", err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.GetLogger().Info("Shutting down User Service...")
	registry.Deregister(cfg.ServiceNames.UserService, address, port)
	grpcServer.GracefulStop()
}
