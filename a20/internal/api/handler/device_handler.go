package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/middleware"
	"iot-platform/internal/service"
)

type DeviceHandler struct {
	deviceService      *service.DeviceService
	deviceGroupService *service.DeviceGroupService
}

func NewDeviceHandler() *DeviceHandler {
	return &DeviceHandler{
		deviceService:      service.NewDeviceService(),
		deviceGroupService: service.NewDeviceGroupService(),
	}
}

type CreateDeviceRequest struct {
	DeviceName  string `json:"device_name" binding:"required"`
	DeviceType  string `json:"device_type"`
	Protocol    string `json:"protocol" binding:"required"`
	Description string `json:"description"`
	Metadata    string `json:"metadata"`
}

type UpdateDeviceRequest struct {
	DeviceName  string `json:"device_name"`
	DeviceType  string `json:"device_type"`
	Description string `json:"description"`
	Metadata    string `json:"metadata"`
}

func (h *DeviceHandler) CreateDevice(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req CreateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device, err := h.deviceService.RegisterDevice(
		userID,
		req.DeviceName,
		req.DeviceType,
		req.Description,
		req.Protocol,
		req.Metadata,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "device created successfully",
		"device":  device,
	})
}

func (h *DeviceHandler) ListDevices(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	devices, total, err := h.deviceService.ListDevices(userID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"devices":   devices,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *DeviceHandler) GetDevice(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceGroupService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	device, err := h.deviceService.GetDeviceByID(uint(deviceID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}

	c.JSON(http.StatusOK, device)
}

func (h *DeviceHandler) UpdateDevice(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceGroupService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	var req UpdateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.DeviceName != "" {
		updates["device_name"] = req.DeviceName
	}
	if req.DeviceType != "" {
		updates["device_type"] = req.DeviceType
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Metadata != "" {
		updates["metadata"] = req.Metadata
	}

	device, err := h.deviceService.UpdateDevice(uint(deviceID), updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "device updated successfully",
		"device":  device,
	})
}

func (h *DeviceHandler) DeleteDevice(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceGroupService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	if err := h.deviceService.DeleteDevice(uint(deviceID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device deleted successfully"})
}

type CreateGroupRequest struct {
	GroupName   string `json:"group_name" binding:"required"`
	Description string `json:"description"`
}

func (h *DeviceHandler) CreateGroup(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	group, err := h.deviceGroupService.CreateGroup(userID, req.GroupName, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "group created successfully",
		"group":   group,
	})
}

func (h *DeviceHandler) ListGroups(c *gin.Context) {
	userID := middleware.GetUserID(c)

	groups, err := h.deviceGroupService.ListGroups(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

func (h *DeviceHandler) GetGroup(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	group, err := h.deviceGroupService.GetGroupByID(uint(groupID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}

	c.JSON(http.StatusOK, group)
}

func (h *DeviceHandler) DeleteGroup(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	if err := h.deviceGroupService.DeleteGroup(uint(groupID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "group deleted successfully"})
}

func (h *DeviceHandler) AssignToGroup(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("device_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	groupID, err := strconv.ParseUint(c.Param("group_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	if err := h.deviceGroupService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	if err := h.deviceService.AssignToGroup(uint(deviceID), uint(groupID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device assigned to group successfully"})
}

func (h *DeviceHandler) RemoveFromGroup(c *gin.Context) {
	userID := middleware.GetUserID(c)

	deviceID, err := strconv.ParseUint(c.Param("device_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	if err := h.deviceGroupService.CheckDeviceOwnership(uint(deviceID), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	if err := h.deviceService.RemoveFromGroup(uint(deviceID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device removed from group successfully"})
}
