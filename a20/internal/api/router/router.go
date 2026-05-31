package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/handler"
	"iot-platform/internal/api/middleware"
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	authHandler := handler.NewAuthHandler()
	deviceHandler := handler.NewDeviceHandler()
	dataHandler := handler.NewDataHandler()
	ruleHandler := handler.NewRuleHandler()
	alertHandler := handler.NewAlertHandler()

	api := r.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware())
		{
			protected.GET("/auth/profile", authHandler.GetProfile)

			devices := protected.Group("/devices")
			{
				devices.POST("", deviceHandler.CreateDevice)
				devices.GET("", deviceHandler.ListDevices)
				devices.GET("/:id", deviceHandler.GetDevice)
				devices.PUT("/:id", deviceHandler.UpdateDevice)
				devices.DELETE("/:id", deviceHandler.DeleteDevice)
				devices.POST("/:id/commands", dataHandler.SendCommand)
				devices.GET("/:id/commands", dataHandler.ListDeviceCommands)
				devices.POST("/:device_id/groups/:group_id", deviceHandler.AssignToGroup)
				devices.DELETE("/:device_id/groups", deviceHandler.RemoveFromGroup)
			}

			groups := protected.Group("/groups")
			{
				groups.POST("", deviceHandler.CreateGroup)
				groups.GET("", deviceHandler.ListGroups)
				groups.GET("/:id", deviceHandler.GetGroup)
				groups.DELETE("/:id", deviceHandler.DeleteGroup)
			}

			data := protected.Group("/data")
			{
				data.GET("", dataHandler.QueryData)
				data.GET("/latest/:device_key", dataHandler.GetLatestData)
				data.GET("/commands/:command_id", dataHandler.GetCommandStatus)
			}

			rules := protected.Group("/rules")
			{
				rules.POST("", ruleHandler.CreateRule)
				rules.GET("", ruleHandler.ListRules)
				rules.GET("/:id", ruleHandler.GetRule)
				rules.PUT("/:id", ruleHandler.UpdateRule)
				rules.DELETE("/:id", ruleHandler.DeleteRule)
				rules.POST("/:id/bind", ruleHandler.BindDevice)
				rules.POST("/:id/unbind", ruleHandler.UnbindDevice)
				rules.POST("/:id/toggle", ruleHandler.ToggleRule)
			}

			alerts := protected.Group("/alerts")
			{
				alerts.GET("", alertHandler.ListAlerts)
				alerts.GET("/:id", alertHandler.GetAlert)
				alerts.POST("/:id/handle", alertHandler.HandleAlert)
			}
		}
	}

	return r
}
