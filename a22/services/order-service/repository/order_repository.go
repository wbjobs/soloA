package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"e-commerce-fulfillment/services/order-service/models"
)

type OrderRepository interface {
	Create(ctx context.Context, order *models.Order) error
	GetByID(ctx context.Context, id string) (*models.Order, error)
	GetByIDWithItems(ctx context.Context, id string) (*models.Order, error)
	List(ctx context.Context, userID int64, status int32, page, pageSize int) ([]models.Order, int64, error)
	UpdateStatus(ctx context.Context, id string, newStatus int32, operator, remark string) error
	CancelOrder(ctx context.Context, id string, reason string) error
	UpdateOrder(ctx context.Context, order *models.Order) error

	CreateSagaTransaction(ctx context.Context, saga *models.SagaTransaction) error
	UpdateSagaTransaction(ctx context.Context, saga *models.SagaTransaction) error
	GetSagaByTransactionID(ctx context.Context, transactionID string) (*models.SagaTransaction, error)
	GetSagasByOrderID(ctx context.Context, orderID string) ([]models.SagaTransaction, error)
	UpdateSagaStatus(ctx context.Context, transactionID string, step int32, status string, compensated bool, errorMsg string) error
}

type orderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) OrderRepository {
	return &orderRepository{db: db}
}

func (r *orderRepository) Create(ctx context.Context, order *models.Order) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(order).Error; err != nil {
			return fmt.Errorf("failed to create order: %v", err)
		}

		log := &models.OrderStatusLog{
			OrderID:      order.ID,
			BeforeStatus: models.OrderStatusUnknown,
			AfterStatus:  order.Status,
			Operator:     "SYSTEM",
			Remark:       "Order created",
		}
		if err := tx.Create(log).Error; err != nil {
			return fmt.Errorf("failed to create order status log: %v", err)
		}

		return nil
	})
}

func (r *orderRepository) GetByID(ctx context.Context, id string) (*models.Order, error) {
	var order models.Order
	result := r.db.WithContext(ctx).First(&order, "id = ?", id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get order: %v", result.Error)
	}
	return &order, nil
}

func (r *orderRepository) GetByIDWithItems(ctx context.Context, id string) (*models.Order, error) {
	var order models.Order
	result := r.db.WithContext(ctx).Preload("Items").First(&order, "id = ?", id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get order with items: %v", result.Error)
	}
	return &order, nil
}

func (r *orderRepository) List(ctx context.Context, userID int64, status int32, page, pageSize int) ([]models.Order, int64, error) {
	var orders []models.Order
	var total int64

	query := r.db.WithContext(ctx).Model(&models.Order{})

	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}
	if status > 0 {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count orders: %v", err)
	}

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := query.Preload("Items").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&orders).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list orders: %v", err)
	}

	return orders, total, nil
}

func (r *orderRepository) UpdateStatus(ctx context.Context, id string, newStatus int32, operator, remark string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var order models.Order
		result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrRecordNotFound) {
				return fmt.Errorf("order not found: %s", id)
			}
			return fmt.Errorf("failed to get order: %v", result.Error)
		}

		if !models.IsValidStatusTransition(order.Status, newStatus) {
			return fmt.Errorf("invalid status transition: %d -> %d", order.Status, newStatus)
		}

		oldStatus := order.Status
		order.Status = newStatus

		if newStatus == models.OrderStatusPaid {
			now := time.Now()
			order.PaidAt = &now
		} else if newStatus == models.OrderStatusShipped {
			now := time.Now()
			order.ShippedAt = &now
		} else if newStatus == models.OrderStatusCompleted {
			now := time.Now()
			order.CompletedAt = &now
		}

		if err := tx.Save(&order).Error; err != nil {
			return fmt.Errorf("failed to update order: %v", err)
		}

		if operator == "" {
			operator = "SYSTEM"
		}
		if remark == "" {
			remark = fmt.Sprintf("Status updated from %d to %d", oldStatus, newStatus)
		}

		log := &models.OrderStatusLog{
			OrderID:      id,
			BeforeStatus: oldStatus,
			AfterStatus:  newStatus,
			Operator:     operator,
			Remark:       remark,
		}
		if err := tx.Create(log).Error; err != nil {
			return fmt.Errorf("failed to create order status log: %v", err)
		}

		return nil
	})
}

func (r *orderRepository) CancelOrder(ctx context.Context, id string, reason string) error {
	return r.UpdateStatus(ctx, id, models.OrderStatusCancelled, "SYSTEM", reason)
}

func (r *orderRepository) UpdateOrder(ctx context.Context, order *models.Order) error {
	result := r.db.WithContext(ctx).Save(order)
	if result.Error != nil {
		return fmt.Errorf("failed to update order: %v", result.Error)
	}
	return nil
}

func (r *orderRepository) CreateSagaTransaction(ctx context.Context, saga *models.SagaTransaction) error {
	result := r.db.WithContext(ctx).Create(saga)
	if result.Error != nil {
		return fmt.Errorf("failed to create saga transaction: %v", result.Error)
	}
	return nil
}

func (r *orderRepository) UpdateSagaTransaction(ctx context.Context, saga *models.SagaTransaction) error {
	result := r.db.WithContext(ctx).Save(saga)
	if result.Error != nil {
		return fmt.Errorf("failed to update saga transaction: %v", result.Error)
	}
	return nil
}

func (r *orderRepository) GetSagaByTransactionID(ctx context.Context, transactionID string) (*models.SagaTransaction, error) {
	var saga models.SagaTransaction
	result := r.db.WithContext(ctx).Where("transaction_id = ?", transactionID).First(&saga)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get saga transaction: %v", result.Error)
	}
	return &saga, nil
}

func (r *orderRepository) GetSagasByOrderID(ctx context.Context, orderID string) ([]models.SagaTransaction, error) {
	var sagas []models.SagaTransaction
	result := r.db.WithContext(ctx).Where("order_id = ?", orderID).Order("step ASC").Find(&sagas)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get saga transactions: %v", result.Error)
	}
	return sagas, nil
}

func (r *orderRepository) UpdateSagaStatus(ctx context.Context, transactionID string, step int32, status string, compensated bool, errorMsg string) error {
	return r.db.WithContext(ctx).Model(&models.SagaTransaction{}).
		Where("transaction_id = ? AND step = ?", transactionID, step).
		Updates(map[string]interface{}{
			"status":       status,
			"compensated":  compensated,
			"error_message": errorMsg,
		}).Error
}
