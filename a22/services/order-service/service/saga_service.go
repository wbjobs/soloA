package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/events"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/proto/inventory"
	"e-commerce-fulfillment/proto/payment"
	"e-commerce-fulfillment/services/order-service/models"
	"e-commerce-fulfillment/services/order-service/repository"
)

type SagaService interface {
	ExecuteCreateOrderSaga(ctx context.Context, order *models.Order, operationID string) error
	ExecuteCancelOrderSaga(ctx context.Context, orderID string) error
	ExecutePaymentSaga(ctx context.Context, orderID string, paymentMethod string) error
	RetryFailedCompensations(ctx context.Context) int
}

type sagaService struct {
	repo                repository.OrderRepository
	producer            *events.EventProducer
	registry            *discovery.ServiceRegistry
	orderLocks          map[string]*sync.Mutex
	orderLocksMutex     sync.RWMutex
	compensationRetryMax int
}

func NewSagaService(repo repository.OrderRepository, producer *events.EventProducer) SagaService {
	return &sagaService{
		repo:                repo,
		producer:            producer,
		registry:            discovery.NewServiceRegistry(),
		orderLocks:          make(map[string]*sync.Mutex),
		orderLocksMutex:     sync.RWMutex{},
		compensationRetryMax: 5,
	}
}

func (s *sagaService) getOrderLock(orderID string) *sync.Mutex {
	s.orderLocksMutex.RLock()
	lock, exists := s.orderLocks[orderID]
	s.orderLocksMutex.RUnlock()

	if exists {
		return lock
	}

	s.orderLocksMutex.Lock()
	defer s.orderLocksMutex.Unlock()

	lock, exists = s.orderLocks[orderID]
	if exists {
		return lock
	}

	lock = &sync.Mutex{}
	s.orderLocks[orderID] = lock
	return lock
}

func (s *sagaService) getGRPCConn(serviceName string) (*grpc.ClientConn, error) {
	instance, err := s.registry.Discover(serviceName)
	if err != nil {
		return nil, fmt.Errorf("failed to discover service %s: %v", serviceName, err)
	}

	address := fmt.Sprintf("%s:%d", instance.Address, instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %v", serviceName, err)
	}

	return conn, nil
}

func (s *sagaService) getGRPCConnWithRetry(serviceName string, maxRetries int) (*grpc.ClientConn, error) {
	var conn *grpc.ClientConn
	var err error
	retryInterval := 500 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		conn, err = s.getGRPCConn(serviceName)
		if err == nil {
			return conn, nil
		}

		if i < maxRetries-1 {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to connect to %s (attempt %d/%d): %v, retrying...", serviceName, i+1, maxRetries, err))
			time.Sleep(retryInterval)
			retryInterval *= 2
		}
	}

	return nil, err
}

func (s *sagaService) createSagaTransaction(ctx context.Context, orderID string, transactionID string, step int32, stepName string, reqPayload interface{}) error {
	reqJSON, _ := json.Marshal(reqPayload)

	saga := &models.SagaTransaction{
		TransactionID:  transactionID,
		OrderID:        orderID,
		Step:           step,
		StepName:       stepName,
		Status:         models.SagaStatusPending,
		Compensated:    false,
		RequestPayload: string(reqJSON),
	}

	return s.repo.CreateSagaTransaction(ctx, saga)
}

