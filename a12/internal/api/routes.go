package api

import (
	"github.com/gin-gonic/gin"

	"task-scheduler/internal/config"
	"task-scheduler/internal/metrics"
)

func SetupRoutes(cfg *config.Config) *gin.Engine {
	gin.SetMode(cfg.Server.Mode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(metrics.MetricsMiddleware())

	r.GET("/metrics", metrics.PrometheusHandler())
	r.GET("/health", HealthCheck)

	api := r.Group("/api/v1")
	{
		tasks := api.Group("/tasks")
		{
			tasks.POST("", CreateTask)
			tasks.GET("", ListTasks)
			tasks.GET("/:id", GetTask)
			tasks.PUT("/:id", UpdateTask)
			tasks.DELETE("/:id", DeleteTask)
			tasks.POST("/:id/trigger", TriggerTask)
			tasks.GET("/:task_id/logs", GetTaskLogs)
		}

		logs := api.Group("/logs")
		{
			logs.GET("", ListLogs)
			logs.GET("/:id", GetLog)
		}

		performance := api.Group("/performance")
		{
			performance.GET("/summary", GetPerformanceSummary)
			performance.GET("/system", GetSystemPerformance)
			performance.GET("/tasks", GetAllTasksPerformance)
			performance.GET("/task/:id", GetTaskPerformance)
			performance.GET("/slow", GetSlowTasks)
			performance.GET("/failures", GetFailureRate)
			performance.GET("/trend", GetExecutionTrend)
		}
	}

	return r
}

func HealthCheck(c *gin.Context) {
	c.JSON(200, gin.H{
		"status": "ok",
	})
}
