package handler

import (
	"context"

	"e-commerce-fulfillment/proto/product"
	"e-commerce-fulfillment/services/product-service/service"
)

type ProductHandler struct {
	product.UnimplementedProductServiceServer
	productService service.ProductService
}

func NewProductHandler(productService service.ProductService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
	}
}

func (h *ProductHandler) CreateProduct(ctx context.Context, req *product.CreateProductRequest) (*product.CreateProductResponse, error) {
	productID, err := h.productService.CreateProduct(ctx, req.Name, req.Description, req.Category, req.Brand)
	if err != nil {
		return &product.CreateProductResponse{
			Success:   false,
			Message:   err.Error(),
			ProductId: 0,
		}, nil
	}

	return &product.CreateProductResponse{
		Success:   true,
		Message:   "Product created successfully",
		ProductId: productID,
	}, nil
}

func (h *ProductHandler) GetProduct(ctx context.Context, req *product.GetProductRequest) (*product.GetProductResponse, error) {
	productModel, err := h.productService.GetProduct(ctx, req.ProductId)
	if err != nil {
		return &product.GetProductResponse{
			Success: false,
			Message: err.Error(),
			Product: nil,
		}, nil
	}

	skus := make([]*product.SKU, 0, len(productModel.SKUs))
	for _, sku := range productModel.SKUs {
		skus = append(skus, &product.SKU{
			Id:            sku.ID,
			ProductId:     sku.ProductID,
			SkuCode:       sku.SKUCode,
			Attributes:    sku.Attributes,
			Price:         sku.Price,
			StockQuantity: sku.StockQuantity,
			CreatedAt:     sku.CreatedAt.Unix(),
			UpdatedAt:     sku.UpdatedAt.Unix(),
		})
	}

	return &product.GetProductResponse{
		Success: true,
		Message: "Product retrieved successfully",
		Product: &product.Product{
			Id:          productModel.ID,
			Name:        productModel.Name,
			Description: productModel.Description,
			Category:    productModel.Category,
			Brand:       productModel.Brand,
			CreatedAt:   productModel.CreatedAt.Unix(),
			UpdatedAt:   productModel.UpdatedAt.Unix(),
			Skus:        skus,
		},
	}, nil
}

func (h *ProductHandler) ListProducts(ctx context.Context, req *product.ListProductsRequest) (*product.ListProductsResponse, error) {
	products, total, err := h.productService.ListProducts(ctx, int(req.Page), int(req.PageSize), req.Category, req.Keyword)
	if err != nil {
		return &product.ListProductsResponse{
			Success:  false,
			Message:  err.Error(),
			Products: nil,
			Total:    0,
		}, nil
	}

	productList := make([]*product.Product, 0, len(products))
	for _, p := range products {
		skus := make([]*product.SKU, 0, len(p.SKUs))
		for _, sku := range p.SKUs {
			skus = append(skus, &product.SKU{
				Id:            sku.ID,
				ProductId:     sku.ProductID,
				SkuCode:       sku.SKUCode,
				Attributes:    sku.Attributes,
				Price:         sku.Price,
				StockQuantity: sku.StockQuantity,
				CreatedAt:     sku.CreatedAt.Unix(),
				UpdatedAt:     sku.UpdatedAt.Unix(),
			})
		}

		productList = append(productList, &product.Product{
			Id:          p.ID,
			Name:        p.Name,
			Description: p.Description,
			Category:    p.Category,
			Brand:       p.Brand,
			CreatedAt:   p.CreatedAt.Unix(),
			UpdatedAt:   p.UpdatedAt.Unix(),
			Skus:        skus,
		})
	}

	return &product.ListProductsResponse{
		Success:  true,
		Message:  "Products listed successfully",
		Products: productList,
		Total:    total,
	}, nil
}

