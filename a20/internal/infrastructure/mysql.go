package infrastructure

import (
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"iot-platform/internal/config"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

var DB *gorm.DB

func InitMySQL(cfg *config.MySQLConfig) error {
	var db *gorm.DB
	var err error

	for i := 0; i < 5; i++ {
		db, err = gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Info),
		})
		if err == nil {
			break
		}
		logger.Warn("Failed to connect to MySQL, retrying...", logger.Int("attempt", i+1), logger.ErrorField(err))
		time.Sleep(time.Second * 5)
	}

	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Second)

	DB = db

	if err := autoMigrate(db); err != nil {
		return err
	}

	logger.Info("MySQL connected successfully")
	return nil
}

func autoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.Device{},
		&model.DeviceGroup{},
		&model.Rule{},
		&model.Alert{},
		&model.Notification{},
		&model.DeviceCommand{},
		&model.DeviceRule{},
	)
}

func GetDB() *gorm.DB {
	return DB
}
