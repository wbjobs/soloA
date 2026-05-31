package status

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/utils"
)

type StatusHandler struct {
	service *DeliveryStatusService
}

func NewStatusHandler(service *DeliveryStatusService) *StatusHandler {
	return &StatusHandler{service: service}
}

func (h *StatusHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/delivery/:message_id", h.GetDeliveryStatus)
	router.GET("/tasks/:task_id", h.GetTaskStatus)
	router.GET("/logs", h.ListDeliveryLogs)
	router.GET("/statistics", h.GetStatistics)
	router.GET("/channel-statistics", h.GetChannelStatistics)
	router.GET("/failed", h.GetFailedMessages)
	router.POST("/failed/:message_id/retry", h.RetryFailedMessage)
}

func (h *StatusHandler) GetDeliveryStatus(c *gin.Context) {
	messageID := c.Param("message_id")

	log, err := h.service.GetStatus(c.Request.Context(), messageID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Message not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(log))
}

func (h *StatusHandler) GetTaskStatus(c *gin.Context) {
	taskID := c.Param("task_id")

	task, logs, err := h.service.GetTaskStatus(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Task not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(map[string]interface{}{
		"task": task,
		"logs": logs,
	}))
}

func (h *StatusHandler) ListDeliveryLogs(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.Query("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var startTime, endTime time.Time
	if start := c.Query("start_time"); start != "" {
		startTime, _ = time.Parse(time.RFC3339, start)
	}
	if end := c.Query("end_time"); end != "" {
		endTime, _ = time.Parse(time.RFC3339, end)
	}

	logs, total, err := h.service.ListDeliveryLogs(c.Request.Context(), tenantID, userID, startTime, endTime, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(utils.Page(logs, total, page, pageSize)))
}

func (h *StatusHandler) GetStatistics(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	startTime := time.Now().AddDate(0, 0, -7)
	endTime := time.Now()

	if start := c.Query("start_time"); start != "" {
		startTime, _ = time.Parse(time.RFC3339, start)
	}
	if end := c.Query("end_time"); end != "" {
		endTime, _ = time.Parse(time.RFC3339, end)
	}

	stats, err := h.service.GetDeliveryStatistics(c.Request.Context(), tenantID, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(map[string]interface{}{
		"statistics": stats,
		"time_range": map[string]time.Time{
			"start": startTime,
			"end":   endTime,
		},
	}))
}

func (h *StatusHandler) GetChannelStatistics(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	startTime := time.Now().AddDate(0, 0, -7)
	endTime := time.Now()

	if start := c.Query("start_time"); start != "" {
		startTime, _ = time.Parse(time.RFC3339, start)
	}
	if end := c.Query("end_time"); end != "" {
		endTime, _ = time.Parse(time.RFC3339, end)
	}

	stats, err := h.service.GetChannelStatistics(c.Request.Context(), tenantID, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(stats))
}

func (h *StatusHandler) GetFailedMessages(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	logs, err := h.service.GetFailedMessages(c.Request.Context(), tenantID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(logs))
}

func (h *StatusHandler) RetryFailedMessage(c *gin.Context) {
	messageID := c.Param("message_id")

	if err := h.service.RetryFailedMessage(c.Request.Context(), messageID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Retry initiated"))
}
