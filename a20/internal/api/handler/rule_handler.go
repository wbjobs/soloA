package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"iot-platform/internal/api/middleware"
	"iot-platform/internal/service"
)

type RuleHandler struct {
	ruleService *service.RuleService
}

func NewRuleHandler() *RuleHandler {
	return &RuleHandler{
		ruleService: service.NewRuleService(),
	}
}

type CreateRuleRequest struct {
	RuleName    string `json:"rule_name" binding:"required"`
	Description string `json:"description"`
	Condition   string `json:"condition" binding:"required"`
	Actions     string `json:"actions" binding:"required"`
	Priority    int    `json:"priority"`
}

type UpdateRuleRequest struct {
	RuleName    string `json:"rule_name"`
	Description string `json:"description"`
	Condition   string `json:"condition"`
	Actions     string `json:"actions"`
	Status      *int   `json:"status"`
	Priority    *int   `json:"priority"`
}

func (h *RuleHandler) CreateRule(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req CreateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule, err := h.ruleService.CreateRule(
		userID,
		req.RuleName,
		req.Description,
		req.Condition,
		req.Actions,
		1,
		req.Priority,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "rule created successfully",
		"rule":    rule,
	})
}

func (h *RuleHandler) ListRules(c *gin.Context) {
	userID := middleware.GetUserID(c)

	rules, err := h.ruleService.ListRules(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"rules": rules})
}

func (h *RuleHandler) GetRule(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	rule, err := h.ruleService.GetRuleByID(uint(ruleID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	c.JSON(http.StatusOK, rule)
}

func (h *RuleHandler) UpdateRule(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req UpdateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.RuleName != "" {
		updates["rule_name"] = req.RuleName
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Condition != "" {
		updates["condition"] = req.Condition
	}
	if req.Actions != "" {
		updates["actions"] = req.Actions
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Priority != nil {
		updates["priority"] = *req.Priority
	}

	rule, err := h.ruleService.UpdateRule(uint(ruleID), updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "rule updated successfully",
		"rule":    rule,
	})
}

func (h *RuleHandler) DeleteRule(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	if err := h.ruleService.DeleteRule(uint(ruleID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "rule deleted successfully"})
}

func (h *RuleHandler) BindDevice(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req struct {
		DeviceID uint `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.ruleService.BindDeviceToRule(uint(ruleID), req.DeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device bound to rule successfully"})
}

func (h *RuleHandler) UnbindDevice(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req struct {
		DeviceID uint `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.ruleService.UnbindDeviceFromRule(uint(ruleID), req.DeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "device unbound from rule successfully"})
}

func (h *RuleHandler) ToggleRule(c *gin.Context) {
	ruleID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req struct {
		Enable bool `json:"enable" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.ruleService.ToggleRule(uint(ruleID), req.Enable); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	status := "disabled"
	if req.Enable {
		status = "enabled"
	}
	c.JSON(http.StatusOK, gin.H{"message": "rule " + status + " successfully"})
}
