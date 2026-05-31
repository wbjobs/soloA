package device

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
)

type DeviceHandler struct {
	service *DeviceService
}

func NewDeviceHandler(service *DeviceService) *DeviceHandler {
	return &DeviceHandler{service: service}
}

func (h *DeviceHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/devices/register", h.RegisterDevice)
	router.POST("/devices/unregister", h.UnregisterDevice)
	router.GET("/devices", h.ListDevices)
	router.GET("/devices/:device_id", h.GetDevice)
	router.PUT("/devices/:device_id/status", h.UpdateDeviceStatus)
	
	router.GET("/devices/user/:user_id", h.GetUserDevices)
	
	router.POST("/preferences", h.UpdateUserPreference)
	router.GET("/preferences/:user_id", h.GetUserPreference)
	
	router.POST("/segments", h.CreateSegment)
	router.GET("/segments", h.ListSegments)
	router.GET("/segments/:id", h.GetSegment)
	router.DELETE("/segments/:id", h.DeleteSegment)
}

func (h *DeviceHandler) RegisterDevice(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.RegisterDevice(c.Request.Context(), tenantID, &req); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Device registered successfully"))
}

func (h *DeviceHandler) UnregisterDevice(c *gin.Context) {
	var req struct {
		DeviceID string `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.UnregisterDevice(c.Request.Context(), req.DeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Device unregistered successfully"))
}

func (h *DeviceHandler) GetDevice(c *gin.Context) {
	deviceID := c.Param("device_id")

	device, err := h.service.GetDevice(c.Request.Context(), deviceID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Device not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(device))
}

func (h *DeviceHandler) ListDevices(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	channelType := c.Query("channel_type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var isActive *bool
	if active := c.Query("is_active"); active != "" {
		b := active == "true"
		isActive = &b
	}

	devices, total, err := h.service.ListDevices(c.Request.Context(), tenantID, channelType, isActive, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(utils.Page(devices, total, page, pageSize)))
}

func (h *DeviceHandler) UpdateDeviceStatus(c *gin.Context) {
	deviceID := c.Param("device_id")

	var req struct {
		IsActive bool `json:"is_active" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.UpdateDeviceActiveStatus(c.Request.Context(), deviceID, req.IsActive); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Device status updated"))
}

func (h *DeviceHandler) GetUserDevices(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.Param("user_id")
	channelType := c.Query("channel_type")

	var devices []*models.Device
	var err error

	if channelType != "" {
		devices, err = h.service.GetUserDevices(c.Request.Context(), tenantID, userID, channelType)
	} else {
		devices, err = h.service.GetUserDevices(c.Request.Context(), tenantID, userID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(devices))
}

func (h *DeviceHandler) UpdateUserPreference(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	var req models.UserPreference
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.UpdateUserPreference(c.Request.Context(), tenantID, req.UserID, &req); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Preference updated"))
}

func (h *DeviceHandler) GetUserPreference(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.Param("user_id")

	preference, err := h.service.GetUserPreference(c.Request.Context(), tenantID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(preference))
}

func (h *DeviceHandler) CreateSegment(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")

	var segment models.UserSegment
	if err := c.ShouldBindJSON(&segment); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}
	segment.TenantID = tenantID

	if err := h.service.CreateSegment(c.Request.Context(), &segment); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(segment))
}

func (h *DeviceHandler) GetSegment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	segment, err := h.service.GetSegment(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Segment not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(segment))
}

func (h *DeviceHandler) ListSegments(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	segments, total, err := h.service.ListSegments(c.Request.Context(), tenantID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(utils.Page(segments, total, page, pageSize)))
}

func (h *DeviceHandler) DeleteSegment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	if err := h.service.DeleteSegment(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Segment deleted"))
}