func (h *ProductHandler) UpdateProduct(ctx context.Context, req *product.UpdateProductRequest) (*product.UpdateProductResponse, error) {
	err := h.productService.UpdateProduct(ctx, req.ProductId, req.Name, req.Description, req.Category, req.Brand)
	if err != nil {
		return &product.UpdateProductResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &product.UpdateProductResponse{
		Success: true,
		Message: "Product updated successfully",
	}, nil
}

func (h *ProductHandler) DeleteProduct(ctx context.Context, req *product.DeleteProductRequest) (*product.DeleteProductResponse, error) {
	err := h.productService.DeleteProduct(ctx, req.ProductId)
	if err != nil {
		return &product.DeleteProductResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &product.DeleteProductResponse{
		Success: true,
		Message: "Product deleted successfully",
	}, nil
}

func (h *ProductHandler) CreateSKU(ctx context.Context, req *product.CreateSKURequest) (*product.CreateSKUResponse, error) {
	skuID, err := h.productService.CreateSKU(ctx, req.ProductId, req.SkuCode, req.Attributes, req.Price, req.StockQuantity)
	if err != nil {
		return &product.CreateSKUResponse{
			Success: false,
			Message: err.Error(),
			SkuId:   0,
		}, nil
	}

	return &product.CreateSKUResponse{
		Success: true,
		Message: "SKU created successfully",
		SkuId:   skuID,
	}, nil
}

func (h *ProductHandler) GetSKU(ctx context.Context, req *product.GetSKURequest) (*product.GetSKUResponse, error) {
	sku, err := h.productService.GetSKU(ctx, req.SkuId)
	if err != nil {
		return &product.GetSKUResponse{
			Success: false,
			Message: err.Error(),
			Sku:     nil,
		}, nil
	}

	return &product.GetSKUResponse{
		Success: true,
		Message: "SKU retrieved successfully",
		Sku: &product.SKU{
			Id:            sku.ID,
			ProductId:     sku.ProductID,
			SkuCode:       sku.SKUCode,
			Attributes:    sku.Attributes,
			Price:         sku.Price,
			StockQuantity: sku.StockQuantity,
			CreatedAt:     sku.CreatedAt.Unix(),
			UpdatedAt:     sku.UpdatedAt.Unix(),
		},
	}, nil
}

func (h *ProductHandler) GetSKUByCode(ctx context.Context, req *product.GetSKUByCodeRequest) (*product.GetSKUResponse, error) {
	sku, err := h.productService.GetSKUByCode(ctx, req.SkuCode)
	if err != nil {
		return &product.GetSKUResponse{
			Success: false,
			Message: err.Error(),
			Sku:     nil,
		}, nil
	}

	return &product.GetSKUResponse{
		Success: true,
		Message: "SKU retrieved successfully",
		Sku: &product.SKU{
			Id:            sku.ID,
			ProductId:     sku.ProductID,
			SkuCode:       sku.SKUCode,
			Attributes:    sku.Attributes,
			Price:         sku.Price,
			StockQuantity: sku.StockQuantity,
			CreatedAt:     sku.CreatedAt.Unix(),
			UpdatedAt:     sku.UpdatedAt.Unix(),
		},
	}, nil
}

func (h *ProductHandler) UpdateSKU(ctx context.Context, req *product.UpdateSKURequest) (*product.UpdateSKUResponse, error) {
	err := h.productService.UpdateSKU(ctx, req.SkuId, req.Attributes, req.Price, req.StockQuantity)
	if err != nil {
		return &product.UpdateSKUResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &product.UpdateSKUResponse{
		Success: true,
		Message: "SKU updated successfully",
	}, nil
}

func (h *ProductHandler) DeleteSKU(ctx context.Context, req *product.DeleteSKURequest) (*product.DeleteSKUResponse, error) {
	err := h.productService.DeleteSKU(ctx, req.SkuId)
	if err != nil {
		return &product.DeleteSKUResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &product.DeleteSKUResponse{
		Success: true,
		Message: "SKU deleted successfully",
	}, nil
}
