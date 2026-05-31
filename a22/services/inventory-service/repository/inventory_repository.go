package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"e-commerce-fulfillment/services/inventory-service/models"
)

type InventoryRepository interface {
	GetBySKUCode(ctx context.Context, skuCode string) (*models.Inventory, error)
	Create(ctx context.Context, inventory *models.Inventory) error
	Update(ctx context.Context, inventory *models.Inventory) error
	SetQuantity(ctx context.Context, skuCode string, quantity int32) error

	DeductWithTx(ctx context.Context, skuCode string, quantity int32, operationID, orderID string) error
	RollbackWithTx(ctx context.Context, operationID, orderID string) error
	ConfirmWithTx(ctx context.Context, operationID, orderID string) error

	CreateOperation(ctx context.Context, operation *models.InventoryOperation) error
	UpdateOperation(ctx context.Context, operation *models.InventoryOperation) error
	GetOperationByID(ctx context.Context, operationID string) (*models.InventoryOperation, error)
	GetOperationsByOrderID(ctx context.Context, orderID string) ([]models.InventoryOperation, error)
}

type inventoryRepository struct {
	db *gorm.DB
}

func NewInventoryRepository(db *gorm.DB) InventoryRepository {
	return &inventoryRepository{db: db}
}

func (r *inventoryRepository) GetBySKUCode(ctx context.Context, skuCode string) (*models.Inventory, error) {
	var inventory models.Inventory
	result := r.db.WithContext(ctx).Where("sku_code = ?", skuCode).First(&inventory)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get inventory: %v", result.Error)
	}
	return &inventory, nil
}

func (r *inventoryRepository) Create(ctx context.Context, inventory *models.Inventory) error {
	result := r.db.WithContext(ctx).Create(inventory)
	if result.Error != nil {
		return fmt.Errorf("failed to create inventory: %v", result.Error)
	}
	return nil
}

func (r *inventoryRepository) Update(ctx context.Context, inventory *models.Inventory) error {
	result := r.db.WithContext(ctx).Save(inventory)
	if result.Error != nil {
		return fmt.Errorf("failed to update inventory: %v", result.Error)
	}
	return nil
}

func (r *inventoryRepository) SetQuantity(ctx context.Context, skuCode string, quantity int32) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var inventory models.Inventory
		result := tx.Where("sku_code = ?", skuCode).First(&inventory)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrRecordNotFound) {
				inventory = models.Inventory{
					SKUCode:           skuCode,
					AvailableQuantity: quantity,
					FrozenQuantity:    0,
					SoldQuantity:      0,
				}
				if err := tx.Create(&inventory).Error; err != nil {
					return fmt.Errorf("failed to create inventory: %v", err)
				}
				return nil
			}
			return fmt.Errorf("failed to get inventory: %v", result.Error)
		}

		inventory.AvailableQuantity = quantity
		if err := tx.Save(&inventory).Error; err != nil {
			return fmt.Errorf("failed to update inventory: %v", err)
		}
		return nil
	})
}

func (r *inventoryRepository) DeductWithTx(ctx context.Context, skuCode string, quantity int32, operationID, orderID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Exec(`
			UPDATE inventories 
			SET available_quantity = available_quantity - ?,
			    frozen_quantity = frozen_quantity + ?,
			    updated_at = NOW()
			WHERE sku_code = ? AND available_quantity >= ?
		`, quantity, quantity, skuCode, quantity)

		if result.Error != nil {
			return fmt.Errorf("failed to update inventory: %v", result.Error)
		}

		if result.RowsAffected == 0 {
			var inventory models.Inventory
			checkResult := tx.Where("sku_code = ?", skuCode).First(&inventory)
			if checkResult.Error != nil {
				if errors.Is(checkResult.Error, gorm.ErrRecordNotFound) {
					return fmt.Errorf("inventory not found for sku: %s", skuCode)
				}
				return fmt.Errorf("failed to get inventory: %v", checkResult.Error)
			}
			return fmt.Errorf("insufficient inventory for sku: %s, available: %d, required: %d", skuCode, inventory.AvailableQuantity, quantity)
		}

		var existingOp models.InventoryOperation
		checkOpResult := tx.Where("operation_id = ?", operationID).First(&existingOp)
		if checkOpResult.Error == nil {
			return nil
		}
		if !errors.Is(checkOpResult.Error, gorm.ErrRecordNotFound) {
			return fmt.Errorf("failed to check existing operation: %v", checkOpResult.Error)
		}

		operation := &models.InventoryOperation{
			OperationID:   operationID,
			OrderID:       orderID,
			SKUCode:       skuCode,
			Quantity:      quantity,
			OperationType: models.OperationTypeDeduct,
			Status:        models.OperationStatusPending,
		}
		if err := tx.Create(operation).Error; err != nil {
			return fmt.Errorf("failed to create operation: %v", err)
		}

		return nil
	})
}