func (s *sagaService) tryUpdateOrderStatusWithRetry(ctx context.Context, orderID string, targetStatus int32, operator, remark string, maxRetries int) error {
	var err error
	retryInterval := 200 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		err = s.repo.UpdateStatus(ctx, orderID, targetStatus, operator, remark)
		if err == nil {
			return nil
		}

		order, getErr := s.repo.GetByID(ctx, orderID)
		if getErr != nil || order == nil {
			logger.GetLogger().Error(fmt.Sprintf("Failed to get order %s for status check: %v", orderID, getErr))
			time.Sleep(retryInterval)
			retryInterval *= 2
			continue
		}

		if order.Status == targetStatus {
			logger.GetLogger().Info(fmt.Sprintf("Order %s already in target status %d", orderID, targetStatus))
			return nil
		}

		if !models.IsValidStatusTransition(order.Status, targetStatus) {
			logger.GetLogger().Error(fmt.Sprintf("Invalid status transition for order %s: %d -> %d, current: %d", orderID, order.Status, targetStatus, order.Status))

			if targetStatus == models.OrderStatusCancelled {
				canCancel := order.Status == models.OrderStatusPendingPayment ||
					order.Status == models.OrderStatusPaid ||
					order.Status == models.OrderStatusShipped

				if canCancel {
					logger.GetLogger().Warn(fmt.Sprintf("Forcing cancel order %s from status %d", orderID, order.Status))
					if forceErr := s.forceCancelOrder(ctx, orderID, remark); forceErr != nil {
						logger.GetLogger().Error(fmt.Sprintf("Force cancel failed: %v", forceErr))
					}
					return nil
				}
			}

			return fmt.Errorf("invalid status transition: %d -> %d (current: %d)", order.Status, targetStatus, order.Status)
		}

		logger.GetLogger().Warn(fmt.Sprintf("Failed to update order status (attempt %d/%d): %v, retrying...", i+1, maxRetries, err))
		time.Sleep(retryInterval)
		retryInterval *= 2
	}

	return fmt.Errorf("failed to update order status after %d retries: %v", maxRetries, err)
}

func (s *sagaService) forceCancelOrder(ctx context.Context, orderID, reason string) error {
	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	oldStatus := order.Status
	order.Status = models.OrderStatusCancelled
	if err := s.repo.UpdateOrder(ctx, order); err != nil {
		return err
	}

	return s.repo.UpdateSagaStatus(ctx, uuid.New().String(), 0, models.SagaStatusCompensated, true, fmt.Sprintf("Force cancelled from %d: %s", oldStatus, reason))
}

func (s *sagaService) ExecuteCreateOrderSaga(ctx context.Context, order *models.Order, operationID string) error {
	lock := s.getOrderLock(order.ID)
	lock.Lock()
	defer lock.Unlock()

	transactionID := uuid.New().String()
	cfg := config.AppConfig

	logger.GetLogger().Info(fmt.Sprintf("Starting create order saga, transaction_id: %s, order_id: %s", transactionID, order.ID))

	step1Payload := map[string]interface{}{
		"order_id": order.ID,
		"user_id":  order.UserID,
	}
	if err := s.createSagaTransaction(ctx, order.ID, transactionID, models.SagaStepCreateOrder, "CREATE_ORDER", step1Payload); err != nil {
		return fmt.Errorf("failed to create saga step 1: %v", err)
	}

	if err := s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreateOrder, models.SagaStatusSuccess, false, ""); err != nil {
		return fmt.Errorf("failed to update saga step 1 status: %v", err)
	}

	items := make([]*inventory.DeductItem, 0, len(order.Items))
	for _, item := range order.Items {
		items = append(items, &inventory.DeductItem{
			SkuCode:  item.SKUCode,
			Quantity: item.Quantity,
		})
	}

	step2Payload := map[string]interface{}{
		"order_id": order.ID,
		"items":    items,
	}
	if err := s.createSagaTransaction(ctx, order.ID, transactionID, models.SagaStepDeductInventory, "DEDUCT_INVENTORY", step2Payload); err != nil {
		return fmt.Errorf("failed to create saga step 2: %v", err)
	}

	invConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.InventoryService, 3)
	if err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to get inventory service: %v, starting compensation", err))
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, err.Error())
		compErr := s.compensateCreateOrderSagaWithRetry(ctx, transactionID, order, 1)
		if compErr != nil {
			logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Compensation failed: %v", compErr))
		}
		return err
	}
	defer invConn.Close()

	invClient := inventory.NewInventoryServiceClient(invConn)
	deductResp, err := invClient.BatchDeductInventory(ctx, &inventory.BatchDeductInventoryRequest{
		OrderId: order.ID,
		Items:   items,
	})
	if err != nil || !deductResp.Success {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		} else {
			errMsg = deductResp.Message
		}
		logger.GetLogger().Error(fmt.Sprintf("Inventory deduction failed: %s, starting compensation", errMsg))
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, errMsg)
		compErr := s.compensateCreateOrderSagaWithRetry(ctx, transactionID, order, 1)
		if compErr != nil {
			logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Compensation failed: %v", compErr))
		}
		return errors.New(errMsg)
	}

	respJSON, _ := json.Marshal(deductResp)
	s.repo.Model(&models.SagaTransaction{}).Where("transaction_id = ? AND step = ?", transactionID, models.SagaStepDeductInventory).Update("response_payload", string(respJSON))
	s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusSuccess, false, "")

	orderCreatedEvent := &events.OrderCreatedEvent{
		OrderID:     order.ID,
		UserID:      order.UserID,
		TotalAmount: order.TotalAmount,
		OrderItems:  make([]events.OrderCreatedEventItem, 0, len(order.Items)),
	}
	for _, item := range order.Items {
		orderCreatedEvent.OrderItems = append(orderCreatedEvent.OrderItems, events.OrderCreatedEventItem{
			SKUCode:   item.SKUCode,
			Quantity:  item.Quantity,
			UnitPrice: item.UnitPrice,
		})
	}

	if err := s.producer.Publish(ctx, cfg.Kafka.Topics.OrderCreated, &events.Event{
		EventType: "ORDER_CREATED",
		Payload:   orderCreatedEvent,
		Timestamp: time.Now(),
	}); err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to publish order created event: %v", err))
	}

	logger.GetLogger().Info(fmt.Sprintf("Create order saga completed successfully, transaction_id: %s", transactionID))
	return nil
}

