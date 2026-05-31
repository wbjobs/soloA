package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"task-scheduler/internal/api"
	"task-scheduler/internal/config"
	"task-scheduler/internal/db"
	grpcserver "task-scheduler/internal/grpc"
	"task-scheduler/internal/executor"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/metrics"
	"task-scheduler/internal/scheduler"

	"go.uber.org/zap"
)

func main() {
	cfg := config.Load()

	logger.Init(&cfg.Log)
	defer logger.Logger.Sync()

	logger.Logger.Info("Starting task scheduler...",
		zap.String("node_id", cfg.Node.ID),
		zap.Int("http_port", cfg.Server.Port),
		zap.Int("grpc_port", cfg.GRPC.Port),
	)

	if err := db.Init(&cfg.MySQL); err != nil {
		logger.Sugar.Fatalf("Failed to init MySQL: %v", err)
	}

	if err := db.InitRedis(&cfg.Redis); err != nil {
		logger.Sugar.Fatalf("Failed to init Redis: %v", err)
	}

	db.SetNodeID(cfg.Node.ID)

	executor.InitExecutor(cfg)

	if err := grpcserver.StartGRPCServer(cfg); err != nil {
		logger.Sugar.Fatalf("Failed to start gRPC server: %v", err)
	}

	go grpcserver.StartHeartbeat(cfg)

	metrics.RecordNodeHeartbeat(cfg.Node.ID)

	scheduler.InitScheduler(cfg)
	scheduler.GlobalScheduler.Start()
	defer scheduler.GlobalScheduler.Stop()

	r := api.SetupRoutes(cfg)
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		logger.Sugar.Infof("HTTP server starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Sugar.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Sugar.Fatalf("Server forced to shutdown: %v", err)
	}

	logger.Logger.Info("Server exited properly")
}
