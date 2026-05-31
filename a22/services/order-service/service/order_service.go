package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/order-service/models"
	"e-commerce-fulfillment/services/order-service/repository"
)

type OrderService interface {
	CreateOrder(ctx context.Context, userID int64, shippingAddress, remark string, items []OrderItemReq) (*models.Order, error)
	GetOrder(ctx context.Context, orderID string, userID int64) (*models.Order, error)
	ListOrders(ctx context.Context, userID int64, status int32, page, pageSize int) ([]models.Order, int64, error)
	UpdateOrderStatus(ctx context.Context, orderID string, newStatus int32) error
	CancelOrder(ctx context.Context, orderID string, userID int64, reason string) error
	PayOrder(ctx context.Context, orderID string, userID int64, paymentMethod string) (string, error)
	SetAutoCancelService(autoCancelService *AutoCancelService)
}

type OrderItemReq struct {
	SKUCode   string
	Quantity  int32
	UnitPrice float64
}

type orderService struct {
	repo              repository.OrderRepository
	sagaService       SagaService
	autoCancelService *AutoCancelService
}

func NewOrderService(repo repository.OrderRepository, sagaService SagaService) OrderService {
	return &orderService{
		repo:        repo,
		sagaService: sagaService,
	}
}

func (s *orderService) SetAutoCancelService(autoCancelService *AutoCancelService) {
	s.autoCancelService = autoCancelService
}

func (s *orderService) CreateOrder(ctx context.Context, userID int64, shippingAddress, remark string, items []OrderItemReq) (*models.Order, error) {
	if userID <= 0 {
		return nil, errors.New("user id is required")
	}
	if len(items) == 0 {
		return nil, errors.New("order items cannot be empty")
	}

	orderID := fmt.Sprintf("ORD%s", time.Now().Format("20060102150405")+uuid.New().String()[:8])

	var totalAmount float64
	var payAmount float64
	orderItems := make([]models.OrderItem, 0, len(items))

	for _, item := range items {
		if item.SKUCode == "" {
			return nil, errors.New("sku code is required")
		}
		if item.Quantity <= 0 {
			return nil, errors.New("quantity must be positive")
		}
		if item.UnitPrice <= 0 {
			return nil, errors.New("unit price must be positive")
		}

		totalPrice := float64(item.Quantity) * item.UnitPrice
		totalAmount += totalPrice

		orderItems = append(orderItems, models.OrderItem{
			SKUCode:    item.SKUCode,
			Quantity:   item.Quantity,
			UnitPrice:  item.UnitPrice,
			TotalPrice: totalPrice,
		})
	}

	payAmount = totalAmount

	order := &models.Order{
		ID:              orderID,
		UserID:          userID,
		Status:          models.OrderStatusPendingPayment,
		TotalAmount:     totalAmount,
		DiscountAmount:  0,
		PayAmount:       payAmount,
		ShippingAddress: shippingAddress,
		Remark:          remark,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
		Items:           orderItems,
	}

	if err := s.repo.Create(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to create order: %v", err)
	}

	if err := s.sagaService.ExecuteCreateOrderSaga(ctx, order, ""); err != nil {
		s.repo.CancelOrder(ctx, orderID, "Saga execution failed")
		return nil, fmt.Errorf("failed to execute order saga: %v", err)
	}

	if s.autoCancelService != nil {
		if err := s.autoCancelService.ScheduleAutoCancel(ctx, orderID, userID); err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to schedule auto cancel for order %s: %v", orderID, err))
		}
	}

	return order, nil
}

func (s *orderService) GetOrder(ctx context.Context, orderID string, userID int64) (*models.Order, error) {
	if orderID == "" {
		return nil, errors.New("order id is required")
	}

	order, err := s.repo.GetByIDWithItems(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}

	if userID > 0 && order.UserID != userID {
		return nil, errors.New("unauthorized to access this order")
	}

	return order, nil
}

func (s *orderService) ListOrders(ctx context.Context, userID int64, status int32, page, pageSize int) ([]models.Order, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	return s.repo.List(ctx, userID, status, page, pageSize)
}

func (s *orderService) UpdateOrderStatus(ctx context.Context, orderID string, newStatus int32) error {
	if orderID == "" {
		return errors.New("order id is required")
	}

	return s.repo.UpdateStatus(ctx, orderID, newStatus, "SYSTEM", "")
}

func (s *orderService) CancelOrder(ctx context.Context, orderID string, userID int64, reason string) error {
	if orderID == "" {
		return errors.New("order id is required")
	}

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	if userID > 0 && order.UserID != userID {
		return errors.New("unauthorized to cancel this order")
	}

	if reason == "" {
		reason = "User cancelled"
	}

	return s.sagaService.ExecuteCancelOrderSaga(ctx, orderID)
}

func (s *orderService) PayOrder(ctx context.Context, orderID string, userID int64, paymentMethod string) (string, error) {
	if orderID == "" {
		return "", errors.New("order id is required")
	}

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return "", err
	}
	if order == nil {
		return "", errors.New("order not found")
	}

	if userID > 0 && order.UserID != userID {
		return "", errors.New("unauthorized to pay this order")
	}

	if paymentMethod == "" {
		paymentMethod = "BALANCE"
	}

	if err := s.sagaService.ExecutePaymentSaga(ctx, orderID, paymentMethod); err != nil {
		return "", fmt.Errorf("payment failed: %v", err)
	}

	if s.autoCancelService != nil {
		if err := s.autoCancelService.CancelSchedule(ctx, orderID); err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to cancel auto cancel schedule for order %s: %v", orderID, err))
		}
	}

	return orderID, nil
}
