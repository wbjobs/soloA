package models

import (
	"time"

	"gorm.io/gorm"
)

type Product struct {
	ID          int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string         `gorm:"type:varchar(200);not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Category    string         `gorm:"type:varchar(100);index" json:"category"`
	Brand       string         `gorm:"type:varchar(100)" json:"brand"`
	CreatedAt   time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	SKUs        []SKU          `gorm:"foreignKey:ProductID" json:"skus,omitempty"`
}

type SKU struct {
	ID            int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	ProductID     int64          `gorm:"not null;index" json:"product_id"`
	SKUCode       string         `gorm:"type:varchar(50);not null;uniqueIndex" json:"sku_code"`
	Attributes    string         `gorm:"type:json" json:"attributes"`
	Price         float64        `gorm:"type:decimal(10,2);not null;default:0" json:"price"`
	StockQuantity int32          `gorm:"not null;default:0" json:"stock_quantity"`
	CreatedAt     time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Product) TableName() string {
	return "products"
}

func (SKU) TableName() string {
	return "skus"
}
