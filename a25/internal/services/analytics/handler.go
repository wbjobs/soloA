package analytics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/message-push-center/internal/common/utils"
)

type AnalyticsHandler struct {
	service *AnalyticsService
}

func NewAnalyticsHandler(service *AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{service: service}
}

func (h *AnalyticsHandler) RegisterRoutes(r *gin.RouterGroup) {
	analytics := r.Group("/analytics")
	{
		analytics.GET("/overview", h.GetDashboardOverview)
		analytics.GET("/funnel", h.GetConversionFunnel)
		analytics.GET("/channels", h.GetChannelPerformance)
		analytics.GET("/failures", h.GetFailureAnalysis)
		analytics.GET("/billing", h.GetBillingSummary)
		analytics.GET("/timeseries", h.GetTimeSeries)
		analytics.GET("/latency", h.GetChannelLatency)
		analytics.GET("/realtime", h.GetRealtimeMetrics)
	}
}

func (h *AnalyticsHandler) GetDashboardOverview(c *gin.Context) {
	tenantID := c.GetString("tenant_id")

	overview, err := h.service.GetDashboardOverview(c.Request.Context(), tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(overview))
}

func (h *AnalyticsHandler) GetConversionFunnel(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	taskID := c.Query("task_id")

	var startTime, endTime time.Time
	var err error

	if startTimeStr != "" {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid start_time format"))
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -7)
	}

	if endTimeStr != "" {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid end_time format"))
			return
		}
	} else {
		endTime = time.Now()
	}

	funnel, err := h.service.GetConversionFunnel(c.Request.Context(), tenantID, startTime, endTime, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(funnel))
}

func (h *AnalyticsHandler) GetChannelPerformance(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	var startTime, endTime time.Time
	var err error

	if startTimeStr != "" {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid start_time format"))
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -7)
	}

	if endTimeStr != "" {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid end_time format"))
			return
		}
	} else {
		endTime = time.Now()
	}

	performance, err := h.service.GetChannelPerformance(c.Request.Context(), tenantID, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(performance))
}

func (h *AnalyticsHandler) GetFailureAnalysis(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	limitStr := c.DefaultQuery("limit", "20")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 20
	}

	var startTime, endTime time.Time

	if startTimeStr != "" {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid start_time format"))
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -7)
	}

	if endTimeStr != "" {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid end_time format"))
			return
		}
	} else {
		endTime = time.Now()
	}

	failures, err := h.service.GetFailureAnalysis(c.Request.Context(), tenantID, startTime, endTime, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(failures))
}

func (h *AnalyticsHandler) GetBillingSummary(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	month := c.Query("month")

	if month == "" {
		month = time.Now().Format("2006-01")
	}

	summary, err := h.service.GetBillingSummary(c.Request.Context(), tenantID, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(summary))
}

func (h *AnalyticsHandler) GetTimeSeries(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	interval := c.DefaultQuery("interval", "hour")

	var startTime, endTime time.Time
	var err error

	if startTimeStr != "" {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid start_time format"))
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -1)
	}

	if endTimeStr != "" {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid end_time format"))
			return
		}
	} else {
		endTime = time.Now()
	}

	data, err := h.service.GetTimeSeriesData(c.Request.Context(), tenantID, startTime, endTime, interval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(data))
}

func (h *AnalyticsHandler) GetChannelLatency(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	var startTime, endTime time.Time
	var err error

	if startTimeStr != "" {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid start_time format"))
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -1)
	}

	if endTimeStr != "" {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.Error("Invalid end_time format"))
			return
		}
	} else {
		endTime = time.Now()
	}

	latency, err := h.service.GetChannelLatency(c.Request.Context(), tenantID, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(latency))
}

func (h *AnalyticsHandler) GetRealtimeMetrics(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	durationStr := c.DefaultQuery("duration", "5")

	duration, err := strconv.Atoi(durationStr)
	if err != nil {
		duration = 5
	}

	metrics, err := h.service.GetRealtimeMetrics(c.Request.Context(), tenantID, time.Duration(duration)*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.Error(err.Error()))
		return
	}

	c.JSON(http.StatusOK, utils.Success(metrics))
}