func (s *sagaService) compensateCreateOrderSagaWithRetry(ctx context.Context, transactionID string, order *models.Order, failedStep int32) error {
	var lastErr error
	retryInterval := 1 * time.Second

	for attempt := 1; attempt <= s.compensationRetryMax; attempt++ {
		logger.GetLogger().Warn(fmt.Sprintf("Create order saga compensation attempt %d/%d, transaction_id: %s", attempt, s.compensationRetryMax, transactionID))

		err := s.compensateCreateOrderSaga(ctx, transactionID, order, failedStep)
		if err == nil {
			logger.GetLogger().Info(fmt.Sprintf("Create order saga compensation succeeded on attempt %d", attempt))
			return nil
		}

		lastErr = err
		logger.GetLogger().Error(fmt.Sprintf("Compensation attempt %d failed: %v", attempt, err))

		if attempt < s.compensationRetryMax {
			time.Sleep(retryInterval)
			retryInterval *= 2
		}
	}

	logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Create order saga compensation failed after %d attempts, transaction_id: %s, error: %v", s.compensationRetryMax, transactionID, lastErr))
	return lastErr
}

func (s *sagaService) compensateCreateOrderSaga(ctx context.Context, transactionID string, order *models.Order, failedStep int32) error {
	logger.GetLogger().Warn(fmt.Sprintf("Starting compensation for create order saga, transaction_id: %s, failed_step: %d", transactionID, failedStep))

	cfg := config.AppConfig
	hasError := false

	if failedStep <= 2 {
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusCompensating, false, "")

		invConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.InventoryService, 3)
		if err != nil {
			logger.GetLogger().Error(fmt.Sprintf("Failed to get inventory service for compensation: %v", err))
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, err.Error())
			hasError = true
		} else {
			defer invConn.Close()
			invClient := inventory.NewInventoryServiceClient(invConn)
			rollbackResp, err := invClient.RollbackInventory(ctx, &inventory.RollbackInventoryRequest{
				OrderId: order.ID,
			})
			if err != nil || !rollbackResp.Success {
				errMsg := ""
				if err != nil {
					errMsg = err.Error()
				} else {
					errMsg = rollbackResp.Message
				}
				logger.GetLogger().Error(fmt.Sprintf("Failed to rollback inventory: %s", errMsg))
				s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, errMsg)
				hasError = true
			} else {
				s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusCompensated, true, "")
			}
		}
	}

	if failedStep <= 1 {
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreateOrder, models.SagaStatusCompensating, false, "")

		if err := s.tryUpdateOrderStatusWithRetry(ctx, order.ID, models.OrderStatusCancelled, "SYSTEM", "Saga compensation", 3); err != nil {
			logger.GetLogger().Error(fmt.Sprintf("Failed to cancel order in compensation: %v", err))
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreateOrder, models.SagaStatusFailed, false, err.Error())
			hasError = true
		} else {
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreateOrder, models.SagaStatusCompensated, true, "")
		}
	}

	if hasError {
		return fmt.Errorf("create order saga compensation had errors")
	}

	logger.GetLogger().Warn(fmt.Sprintf("Create order saga compensation completed, transaction_id: %s", transactionID))
	return nil
}

