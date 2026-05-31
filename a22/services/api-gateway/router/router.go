package router

import (
	"github.com/gin-gonic/gin"

	"e-commerce-fulfillment/pkg/discovery"
	"e-commerce-fulfillment/services/api-gateway/handler"
	"e-commerce-fulfillment/services/api-gateway/middleware"
)

func SetupRouter(registry *discovery.ServiceRegistry) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	userHandler := handler.NewUserHandler(registry)
	productHandler := handler.NewProductHandler(registry)
	orderHandler := handler.NewOrderHandler(registry)
	inventoryHandler := handler.NewInventoryHandler(registry)
	paymentHandler := handler.NewPaymentHandler(registry)

	api := r.Group("/api/v1")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"success": true,
				"message": "API Gateway is running",
			})
		})

		auth := api.Group("/auth")
		{
			auth.POST("/register", userHandler.Register)
			auth.POST("/login", userHandler.Login)
		}

		users := api.Group("/users")
		users.Use(middleware.JWTAuth())
		{
			users.GET("/profile", userHandler.GetProfile)
		}

		products := api.Group("/products")
		{
			products.POST("", productHandler.CreateProduct)
			products.GET("", productHandler.ListProducts)
			products.GET("/:id", productHandler.GetProduct)
			products.PUT("/:id", productHandler.UpdateProduct)
			products.DELETE("/:id", productHandler.DeleteProduct)
			products.POST("/:id/skus", productHandler.CreateSKU)
			products.GET("/skus/:sku_code", productHandler.GetSKU)
		}

		inventory := api.Group("/inventory")
		inventory.Use(middleware.JWTAuth())
		{
			inventory.GET("/:sku_code", inventoryHandler.GetInventory)
			inventory.POST("/add", inventoryHandler.AddStock)
			inventory.POST("/deduct", inventoryHandler.DeductStock)
			inventory.POST("/rollback", inventoryHandler.RollbackStock)
			inventory.POST("/confirm", inventoryHandler.ConfirmStock)
		}

		orders := api.Group("/orders")
		orders.Use(middleware.JWTAuth())
		{
			orders.POST("", orderHandler.CreateOrder)
			orders.GET("", orderHandler.ListOrders)
			orders.GET("/:id", orderHandler.GetOrder)
			orders.POST("/:id/pay", orderHandler.PayOrder)
			orders.POST("/:id/cancel", orderHandler.CancelOrder)
			orders.POST("/:id/ship", orderHandler.ShipOrder)
			orders.POST("/:id/complete", orderHandler.CompleteOrder)
		}

		payments := api.Group("/payments")
		payments.Use(middleware.JWTAuth())
		{
			payments.POST("", paymentHandler.CreatePayment)
			payments.GET("/:id", paymentHandler.GetPayment)
			payments.GET("/order/:order_id", paymentHandler.GetPaymentByOrder)
			payments.POST("/:id/refund", paymentHandler.Refund)
		}
	}

	return r
}
