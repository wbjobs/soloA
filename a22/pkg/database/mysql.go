package database

import (
	"fmt"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/logger"
)

func InitMySQL() *gorm.DB {
	cfg := config.AppConfig

	maxRetries := 5
	var db *gorm.DB
	var err error

	for i := 0; i < maxRetries; i++ {
		db, err = gorm.Open(mysql.Open(cfg.Database.MySQL.DSN), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Info),
		})
		if err == nil {
			break
		}
		logger.GetLogger().Warn(fmt.Sprintf("Failed to connect MySQL, retrying (%d/%d): %v", i+1, maxRetries, err))
		time.Sleep(time.Second * 2)
	}

	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to connect MySQL after %d retries: %v", maxRetries, err))
	}

	sqlDB, err := db.DB()
	if err != nil {
		logger.GetLogger().Fatal(fmt.Sprintf("Failed to get SQL DB: %v", err))
	}

	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	logger.GetLogger().Info("MySQL connected successfully")
	return db
}
