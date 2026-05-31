package db

import (
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"task-scheduler/internal/config"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/models"
)

var DB *gorm.DB

func Init(cfg *config.MySQLConfig) error {
	newLogger := logger.New(
		&zapLogger{},
		logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	var err error
	DB, err = gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{
		Logger: newLogger,
	})
	if err != nil {
		return err
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err = autoMigrate(); err != nil {
		return err
	}

	logger.Logger.Info("MySQL connected successfully")
	return nil
}

func autoMigrate() error {
	return DB.AutoMigrate(
		&models.Task{},
		&models.TaskExecutionLog{},
		&models.Node{},
	)
}

type zapLogger struct{}

func (l *zapLogger) Printf(format string, v ...interface{}) {
	logger.Sugar.Infof(format, v...)
}
