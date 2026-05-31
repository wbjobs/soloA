package models

import (
	"math"
	"time"

	"gorm.io/gorm"
)

type Warehouse struct {
	ID            int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	Name          string         `gorm:"type:varchar(100);not null" json:"name"`
	Code          string         `gorm:"type:varchar(50);not null;uniqueIndex" json:"code"`
	Address       string         `gorm:"type:varchar(500)" json:"address"`
	City          string         `gorm:"type:varchar(100);index" json:"city"`
	Province      string         `gorm:"type:varchar(100);index" json:"province"`
	Country       string         `gorm:"type:varchar(100);index" json:"country"`
	Latitude      float64        `gorm:"type:decimal(10,7)" json:"latitude"`
	Longitude     float64        `gorm:"type:decimal(10,7)" json:"longitude"`
	IsActive      bool           `gorm:"not null;default:true;index" json:"is_active"`
	Priority      int32          `gorm:"not null;default:0;index" json:"priority"`
	CreatedAt     time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type WarehouseInventory struct {
	ID                int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	WarehouseID       int64          `gorm:"not null;uniqueIndex:idx_warehouse_sku,priority:1" json:"warehouse_id"`
	SKUCode           string         `gorm:"type:varchar(50);not null;uniqueIndex:idx_warehouse_sku,priority:2;index" json:"sku_code"`
	AvailableQuantity int32          `gorm:"not null;default:0" json:"available_quantity"`
	FrozenQuantity    int32          `gorm:"not null;default:0" json:"frozen_quantity"`
	SoldQuantity      int32          `gorm:"not null;default:0" json:"sold_quantity"`
	CreatedAt         time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}

type RoutingResult struct {
	WarehouseID   int64  `json:"warehouse_id"`
	WarehouseCode string `json:"warehouse_code"`
	Distance      float64   `json:"distance"`
}

func (Warehouse) TableName() string {
	return "warehouses"
}

func (WarehouseInventory) TableName() string {
	return "warehouse_inventories"
}

func CalculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371.0

	lat1Rad := lat1 * math.Pi / 180.0
	lon1Rad := lon1 * math.Pi / 180.0
	lat2Rad := lat2 * math.Pi / 180.0
	lon2Rad := lon2 * math.Pi / 180.0

	dlat := lat2Rad - lat1Rad
	dlon := lon2Rad - lon1Rad

	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(dlon/2)*math.Sin(dlon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadius * c
}
