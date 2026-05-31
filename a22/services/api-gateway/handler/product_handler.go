package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/proto/product"
)

type ProductHandler struct {
	registry *discovery.ServiceRegistry
}

func NewProductHandler(registry *discovery.ServiceRegistry) *ProductHandler {
	return &ProductHandler{registry: registry}
}

func (h *ProductHandler) getProductClient() (product.ProductServiceClient, *grpc.ClientConn, error) {
	instance, err := h.registry.Discover("product-service")
	if err != nil {
		return nil, nil, err
	}

	address := instance.Address + ":" + strconv.Itoa(instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}

	return product.NewProductServiceClient(conn), conn, nil
}

func (h *ProductHandler) CreateProduct(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Brand       string `json:"brand"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CreateProduct(context.Background(), &product.CreateProductRequest{
		Name:        req.Name,
		Description: req.Description,
		Category:    req.Category,
		Brand:       req.Brand,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data": gin.H{
			"product_id": resp.ProductId,
		},
	})
}

func (h *ProductHandler) GetProduct(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid product ID",
		})
		return
	}

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetProduct(context.Background(), &product.GetProductRequest{
		ProductId: productID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data":    resp.Product,
	})
}

func (h *ProductHandler) ListProducts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	category := c.Query("category")
	keyword := c.Query("keyword")

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.ListProducts(context.Background(), &product.ListProductsRequest{
		Page:     int32(page),
		PageSize: int32(pageSize),
		Category: category,
		Keyword:  keyword,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data": gin.H{
			"products": resp.Products,
			"total":    resp.Total,
			"page":     page,
			"page_size": pageSize,
		},
	})
}

func (h *ProductHandler) UpdateProduct(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid product ID",
		})
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Brand       string `json:"brand"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.UpdateProduct(context.Background(), &product.UpdateProductRequest{
		ProductId:   productID,
		Name:        req.Name,
		Description: req.Description,
		Category:    req.Category,
		Brand:       req.Brand,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
	})
}

func (h *ProductHandler) DeleteProduct(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid product ID",
		})
		return
	}

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.DeleteProduct(context.Background(), &product.DeleteProductRequest{
		ProductId: productID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
	})
}

func (h *ProductHandler) CreateSKU(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid product ID",
		})
		return
	}

	var req struct {
		SKUCode       string  `json:"sku_code" binding:"required"`
		Attributes    string  `json:"attributes"`
		Price         float64 `json:"price" binding:"required,min=0"`
		StockQuantity int32   `json:"stock_quantity" binding:"min=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CreateSKU(context.Background(), &product.CreateSKURequest{
		ProductId:     productID,
		SkuCode:       req.SKUCode,
		Attributes:    req.Attributes,
		Price:         req.Price,
		StockQuantity: req.StockQuantity,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data": gin.H{
			"sku_id": resp.SkuId,
		},
	})
}

func (h *ProductHandler) GetSKU(c *gin.Context) {
	skuCode := c.Param("sku_code")

	client, conn, err := h.getProductClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get product client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetSKUByCode(context.Background(), &product.GetSKUByCodeRequest{
		SkuCode: skuCode,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data":    resp.Sku,
	})
}
