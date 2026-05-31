package gateway

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
)

type GatewayHandler struct {
	service *MessageGateway
}

func NewGatewayHandler(service *MessageGateway) *GatewayHandler {
	return &GatewayHandler{service: service}
}

func (h *GatewayHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/messages/send", h.SendSingle)
	router.POST("/messages/batch", h.SendBatch)
	router.GET("/messages/:message_id/status", h.GetMessageStatus)
	router.GET("/tasks/:task_id/status", h.GetTaskStatus)
	router.POST("/tasks/:task_id/cancel", h.CancelTask)
	router.GET("/channels/status", h.GetChannelStatus)
}

type SendSingleHTTPRequest struct {
	UserID         string                 `json:"user_id" binding:"required"`
	TemplateCode   string                 `json:"template_code" binding:"required"`
	TemplateParams map[string]interface{} `json:"template_params"`
	ChannelType    string                 `json:"channel_type"`
	Priority       string                 `json:"priority"`
	ExpireAt       *time.Time             `json:"expire_at"`
	Language       string                 `json:"language"`
	CallbackURL    string                 `json:"callback_url"`
	Metadata       map[string]interface{} `json:"metadata"`
}

func (h *GatewayHandler) SendSingle(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	var req SendSingleHTTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	resp, err := h.service.SendSingle(c.Request.Context(), &SendSingleRequest{
		TenantID:       tenantID,
		UserID:         req.UserID,
		TemplateCode:   req.TemplateCode,
		TemplateParams: req.TemplateParams,
		ChannelType:    req.ChannelType,
		Priority:       req.Priority,
		ExpireAt:       req.ExpireAt,
		Language:       req.Language,
		CallbackURL:    req.CallbackURL,
		Metadata:       req.Metadata,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(resp))
}

type SendBatchHTTPRequest struct {
	UserIDs        []string               `json:"user_ids"`
	SegmentID      string                 `json:"segment_id"`
	TemplateCode   string                 `json:"template_code" binding:"required"`
	TemplateParams map[string]interface{} `json:"template_params"`
	ChannelType    string                 `json:"channel_type"`
	Priority       string                 `json:"priority"`
	ScheduledAt    *time.Time             `json:"scheduled_at"`
	ExpireAt       *time.Time             `json:"expire_at"`
	Language       string                 `json:"language"`
	CallbackURL    string                 `json:"callback_url"`
	Metadata       map[string]interface{} `json:"metadata"`
}

func (h *GatewayHandler) SendBatch(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	var req SendBatchHTTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if len(req.UserIDs) == 0 && req.SegmentID == "" {
		c.JSON(http.StatusBadRequest, utils.BadRequest("user_ids or segment_id required"))
		return
	}

	resp, err := h.service.SendBatch(c.Request.Context(), &SendBatchRequest{
		TenantID:       tenantID,
		UserIDs:        req.UserIDs,
		SegmentID:      req.SegmentID,
		TemplateCode:   req.TemplateCode,
		TemplateParams: req.TemplateParams,
		ChannelType:    req.ChannelType,
		Priority:       req.Priority,
		ScheduledAt:    req.ScheduledAt,
		ExpireAt:       req.ExpireAt,
		Language:       req.Language,
		CallbackURL:    req.CallbackURL,
		Metadata:       req.Metadata,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(resp))
}

func (h *GatewayHandler) GetMessageStatus(c *gin.Context) {
	messageID := c.Param("message_id")

	log, err := h.service.GetMessageStatus(c.Request.Context(), messageID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Message not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(log))
}

func (h *GatewayHandler) GetTaskStatus(c *gin.Context) {
	taskID := c.Param("task_id")

	task, err := h.service.GetTaskStatus(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Task not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(task))
}

func (h *GatewayHandler) CancelTask(c *gin.Context) {
	taskID := c.Param("task_id")

	if err := h.service.CancelTask(c.Request.Context(), taskID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Task cancelled successfully"))
}

func (h *GatewayHandler) GetChannelStatus(c *gin.Context) {
	status, err := h.service.GetChannelStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(status))
}

func (h *GatewayHandler) GetInAppMessages(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.Query("user_id")

	var messages []models.InAppMessage
	h.service.db.Where("tenant_id = ? AND user_id = ? AND is_deleted = ?", tenantID, userID, false).
		Order("created_at DESC").
		Limit(50).
		Find(&messages)

	c.JSON(http.StatusOK, utils.Success(messages))
}

func (h *GatewayHandler) MarkInAppRead(c *gin.Context) {
	var req struct {
		MessageIDs []uint `json:"message_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	now := time.Now()
	h.service.db.Model(&models.InAppMessage{}).
		Where("id IN ?", req.MessageIDs).
		Updates(map[string]interface{}{
			"is_read": true,
			"read_at": &now,
		})

	c.JSON(http.StatusOK, utils.SuccessMessage("Messages marked as read"))
}
