package models

import (
	"time"

	"gorm.io/gorm"
)

type Inventory struct {
	ID                 int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	SKUCode            string         `gorm:"type:varchar(50);not null;uniqueIndex" json:"sku_code"`
	AvailableQuantity  int32          `gorm:"not null;default:0" json:"available_quantity"`
	FrozenQuantity     int32          `gorm:"not null;default:0" json:"frozen_quantity"`
	SoldQuantity       int32          `gorm:"not null;default:0" json:"sold_quantity"`
	CreatedAt          time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

type InventoryOperation struct {
	ID             int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	OperationID    string         `gorm:"type:varchar(64);not null;uniqueIndex" json:"operation_id"`
	OrderID        string         `gorm:"type:varchar(64);not null;index" json:"order_id"`
	SKUCode        string         `gorm:"type:varchar(50);not null;index" json:"sku_code"`
	Quantity       int32          `gorm:"not null" json:"quantity"`
	OperationType  string         `gorm:"type:varchar(20);not null;index" json:"operation_type"`
	Status         string         `gorm:"type:varchar(20);not null;index" json:"status"`
	CreatedAt      time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

const (
	OperationTypeDeduct   = "DEDUCT"
	OperationTypeRollback = "ROLLBACK"
	OperationTypeConfirm  = "CONFIRM"

	OperationStatusPending   = "PENDING"
	OperationStatusSuccess   = "SUCCESS"
	OperationStatusFailed    = "FAILED"
	OperationStatusRolledBack = "ROLLED_BACK"
)

func (Inventory) TableName() string {
	return "inventories"
}

func (InventoryOperation) TableName() string {
	return "inventory_operations"
}
