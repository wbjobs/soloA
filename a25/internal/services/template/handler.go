package template

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
)

type TemplateHandler struct {
	service *TemplateService
}

func NewTemplateHandler(service *TemplateService) *TemplateHandler {
	return &TemplateHandler{service: service}
}

func (h *TemplateHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/templates", h.CreateTemplate)
	router.GET("/templates", h.ListTemplates)
	router.GET("/templates/:template_code", h.GetTemplate)
	router.PUT("/templates/:id", h.UpdateTemplate)
	router.DELETE("/templates/:id", h.DeleteTemplate)
	
	router.POST("/templates/:id/contents", h.AddContent)
	router.GET("/templates/:id/contents/:language", h.GetContent)
	router.DELETE("/templates/:id/contents/:language", h.DeleteContent)
	
	router.POST("/templates/:id/variables", h.AddVariable)
	router.DELETE("/templates/:id/variables/:variable_id", h.DeleteVariable)
	
	router.POST("/templates/:id/versions", h.CreateVersion)
	router.POST("/templates/versions/:version_id/publish", h.PublishVersion)
	
	router.POST("/templates/:id/preview", h.Preview)
}

func (h *TemplateHandler) CreateTemplate(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	var req CreateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}
	req.TenantID = tenantID

	template, err := h.service.CreateTemplate(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(template))
}

func (h *TemplateHandler) GetTemplate(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	templateCode := c.Param("template_code")

	template, err := h.service.GetTemplate(c.Request.Context(), tenantID, templateCode)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Template not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(template))
}

func (h *TemplateHandler) UpdateTemplate(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var req UpdateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.UpdateTemplate(c.Request.Context(), uint(id), &req); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Template updated successfully"))
}

func (h *TemplateHandler) DeleteTemplate(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	if err := h.service.DeleteTemplate(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Template deleted successfully"))
}

func (h *TemplateHandler) ListTemplates(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	channelType := c.Query("channel_type")
	category := c.Query("category")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	templates, total, err := h.service.ListTemplates(c.Request.Context(), tenantID, channelType, category, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(utils.Page(templates, total, page, pageSize)))
}

func (h *TemplateHandler) AddContent(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var req struct {
		Language string `json:"language" binding:"required"`
		Subject  string `json:"subject"`
		Content  string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.AddContent(c.Request.Context(), uint(id), req.Language, req.Subject, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Content added successfully"))
}

func (h *TemplateHandler) GetContent(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	language := c.Param("language")

	content, err := h.service.GetContent(c.Request.Context(), uint(id), language)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.NotFound("Content not found"))
		return
	}

	c.JSON(http.StatusOK, utils.Success(content))
}

func (h *TemplateHandler) DeleteContent(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	language := c.Param("language")

	if err := h.service.DeleteContent(c.Request.Context(), uint(id), language); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Content deleted successfully"))
}

func (h *TemplateHandler) AddVariable(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var variable models.TemplateVariable
	if err := c.ShouldBindJSON(&variable); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.AddVariable(c.Request.Context(), uint(id), &variable); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(variable))
}

func (h *TemplateHandler) DeleteVariable(c *gin.Context) {
	variableID, _ := strconv.ParseUint(c.Param("variable_id"), 10, 32)

	if err := h.service.DeleteVariable(c.Request.Context(), uint(variableID)); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Variable deleted successfully"))
}

func (h *TemplateHandler) CreateVersion(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var req struct {
		Version    string `json:"version" binding:"required"`
		ChangeNote string `json:"change_note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	if err := h.service.CreateVersion(c.Request.Context(), uint(id), req.Version, req.ChangeNote, "system"); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Version created successfully"))
}

func (h *TemplateHandler) PublishVersion(c *gin.Context) {
	versionID, _ := strconv.ParseUint(c.Param("version_id"), 10, 32)

	if err := h.service.PublishVersion(c.Request.Context(), uint(versionID), "system"); err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessMessage("Version published successfully"))
}

func (h *TemplateHandler) Preview(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var req models.TemplatePreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	result, err := h.service.Preview(c.Request.Context(), uint(id), req.Language, req.Variables)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.InternalError(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(result))
}
