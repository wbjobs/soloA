package repository

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"e-commerce-fulfillment/services/inventory-service/models"
)

type WarehouseRepository interface {
	GetByID(ctx context.Context, id int64) (*models.Warehouse, error)
	GetByCode(ctx context.Context, code string) (*models.Warehouse, error)
	GetByCity(ctx context.Context, city string) ([]*models.Warehouse, error)
	GetByProvince(ctx context.Context, province string) ([]*models.Warehouse, error)
	GetAllActive(ctx context.Context) ([]*models.Warehouse, error)
	Create(ctx context.Context, warehouse *models.Warehouse) error
	Update(ctx context.Context, warehouse *models.Warehouse) error

	GetWarehouseInventoriesBySKU(ctx context.Context, skuCode string) ([]*models.WarehouseInventory, error)
	GetWarehouseInventory(ctx context.Context, warehouseID int64, skuCode string) (*models.WarehouseInventory, error)
	CreateWarehouseInventory(ctx context.Context, inventory *models.WarehouseInventory) error
	UpdateWarehouseInventory(ctx context.Context, inventory *models.WarehouseInventory) error

	DeductWithWarehouseTx(ctx context.Context, warehouseID int64, skuCode string, quantity int32, operationID, orderID string) error
	RollbackWithWarehouseTx(ctx context.Context, warehouseID int64, operationID, orderID string) error
}

type warehouseRepository struct {
	db *gorm.DB
}

func NewWarehouseRepository(db *gorm.DB) WarehouseRepository {
	return &warehouseRepository{db: db}
}

func (r *warehouseRepository) GetByID(ctx context.Context, id int64) (*models.Warehouse, error) {
	var warehouse models.Warehouse
	result := r.db.WithContext(ctx).First(&warehouse, id)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get warehouse: %v", result.Error)
	}
	return &warehouse, nil
}

func (r *warehouseRepository) GetByCode(ctx context.Context, code string) (*models.Warehouse, error) {
	var warehouse models.Warehouse
	result := r.db.WithContext(ctx).Where("code = ?", code).First(&warehouse)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get warehouse by code: %v", result.Error)
	}
	return &warehouse, nil
}

func (r *warehouseRepository) GetByCity(ctx context.Context, city string) ([]*models.Warehouse, error) {
	var warehouses []*models.Warehouse
	result := r.db.WithContext(ctx).
		Where("city LIKE ? AND is_active = ?", "%"+city+"%", true).
		Order("priority DESC").
		Find(&warehouses)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get warehouses by city: %v", result.Error)
	}
	return warehouses, nil
}

func (r *warehouseRepository) GetByProvince(ctx context.Context, province string) ([]*models.Warehouse, error) {
	var warehouses []*models.Warehouse
	result := r.db.WithContext(ctx).
		Where("province LIKE ? AND is_active = ?", "%"+province+"%", true).
		Order("priority DESC").
		Find(&warehouses)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get warehouses by province: %v", result.Error)
	}
	return warehouses, nil
}

func (r *warehouseRepository) GetAllActive(ctx context.Context) ([]*models.Warehouse, error) {
	var warehouses []*models.Warehouse
	result := r.db.WithContext(ctx).
		Where("is_active = ?", true).
		Order("priority DESC").
		Find(&warehouses)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get active warehouses: %v", result.Error)
	}
	return warehouses, nil
}

func (r *warehouseRepository) Create(ctx context.Context, warehouse *models.Warehouse) error {
	result := r.db.WithContext(ctx).Create(warehouse)
	if result.Error != nil {
		return fmt.Errorf("failed to create warehouse: %v", result.Error)
	}
	return nil
}

func (r *warehouseRepository) Update(ctx context.Context, warehouse *models.Warehouse) error {
	result := r.db.WithContext(ctx).Save(warehouse)
	if result.Error != nil {
		return fmt.Errorf("failed to update warehouse: %v", result.Error)
	}
	return nil
}

