package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"task-scheduler/internal/autoscale"
	"task-scheduler/internal/config"
	"task-scheduler/internal/handler"
	"task-scheduler/internal/model"
	"task-scheduler/internal/notify"
	"task-scheduler/internal/repository"
	"task-scheduler/internal/scheduler"
	"task-scheduler/internal/service"
	"task-scheduler/internal/worker"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	configPath := "config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		logger.Fatal("Failed to load config", zap.Error(err))
	}

	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       cfg.Database.DSN(),
		DefaultStringSize:         256,
		DisableDatetimePrecision:  true,
		DontSupportRenameIndex:    true,
		DontSupportRenameColumn:   true,
		SkipInitializeWithVersion: false,
	}), &gorm.Config{
		PrepareStmt: true,
	})
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}

	sqlDB, err := db.DB()
	if err != nil {
		logger.Fatal("Failed to get sql.DB", zap.Error(err))
	}
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(1 * time.Hour)
	sqlDB.SetConnMaxIdleTime(30 * time.Minute)

	if err := db.AutoMigrate(
		&model.Task{},
		&model.TaskLog{},
		&model.TaskDependency{},
		&model.NotifyConfig{},
		&model.AutoscaleConfig{},
	); err != nil {
		logger.Warn("AutoMigrate failed", zap.Error(err))
	}

	redisClient := redis.NewClient(&redis.Options{
		Addr:         cfg.Redis.Addr(),
		Password:     cfg.Redis.Password,
		DB:           cfg.Redis.DB,
		PoolSize:     cfg.Redis.PoolSize,
		MinIdleConns: cfg.Redis.PoolSize / 2,
		MaxRetries:   3,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolTimeout:  4 * time.Second,
		IdleTimeout:  5 * time.Minute,
	})
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Fatal("Failed to connect to redis", zap.Error(err))
	}

	nodeID := fmt.Sprintf("node-%d", time.Now().UnixNano())
	if hostname, err := os.Hostname(); err == nil {
		nodeID = fmt.Sprintf("%s-%d", hostname, time.Now().UnixNano())
	}

	taskRepo := repository.NewTaskRepository(db)
	taskLogRepo := repository.NewTaskLogRepository(db)
	depRepo := repository.NewTaskDependencyRepository(db)
	notifyConfigRepo := repository.NewNotifyConfigRepository(db)
	autoscaleConfigRepo := repository.NewAutoscaleConfigRepository(db)

	workerPool := worker.NewWorkerPool(logger, cfg.Scheduler.WorkerCount)
	worker.RegisterDefaultHandlers(workerPool)

	notifyManager := notify.NewManager(logger)
	loadNotifyConfigs(logger, notifyConfigRepo, notifyManager)

	sched := scheduler.NewScheduler(
		&cfg.Scheduler,
		logger,
		taskRepo,
		taskLogRepo,
		depRepo,
		workerPool,
		redisClient,
		nodeID,
		notifyManager,
	)

	autoscaleConfig, err := autoscaleConfigRepo.GetOrCreateDefault()
	if err != nil {
		logger.Warn("Failed to get autoscale config", zap.Error(err))
	}

	autoscaler := autoscale.NewAutoscaler(
		logger,
		workerPool,
		sched.QueueLength,
		&autoscale.Config{
			MinWorkers:         autoscaleConfig.MinWorkers,
			MaxWorkers:         autoscaleConfig.MaxWorkers,
			ScaleUpThreshold:   autoscaleConfig.ScaleUpThreshold,
			ScaleDownThreshold: autoscaleConfig.ScaleDownThreshold,
			ScaleUpStep:        autoscaleConfig.ScaleUpStep,
			ScaleDownStep:      autoscaleConfig.ScaleDownStep,
			CooldownSeconds:    autoscaleConfig.CooldownSeconds,
			Enabled:            autoscaleConfig.Enabled,
		},
	)

	autoscaleConfigUpdater := func(cfg *model.AutoscaleConfig) {
		autoscaler.UpdateConfig(&autoscale.Config{
			MinWorkers:         cfg.MinWorkers,
			MaxWorkers:         cfg.MaxWorkers,
			ScaleUpThreshold:   cfg.ScaleUpThreshold,
			ScaleDownThreshold: cfg.ScaleDownThreshold,
			ScaleUpStep:        cfg.ScaleUpStep,
			ScaleDownStep:      cfg.ScaleDownStep,
			CooldownSeconds:    cfg.CooldownSeconds,
			Enabled:            cfg.Enabled,
		})
	}

	taskService := service.NewTaskService(taskRepo, depRepo, sched)
	taskLogService := service.NewTaskLogService(taskLogRepo)
	notifyConfigService := service.NewNotifyConfigService(notifyConfigRepo)
	autoscaleConfigService := service.NewAutoscaleConfigService(autoscaleConfigRepo, sched, autoscaleConfigUpdater)

	taskHandler := handler.NewTaskHandler(taskService, taskLogService, sched)
	notifyConfigHandler := handler.NewNotifyConfigHandler(notifyConfigService)
	autoscaleHandler := handler.NewAutoscaleHandler(autoscaleConfigService, sched)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := sched.Start(ctx); err != nil {
		logger.Fatal("Failed to start scheduler", zap.Error(err))
	}

	autoscaler.Start(ctx)

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/api/v1/health", "/api/v1/status"},
	}))

	api := r.Group("/api/v1")
	taskHandler.RegisterRoutes(api)

	notifyConfigs := api.Group("/notify-configs")
	{
		notifyConfigs.POST("", notifyConfigHandler.CreateNotifyConfig)
		notifyConfigs.GET("", notifyConfigHandler.ListNotifyConfigs)
		notifyConfigs.GET("/:id", notifyConfigHandler.GetNotifyConfig)
		notifyConfigs.PUT("/:id", notifyConfigHandler.UpdateNotifyConfig)
		notifyConfigs.DELETE("/:id", notifyConfigHandler.DeleteNotifyConfig)
	}

	autoscaleGroup := api.Group("/autoscale")
	{
		autoscaleGroup.GET("", autoscaleHandler.GetAutoscaleConfig)
		autoscaleGroup.PUT("", autoscaleHandler.UpdateAutoscaleConfig)
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("Server starting", zap.Int("port", cfg.Server.Port), zap.String("nodeID", nodeID))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Server shutdown error", zap.Error(err))
	}

	cancel()
	autoscaler.Stop()
	sched.Stop()

	if err := redisClient.Close(); err != nil {
		logger.Warn("Redis close error", zap.Error(err))
	}

	if err := sqlDB.Close(); err != nil {
		logger.Warn("Database close error", zap.Error(err))
	}

	logger.Info("Shutdown complete")
}

func loadNotifyConfigs(logger *zap.Logger, repo repository.NotifyConfigRepository, manager *notify.Manager) {
	cfgs, err := repo.List()
	if err != nil {
		logger.Warn("Failed to load notify configs", zap.Error(err))
		return
	}

	for _, cfg := range cfgs {
		if !cfg.Enabled || !cfg.IsDefault {
			continue
		}
		manager.RegisterDefaultConfig(cfg.ChannelType, cfg.Config)
		logger.Info("Loaded notify config",
			zap.String("name", cfg.Name),
			zap.String("channel", cfg.ChannelType),
		)
	}
}