func (s *sagaService) ExecuteCancelOrderSaga(ctx context.Context, orderID string) error {
	lock := s.getOrderLock(orderID)
	lock.Lock()
	defer lock.Unlock()

	cfg := config.AppConfig
	logger.GetLogger().Info(fmt.Sprintf("Starting cancel order saga, order_id: %s", orderID))

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %v", err)
	}
	if order == nil {
		return errors.New("order not found")
	}

	if order.Status == models.OrderStatusCancelled {
		logger.GetLogger().Info(fmt.Sprintf("Order %s already cancelled", orderID))
		return nil
	}

	if order.Status == models.OrderStatusCompleted {
		return errors.New("completed order cannot be cancelled")
	}

	if order.Status == models.OrderStatusPaid || order.Status == models.OrderStatusShipped {
		transactionID := uuid.New().String()

		step3Payload := map[string]interface{}{
			"order_id": orderID,
		}
		s.createSagaTransaction(ctx, orderID, transactionID, models.SagaStepCreatePayment, "REFUND_PAYMENT", step3Payload)

		payConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.PaymentService, 3)
		if err != nil {
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, err.Error())
			return err
		}
		defer payConn.Close()

		payClient := payment.NewPaymentServiceClient(payConn)
		refundResp, err := payClient.RefundPayment(ctx, &payment.RefundPaymentRequest{
			OrderId: orderID,
			Amount:  order.PayAmount,
			Reason:  "Order cancelled",
		})
		if err != nil || !refundResp.Success {
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			} else {
				errMsg = refundResp.Message
			}
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, errMsg)
			return errors.New(errMsg)
		}
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusSuccess, false, "")
	}

	step2Payload := map[string]interface{}{
		"order_id": orderID,
	}
	transactionID := uuid.New().String()
	s.createSagaTransaction(ctx, orderID, transactionID, models.SagaStepDeductInventory, "ROLLBACK_INVENTORY", step2Payload)

	invConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.InventoryService, 3)
	if err != nil {
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, err.Error())
		return err
	}
	defer invConn.Close()

	invClient := inventory.NewInventoryServiceClient(invConn)
	rollbackResp, err := invClient.RollbackInventory(ctx, &inventory.RollbackInventoryRequest{
		OrderId: orderID,
	})
	if err != nil || !rollbackResp.Success {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		} else {
			errMsg = rollbackResp.Message
		}
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusFailed, false, errMsg)
		return errors.New(errMsg)
	}
	s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepDeductInventory, models.SagaStatusSuccess, false, "")

	if err := s.tryUpdateOrderStatusWithRetry(ctx, orderID, models.OrderStatusCancelled, "SYSTEM", "User cancelled", 3); err != nil {
		return fmt.Errorf("failed to cancel order: %v", err)
	}

	if err := s.producer.Publish(ctx, cfg.Kafka.Topics.OrderCancelled, &events.Event{
		EventType: "ORDER_CANCELLED",
		Payload: &events.OrderCancelledEvent{
			OrderID: orderID,
			Reason:  "User cancelled",
		},
		Timestamp: time.Now(),
	}); err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to publish order cancelled event: %v", err))
	}

	logger.GetLogger().Info(fmt.Sprintf("Cancel order saga completed successfully, order_id: %s", orderID))
	return nil
}