func (r *warehouseRepository) GetWarehouseInventoriesBySKU(ctx context.Context, skuCode string) ([]*models.WarehouseInventory, error) {
	var inventories []*models.WarehouseInventory
	result := r.db.WithContext(ctx).
		Where("sku_code = ? AND available_quantity > 0", skuCode).
		Order("available_quantity DESC").
		Find(&inventories)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to get warehouse inventories by sku: %v", result.Error)
	}
	return inventories, nil
}

func (r *warehouseRepository) GetWarehouseInventory(ctx context.Context, warehouseID int64, skuCode string) (*models.WarehouseInventory, error) {
	var inventory models.WarehouseInventory
	result := r.db.WithContext(ctx).
		Where("warehouse_id = ? AND sku_code = ?", warehouseID, skuCode).
		First(&inventory)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get warehouse inventory: %v", result.Error)
	}
	return &inventory, nil
}

func (r *warehouseRepository) CreateWarehouseInventory(ctx context.Context, inventory *models.WarehouseInventory) error {
	result := r.db.WithContext(ctx).Create(inventory)
	if result.Error != nil {
		return fmt.Errorf("failed to create warehouse inventory: %v", result.Error)
	}
	return nil
}

func (r *warehouseRepository) UpdateWarehouseInventory(ctx context.Context, inventory *models.WarehouseInventory) error {
	result := r.db.WithContext(ctx).Save(inventory)
	if result.Error != nil {
		return fmt.Errorf("failed to update warehouse inventory: %v", result.Error)
	}
	return nil
}

func (r *warehouseRepository) DeductWithWarehouseTx(ctx context.Context, warehouseID int64, skuCode string, quantity int32, operationID, orderID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Exec(`
			UPDATE warehouse_inventories 
			SET available_quantity = available_quantity - ?,
			    frozen_quantity = frozen_quantity + ?,
			    updated_at = NOW()
			WHERE warehouse_id = ? AND sku_code = ? AND available_quantity >= ?
		`, quantity, quantity, warehouseID, skuCode, quantity)

		if result.Error != nil {
			return fmt.Errorf("failed to update warehouse inventory: %v", result.Error)
		}

		if result.RowsAffected == 0 {
			var inv models.WarehouseInventory
			checkResult := tx.Where("warehouse_id = ? AND sku_code = ?", warehouseID, skuCode).First(&inv)
			if checkResult.Error != nil {
				if checkResult.Error == gorm.ErrRecordNotFound {
					return fmt.Errorf("warehouse inventory not found for warehouse %d, sku: %s", warehouseID, skuCode)
				}
				return fmt.Errorf("failed to get warehouse inventory: %v", checkResult.Error)
			}
			return fmt.Errorf("insufficient inventory in warehouse %d for sku: %s, available: %d, required: %d", warehouseID, skuCode, inv.AvailableQuantity, quantity)
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

func (r *warehouseRepository) RollbackWithWarehouseTx(ctx context.Context, warehouseID int64, operationID, orderID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operations []models.InventoryOperation
		query := tx.Clauses(gorm.Clause{
			Expression: gorm.Expr("SELECT * FROM inventory_operations WHERE operation_id = ? OR order_id = ? FOR UPDATE", operationID, orderID),
		})

		if operationID != "" {
			query = tx.Where("operation_id = ?", operationID)
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
				UPDATE warehouse_inventories 
				SET frozen_quantity = frozen_quantity - ?,
				    available_quantity = available_quantity + ?,
				    updated_at = NOW()
				WHERE warehouse_id = ? AND sku_code = ? AND frozen_quantity >= ?
			`, op.Quantity, op.Quantity, warehouseID, op.SKUCode, op.Quantity)

			if updateResult.Error != nil {
				return fmt.Errorf("failed to update warehouse inventory for sku %s: %v", op.SKUCode, updateResult.Error)
			}

			tx.Model(&models.InventoryOperation{}).
				Where("id = ? AND status != ?", op.ID, models.OperationStatusRolledBack).
				Update("status", models.OperationStatusRolledBack)
		}

		return nil
	})
}
