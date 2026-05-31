package tenant

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/utils"
)

type TenantHandler struct {
	service *TenantService
}

func NewTenantHandler(service *TenantService) *TenantHandler {
	return &TenantHandler{service: service}
}

func (h *TenantHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/tenants", h.CreateTenant)
	router.GET("/tenants", h.ListTenants)
	router.GET("/tenants/:tenant_id", h.GetTenant)
	router.PUT("/tenants/:tenant_id", h.UpdateTenant)
	router.DELETE("/tenants/:tenant_id", h.DeleteTenant)
	
	router.GET("/tenants/:tenant_id/configs", h.GetConfigs)
	router.POST("/tenants/:tenant_id/configs", h.SetConfig)
	router.DELETE("/tenants/:tenant_id/configs/:config_key", h.DeleteConfig)
}

func (h *TenantHandler) CreateTenant(c *gin.Context) {
	var req CreateTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	tenant, err := h.service.CreateTenant(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(tenant))
}

func (h *TenantHandler) GetTenant(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	tenant, err := h.service.GetTenantByID(c.Request.Context(), tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Tenant not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(tenant))
}

func (h *TenantHandler) UpdateTenant(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	var req UpdateTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.UpdateTenant(c.Request.Context(), tenantID, &req); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Tenant updated successfully"))
}

func (h *TenantHandler) DeleteTenant(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	if err := h.service.DeleteTenant(c.Request.Context(), tenantID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Tenant deleted successfully"))
}

func (h *TenantHandler) ListTenants(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	tenants, total, err := h.service.ListTenants(c.Request.Context(), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(utils.Page(tenants, total, page, pageSize)))
}

func (h *TenantHandler) GetConfigs(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	configs, err := h.service.GetConfigs(c.Request.Context(), tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(configs))
}

type SetConfigRequest struct {
	ConfigKey   string `json:"config_key" binding:"required"`
	ConfigValue string `json:"config_value" binding:"required"`
	ChannelType string `json:"channel_type"`
}

func (h *TenantHandler) SetConfig(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	var req SetConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.SetConfig(c.Request.Context(), tenantID, req.ConfigKey, req.ConfigValue, req.ChannelType); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Config saved successfully"))
}

func (h *TenantHandler) DeleteConfig(c *gin.Context) {
	tenantID := c.Param("tenant_id")
	configKey := c.Param("config_key")

	if err := h.service.DeleteConfig(c.Request.Context(), tenantID, configKey); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Config deleted successfully"))
}
