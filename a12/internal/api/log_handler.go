package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"task-scheduler/internal/db"
	"task-scheduler/internal/models"
)

func ListLogs(c *gin.Context) {
	var req LogListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: err.Error()})
		return
	}

	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 || req.PageSize > 100 {
		req.PageSize = 20
	}

	query := db.DB.Model(&models.TaskExecutionLog{})

	if req.TaskID != nil {
		query = query.Where("task_id = ?", *req.TaskID)
	}
	if req.Status != nil {
		query = query.Where("status = ?", *req.Status)
	}
	if req.StartTime != nil {
		if startTime, err := time.Parse(time.RFC3339, *req.StartTime); err == nil {
			query = query.Where("start_time >= ?", startTime)
		}
	}
	if req.EndTime != nil {
		if endTime, err := time.Parse(time.RFC3339, *req.EndTime); err == nil {
			query = query.Where("start_time <= ?", endTime)
		}
	}

	var total int64
	query.Count(&total)

	var logs []models.TaskExecutionLog
	offset := (req.Page - 1) * req.PageSize
	query.Order("id DESC").Offset(offset).Limit(req.PageSize).Find(&logs)

	logResponses := make([]LogResponse, len(logs))
	for i := range logs {
		logResponses[i] = toLogResponse(&logs[i])
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data: LogListResponse{
			Total: total,
			Logs:  logResponses,
		},
	})
}

func GetLog(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid log ID"})
		return
	}

	var log models.TaskExecutionLog
	if err := db.DB.First(&log, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, Response{Code: 404, Message: "Log not found"})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    toLogResponse(&log),
	})
}

func GetTaskLogs(c *gin.Context) {
	taskID, err := strconv.ParseUint(c.Param("task_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	query := db.DB.Model(&models.TaskExecutionLog{}).Where("task_id = ?", uint(taskID))

	var total int64
	query.Count(&total)

	var logs []models.TaskExecutionLog
	offset := (page - 1) * pageSize
	query.Order("id DESC").Offset(offset).Limit(pageSize).Find(&logs)

	logResponses := make([]LogResponse, len(logs))
	for i := range logs {
		logResponses[i] = toLogResponse(&logs[i])
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data: LogListResponse{
			Total: total,
			Logs:  logResponses,
		},
	})
}

func toLogResponse(log *models.TaskExecutionLog) LogResponse {
	resp := LogResponse{
		ID:               log.ID,
		TaskID:           log.TaskID,
		TaskName:         log.TaskName,
		ExecutionNode:    log.ExecutionNode,
		Status:           log.Status,
		StartTime:        log.StartTime.Format(time.RFC3339),
		Duration:         log.Duration,
		RetryCount:       log.RetryCount,
		ErrorMessage:     log.ErrorMessage,
		Output:           log.Output,
		TriggerType:      log.TriggerType,
		ParentLogID:      log.ParentLogID,
		CallbackResults:  log.CallbackResults,
		DependencyCheck:  log.DependencyCheck,
	}

	if log.EndTime != nil {
		endTimeStr := log.EndTime.Format(time.RFC3339)
		resp.EndTime = &endTimeStr
	}

	return resp
}
