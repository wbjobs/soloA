package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"audit-service/internal/causality"
	"audit-service/internal/model"
	"audit-service/internal/projection"
	"audit-service/internal/store"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	eventStore    store.EventStore
	snapshotStore store.SnapshotStore
	projector     *projection.Projector
	analyzer      *causality.Analyzer
}

func NewHandler(eventStore store.EventStore, snapshotStore store.SnapshotStore, projector *projection.Projector) *Handler {
	return &Handler{
		eventStore:    eventStore,
		snapshotStore: snapshotStore,
		projector:     projector,
		analyzer:      causality.NewAnalyzer(),
	}
}

func (h *Handler) RegisterRoutes(router *gin.Engine) {
	router.GET("/health", h.HealthCheck)
	router.GET("/audit/:aggregateId/events", h.GetEvents)
	router.GET("/audit/:aggregateId/projection", h.GetProjection)
	router.GET("/audit/:aggregateId/causality", h.GetCausality)
	router.POST("/audit/:aggregateId/replay", h.ReplayEvents)
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"time":   time.Now().UTC(),
	})
}

func (h *Handler) GetEvents(c *gin.Context) {
	aggregateID := c.Param("aggregateId")
	if aggregateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aggregateId is required"})
		return
	}

	fromSeqStr := c.Query("from_sequence")
	var fromSeq int64 = 0
	if fromSeqStr != "" {
		var err error
		fromSeq, err = strconv.ParseInt(fromSeqStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from_sequence"})
			return
		}
	}

	var eventTypes []string
	eventTypesStr := c.Query("event_types")
	if eventTypesStr != "" {
		eventTypes = strings.Split(eventTypesStr, ",")
	}

	var startTime, endTime time.Time
	startTimeStr := c.Query("start_time")
	if startTimeStr != "" {
		ts, err := strconv.ParseInt(startTimeStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
			return
		}
		startTime = time.UnixMilli(ts)
	}

	endTimeStr := c.Query("end_time")
	if endTimeStr != "" {
		ts, err := strconv.ParseInt(endTimeStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
			return
		}
		endTime = time.UnixMilli(ts)
	}

	ctx := context.Background()
	events, err := h.eventStore.GetEventsByAggregateWithFilter(ctx, aggregateID, fromSeq, eventTypes, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"aggregate_id": aggregateID,
		"count":        len(events),
		"events":       events,
	})
}

func (h *Handler) GetProjection(c *gin.Context) {
	aggregateID := c.Param("aggregateId")
	if aggregateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aggregateId is required"})
		return
	}

	ctx := context.Background()
	projection, err := h.projector.GetProjection(ctx, aggregateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(projection) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "projection not found"})
		return
	}

	c.JSON(http.StatusOK, projection)
}

func (h *Handler) ReplayEvents(c *gin.Context) {
	aggregateID := c.Param("aggregateId")
	if aggregateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aggregateId is required"})
		return
	}

	ctx := context.Background()
	state, err := h.projector.ReplayEvents(ctx, aggregateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "events replayed successfully",
		"state":   state,
	})
}

func (h *Handler) GetCausality(c *gin.Context) {
	aggregateID := c.Param("aggregateId")
	if aggregateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aggregateId is required"})
		return
	}

	var startTime, endTime time.Time
	startTimeStr := c.Query("start_time")
	if startTimeStr != "" {
		ts, err := strconv.ParseInt(startTimeStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
			return
		}
		startTime = time.UnixMilli(ts)
	}

	endTimeStr := c.Query("end_time")
	if endTimeStr != "" {
		ts, err := strconv.ParseInt(endTimeStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
			return
		}
		endTime = time.UnixMilli(ts)
	}

	includePayload := c.Query("include_payload") == "true"

	ctx := context.Background()
	events, err := h.eventStore.GetEventsByAggregate(ctx, aggregateID, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(events) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no events found for this aggregate"})
		return
	}

	opts := &causality.BuildOptions{
		StartTime:      startTime,
		EndTime:        endTime,
		IncludePayload: includePayload,
	}

	result := h.analyzer.Analyze(events, opts)

	c.JSON(http.StatusOK, gin.H{
		"aggregate_id": aggregateID,
		"analysis":     result,
	})
}

func toModelEvent(pbEvent interface{}) *model.AuditEvent {
	return nil
}
