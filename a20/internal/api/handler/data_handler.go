package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/middleware"
	"iot-platform/internal/model"
	"iot-platform/internal/service"
)

type DataHandler struct {
	dataService    *service.DataService
	deviceService  *service.DeviceService
	controlService *service.DeviceControlService
}

func NewDataHandler() *DataHandler {
	return &DataHandler{
		dataService:    service.NewDataService(),
		deviceService:  service.NewDeviceService(),
		controlService: service.NewDeviceControlService(),
	}
}

func (h *DataHandler) QueryData(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceKey := c.Query("device_key")
	if deviceKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_key is required"})
		return
	}

	device, err := h.deviceService.GetDeviceByKey(deviceKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}

	if device.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	query := &model.DataQuery{
		DeviceKey:   deviceKey,
		Metric:      c.Query("metric"),
		Aggregation: c.Query("aggregation"),
		Interval:    c.Query("interval"),
	}

	if start := c.Query("start"); start != "" {
		if startTime, err := time.Parse(time.RFC3339, start); err == nil {
			query.StartTime = startTime
		}
	}

	if end := c.Query("end"); end != "" {
		if endTime, err := time.Parse(time.RFC3339, end); err == nil {
			query.EndTime = endTime
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil {
			query.Limit = l
		}
	}

	data, err := h.dataService.QueryData(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      data,
		"device_key": deviceKey,
		"count":     len(data),
	})
}

func (h *DataHandler) GetLatestData(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceKey := c.Param("device_key")
	if deviceKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_key is required"})
		return
	}

	device, err := h.deviceService.GetDeviceByKey(deviceKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}

	if device.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	data, err := h.dataService.GetLatestData(deviceKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, data)
}

type SendCommandRequest struct {
	CommandType string                 `json:"command_type" binding:"required"`
	CommandData map[string]interface{} `json:"command_data"`
}

func (h *DataHandler) SendCommand(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	var req SendCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	command, err := h.controlService.SendCommand(uint(deviceID), req.CommandType, req.CommandData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "command sent successfully",
		"command": command,
	})
}

func (h *DataHandler) ListDeviceCommands(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	commands, total, err := h.controlService.ListDeviceCommands(uint(deviceID), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"commands":  commands,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *DataHandler) GetCommandStatus(c *gin.Context) {
	commandID, err := strconv.ParseUint(c.Param("command_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid command id"})
		return
	}

	command, err := h.controlService.GetCommandByID(uint(commandID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "command not found"})
		return
	}

	c.JSON(http.StatusOK, command)
}
