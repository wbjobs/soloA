package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/inventory-service/models"
	"e-commerce-fulfillment/services/inventory-service/repository"
)

type InventoryService interface {
	DeductInventory(ctx context.Context, skuCode string, quantity int32, orderID, operationID string) error
	RollbackInventory(ctx context.Context, operationID, orderID string) error
	ConfirmInventory(ctx context.Context, operationID, orderID string) error
	GetInventory(ctx context.Context, skuCode string) (*models.Inventory, error)
	SetInventory(ctx context.Context, skuCode string, quantity int32) error
	BatchDeductInventory(ctx context.Context, orderID string, items []DeductItem) (string, error)
	IsOperationExecuted(ctx context.Context, operationID, orderID string) (bool, error)
}

type DeductItem struct {
	SKUCode  string
	Quantity int32
}

type inventoryService struct {
	repo  repository.InventoryRepository
	redis *redis.Client
}

func NewInventoryService(repo repository.InventoryRepository, redis *redis.Client) InventoryService {
	return &inventoryService{
		repo:  repo,
		redis: redis,
	}
}

func (s *inventoryService) acquireLock(ctx context.Context, skuCode string) (string, error) {
	lockKey := fmt.Sprintf("inventory:lock:%s", skuCode)
	lockValue := uuid.New().String()
	lockTimeout := 15 * time.Second
	maxRetry := 10
	retryInterval := 100 * time.Millisecond

	for i := 0; i < maxRetry; i++ {
		success, err := s.redis.SetNX(ctx, lockKey, lockValue, lockTimeout).Result()
		if err != nil {
			return "", fmt.Errorf("failed to acquire lock: %v", err)
		}
		if success {
			return lockValue, nil
		}

		if i < maxRetry-1 {
			time.Sleep(retryInterval)
			retryInterval *= 2
		}
	}

	return "", errors.New("failed to acquire lock after max retries, please retry later")
}

func (s *inventoryService) releaseLock(ctx context.Context, skuCode, lockValue string) {
	lockKey := fmt.Sprintf("inventory:lock:%s", skuCode)

	script := `
	if redis.call("GET", KEYS[1]) == ARGV[1] then
		return redis.call("DEL", KEYS[1])
	else
		return 0
	end
	`

	_, err := s.redis.Eval(ctx, script, []string{lockKey}, lockValue).Result()
	if err != nil {
		logger.GetLogger().Warn(fmt.Sprintf("Failed to release lock for %s: %v", skuCode, err))
	}
}

func (s *inventoryService) IsOperationExecuted(ctx context.Context, operationID, orderID string) (bool, error) {
	if operationID != "" {
		op, err := s.repo.GetOperationByID(ctx, operationID)
		if err != nil {
			return false, err
		}
		if op != nil {
			return true, nil
		}
	}

	if orderID != "" {
		ops, err := s.repo.GetOperationsByOrderID(ctx, orderID)
		if err != nil {
			return false, err
		}
		if len(ops) > 0 {
			return true, nil
		}
	}

	return false, nil
}

func (s *inventoryService) DeductInventory(ctx context.Context, skuCode string, quantity int32, orderID, operationID string) error {
	if skuCode == "" {
		return errors.New("sku code is required")
	}
	if quantity <= 0 {
		return errors.New("quantity must be positive")
	}

	if operationID == "" {
		operationID = uuid.New().String()
	}

	executed, err := s.IsOperationExecuted(ctx, operationID, "")
	if err != nil {
		return err
	}
	if executed {
		logger.GetLogger().Info(fmt.Sprintf("Operation %s already executed, skipping deduct", operationID))
		return nil
	}

	lockValue, err := s.acquireLock(ctx, skuCode)
	if err != nil {
		return err
	}
	defer s.releaseLock(ctx, skuCode, lockValue)

	return s.repo.DeductWithTx(ctx, skuCode, quantity, operationID, orderID)
}

func (s *inventoryService) BatchDeductInventory(ctx context.Context, orderID string, items []DeductItem) (string, error) {
	if orderID == "" {
		return "", errors.New("order id is required")
	}
	if len(items) == 0 {
		return "", errors.New("items cannot be empty")
	}

	operationID := uuid.New().String()

	executed, err := s.IsOperationExecuted(ctx, "", orderID)
	if err != nil {
		return "", err
	}
	if executed {
		logger.GetLogger().Info(fmt.Sprintf("Order %s already deducted, skipping batch deduct", orderID))
		return operationID, nil
	}

	sortedItems := make([]DeductItem, len(items))
	copy(sortedItems, items)
	for i := 0; i < len(sortedItems)-1; i++ {
		for j := 0; j < len(sortedItems)-i-1; j++ {
			if sortedItems[j].SKUCode > sortedItems[j+1].SKUCode {
				sortedItems[j], sortedItems[j+1] = sortedItems[j+1], sortedItems[j]
			}
		}
	}

	executedItems := make([]string, 0)
	for _, item := range sortedItems {
		itemOpID := fmt.Sprintf("%s_%s", operationID, item.SKUCode)

		itemExecuted, err := s.IsOperationExecuted(ctx, itemOpID, "")
		if err != nil {
			return operationID, err
		}
		if itemExecuted {
			executedItems = append(executedItems, item.SKUCode)
			continue
		}

		if err := s.DeductInventory(ctx, item.SKUCode, item.Quantity, orderID, itemOpID); err != nil {
			logger.GetLogger().Error(fmt.Sprintf("Failed to deduct %s, rolling back executed items: %v", item.SKUCode, executedItems))

			for _, executedSKU := range executedItems {
				rollbackOpID := fmt.Sprintf("%s_%s", operationID, executedSKU)
				rollbackErr := s.RollbackInventory(ctx, rollbackOpID, "")
				if rollbackErr != nil {
					logger.GetLogger().Error(fmt.Sprintf("Critical: Failed to rollback %s: %v", executedSKU, rollbackErr))
				}
			}

			return "", err
		}

		executedItems = append(executedItems, item.SKUCode)
	}

	return operationID, nil
}

func (s *inventoryService) RollbackInventory(ctx context.Context, operationID, orderID string) error {
	if operationID == "" && orderID == "" {
		return errors.New("operation id or order id is required")
	}

	return s.repo.RollbackWithTx(ctx, operationID, orderID)
}

func (s *inventoryService) ConfirmInventory(ctx context.Context, operationID, orderID string) error {
	if operationID == "" && orderID == "" {
		return errors.New("operation id or order id is required")
	}

	return s.repo.ConfirmWithTx(ctx, operationID, orderID)
}

func (s *inventoryService) GetInventory(ctx context.Context, skuCode string) (*models.Inventory, error) {
	if skuCode == "" {
		return nil, errors.New("sku code is required")
	}

	inventory, err := s.repo.GetBySKUCode(ctx, skuCode)
	if err != nil {
		return nil, err
	}
	if inventory == nil {
		return nil, errors.New("inventory not found")
	}

	return inventory, nil
}

func (s *inventoryService) SetInventory(ctx context.Context, skuCode string, quantity int32) error {
	if skuCode == "" {
		return errors.New("sku code is required")
	}
	if quantity < 0 {
		return errors.New("quantity cannot be negative")
	}

	return s.repo.SetQuantity(ctx, skuCode, quantity)
}
