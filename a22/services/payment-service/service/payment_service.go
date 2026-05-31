package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/payment-service/models"
	"e-commerce-fulfillment/services/payment-service/repository"
)

type PaymentService interface {
	CreatePayment(ctx context.Context, orderID string, userID int64, amount float64, paymentMethod string) (string, int32, error)
	GetPayment(ctx context.Context, paymentID, orderID string) (*models.Payment, error)
	ProcessPayment(ctx context.Context, paymentID string) error
	RefundPayment(ctx context.Context, paymentID, orderID string, amount float64, reason string) error
}

type paymentService struct {
	repo repository.PaymentRepository
}

func NewPaymentService(repo repository.PaymentRepository) PaymentService {
	return &paymentService{repo: repo}
}

func (s *paymentService) CreatePayment(ctx context.Context, orderID string, userID int64, amount float64, paymentMethod string) (string, int32, error) {
	if orderID == "" {
		return "", 0, errors.New("order id is required")
	}
	if amount <= 0 {
		return "", 0, errors.New("amount must be positive")
	}

	existingPayment, err := s.repo.GetByOrderID(ctx, orderID)
	if err != nil {
		return "", 0, err
	}
	if existingPayment != nil {
		logger.GetLogger().Info(fmt.Sprintf("Payment already exists for order %s, returning existing payment", orderID))
		return existingPayment.ID, existingPayment.Status, nil
	}

	paymentID := uuid.New().String()
	transactionID := fmt.Sprintf("txn_%s", orderID)

	payment := &models.Payment{
		ID:            paymentID,
		OrderID:       orderID,
		UserID:        userID,
		Amount:        amount,
		Status:        models.PaymentStatusPending,
		PaymentMethod: paymentMethod,
		TransactionID: transactionID,
		CreatedAt:     time.Now(),
	}

	if err := s.repo.Create(ctx, payment); err != nil {
		existingPayment, getErr := s.repo.GetByOrderID(ctx, orderID)
		if getErr == nil && existingPayment != nil {
			logger.GetLogger().Info(fmt.Sprintf("Detected concurrent payment creation for order %s, returning existing", orderID))
			return existingPayment.ID, existingPayment.Status, nil
		}
		return "", 0, err
	}

	return payment.ID, payment.Status, nil
}

func (s *paymentService) GetPayment(ctx context.Context, paymentID, orderID string) (*models.Payment, error) {
	var payment *models.Payment
	var err error

	if paymentID != "" {
		payment, err = s.repo.GetByID(ctx, paymentID)
	} else if orderID != "" {
		payment, err = s.repo.GetByOrderID(ctx, orderID)
	} else {
		return nil, errors.New("payment id or order id is required")
	}

	if err != nil {
		return nil, err
	}
	if payment == nil {
		return nil, errors.New("payment not found")
	}

	return payment, nil
}

func (s *paymentService) ProcessPayment(ctx context.Context, paymentID string) error {
	if paymentID == "" {
		return errors.New("payment id is required")
	}

	payment, err := s.repo.GetByID(ctx, paymentID)
	if err != nil {
		return err
	}
	if payment == nil {
		return errors.New("payment not found")
	}

	if payment.Status != models.PaymentStatusPending {
		return fmt.Errorf("payment is not in pending status, current status: %d", payment.Status)
	}

	transactionID := uuid.New().String()
	payment.TransactionID = transactionID
	if err := s.repo.Update(ctx, payment); err != nil {
		return err
	}

	return s.repo.UpdateStatus(ctx, paymentID, models.PaymentStatusSuccess, "Payment processed successfully")
}

func (s *paymentService) RefundPayment(ctx context.Context, paymentID, orderID string, amount float64, reason string) error {
	var payment *models.Payment
	var err error

	if paymentID != "" {
		payment, err = s.repo.GetByID(ctx, paymentID)
	} else if orderID != "" {
		payment, err = s.repo.GetByOrderID(ctx, orderID)
	} else {
		return errors.New("payment id or order id is required")
	}

	if err != nil {
		return err
	}
	if payment == nil {
		return errors.New("payment not found")
	}

	if payment.Status != models.PaymentStatusSuccess {
		return fmt.Errorf("payment is not in success status, current status: %d", payment.Status)
	}

	if amount > payment.Amount {
		return fmt.Errorf("refund amount exceeds payment amount: %.2f > %.2f", amount, payment.Amount)
	}

	if reason == "" {
		reason = "Refund processed"
	}

	return s.repo.UpdateStatus(ctx, payment.ID, models.PaymentStatusRefunded, reason)
}
