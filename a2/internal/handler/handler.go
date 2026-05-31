package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"task-scheduler/internal/model"
	"task-scheduler/internal/scheduler"
	"task-scheduler/internal/service"
)

const defaultTimeout = 10 * time.Second

type TaskHandler struct {
	taskService    service.TaskService
	taskLogService service.TaskLogService
	scheduler      *scheduler.Scheduler
}

func NewTaskHandler(
	taskService service.TaskService,
	taskLogService service.TaskLogService,
	sched *scheduler.Scheduler,
) *TaskHandler {
	return &TaskHandler{
		taskService:    taskService,
		taskLogService: taskLogService,
		scheduler:      sched,
	}
}

func (h *TaskHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.Use(h.timeoutMiddleware())

	tasks := r.Group("/tasks")
	{
		tasks.POST("", h.CreateTask)
		tasks.GET("", h.ListTasks)
		tasks.GET("/:id", h.GetTask)
		tasks.PUT("/:id", h.UpdateTask)
		tasks.DELETE("/:id", h.DeleteTask)
		tasks.POST("/:id/trigger", h.TriggerTask)
		tasks.POST("/:id/pause", h.PauseTask)
		tasks.POST("/:id/resume", h.ResumeTask)
		tasks.POST("/:id/cancel", h.CancelTask)
		tasks.GET("/:id/logs", h.GetTaskLogs)
		tasks.GET("/:id/dependencies", h.GetTaskDependencies)
		tasks.POST("/:id/dependencies", h.AddTaskDependency)
		tasks.DELETE("/:id/dependencies/:parent_id", h.RemoveTaskDependency)
	}

	logs := r.Group("/logs")
	{
		logs.GET("/:id", h.GetLog)
	}

	notifyConfigs := r.Group("/notify-configs")
	{
		notifyConfigs.POST("", h.CreateNotifyConfig)
		notifyConfigs.GET("", h.ListNotifyConfigs)
		notifyConfigs.GET("/:id", h.GetNotifyConfig)
		notifyConfigs.PUT("/:id", h.UpdateNotifyConfig)
		notifyConfigs.DELETE("/:id", h.DeleteNotifyConfig)
	}

	autoscale := r.Group("/autoscale")
	{
		autoscale.GET("", h.GetAutoscaleConfig)
		autoscale.PUT("", h.UpdateAutoscaleConfig)
	}

	r.GET("/health", h.HealthCheck)
	r.GET("/status", h.Status)
}

func (h *TaskHandler) timeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), defaultTimeout)
		defer cancel()
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req model.CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		task *model.Task
		err  error
	}, 1)

	go func() {
		task, err := h.taskService.CreateTask(&req)
		done <- struct {
			task *model.Task
			err  error
		}{task, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusCreated, res.task)
	}
}

func (h *TaskHandler) ListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	ctx := c.Request.Context()
	done := make(chan struct {
		tasks []model.Task
		total int64
		err   error
	}, 1)

	go func() {
		tasks, total, err := h.taskService.ListTasks(page, pageSize)
		done <- struct {
			tasks []model.Task
			total int64
			err   error
		}{tasks, total, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, model.PagedResponse{
			Total:    res.total,
			Page:     page,
			PageSize: pageSize,
			Data:     res.tasks,
		})
	}
}

func (h *TaskHandler) GetTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		task *model.Task
		err  error
	}, 1)

	go func() {
		task, err := h.taskService.GetTask(id)
		done <- struct {
			task *model.Task
			err  error
		}{task, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		c.JSON(http.StatusOK, res.task)
	}
}

func (h *TaskHandler) UpdateTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	var req model.UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		task *model.Task
		err  error
	}, 1)

	go func() {
		task, err := h.taskService.UpdateTask(id, &req)
		done <- struct {
			task *model.Task
			err  error
		}{task, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, res.task)
	}
}

func (h *TaskHandler) DeleteTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.DeleteTask(id)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func (h *TaskHandler) TriggerTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.TriggerTask(id)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "task triggered"})
	}
}

func (h *TaskHandler) PauseTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.PauseTask(id)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "task paused"})
	}
}

func (h *TaskHandler) ResumeTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.ResumeTask(id)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "task resumed"})
	}
}

func (h *TaskHandler) CancelTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	if h.scheduler.CancelRunningTask(id) {
		c.JSON(http.StatusOK, gin.H{"message": "task cancellation signal sent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task is not running"})
}

func (h *TaskHandler) GetTaskLogs(c *gin.Context) {
	taskID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	ctx := c.Request.Context()
	done := make(chan struct {
		logs  []model.TaskLog
		total int64
		err   error
	}, 1)

	go func() {
		logs, total, err := h.taskLogService.GetTaskLogs(taskID, page, pageSize)
		done <- struct {
			logs  []model.TaskLog
			total int64
			err   error
		}{logs, total, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, model.PagedResponse{
			Total:    res.total,
			Page:     page,
			PageSize: pageSize,
			Data:     res.logs,
		})
	}
}