func (r *inventoryRepository) RollbackWithTx(ctx context.Context, operationID, orderID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operations []models.InventoryOperation
		query := tx.Clauses(clause.Locking{Strength: "UPDATE"})
		if operationID != "" {
			query = query.Where("operation_id = ?", operationID)
		}
		if orderID != "" {
			query = query.Where("order_id = ?", orderID)
		}
		query = query.Where("operation_type = ? AND status IN (?, ?)", models.OperationTypeDeduct, models.OperationStatusPending, models.OperationStatusSuccess)

		result := query.Find(&operations)
		if result.Error != nil {
			return fmt.Errorf("failed to find operations: %v", result.Error)
		}

		if len(operations) == 0 {
			return nil
		}

		for _, op := range operations {
			updateResult := tx.Exec(`
				UPDATE inventories 
				SET frozen_quantity = frozen_quantity - ?,
				    available_quantity = available_quantity + ?,
				    updated_at = NOW()
				WHERE sku_code = ? AND frozen_quantity >= ?
			`, op.Quantity, op.Quantity, op.SKUCode, op.Quantity)

			if updateResult.Error != nil {
				return fmt.Errorf("failed to update inventory for sku %s: %v", op.SKUCode, updateResult.Error)
			}

			if updateResult.RowsAffected == 0 {
				var inventory models.Inventory
				checkResult := tx.Where("sku_code = ?", op.SKUCode).First(&inventory)
				if checkResult.Error != nil {
					return fmt.Errorf("failed to get inventory for sku %s: %v", op.SKUCode, checkResult.Error)
				}
				if inventory.FrozenQuantity < op.Quantity {
					return fmt.Errorf("insufficient frozen inventory for sku %s: frozen=%d, required=%d", op.SKUCode, inventory.FrozenQuantity, op.Quantity)
				}
			}

			updateOpResult := tx.Model(&models.InventoryOperation{}).
				Where("id = ? AND status != ?", op.ID, models.OperationStatusRolledBack).
				Update("status", models.OperationStatusRolledBack)

			if updateOpResult.Error != nil {
				return fmt.Errorf("failed to update operation status: %v", updateOpResult.Error)
			}
		}

		return nil
	})
}

func (r *inventoryRepository) ConfirmWithTx(ctx context.Context, operationID, orderID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operations []models.InventoryOperation
		query := tx.Clauses(clause.Locking{Strength: "UPDATE"})
		if operationID != "" {
			query = query.Where("operation_id = ?", operationID)
		}
		if orderID != "" {
			query = query.Where("order_id = ?", orderID)
		}
		query = query.Where("operation_type = ? AND status = ?", models.OperationTypeDeduct, models.OperationStatusPending)

		result := query.Find(&operations)
		if result.Error != nil {
			return fmt.Errorf("failed to find operations: %v", result.Error)
		}

		if len(operations) == 0 {
			return nil
		}

		for _, op := range operations {
			updateResult := tx.Exec(`
				UPDATE inventories 
				SET frozen_quantity = frozen_quantity - ?,
				    sold_quantity = sold_quantity + ?,
				    updated_at = NOW()
				WHERE sku_code = ? AND frozen_quantity >= ?
			`, op.Quantity, op.Quantity, op.SKUCode, op.Quantity)

			if updateResult.Error != nil {
				return fmt.Errorf("failed to update inventory for sku %s: %v", op.SKUCode, updateResult.Error)
			}

			if updateResult.RowsAffected == 0 {
				var inventory models.Inventory
				checkResult := tx.Where("sku_code = ?", op.SKUCode).First(&inventory)
				if checkResult.Error != nil {
					return fmt.Errorf("failed to get inventory for sku %s: %v", op.SKUCode, checkResult.Error)
				}
				if inventory.FrozenQuantity < op.Quantity {
					return fmt.Errorf("insufficient frozen inventory for sku %s: frozen=%d, required=%d", op.SKUCode, inventory.FrozenQuantity, op.Quantity)
				}
			}

			updateOpResult := tx.Model(&models.InventoryOperation{}).
				Where("id = ? AND status != ?", op.ID, models.OperationStatusSuccess).
				Update("status", models.OperationStatusSuccess)

			if updateOpResult.Error != nil {
				return fmt.Errorf("failed to update operation status: %v", updateOpResult.Error)
			}
		}

		return nil
	})
}

func (r *inventoryRepository) CreateOperation(ctx context.Context, operation *models.InventoryOperation) error {
	result := r.db.WithContext(ctx).Create(operation)
	if result.Error != nil {
		return fmt.Errorf("failed to create operation: %v", result.Error)
	}
	return nil
}

func (r *inventoryRepository) UpdateOperation(ctx context.Context, operation *models.InventoryOperation) error {
	result := r.db.WithContext(ctx).Save(operation)
	if result.Error != nil {
		return fmt.Errorf("failed to update operation: %v", result.Error)
	}
	return nil
}

func (r *inventoryRepository) GetOperationByID(ctx context.Context, operationID string) (*models.InventoryOperation, error) {
	var operation models.InventoryOperation
	result := r.db.WithContext(ctx).Where("operation_id = ?", operationID).First(&operation)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get operation: %v", result.Error)
	}
	return &operation, nil
}

func (r *inventoryRepository) GetOperationsByOrderID(ctx context.Context, orderID string) ([]models.InventoryOperation, error) {
	var operations []models.InventoryOperation
	result := r.db.WithContext(ctx).Where("order_id = ?", orderID).Find(&operations)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get operations: %v", result.Error)
	}
	return operations, nil
}
