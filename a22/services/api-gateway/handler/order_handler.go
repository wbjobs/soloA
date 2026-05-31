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
	"e-commerce-fulfillment/proto/order"
)

type OrderHandler struct {
	registry *discovery.ServiceRegistry
}

func NewOrderHandler(registry *discovery.ServiceRegistry) *OrderHandler {
	return &OrderHandler{registry: registry}
}

func (h *OrderHandler) getOrderClient() (order.OrderServiceClient, *grpc.ClientConn, error) {
	instance, err := h.registry.Discover("order-service")
	if err != nil {
		return nil, nil, err
	}

	address := instance.Address + ":" + strconv.Itoa(instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}

	return order.NewOrderServiceClient(conn), conn, nil
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	var req struct {
		Items []struct {
			SKUCode  string `json:"sku_code" binding:"required"`
			Quantity int32  `json:"quantity" binding:"required,min=1"`
		} `json:"items" binding:"required"`
		ShippingAddress string `json:"shipping_address" binding:"required"`
		Remark          string `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	items := make([]*order.OrderItem, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, &order.OrderItem{
			SkuCode:  item.SKUCode,
			Quantity: item.Quantity,
		})
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CreateOrder(context.Background(), &order.CreateOrderRequest{
		UserId:          userID.(int64),
		Items:           items,
		ShippingAddress: req.ShippingAddress,
		Remark:          req.Remark,
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
			"order_id": resp.OrderId,
		},
	})
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetOrder(context.Background(), &order.GetOrderRequest{
		OrderId: orderID,
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
		"data":    resp.Order,
	})
}

func (h *OrderHandler) ListOrders(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status, _ := strconv.Atoi(c.DefaultQuery("status", "0"))

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.ListOrders(context.Background(), &order.ListOrdersRequest{
		UserId:   userID.(int64),
		Status:   int32(status),
		Page:     int32(page),
		PageSize: int32(pageSize),
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
			"orders":    resp.Orders,
			"total":     resp.Total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *OrderHandler) PayOrder(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	var req struct {
		PaymentMethod string `json:"payment_method" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.PayOrder(context.Background(), &order.PayOrderRequest{
		OrderId:       orderID,
		PaymentMethod: req.PaymentMethod,
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
			"payment_id": resp.PaymentId,
		},
	})
}

func (h *OrderHandler) CancelOrder(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CancelOrder(context.Background(), &order.CancelOrderRequest{
		OrderId: orderID,
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

func (h *OrderHandler) ShipOrder(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	var req struct {
		ShippingCompany string `json:"shipping_company" binding:"required"`
		TrackingNo      string `json:"tracking_no" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.ShipOrder(context.Background(), &order.ShipOrderRequest{
		OrderId:         orderID,
		ShippingCompany: req.ShippingCompany,
		TrackingNo:      req.TrackingNo,
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

func (h *OrderHandler) CompleteOrder(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	client, conn, err := h.getOrderClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get order client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CompleteOrder(context.Background(), &order.CompleteOrderRequest{
		OrderId: orderID,
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
