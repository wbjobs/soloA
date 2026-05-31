package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"e-commerce-fulfillment/services/payment-service/models"
)

type PaymentRepository interface {
	Create(ctx context.Context, payment *models.Payment) error
	GetByID(ctx context.Context, id string) (*models.Payment, error)
	GetByOrderID(ctx context.Context, orderID string) (*models.Payment, error)
	Update(ctx context.Context, payment *models.Payment) error
	UpdateStatus(ctx context.Context, id string, newStatus int32, remark string) error
	CreateLog(ctx context.Context, log *models.PaymentLog) error
}

type paymentRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) PaymentRepository {
	return &paymentRepository{db: db}
}

func (r *paymentRepository) Create(ctx context.Context, payment *models.Payment) error {
	result := r.db.WithContext(ctx).Create(payment)
	if result.Error != nil {
		return fmt.Errorf("failed to create payment: %v", result.Error)
	}

	log := &models.PaymentLog{
		PaymentID:    payment.ID,
		OrderID:      payment.OrderID,
		Action:       models.PaymentActionCreate,
		BeforeStatus: models.PaymentStatusUnknown,
		AfterStatus:  payment.Status,
		Remark:       "Payment created",
	}
	r.CreateLog(ctx, log)

	return nil
}

func (r *paymentRepository) GetByID(ctx context.Context, id string) (*models.Payment, error) {
	var payment models.Payment
	result := r.db.WithContext(ctx).First(&payment, "id = ?", id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get payment: %v", result.Error)
	}
	return &payment, nil
}

func (r *paymentRepository) GetByOrderID(ctx context.Context, orderID string) (*models.Payment, error) {
	var payment models.Payment
	result := r.db.WithContext(ctx).Where("order_id = ?", orderID).First(&payment)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get payment by order id: %v", result.Error)
	}
	return &payment, nil
}

func (r *paymentRepository) Update(ctx context.Context, payment *models.Payment) error {
	result := r.db.WithContext(ctx).Save(payment)
	if result.Error != nil {
		return fmt.Errorf("failed to update payment: %v", result.Error)
	}
	return nil
}

func (r *paymentRepository) UpdateStatus(ctx context.Context, id string, newStatus int32, remark string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var payment models.Payment
		result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, "id = ?", id)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrRecordNotFound) {
				return fmt.Errorf("payment not found: %s", id)
			}
			return fmt.Errorf("failed to get payment: %v", result.Error)
		}

		beforeStatus := payment.Status
		payment.Status = newStatus

		if newStatus == models.PaymentStatusSuccess {
			now := time.Now()
			payment.PaidAt = &now
		}

		if err := tx.Save(&payment).Error; err != nil {
			return fmt.Errorf("failed to update payment: %v", err)
		}

		action := getPaymentAction(beforeStatus, newStatus)
		log := &models.PaymentLog{
			PaymentID:    id,
			OrderID:      payment.OrderID,
			Action:       action,
			BeforeStatus: beforeStatus,
			AfterStatus:  newStatus,
			Remark:       remark,
		}
		if err := tx.Create(log).Error; err != nil {
			return fmt.Errorf("failed to create payment log: %v", err)
		}

		return nil
	})
}

func getPaymentAction(beforeStatus, afterStatus int32) string {
	switch afterStatus {
	case models.PaymentStatusSuccess:
		return models.PaymentActionPay
	case models.PaymentStatusFailed:
		return models.PaymentActionFail
	case models.PaymentStatusRefunded:
		return models.PaymentActionRefund
	default:
		return "UPDATE"
	}
}

func (r *paymentRepository) CreateLog(ctx context.Context, log *models.PaymentLog) error {
	result := r.db.WithContext(ctx).Create(log)
	if result.Error != nil {
		return fmt.Errorf("failed to create payment log: %v", result.Error)
	}
	return nil
}
