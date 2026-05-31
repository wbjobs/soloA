package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"task-scheduler/internal/db"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/models"
	"task-scheduler/internal/scheduler"
)

func CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: err.Error()})
		return
	}

	task := models.Task{
		Name:           req.Name,
		CronExpression: req.CronExpression,
		TaskType:       req.TaskType,
		TaskConfig:     req.TaskConfig,
		Timeout:        req.Timeout,
		RetryCount:     req.RetryCount,
		RetryInterval:  req.RetryInterval,
		Status:         models.TaskStatusEnabled,
		Description:    req.Description,
		Dependencies:   req.Dependencies,
		Callbacks:      req.Callbacks,
	}

	if req.Status != "" {
		task.Status = req.Status
	}

	if task.Timeout <= 0 {
		task.Timeout = 300
	}

	if err := db.DB.Create(&task).Error; err != nil {
		logger.Sugar.Errorf("Failed to create task: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: "Failed to create task"})
		return
	}

	if task.Status == models.TaskStatusEnabled && scheduler.GlobalScheduler != nil {
		if err := scheduler.GlobalScheduler.AddTask(&task); err != nil {
			logger.Sugar.Warnf("Failed to schedule task: %v", err)
		}
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    toTaskResponse(&task),
	})
}

func GetTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	var task models.Task
	if err := db.DB.First(&task, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, Response{Code: 404, Message: "Task not found"})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    toTaskResponse(&task),
	})
}

func ListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")
	taskType := c.Query("type")
	name := c.Query("name")

	query := db.DB.Model(&models.Task{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if taskType != "" {
		query = query.Where("task_type = ?", taskType)
	}
	if name != "" {
		query = query.Where("name LIKE ?", "%"+name+"%")
	}

	var total int64
	query.Count(&total)

	var tasks []models.Task
	offset := (page - 1) * pageSize
	query.Order("id DESC").Offset(offset).Limit(pageSize).Find(&tasks)

	taskResponses := make([]TaskResponse, len(tasks))
	for i := range tasks {
		taskResponses[i] = toTaskResponse(&tasks[i])
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data: TaskListResponse{
			Total: total,
			Tasks: taskResponses,
		},
	})
}

func UpdateTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	var task models.Task
	if err := db.DB.First(&task, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, Response{Code: 404, Message: "Task not found"})
		return
	}

	var req UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: err.Error()})
		return
	}

	if req.Name != nil {
		task.Name = *req.Name
	}
	if req.CronExpression != nil {
		task.CronExpression = *req.CronExpression
	}
	if req.TaskType != nil {
		task.TaskType = *req.TaskType
	}
	if req.TaskConfig != nil {
		task.TaskConfig = *req.TaskConfig
	}
	if req.Timeout != nil {
		task.Timeout = *req.Timeout
	}
	if req.RetryCount != nil {
		task.RetryCount = *req.RetryCount
	}
	if req.RetryInterval != nil {
		task.RetryInterval = *req.RetryInterval
	}
	if req.Status != nil {
		task.Status = *req.Status
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.Dependencies != nil {
		task.Dependencies = *req.Dependencies
	}
	if req.Callbacks != nil {
		task.Callbacks = *req.Callbacks
	}

	if err := db.DB.Save(&task).Error; err != nil {
		logger.Sugar.Errorf("Failed to update task: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: "Failed to update task"})
		return
	}

	if scheduler.GlobalScheduler != nil {
		if err := scheduler.GlobalScheduler.UpdateTask(&task); err != nil {
			logger.Sugar.Warnf("Failed to update scheduler task: %v", err)
		}
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "success",
		Data:    toTaskResponse(&task),
	})
}

func DeleteTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	var task models.Task
	if err := db.DB.First(&task, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, Response{Code: 404, Message: "Task not found"})
		return
	}

	if scheduler.GlobalScheduler != nil {
		scheduler.GlobalScheduler.RemoveTask(task.ID)
	}

	if err := db.DB.Delete(&task).Error; err != nil {
		logger.Sugar.Errorf("Failed to delete task: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: "Failed to delete task"})
		return
	}

	c.JSON(http.StatusOK, Response{Code: 200, Message: "Task deleted successfully"})
}

func TriggerTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Code: 400, Message: "Invalid task ID"})
		return
	}

	if scheduler.GlobalScheduler == nil {
		c.JSON(http.StatusServiceUnavailable, Response{Code: 503, Message: "Scheduler not available"})
		return
	}

	if err := scheduler.GlobalScheduler.TriggerTask(uint(id)); err != nil {
		logger.Sugar.Errorf("Failed to trigger task: %v", err)
		c.JSON(http.StatusInternalServerError, Response{Code: 500, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task triggered successfully",
		Data:    TriggerTaskResponse{Success: true, Message: "Task triggered"},
	})
}

func toTaskResponse(task *models.Task) TaskResponse {
	return TaskResponse{
		ID:             task.ID,
		Name:           task.Name,
		CronExpression: task.CronExpression,
		TaskType:       task.TaskType,
		TaskConfig:     task.TaskConfig,
		Timeout:        task.Timeout,
		RetryCount:     task.RetryCount,
		RetryInterval:  task.RetryInterval,
		Status:         task.Status,
		Description:    task.Description,
		Dependencies:   task.Dependencies,
		Callbacks:      task.Callbacks,
		CreatedAt:      task.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      task.UpdatedAt.Format(time.RFC3339),
	}
}
