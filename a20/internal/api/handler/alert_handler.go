package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/middleware"
	"iot-platform/internal/service"
)

type AlertHandler struct {
	alertService *service.AlertService
}

func NewAlertHandler() *AlertHandler {
	return &AlertHandler{
		alertService: service.NewAlertService(),
	}
}

func (h *AlertHandler) ListAlerts(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var status *int
	if statusStr := c.Query("status"); statusStr != "" {
		if s, err := strconv.Atoi(statusStr); err == nil {
			status = &s
		}
	}

	alerts, total, err := h.alertService.ListAlerts(userID, page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"alerts":    alerts,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *AlertHandler) GetAlert(c *gin.Context) {
	alertID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	alert, err := h.alertService.GetAlertByID(uint(alertID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
		return
	}

	c.JSON(http.StatusOK, alert)
}

func (h *AlertHandler) HandleAlert(c *gin.Context) {
	alertID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	if err := h.alertService.HandleAlert(uint(alertID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "alert handled successfully"})
}