func (h *TaskHandler) GetLog(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid log id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		log *model.TaskLog
		err error
	}, 1)

	go func() {
		log, err := h.taskLogService.GetLog(id)
		done <- struct {
			log *model.TaskLog
			err error
		}{log, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
			return
		}
		c.JSON(http.StatusOK, res.log)
	}
}

func (h *TaskHandler) GetTaskDependencies(c *gin.Context) {
	taskID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		deps []model.TaskDependency
		err  error
	}, 1)

	go func() {
		deps, err := h.taskService.GetTaskDependencies(taskID)
		done <- struct {
			deps []model.TaskDependency
			err  error
		}{deps, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, res.deps)
	}
}

type addDependencyRequest struct {
	ParentTaskID int64 `json:"parent_task_id" binding:"required"`
}

func (h *TaskHandler) AddTaskDependency(c *gin.Context) {
	taskID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	var req addDependencyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.AddTaskDependency(taskID, req.ParentTaskID)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"message": "dependency added"})
	}
}

func (h *TaskHandler) RemoveTaskDependency(c *gin.Context) {
	taskID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	parentTaskID, err := strconv.ParseInt(c.Param("parent_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent task id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.taskService.RemoveTaskDependency(taskID, parentTaskID)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "dependency removed"})
	}
}

func (h *TaskHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}

func (h *TaskHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"is_leader":     h.scheduler.IsLeader(),
		"status":        "running",
		"worker_count":  h.scheduler.WorkerCount(),
		"queue_length":  h.scheduler.QueueLength(),
	})
}

type NotifyConfigHandler struct {
	service service.NotifyConfigService
}

func NewNotifyConfigHandler(svc service.NotifyConfigService) *NotifyConfigHandler {
	return &NotifyConfigHandler{service: svc}
}

func (h *NotifyConfigHandler) CreateNotifyConfig(c *gin.Context) {
	var req model.CreateNotifyConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		cfg *model.NotifyConfig
		err error
	}, 1)

	go func() {
		cfg, err := h.service.Create(&req)
		done <- struct {
			cfg *model.NotifyConfig
			err error
		}{cfg, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusCreated, res.cfg)
	}
}

func (h *NotifyConfigHandler) ListNotifyConfigs(c *gin.Context) {
	ctx := c.Request.Context()
	done := make(chan struct {
		cfgs []model.NotifyConfig
		err  error
	}, 1)

	go func() {
		cfgs, err := h.service.List()
		done <- struct {
			cfgs []model.NotifyConfig
			err  error
		}{cfgs, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, res.cfgs)
	}
}

func (h *NotifyConfigHandler) GetNotifyConfig(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		cfg *model.NotifyConfig
		err error
	}, 1)

	go func() {
		cfg, err := h.service.Get(id)
		done <- struct {
			cfg *model.NotifyConfig
			err error
		}{cfg, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "notify config not found"})
			return
		}
		c.JSON(http.StatusOK, res.cfg)
	}
}

func (h *NotifyConfigHandler) UpdateNotifyConfig(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req model.UpdateNotifyConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		cfg *model.NotifyConfig
		err error
	}, 1)

	go func() {
		cfg, err := h.service.Update(id, &req)
		done <- struct {
			cfg *model.NotifyConfig
			err error
		}{cfg, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, res.cfg)
	}
}

func (h *NotifyConfigHandler) DeleteNotifyConfig(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ctx := c.Request.Context()
	done := make(chan error, 1)

	go func() {
		done <- h.service.Delete(id)
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case err := <-done:
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

type AutoscaleHandler struct {
	service   service.AutoscaleConfigService
	scheduler *scheduler.Scheduler
}

func NewAutoscaleHandler(svc service.AutoscaleConfigService, sched *scheduler.Scheduler) *AutoscaleHandler {
	return &AutoscaleHandler{service: svc, scheduler: sched}
}

func (h *AutoscaleHandler) GetAutoscaleConfig(c *gin.Context) {
	ctx := c.Request.Context()
	done := make(chan struct {
		cfg *model.AutoscaleConfig
		err error
	}, 1)

	go func() {
		cfg, err := h.service.Get()
		done <- struct {
			cfg *model.AutoscaleConfig
			err error
		}{cfg, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"config":       res.cfg,
			"worker_count": h.scheduler.WorkerCount(),
			"queue_length": h.scheduler.QueueLength(),
		})
	}
}

func (h *AutoscaleHandler) UpdateAutoscaleConfig(c *gin.Context) {
	var req model.UpdateAutoscaleConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	done := make(chan struct {
		cfg *model.AutoscaleConfig
		err error
	}, 1)

	go func() {
		cfg, err := h.service.Update(&req)
		done <- struct {
			cfg *model.AutoscaleConfig
			err error
		}{cfg, err}
	}()

	select {
	case <-ctx.Done():
		c.JSON(http.StatusRequestTimeout, gin.H{"error": "request timeout"})
		return
	case res := <-done:
		if res.err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.err.Error()})
			return
		}
		c.JSON(http.StatusOK, res.cfg)
	}
}
