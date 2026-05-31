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
	"e-commerce-fulfillment/proto/user"
)

type UserHandler struct {
	registry *discovery.ServiceRegistry
}

func NewUserHandler(registry *discovery.ServiceRegistry) *UserHandler {
	return &UserHandler{registry: registry}
}

func (h *UserHandler) getUserClient() (user.UserServiceClient, *grpc.ClientConn, error) {
	instance, err := h.registry.Discover("user-service")
	if err != nil {
		return nil, nil, err
	}

	address := instance.Address + ":" + strconv.Itoa(instance.Port)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}

	return user.NewUserServiceClient(conn), conn, nil
}

func (h *UserHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getUserClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get user client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.Register(context.Background(), &user.RegisterRequest{
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password,
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
			"user_id": resp.UserId,
		},
	})
}

func (h *UserHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	client, conn, err := h.getUserClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get user client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.Login(context.Background(), &user.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": resp.Message,
		"data": gin.H{
			"token": resp.Token,
			"user": gin.H{
				"id":       resp.User.Id,
				"username": resp.User.Username,
				"email":    resp.User.Email,
			},
		},
	})
}

func (h *UserHandler) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	client, conn, err := h.getUserClient()
	if err != nil {
		logger.GetLogger().Error("Failed to get user client: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Service unavailable",
		})
		return
	}
	defer conn.Close()

	resp, err := client.GetUser(context.Background(), &user.GetUserRequest{
		UserId: userID.(int64),
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
			"id":       resp.User.Id,
			"username": resp.User.Username,
			"email":    resp.User.Email,
		},
	})
}