func (s *sagaService) ExecutePaymentSaga(ctx context.Context, orderID string, paymentMethod string) error {
	lock := s.getOrderLock(orderID)
	lock.Lock()
	defer lock.Unlock()

	cfg := config.AppConfig
	logger.GetLogger().Info(fmt.Sprintf("Starting payment saga, order_id: %s", orderID))

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %v", err)
	}
	if order == nil {
		return errors.New("order not found")
	}

	if order.Status == models.OrderStatusPaid {
		logger.GetLogger().Info(fmt.Sprintf("Order %s already paid", orderID))
		return nil
	}

	if order.Status != models.OrderStatusPendingPayment {
		return fmt.Errorf("order is not in pending payment status, current status: %d", order.Status)
	}

	transactionID := uuid.New().String()

	step3Payload := map[string]interface{}{
		"order_id":       orderID,
		"user_id":        order.UserID,
		"amount":         order.PayAmount,
		"payment_method": paymentMethod,
	}
	if err := s.createSagaTransaction(ctx, orderID, transactionID, models.SagaStepCreatePayment, "CREATE_PAYMENT", step3Payload); err != nil {
		return fmt.Errorf("failed to create saga step 3: %v", err)
	}

	payConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.PaymentService, 3)
	if err != nil {
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, err.Error())
		return err
	}
	defer payConn.Close()

	payClient := payment.NewPaymentServiceClient(payConn)
	createPayResp, err := payClient.CreatePayment(ctx, &payment.CreatePaymentRequest{
		OrderId:       orderID,
		UserId:        order.UserID,
		Amount:        order.PayAmount,
		PaymentMethod: paymentMethod,
	})
	if err != nil || !createPayResp.Success {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		} else {
			errMsg = createPayResp.Message
		}
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, errMsg)
		return errors.New(errMsg)
	}
	s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusSuccess, false, "")

	paymentID := createPayResp.PaymentId

	processPayResp, err := payClient.GetPayment(ctx, &payment.GetPaymentRequest{
		PaymentId: paymentID,
	})
	if err != nil || !processPayResp.Success {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		} else {
			errMsg = processPayResp.Message
		}
		compErr := s.compensatePaymentSagaWithRetry(ctx, transactionID, order, paymentID)
		if compErr != nil {
			logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Payment compensation failed: %v", compErr))
		}
		return errors.New(errMsg)
	}

	if err := s.tryUpdateOrderStatusWithRetry(ctx, orderID, models.OrderStatusPaid, "SYSTEM", "Payment completed", 3); err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to update order to paid, starting compensation: %v", err))
		compErr := s.compensatePaymentSagaWithRetry(ctx, transactionID, order, paymentID)
		if compErr != nil {
			logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Payment compensation failed: %v", compErr))
		}
		return fmt.Errorf("failed to update order status: %v", err)
	}

	invConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.InventoryService, 3)
	if err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to get inventory service to confirm: %v, will retry later", err))
	} else {
		defer invConn.Close()
		invClient := inventory.NewInventoryServiceClient(invConn)
		confirmResp, err := invClient.ConfirmInventory(ctx, &inventory.ConfirmInventoryRequest{
			OrderId: orderID,
		})
		if err != nil || !confirmResp.Success {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to confirm inventory for order %s: %v, will retry later", orderID, err))
		}
	}

	if err := s.producer.Publish(ctx, cfg.Kafka.Topics.OrderPaid, &events.Event{
		EventType: "ORDER_PAID",
		Payload: &events.OrderPaidEvent{
			OrderID: orderID,
		},
		Timestamp: time.Now(),
	}); err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to publish order paid event: %v", err))
	}

	logger.GetLogger().Info(fmt.Sprintf("Payment saga completed successfully, order_id: %s", orderID))
	return nil
}

