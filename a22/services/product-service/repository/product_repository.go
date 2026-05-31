package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"e-commerce-fulfillment/services/product-service/models"
)

type ProductRepository interface {
	CreateProduct(ctx context.Context, product *models.Product) error
	GetProductByID(ctx context.Context, id int64) (*models.Product, error)
	ListProducts(ctx context.Context, page, pageSize int, category, keyword string) ([]models.Product, int64, error)
	UpdateProduct(ctx context.Context, product *models.Product) error
	DeleteProduct(ctx context.Context, id int64) error

	CreateSKU(ctx context.Context, sku *models.SKU) error
	GetSKUByID(ctx context.Context, id int64) (*models.SKU, error)
	GetSKUByCode(ctx context.Context, skuCode string) (*models.SKU, error)
	UpdateSKU(ctx context.Context, sku *models.SKU) error
	DeleteSKU(ctx context.Context, id int64) error
}

type productRepository struct {
	db *gorm.DB
}

func NewProductRepository(db *gorm.DB) ProductRepository {
	return &productRepository{db: db}
}

func (r *productRepository) CreateProduct(ctx context.Context, product *models.Product) error {
	result := r.db.WithContext(ctx).Create(product)
	if result.Error != nil {
		return fmt.Errorf("failed to create product: %v", result.Error)
	}
	return nil
}

func (r *productRepository) GetProductByID(ctx context.Context, id int64) (*models.Product, error) {
	var product models.Product
	result := r.db.WithContext(ctx).Preload("SKUs").First(&product, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get product: %v", result.Error)
	}
	return &product, nil
}

func (r *productRepository) ListProducts(ctx context.Context, page, pageSize int, category, keyword string) ([]models.Product, int64, error) {
	var products []models.Product
	var total int64

	query := r.db.WithContext(ctx).Model(&models.Product{})

	if category != "" {
		query = query.Where("category = ?", category)
	}
	if keyword != "" {
		query = query.Where("name LIKE ? OR description LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count products: %v", err)
	}

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := query.Preload("SKUs").Offset(offset).Limit(pageSize).Find(&products).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list products: %v", err)
	}

	return products, total, nil
}

func (r *productRepository) UpdateProduct(ctx context.Context, product *models.Product) error {
	result := r.db.WithContext(ctx).Save(product)
	if result.Error != nil {
		return fmt.Errorf("failed to update product: %v", result.Error)
	}
	return nil
}

func (r *productRepository) DeleteProduct(ctx context.Context, id int64) error {
	result := r.db.WithContext(ctx).Delete(&models.Product{}, id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete product: %v", result.Error)
	}
	return nil
}

func (r *productRepository) CreateSKU(ctx context.Context, sku *models.SKU) error {
	result := r.db.WithContext(ctx).Create(sku)
	if result.Error != nil {
		return fmt.Errorf("failed to create sku: %v", result.Error)
	}
	return nil
}

func (r *productRepository) GetSKUByID(ctx context.Context, id int64) (*models.SKU, error) {
	var sku models.SKU
	result := r.db.WithContext(ctx).First(&sku, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get sku: %v", result.Error)
	}
	return &sku, nil
}

func (r *productRepository) GetSKUByCode(ctx context.Context, skuCode string) (*models.SKU, error) {
	var sku models.SKU
	result := r.db.WithContext(ctx).Where("sku_code = ?", skuCode).First(&sku)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get sku by code: %v", result.Error)
	}
	return &sku, nil
}

func (r *productRepository) UpdateSKU(ctx context.Context, sku *models.SKU) error {
	result := r.db.WithContext(ctx).Save(sku)
	if result.Error != nil {
		return fmt.Errorf("failed to update sku: %v", result.Error)
	}
	return nil
}

func (r *productRepository) DeleteSKU(ctx context.Context, id int64) error {
	result := r.db.WithContext(ctx).Delete(&models.SKU{}, id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete sku: %v", result.Error)
	}
	return nil
}
