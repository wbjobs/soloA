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
	"e-commerce-fulfillment/proto/payment"
)

type PaymentHandler struct {
	registry *discovery.ServiceRegistry
}

func NewPaymentHandler(registry *discovery.ServiceRegistry) *PaymentHandler {
	return &PaymentHandler{registry: registry}
}

func (h *PaymentHandler) getPaymentClient() (payment.PaymentServiceClient, *grpc.ClientConn, error) {
	instance, err := h.registry.Discover("payment-service")
	if err != nil {
		return nil, nil, err
	}

	address := instance.Address + ":" + strconv.Itoa(instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}

	return payment.NewPaymentServiceClient(conn), conn, nil
}

func (h *PaymentHandler) CreatePayment(c *gin.Context) {
	var req struct {
		OrderId       int64   `json:"order_id" binding:"required"`
		UserId        int64   `json:"user_id" binding:"required"`
		Amount        float64 `json:"amount" binding:"required,min=0"`
		PaymentMethod string  `json:"payment_method" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getPaymentClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get payment client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.CreatePayment(context.Background(), &payment.CreatePaymentRequest{
		OrderId:       req.OrderId,
		UserId:        req.UserId,
		Amount:        req.Amount,
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

func (h *PaymentHandler) GetPayment(c *gin.Context) {
	paymentIDStr := c.Param("id")
	paymentID, err := strconv.ParseInt(paymentIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid payment ID",
		})
		return
	}

	client, conn, err := h.getPaymentClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get payment client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetPayment(context.Background(), &payment.GetPaymentRequest{
		PaymentId: paymentID,
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
		"data":    resp.Payment,
	})
}

func (h *PaymentHandler) GetPaymentByOrder(c *gin.Context) {
	orderIDStr := c.Param("order_id")
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid order ID",
		})
		return
	}

	client, conn, err := h.getPaymentClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get payment client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetPaymentByOrder(context.Background(), &payment.GetPaymentByOrderRequest{
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
		"data":    resp.Payment,
	})
}

func (h *PaymentHandler) Refund(c *gin.Context) {
	paymentIDStr := c.Param("id")
	paymentID, err := strconv.ParseInt(paymentIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid payment ID",
		})
		return
	}

	var req struct {
		Reason string `json:"reason" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getPaymentClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get payment client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.Refund(context.Background(), &payment.RefundRequest{
		PaymentId: paymentID,
		Reason:    req.Reason,
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