func (s *sagaService) compensatePaymentSagaWithRetry(ctx context.Context, transactionID string, order *models.Order, paymentID string) error {
	var lastErr error
	retryInterval := 1 * time.Second

	for attempt := 1; attempt <= s.compensationRetryMax; attempt++ {
		logger.GetLogger().Warn(fmt.Sprintf("Payment saga compensation attempt %d/%d, transaction_id: %s", attempt, s.compensationRetryMax, transactionID))

		err := s.compensatePaymentSaga(ctx, transactionID, order, paymentID)
		if err == nil {
			logger.GetLogger().Info(fmt.Sprintf("Payment saga compensation succeeded on attempt %d", attempt))
			return nil
		}

		lastErr = err
		logger.GetLogger().Error(fmt.Sprintf("Payment compensation attempt %d failed: %v", attempt, err))

		if attempt < s.compensationRetryMax {
			time.Sleep(retryInterval)
			retryInterval *= 2
		}
	}

	logger.GetLogger().Error(fmt.Sprintf("CRITICAL: Payment saga compensation failed after %d attempts, transaction_id: %s, error: %v", s.compensationRetryMax, transactionID, lastErr))
	return lastErr
}

func (s *sagaService) compensatePaymentSaga(ctx context.Context, transactionID string, order *models.Order, paymentID string) error {
	logger.GetLogger().Warn(fmt.Sprintf("Starting compensation for payment saga, transaction_id: %s", transactionID))

	cfg := config.AppConfig
	hasError := false

	s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusCompensating, false, "")

	payConn, err := s.getGRPCConnWithRetry(cfg.ServiceNames.PaymentService, 3)
	if err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to get payment service for compensation: %v", err))
		s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, err.Error())
		hasError = true
	} else {
		defer payConn.Close()
		payClient := payment.NewPaymentServiceClient(payConn)
		refundResp, err := payClient.RefundPayment(ctx, &payment.RefundPaymentRequest{
			PaymentId: paymentID,
			Amount:    order.PayAmount,
			Reason:    "Payment saga compensation",
		})
		if err != nil || !refundResp.Success {
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			} else {
				errMsg = refundResp.Message
			}
			logger.GetLogger().Error(fmt.Sprintf("Failed to refund payment: %s", errMsg))
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusFailed, false, errMsg)
			hasError = true
		} else {
			s.repo.UpdateSagaStatus(ctx, transactionID, models.SagaStepCreatePayment, models.SagaStatusCompensated, true, "")
		}
	}

	if hasError {
		return fmt.Errorf("payment saga compensation had errors")
	}

	logger.GetLogger().Warn(fmt.Sprintf("Payment saga compensation completed, transaction_id: %s", transactionID))
	return nil
}

func (s *sagaService) RetryFailedCompensations(ctx context.Context) int {
	logger.GetLogger().Info("Starting retry of failed compensations")

	retryCount := 0

	query := s.repo.(*orderRepository).db.WithContext(ctx).Model(&models.SagaTransaction{}).
		Where("status IN ?", []string{models.SagaStatusFailed, models.SagaStatusCompensating}).
		Order("created_at ASC")

	var sagas []models.SagaTransaction
	if err := query.Find(&sagas).Error; err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to find failed saga transactions: %v", err))
		return 0
	}

	for _, saga := range sagas {
		order, err := s.repo.GetByID(ctx, saga.OrderID)
		if err != nil || order == nil {
			logger.GetLogger().Warn(fmt.Sprintf("Order %s not found for saga %s", saga.OrderID, saga.TransactionID))
			continue
		}

		if saga.Step == models.SagaStepDeductInventory || saga.Step == models.SagaStepCreateOrder {
			if err := s.compensateCreateOrderSaga(ctx, saga.TransactionID, order, int32(saga.Step)); err == nil {
				retryCount++
				logger.GetLogger().Info(fmt.Sprintf("Successfully retried compensation for saga %s", saga.TransactionID))
			}
		} else if saga.Step == models.SagaStepCreatePayment {
			if err := s.compensatePaymentSaga(ctx, saga.TransactionID, order, ""); err == nil {
				retryCount++
				logger.GetLogger().Info(fmt.Sprintf("Successfully retried payment compensation for saga %s", saga.TransactionID))
			}
		}
	}

	logger.GetLogger().Info(fmt.Sprintf("Retry of failed compensations completed, retried: %d", retryCount))
	return retryCount
}
