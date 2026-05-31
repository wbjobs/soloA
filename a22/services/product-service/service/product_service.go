package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"e-commerce-fulfillment/services/product-service/models"
	"e-commerce-fulfillment/services/product-service/repository"
)

type ProductService interface {
	CreateProduct(ctx context.Context, name, description, category, brand string) (int64, error)
	GetProduct(ctx context.Context, id int64) (*models.Product, error)
	ListProducts(ctx context.Context, page, pageSize int, category, keyword string) ([]models.Product, int64, error)
	UpdateProduct(ctx context.Context, id int64, name, description, category, brand string) error
	DeleteProduct(ctx context.Context, id int64) error

	CreateSKU(ctx context.Context, productID int64, skuCode, attributes string, price float64, stockQuantity int32) (int64, error)
	GetSKU(ctx context.Context, id int64) (*models.SKU, error)
	GetSKUByCode(ctx context.Context, skuCode string) (*models.SKU, error)
	UpdateSKU(ctx context.Context, id int64, attributes string, price float64, stockQuantity int32) error
	DeleteSKU(ctx context.Context, id int64) error
}

type productService struct {
	repo repository.ProductRepository
}

func NewProductService(repo repository.ProductRepository) ProductService {
	return &productService{repo: repo}
}

func (s *productService) CreateProduct(ctx context.Context, name, description, category, brand string) (int64, error) {
	if name == "" {
		return 0, errors.New("product name is required")
	}

	product := &models.Product{
		Name:        name,
		Description: description,
		Category:    category,
		Brand:       brand,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.CreateProduct(ctx, product); err != nil {
		return 0, err
	}

	return product.ID, nil
}

func (s *productService) GetProduct(ctx context.Context, id int64) (*models.Product, error) {
	product, err := s.repo.GetProductByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, errors.New("product not found")
	}
	return product, nil
}

func (s *productService) ListProducts(ctx context.Context, page, pageSize int, category, keyword string) ([]models.Product, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	return s.repo.ListProducts(ctx, page, pageSize, category, keyword)
}

func (s *productService) UpdateProduct(ctx context.Context, id int64, name, description, category, brand string) error {
	product, err := s.repo.GetProductByID(ctx, id)
	if err != nil {
		return err
	}
	if product == nil {
		return errors.New("product not found")
	}

	if name != "" {
		product.Name = name
	}
	if description != "" {
		product.Description = description
	}
	if category != "" {
		product.Category = category
	}
	if brand != "" {
		product.Brand = brand
	}
	product.UpdatedAt = time.Now()

	return s.repo.UpdateProduct(ctx, product)
}

func (s *productService) DeleteProduct(ctx context.Context, id int64) error {
	product, err := s.repo.GetProductByID(ctx, id)
	if err != nil {
		return err
	}
	if product == nil {
		return errors.New("product not found")
	}

	return s.repo.DeleteProduct(ctx, id)
}

func (s *productService) CreateSKU(ctx context.Context, productID int64, skuCode, attributes string, price float64, stockQuantity int32) (int64, error) {
	if skuCode == "" {
		return 0, errors.New("sku code is required")
	}

	product, err := s.repo.GetProductByID(ctx, productID)
	if err != nil {
		return 0, err
	}
	if product == nil {
		return 0, errors.New("product not found")
	}

	existingSKU, err := s.repo.GetSKUByCode(ctx, skuCode)
	if err != nil {
		return 0, err
	}
	if existingSKU != nil {
		return 0, fmt.Errorf("sku code %s already exists", skuCode)
	}

	if price < 0 {
		return 0, errors.New("price cannot be negative")
	}
	if stockQuantity < 0 {
		return 0, errors.New("stock quantity cannot be negative")
	}

	sku := &models.SKU{
		ProductID:     productID,
		SKUCode:       skuCode,
		Attributes:    attributes,
		Price:         price,
		StockQuantity: stockQuantity,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.repo.CreateSKU(ctx, sku); err != nil {
		return 0, err
	}

	return sku.ID, nil
}

func (s *productService) GetSKU(ctx context.Context, id int64) (*models.SKU, error) {
	sku, err := s.repo.GetSKUByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if sku == nil {
		return nil, errors.New("sku not found")
	}
	return sku, nil
}

func (s *productService) GetSKUByCode(ctx context.Context, skuCode string) (*models.SKU, error) {
	sku, err := s.repo.GetSKUByCode(ctx, skuCode)
	if err != nil {
		return nil, err
	}
	if sku == nil {
		return nil, errors.New("sku not found")
	}
	return sku, nil
}

func (s *productService) UpdateSKU(ctx context.Context, id int64, attributes string, price float64, stockQuantity int32) error {
	sku, err := s.repo.GetSKUByID(ctx, id)
	if err != nil {
		return err
	}
	if sku == nil {
		return errors.New("sku not found")
	}

	if attributes != "" {
		sku.Attributes = attributes
	}
	if price >= 0 {
		sku.Price = price
	}
	if stockQuantity >= 0 {
		sku.StockQuantity = stockQuantity
	}
	sku.UpdatedAt = time.Now()

	return s.repo.UpdateSKU(ctx, sku)
}

func (s *productService) DeleteSKU(ctx context.Context, id int64) error {
	sku, err := s.repo.GetSKUByID(ctx, id)
	if err != nil {
		return err
	}
	if sku == nil {
		return errors.New("sku not found")
	}

	return s.repo.DeleteSKU(ctx, id)
}
