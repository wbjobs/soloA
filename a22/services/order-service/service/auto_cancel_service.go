package service

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"e-commerce-fulfillment/pkg/delayqueue"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/order-service/models"
	"e-commerce-fulfillment/services/order-service/repository"
)

const (
	OrderAutoCancelTopic   = "order_auto_cancel"
	DefaultPaymentTimeout  = 30 * time.Minute
	AutoCancelCheckInterval = 10 * time.Second
	AutoCancelBatchSize    = 100
)

type OrderCancelTask struct {
	OrderID string `json:"order_id"`
	UserID  int64  `json:"user_id"`
	Reason  string `json:"reason"`
}

type AutoCancelService struct {
	repo        repository.OrderRepository
	sagaService SagaService
	delayQueue  *delayqueue.DelayQueue
	timeout     time.Duration
}

func NewAutoCancelService(
	repo repository.OrderRepository,
	sagaService SagaService,
	redis *redis.Client,
	timeout time.Duration,
) *AutoCancelService {
	if timeout <= 0 {
		timeout = DefaultPaymentTimeout
	}

	return &AutoCancelService{
		repo:        repo,
		sagaService: sagaService,
		delayQueue:  delayqueue.NewDelayQueue(redis),
		timeout:     timeout,
	}
}

func (s *AutoCancelService) ScheduleAutoCancel(ctx context.Context, orderID string, userID int64) error {
	task := &OrderCancelTask{
		OrderID: orderID,
		UserID:  userID,
		Reason:  "Payment timeout",
	}

	payload := map[string]interface{}{
		"order_id": task.OrderID,
		"user_id":  task.UserID,
		"reason":   task.Reason,
	}

	msg := &delayqueue.DelayedMessage{
		ID:      orderID,
		Topic:   OrderAutoCancelTopic,
		Payload: payload,
		DelayMs: s.timeout.Milliseconds(),
	}

	if err := s.delayQueue.EnqueueWithRetry(ctx, msg, 3); err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to schedule auto cancel for order %s: %v", orderID, err))
		return err
	}

	logger.GetLogger().Info(fmt.Sprintf("Scheduled auto cancel for order %s, timeout: %v", orderID, s.timeout))
	return nil
}

func (s *AutoCancelService) CancelSchedule(ctx context.Context, orderID string) error {
	if err := s.delayQueue.Remove(ctx, OrderAutoCancelTopic, orderID); err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to cancel auto cancel schedule for order %s: %v", orderID, err))
		return err
	}

	logger.GetLogger().Info(fmt.Sprintf("Cancelled auto cancel schedule for order %s", orderID))
	return nil
}

func (s *AutoCancelService) Start(ctx context.Context) {
	logger.GetLogger().Info("Starting order auto cancel service...")

	go s.delayQueue.StartConsumer(
		ctx,
		OrderAutoCancelTopic,
		AutoCancelCheckInterval,
		AutoCancelBatchSize,
		s.handleAutoCancel,
	)

	go s.scanStaleOrders(ctx)
}

func (s *AutoCancelService) handleAutoCancel(ctx context.Context, msg *delayqueue.DelayedMessage) error {
	orderID, ok := msg.Payload["order_id"].(string)
	if !ok {
		return fmt.Errorf("invalid order_id in payload")
	}

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to get order %s for auto cancel: %v", orderID, err))
		return err
	}
	if order == nil {
		logger.GetLogger().Warn(fmt.Sprintf("Order %s not found, skipping auto cancel", orderID))
		return nil
	}

	if order.Status != models.OrderStatusPendingPayment {
		logger.GetLogger().Info(fmt.Sprintf("Order %s is not in pending payment status (current: %d), skipping auto cancel", orderID, order.Status))
		return nil
	}

	if time.Since(order.CreatedAt) < s.timeout-time.Second {
		logger.GetLogger().Warn(fmt.Sprintf("Order %s not yet expired, re-scheduling", orderID))
		return s.ScheduleAutoCancel(ctx, orderID, order.UserID)
	}

	logger.GetLogger().Warn(fmt.Sprintf("Auto canceling order %s due to payment timeout", orderID))

	if err := s.sagaService.ExecuteCancelOrderSaga(ctx, orderID); err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to auto cancel order %s: %v", orderID, err))
		return err
	}

	logger.GetLogger().Info(fmt.Sprintf("Successfully auto cancelled order %s", orderID))
	return nil
}

func (s *AutoCancelService) scanStaleOrders(ctx context.Context) {
	logger.GetLogger().Info("Starting stale orders scanner...")

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.GetLogger().Info("Stale orders scanner stopped")
			return
		case <-ticker.C:
			s.reconcileStaleOrders(ctx)
		}
	}
}

func (s *AutoCancelService) reconcileStaleOrders(ctx context.Context) {
	logger.GetLogger().Info("Reconciling stale orders...")

	cutoffTime := time.Now().Add(-s.timeout)

	orders, _, err := s.repo.List(ctx, 0, models.OrderStatusPendingPayment, 1, 500)
	if err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to list pending orders: %v", err))
		return
	}

	for _, order := range orders {
		if order.CreatedAt.Before(cutoffTime) {
			logger.GetLogger().Warn(fmt.Sprintf("Found stale pending order %s, created at: %v", order.ID, order.CreatedAt))

			if err := s.sagaService.ExecuteCancelOrderSaga(ctx, order.ID); err != nil {
				logger.GetLogger().Error(fmt.Sprintf("Failed to cancel stale order %s: %v", order.ID, err))
			}
		}
	}

	logger.GetLogger().Info("Stale orders reconciliation completed")
}
