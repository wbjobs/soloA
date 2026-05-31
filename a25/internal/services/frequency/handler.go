package frequency

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
)

type FrequencyHandler struct {
	service *FrequencyControlService
}

func NewFrequencyHandler(service *FrequencyControlService) *FrequencyHandler {
	return &FrequencyHandler{service: service}
}

func (h *FrequencyHandler) RegisterRoutes(r *gin.RouterGroup) {
	frequency := r.Group("/frequency")
	{
		frequency.GET("/info/:user_id", h.GetFrequencyInfo)
		frequency.POST("/check", h.CheckFrequency)
		frequency.PUT("/limits", h.SetUserLimit)
		frequency.GET("/history/:user_id", h.GetUserHistory)
		frequency.GET("/defaults", h.GetDefaultLimits)
	}
}

func (h *FrequencyHandler) GetFrequencyInfo(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	userID := c.Param("user_id")
	category := c.DefaultQuery("category", models.MessageCategoryMarketing)

	info, err := h.service.GetFrequencyInfo(c.Request.Context(), tenantID, userID, category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(info))
}

func (h *FrequencyHandler) CheckFrequency(c *gin.Context) {
	tenantID := c.GetString("tenant_id")

	var req struct {
		UserID      string `json:"user_id" binding:"required"`
		Category    string `json:"category"`
		ChannelType string `json:"channel_type"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	category := req.Category
	if category == "" {
		category = models.MessageCategoryMarketing
	}

	freqReq := &CheckFrequencyRequest{
		TenantID:    tenantID,
		UserID:      req.UserID,
		Category:    category,
		ChannelType: req.ChannelType,
	}

	info, err := h.service.CheckAndRecord(c.Request.Context(), freqReq)
	if err != nil {
		if err == ErrFrequencyLimitExceeded || err == ErrCoolDownActive {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"code":    429,
				"message": err.Error(),
				"data":    info,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(info))
}

func (h *FrequencyHandler) SetUserLimit(c *gin.Context) {
	tenantID := c.GetString("tenant_id")

	var req struct {
		UserID              string `json:"user_id" binding:"required"`
		Category            string `json:"category"`
		MaxMessagesPerDay   int    `json:"max_messages_per_day"`
		MaxMessagesPerWeek  int    `json:"max_messages_per_week"`
		MaxMessagesPerMonth int    `json:"max_messages_per_month"`
		CoolDownMinutes     int    `json:"cooldown_minutes"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	category := req.Category
	if category == "" {
		category = models.MessageCategoryMarketing
	}

	limit := &models.UserFrequencyLimit{
		TenantID:            tenantID,
		UserID:              req.UserID,
		Category:            category,
		MaxMessagesPerDay:   req.MaxMessagesPerDay,
		MaxMessagesPerWeek:  req.MaxMessagesPerWeek,
		MaxMessagesPerMonth: req.MaxMessagesPerMonth,
		CoolDownMinutes:     req.CoolDownMinutes,
	}

	if err := h.service.SetUserLimit(c.Request.Context(), limit); err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *FrequencyHandler) GetUserHistory(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	userID := c.Param("user_id")
	limitStr := c.DefaultQuery("limit", "50")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 50
	}

	histories, err := h.service.GetUserMessageHistory(c.Request.Context(), tenantID, userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(histories))
}

func (h *FrequencyHandler) GetDefaultLimits(c *gin.Context) {
	limits := h.service.GetDefaultFrequencyLimits()
	c.JSON(http.StatusOK, utils.Success(limits))
}
