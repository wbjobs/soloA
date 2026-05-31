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
	"e-commerce-fulfillment/proto/inventory"
)

type InventoryHandler struct {
	registry *discovery.ServiceRegistry
}

func NewInventoryHandler(registry *discovery.ServiceRegistry) *InventoryHandler {
	return &InventoryHandler{registry: registry}
}

func (h *InventoryHandler) getInventoryClient() (inventory.InventoryServiceClient, *grpc.ClientConn, error) {
	instance, err := h.registry.Discover("inventory-service")
	if err != nil {
		return nil, nil, err
	}

	address := instance.Address + ":" + strconv.Itoa(instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}

	return inventory.NewInventoryServiceClient(conn), conn, nil
}

func (h *InventoryHandler) GetInventory(c *gin.Context) {
	skuCode := c.Param("sku_code")

	client, conn, err := h.getInventoryClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get inventory client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetInventory(context.Background(), &inventory.GetInventoryRequest{
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
		"data": gin.H{
			"sku_code":        resp.Inventory.SkuCode,
			"available_stock": resp.Inventory.AvailableStock,
			"frozen_stock":    resp.Inventory.FrozenStock,
			"sold_stock":      resp.Inventory.SoldStock,
			"total_stock":     resp.Inventory.AvailableStock + resp.Inventory.FrozenStock + resp.Inventory.SoldStock,
		},
	})
}

func (h *InventoryHandler) AddStock(c *gin.Context) {
	var req struct {
		SKUCode       string `json:"sku_code" binding:"required"`
		ChangeQuantity int32 `json:"change_quantity" binding:"required,min=1"`
		Remark        string `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getInventoryClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get inventory client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.AddStock(context.Background(), &inventory.AddStockRequest{
		SkuCode:       req.SKUCode,
		ChangeQuantity: req.ChangeQuantity,
		Remark:        req.Remark,
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

func (h *InventoryHandler) DeductStock(c *gin.Context) {
	var req struct {
		SKUCode        string `json:"sku_code" binding:"required"`
		ChangeQuantity int32  `json:"change_quantity" binding:"required,min=1"`
		OrderId        string `json:"order_id" binding:"required"`
		Remark         string `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getInventoryClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get inventory client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.DeductStock(context.Background(), &inventory.DeductStockRequest{
		SkuCode:        req.SKUCode,
		ChangeQuantity: req.ChangeQuantity,
		OrderId:        req.OrderId,
		Remark:         req.Remark,
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

func (h *InventoryHandler) RollbackStock(c *gin.Context) {
	var req struct {
		SKUCode        string `json:"sku_code" binding:"required"`
		ChangeQuantity int32  `json:"change_quantity" binding:"required,min=1"`
		OrderId        string `json:"order_id" binding:"required"`
		Remark         string `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getInventoryClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get inventory client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.RollbackStock(context.Background(), &inventory.RollbackStockRequest{
		SkuCode:        req.SKUCode,
		ChangeQuantity: req.ChangeQuantity,
		OrderId:        req.OrderId,
		Remark:         req.Remark,
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

func (h *InventoryHandler) ConfirmStock(c *gin.Context) {
	var req struct {
		SKUCode        string `json:"sku_code" binding:"required"`
		ChangeQuantity int32  `json:"change_quantity" binding:"required,min=1"`
		OrderId        string `json:"order_id" binding:"required"`
		Remark         string `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getInventoryClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get inventory client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.ConfirmStock(context.Background(), &inventory.ConfirmStockRequest{
		SkuCode:        req.SKUCode,
		ChangeQuantity: req.ChangeQuantity,
		OrderId:        req.OrderId,
		Remark:         req.Remark,
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
