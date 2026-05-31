package abtest

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/utils"
)

type ABTestHandler struct {
	service *ABTestService
}

func NewABTestHandler(service *ABTestService) *ABTestHandler {
	return &ABTestHandler{service: service}
}

func (h *ABTestHandler) RegisterRoutes(r *gin.RouterGroup) {
	abtest := r.Group("/abtest")
	{
		abtest.POST("/", h.CreateABTest)
		abtest.GET("/:test_id", h.GetABTest)
		abtest.GET("/", h.ListABTests)
		abtest.POST("/:test_id/start", h.StartABTest)
		abtest.POST("/:test_id/pause", h.PauseABTest)
		abtest.POST("/:test_id/complete", h.CompleteABTest)
		abtest.POST("/:test_id/assign/:user_id", h.AssignVariant)
		abtest.GET("/:test_id/result", h.GetTestResult)
		abtest.POST("/:test_id/click", h.RecordClick)
		abtest.POST("/:test_id/conversion", h.RecordConversion)
		abtest.GET("/:test_id/determine-winner", h.DetermineWinner)
		abtest.DELETE("/:test_id", h.DeleteABTest)
	}
}

func (h *ABTestHandler) CreateABTest(c *gin.Context) {
	tenantID := c.GetString("tenant_id")

	var req struct {
		TestName    string         `json:"test_name" binding:"required"`
		Description string         `json:"description"`
		SegmentID   string         `json:"segment_id"`
		UserIDs     []string       `json:"user_ids"`
		ScheduledAt *string        `json:"scheduled_at"`
		Variants    []VariantConfig `json:"variants" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	if len(req.Variants) < 2 {
		c.JSON(http.StatusBadRequest, utils.Error("At least 2 variants required"))
		return
	}

	createReq := &CreateABTestRequest{
		TenantID:    tenantID,
		TestName:    req.TestName,
		Description: req.Description,
		SegmentID:   req.SegmentID,
		UserIDs:     req.UserIDs,
		Variants:    req.Variants,
	}

	result, err := h.service.CreateABTest(c.Request.Context(), createReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusCreated, utils.Success(result))
}

func (h *ABTestHandler) GetABTest(c *gin.Context) {
	testID := c.Param("test_id")

	result, err := h.service.GetABTest(c.Request.Context(), testID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(result))
}

func (h *ABTestHandler) ListABTests(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	status := c.Query("status")
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")

	page, err := strconv.Atoi(pageStr)
	if err != nil {
		page = 1
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil {
		pageSize = 20
	}

	tests, total, err := h.service.ListABTests(c.Request.Context(), tenantID, status, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(gin.H{
		"items": tests,
		"total": total,
		"page":  page,
		"size":  pageSize,
	}))
}

func (h *ABTestHandler) StartABTest(c *gin.Context) {
	testID := c.Param("test_id")

	if err := h.service.StartABTest(c.Request.Context(), testID); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *ABTestHandler) PauseABTest(c *gin.Context) {
	testID := c.Param("test_id")

	if err := h.service.PauseABTest(c.Request.Context(), testID); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *ABTestHandler) CompleteABTest(c *gin.Context) {
	testID := c.Param("test_id")

	var req struct {
		WinningVariantID string `json:"winning_variant_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	if err := h.service.CompleteABTest(c.Request.Context(), testID, req.WinningVariantID); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *ABTestHandler) AssignVariant(c *gin.Context) {
	testID := c.Param("test_id")
	userID := c.Param("user_id")

	variant, err := h.service.AssignVariant(c.Request.Context(), testID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(variant))
}

func (h *ABTestHandler) GetTestResult(c *gin.Context) {
	testID := c.Param("test_id")

	result, err := h.service.GetABTestResult(c.Request.Context(), testID)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(result))
}

func (h *ABTestHandler) RecordClick(c *gin.Context) {
	testID := c.Param("test_id")

	var req struct {
		VariantID string `json:"variant_id" binding:"required"`
		MessageID string `json:"message_id"`
		UserID    string `json:"user_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	if err := h.service.RecordClick(c.Request.Context(), testID, req.VariantID, req.MessageID, req.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *ABTestHandler) RecordConversion(c *gin.Context) {
	testID := c.Param("test_id")

	var req struct {
		VariantID string `json:"variant_id" binding:"required"`
		MessageID string `json:"message_id"`
		UserID    string `json:"user_id"`
		EventType string `json:"event_type"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, utils.Error("Invalid request body"))
		return
	}

	if err := h.service.RecordConversion(c.Request.Context(), testID, req.VariantID, req.MessageID, req.UserID, req.EventType); err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}

func (h *ABTestHandler) DetermineWinner(c *gin.Context) {
	testID := c.Param("test_id")

	winner, err := h.service.DetermineWinner(c.Request.Context(), testID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(gin.H{
		"winning_variant_id": winner,
	}))
}

func (h *ABTestHandler) DeleteABTest(c *gin.Context) {
	testID := c.Param("test_id")

	if err := h.service.DeleteABTest(c.Request.Context(), testID); err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(nil))
}
