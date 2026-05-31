package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/auth"
	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/ratelimit"
	"github.com/message-push-center/internal/common/utils"
	"github.com/message-push-center/internal/services/abtest"
	"github.com/message-push-center/internal/services/analytics"
	"github.com/message-push-center/internal/services/device"
	"github.com/message-push-center/internal/services/frequency"
	"github.com/message-push-center/internal/services/gateway"
	"github.com/message-push-center/internal/services/status"
	"github.com/message-push-center/internal/services/tenant"
	"github.com/message-push-center/internal/services/template"
)

func main() {
	if err := utils.InitLogger(); err != nil {
		log.Fatalf("Failed to init logger: %v", err)
	}

	configPath := "./config/config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := database.InitMySQL(&cfg.Database.MySQL); err != nil {
		log.Printf("Warning: Failed to init MySQL: %v", err)
	}

	if err := database.InitRedis(&cfg.Redis); err != nil {
		log.Printf("Warning: Failed to init Redis: %v", err)
	}

	database.InitKafka(&cfg.Kafka)

	if database.GetDB() != nil {
		if err := autoMigrate(); err != nil {
			log.Printf("Warning: Auto migrate failed: %v", err)
		}
	}

	tenantService := tenant.NewTenantService()
	templateService := template.NewTemplateService()
	deviceService := device.NewDeviceService()
	statusService := status.NewDeliveryStatusService()
	frequencyService := frequency.NewFrequencyControlService()
	abtestService := abtest.NewABTestService()
	analyticsService := analytics.NewAnalyticsService()

	var rateLimiter *ratelimit.RateLimiter
	if database.GetRedis() != nil {
		rateLimiter = ratelimit.NewRateLimiter(database.GetRedis(), &cfg.Limits)
	}

	messageGateway := gateway.NewMessageGateway(tenantService, templateService, deviceService, rateLimiter)

	tenantHandler := tenant.NewTenantHandler(tenantService)
	templateHandler := template.NewTemplateHandler(templateService)
	deviceHandler := device.NewDeviceHandler(deviceService)
	gatewayHandler := gateway.NewGatewayHandler(messageGateway)
	statusHandler := status.NewStatusHandler(statusService)
	frequencyHandler := frequency.NewFrequencyHandler(frequencyService)
	abtestHandler := abtest.NewABTestHandler(abtestService)
	analyticsHandler := analytics.NewAnalyticsHandler(analyticsService)

	router := gin.Default()

	router.Use(gin.Recovery())
	router.Use(authMiddleware())

	apiV1 := router.Group("/api/v1")
	{
		adminGroup := apiV1.Group("/admin")
		{
			tenantHandler.RegisterRoutes(adminGroup)
		}

		apiGroup := apiV1.Group("/")
		{
			templateHandler.RegisterRoutes(apiGroup)
			deviceHandler.RegisterRoutes(apiGroup)
			gatewayHandler.RegisterRoutes(apiGroup)
			statusHandler.RegisterRoutes(apiGroup)
			frequencyHandler.RegisterRoutes(apiGroup)
			abtestHandler.RegisterRoutes(apiGroup)
			analyticsHandler.RegisterRoutes(apiGroup)
		}
	}

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "message-push-center",
		})
	})

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func autoMigrate() error {
	db := database.GetDB()
	if db == nil {
		return nil
	}

	return db.AutoMigrate(
		&models.Tenant{},
		&models.TenantConfig{},
		&models.TenantWebhook{},
		&models.MessageTemplate{},
		&models.TemplateVersion{},
		&models.TemplateContent{},
		&models.TemplateVariable{},
		&models.Device{},
		&models.UserPreference{},
		&models.UserSegment{},
		&models.MessageTask{},
		&models.InAppMessage{},
		&models.DeliveryLog{},
		&models.UserFrequencyLimit{},
		&models.UserMessageHistory{},
		&models.ABTest{},
		&models.ABTestVariant{},
		&models.DashboardMetric{},
		&models.ConversionEvent{},
		&models.TenantBillingRecord{},
	)
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/health" {
			c.Next()
			return
		}

		apiKey := c.GetHeader("X-API-Key")
		tenantID := c.GetHeader("X-Tenant-ID")

		if apiKey == "" && tenantID == "" {
			if strings.HasPrefix(path, "/api/v1/admin") {
				c.Next()
				return
			}
		}

		if tenantID != "" {
			c.Set("tenant_id", tenantID)
			c.Next()
			return
		}

		if apiKey != "" {
			tenantService := tenant.NewTenantService()
			tenant, err := tenantService.GetTenantByAPIKey(c.Request.Context(), apiKey)
			if err == nil && tenant != nil {
				c.Set("tenant_id", tenant.TenantID)
				c.Request.Header.Set("X-Tenant-ID", tenant.TenantID)
				c.Next()
				return
			}
		}

		c.JSON(401, utils.Unauthorized("Unauthorized"))
		c.Abort()
	}
}
