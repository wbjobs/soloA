package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"task-scheduler/internal/analyzer"
	"task-scheduler/internal/logger"
)

func GetTaskPerformance(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}
	if days > 365 {
		days = 365
	}

	stats, err := analyzer.GlobalAnalyzer.GetTaskPerformance(uint(id), days)
	if err != nil {
		logger.Sugar.Errorf("Failed to get task performance: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    stats,
	})
}

func GetAllTasksPerformance(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}
	if days > 365 {
		days = 365
	}

	stats, err := analyzer.GlobalAnalyzer.GetAllTasksPerformance(days)
	if err != nil {
		logger.Sugar.Errorf("Failed to get all tasks performance: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data: gin.H{
			"time_range_days": days,
			"total_tasks":     len(stats),
			"tasks":           stats,
		},
	})
}

func GetSystemPerformance(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}
	if days > 365 {
		days = 365
	}

	stats, err := analyzer.GlobalAnalyzer.GetSystemPerformance(days)
	if err != nil {
		logger.Sugar.Errorf("Failed to get system performance: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    stats,
	})
}

func GetSlowTasks(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	threshold, _ := strconv.ParseInt(c.DefaultQuery("threshold", "1000"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	if days <= 0 {
		days = 7
	}
	if threshold <= 0 {
		threshold = 1000
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}

	slowTasks, err := analyzer.GlobalAnalyzer.GetSlowTasks(days, threshold, limit)
	if err != nil {
		logger.Sugar.Errorf("Failed to get slow tasks: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data: gin.H{
			"time_range_days": days,
			"threshold_ms":    threshold,
			"total":           len(slowTasks),
			"tasks":           slowTasks,
		},
	})
}

func GetFailureRate(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}
	if days > 365 {
		days = 365
	}

	stats, err := analyzer.GlobalAnalyzer.GetFailureRate(days)
	if err != nil {
		logger.Sugar.Errorf("Failed to get failure rate: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    stats,
	})
}

func GetExecutionTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}
	if days > 30 {
		days = 30
	}

	var taskID *uint
	taskIDStr := c.Query("task_id")
	if taskIDStr != "" {
		id, err := strconv.ParseUint(taskIDStr, 10, 32)
		if err == nil {
			uid := uint(id)
			taskID = &uid
		}
	}

	trend, err := analyzer.GlobalAnalyzer.GetExecutionTrend(days, taskID)
	if err != nil {
		logger.Sugar.Errorf("Failed to get execution trend: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    trend,
	})
}

func GetPerformanceSummary(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		days = 7
	}

	systemStats, err := analyzer.GlobalAnalyzer.GetSystemPerformance(days)
	if err != nil {
		logger.Sugar.Errorf("Failed to get system performance: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	slowTasks, err := analyzer.GlobalAnalyzer.GetSlowTasks(days, 5000, 10)
	if err != nil {
		logger.Sugar.Warnf("Failed to get slow tasks: %v", err)
	}

	failureStats, err := analyzer.GlobalAnalyzer.GetFailureRate(days)
	if err != nil {
		logger.Sugar.Warnf("Failed to get failure rate: %v", err)
	}

	summary := gin.H{
		"time_range_days":  days,
		"system_overview":  systemStats,
		"top_slow_tasks":   slowTasks,
		"high_failure_tasks": func() []*analyzer.TaskFailureRate {
			if failureStats != nil && len(failureStats.Tasks) > 5 {
				return failureStats.Tasks[:5]
			}
			if failureStats != nil {
				return failureStats.Tasks
			}
			return nil
		}(),
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    summary,
	})
}
