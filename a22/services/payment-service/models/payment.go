package models

import (
	"time"

	"gorm.io/gorm"
)

type Payment struct {
	ID             string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	OrderID        string         `gorm:"type:varchar(64);not null;uniqueIndex:idx_payments_order_id" json:"order_id"`
	UserID         int64          `gorm:"not null;index" json:"user_id"`
	Amount         float64        `gorm:"type:decimal(10,2);not null" json:"amount"`
	Status         int32          `gorm:"not null;default:1;index" json:"status"`
	PaymentMethod  string         `gorm:"type:varchar(50)" json:"payment_method"`
	TransactionID  string         `gorm:"type:varchar(100);uniqueIndex:idx_payments_transaction_id" json:"transaction_id"`
	CreatedAt      time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	PaidAt         *time.Time     `gorm:"type:datetime" json:"paid_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

type PaymentLog struct {
	ID          int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	PaymentID   string         `gorm:"type:varchar(64);not null;index" json:"payment_id"`
	OrderID     string         `gorm:"type:varchar(64);not null;index" json:"order_id"`
	Action      string         `gorm:"type:varchar(50);not null" json:"action"`
	BeforeStatus int32         `gorm:"not null" json:"before_status"`
	AfterStatus  int32         `gorm:"not null" json:"after_status"`
	Remark      string         `gorm:"type:varchar(255)" json:"remark"`
	CreatedAt   time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
}

const (
	PaymentStatusUnknown = 0
	PaymentStatusPending = 1
	PaymentStatusSuccess = 2
	PaymentStatusFailed  = 3
	PaymentStatusRefunded = 4
)

const (
	PaymentActionCreate   = "CREATE"
	PaymentActionPay      = "PAY"
	PaymentActionFail     = "FAIL"
	PaymentActionRefund   = "REFUND"
)

func (Payment) TableName() string {
	return "payments"
}

func (PaymentLog) TableName() string {
	return "payment_logs"
}
