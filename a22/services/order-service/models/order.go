package models

import (
	"time"

	"gorm.io/gorm"
)

type Order struct {
	ID              string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	UserID          int64          `gorm:"not null;index" json:"user_id"`
	Status          int32          `gorm:"not null;default:1;index" json:"status"`
	TotalAmount     float64        `gorm:"type:decimal(10,2);not null;default:0" json:"total_amount"`
	DiscountAmount  float64        `gorm:"type:decimal(10,2);not null;default:0" json:"discount_amount"`
	PayAmount       float64        `gorm:"type:decimal(10,2);not null;default:0" json:"pay_amount"`
	ShippingAddress string         `gorm:"type:varchar(500)" json:"shipping_address"`
	Remark          string         `gorm:"type:varchar(500)" json:"remark"`
	CreatedAt       time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	PaidAt          *time.Time     `gorm:"type:datetime" json:"paid_at"`
	ShippedAt       *time.Time     `gorm:"type:datetime" json:"shipped_at"`
	CompletedAt     *time.Time     `gorm:"type:datetime" json:"completed_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	Items           []OrderItem    `gorm:"foreignKey:OrderID" json:"items,omitempty"`
}

type OrderItem struct {
	ID         int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID    string         `gorm:"type:varchar(64);not null;index" json:"order_id"`
	SKUCode    string         `gorm:"type:varchar(50);not null;index" json:"sku_code"`
	Quantity   int32          `gorm:"not null" json:"quantity"`
	UnitPrice  float64        `gorm:"type:decimal(10,2);not null" json:"unit_price"`
	TotalPrice float64        `gorm:"type:decimal(10,2);not null" json:"total_price"`
	CreatedAt  time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt  time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type OrderStatusLog struct {
	ID          int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID     string         `gorm:"type:varchar(64);not null;index" json:"order_id"`
	BeforeStatus int32         `gorm:"not null" json:"before_status"`
	AfterStatus  int32         `gorm:"not null;index" json:"after_status"`
	Operator    string         `gorm:"type:varchar(50)" json:"operator"`
	Remark      string         `gorm:"type:varchar(255)" json:"remark"`
	CreatedAt   time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
}

type SagaTransaction struct {
	ID              int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	TransactionID   string         `gorm:"type:varchar(64);not null;uniqueIndex" json:"transaction_id"`
	OrderID         string         `gorm:"type:varchar(64);not null;index" json:"order_id"`
	Step            int32          `gorm:"not null" json:"step"`
	StepName        string         `gorm:"type:varchar(50);not null" json:"step_name"`
	Status          string         `gorm:"type:varchar(20);not null;index" json:"status"`
	Compensated     bool           `gorm:"not null;default:false" json:"compensated"`
	RequestPayload  string         `gorm:"type:text" json:"request_payload"`
	ResponsePayload string         `gorm:"type:text" json:"response_payload"`
	ErrorMessage    string         `gorm:"type:text" json:"error_message"`
	CreatedAt       time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" json:"updated_at"`
}

const (
	OrderStatusUnknown       = 0
	OrderStatusPendingPayment = 1
	OrderStatusPaid          = 2
	OrderStatusShipped       = 3
	OrderStatusCompleted     = 4
	OrderStatusCancelled     = 5
)

const (
	SagaStepCreateOrder      = 1
	SagaStepDeductInventory  = 2
	SagaStepCreatePayment    = 3
)

const (
	SagaStatusPending   = "PENDING"
	SagaStatusSuccess   = "SUCCESS"
	SagaStatusFailed    = "FAILED"
	SagaStatusCompensating = "COMPENSATING"
	SagaStatusCompensated = "COMPENSATED"
)

var ValidStatusTransitions = map[int32][]int32{
	OrderStatusUnknown:       {OrderStatusPendingPayment},
	OrderStatusPendingPayment: {OrderStatusPaid, OrderStatusCancelled},
	OrderStatusPaid:          {OrderStatusShipped, OrderStatusCancelled},
	OrderStatusShipped:       {OrderStatusCompleted, OrderStatusCancelled},
	OrderStatusCompleted:     {},
	OrderStatusCancelled:     {},
}

func (Order) TableName() string {
	return "orders"
}

func (OrderItem) TableName() string {
	return "order_items"
}

func (OrderStatusLog) TableName() string {
	return "order_status_logs"
}

func (SagaTransaction) TableName() string {
	return "saga_transactions"
}

func IsValidStatusTransition(from, to int32) bool {
	validTransitions, ok := ValidStatusTransitions[from]
	if !ok {
		return false
	}
	for _, validTo := range validTransitions {
		if validTo == to {
			return true
		}
	}
	return false
}

func GetStatusText(status int32) string {
	switch status {
	case OrderStatusPendingPayment:
		return "待支付"
	case OrderStatusPaid:
		return "已支付"
	case OrderStatusShipped:
		return "已发货"
	case OrderStatusCompleted:
		return "已完成"
	case OrderStatusCancelled:
		return "已取消"
	default:
		return "未知状态"
	}
}
