package service

import (
	"fmt"
	"time"

	"task-scheduler/internal/model"
	"task-scheduler/internal/repository"
	"task-scheduler/internal/scheduler"
)

type TaskService interface {
	CreateTask(req *model.CreateTaskRequest) (*model.Task, error)
	UpdateTask(id int64, req *model.UpdateTaskRequest) (*model.Task, error)
	DeleteTask(id int64) error
	GetTask(id int64) (*model.Task, error)
	ListTasks(page, pageSize int) ([]model.Task, int64, error)
	TriggerTask(id int64) error
	PauseTask(id int64) error
	ResumeTask(id int64) error
	GetTaskDependencies(taskID int64) ([]model.TaskDependency, error)
	AddTaskDependency(taskID, parentTaskID int64) error
	RemoveTaskDependency(taskID, parentTaskID int64) error
}

type TaskLogService interface {
	GetTaskLogs(taskID int64, page, pageSize int) ([]model.TaskLog, int64, error)
	GetLog(id int64) (*model.TaskLog, error)
}

type NotifyConfigService interface {
	Create(req *model.CreateNotifyConfigRequest) (*model.NotifyConfig, error)
	Update(id int64, req *model.UpdateNotifyConfigRequest) (*model.NotifyConfig, error)
	Delete(id int64) error
	Get(id int64) (*model.NotifyConfig, error)
	List() ([]model.NotifyConfig, error)
}

type AutoscaleConfigService interface {
	Get() (*model.AutoscaleConfig, error)
	Update(req *model.UpdateAutoscaleConfigRequest) (*model.AutoscaleConfig, error)
}

type AutoscaleConfigUpdater func(cfg *model.AutoscaleConfig)

type taskService struct {
	taskRepo    repository.TaskRepository
	depRepo     repository.TaskDependencyRepository
	scheduler   *scheduler.Scheduler
}

func NewTaskService(taskRepo repository.TaskRepository, depRepo repository.TaskDependencyRepository, sched *scheduler.Scheduler) TaskService {
	return &taskService{
		taskRepo:  taskRepo,
		depRepo:   depRepo,
		scheduler: sched,
	}
}

func (s *taskService) CreateTask(req *model.CreateTaskRequest) (*model.Task, error) {
	task := &model.Task{
		Name:            req.Name,
		Type:            model.TaskType(req.Type),
		Handler:         req.Handler,
		Payload:         req.Payload,
		Status:          model.TaskStatusPending,
		MaxRetry:        req.MaxRetry,
		TimeoutSeconds:  req.TimeoutSeconds,
		NotifyOnSuccess: req.NotifyOnSuccess,
		NotifyOnFailure: req.NotifyOnFailure,
		NotifyChannels:  req.NotifyChannels,
		Priority:        req.Priority,
	}

	if req.DependencyStatus != "" {
		task.DependencyStatus = model.DependencyStatus(req.DependencyStatus)
	} else {
		task.DependencyStatus = model.DependencyAllSuccess
	}

	if task.MaxRetry == 0 {
		task.MaxRetry = 3
	}
	if task.TimeoutSeconds == 0 {
		task.TimeoutSeconds = 60
	}

	switch task.Type {
	case model.TaskTypeOnce:
		if req.RunAt == "" {
			return nil, fmt.Errorf("run_at is required for once tasks")
		}
		runAt, err := time.Parse(time.RFC3339, req.RunAt)
		if err != nil {
			return nil, fmt.Errorf("invalid run_at format, use RFC3339: %w", err)
		}
		task.RunAt = &runAt
		task.NextRunAt = &runAt

	case model.TaskTypeInterval:
		if req.IntervalSeconds <= 0 {
			return nil, fmt.Errorf("interval_seconds must be positive for interval tasks")
		}
		task.IntervalSeconds = req.IntervalSeconds
		now := time.Now()
		task.NextRunAt = &now

	case model.TaskTypeCron:
		if req.CronExpr == "" {
			return nil, fmt.Errorf("cron_expr is required for cron tasks")
		}
		task.CronExpr = req.CronExpr
	}

	if task.NextRunAt == nil {
		now := time.Now()
		task.NextRunAt = &now
	}

	if task.Type == model.TaskTypeCron {
		calculated := s.scheduler.CalculateNextRunTime(task)
		if calculated != nil {
			task.NextRunAt = calculated
		}
	}

	if len(req.DependencyIDs) > 0 {
		task.Status = model.TaskStatusWaiting
	}

	if err := s.taskRepo.Create(task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	for _, parentID := range req.DependencyIDs {
		if parentID == task.ID {
			continue
		}
		dep := &model.TaskDependency{
			TaskID:       task.ID,
			ParentTaskID: parentID,
		}
		if err := s.depRepo.Create(dep); err != nil {
			return nil, fmt.Errorf("failed to create dependency: %w", err)
		}
	}

	return task, nil
}

func (s *taskService) UpdateTask(id int64, req *model.UpdateTaskRequest) (*model.Task, error) {
	task, err := s.taskRepo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if req.Name != "" {
		task.Name = req.Name
	}
	if req.Type != "" {
		task.Type = model.TaskType(req.Type)
	}
	if req.Handler != "" {
		task.Handler = req.Handler
	}
	if req.Payload != nil {
		task.Payload = req.Payload
	}
	if req.CronExpr != "" {
		task.CronExpr = req.CronExpr
	}
	if req.IntervalSeconds > 0 {
		task.IntervalSeconds = req.IntervalSeconds
	}
	if req.RunAt != "" {
		runAt, err := time.Parse(time.RFC3339, req.RunAt)
		if err != nil {
			return nil, fmt.Errorf("invalid run_at format: %w", err)
		}
		task.RunAt = &runAt
	}
	if req.MaxRetry > 0 {
		task.MaxRetry = req.MaxRetry
	}
	if req.TimeoutSeconds > 0 {
		task.TimeoutSeconds = req.TimeoutSeconds
	}
	if req.Status != "" {
		task.Status = model.TaskStatus(req.Status)
	}
	if req.DependencyStatus != "" {
		task.DependencyStatus = model.DependencyStatus(req.DependencyStatus)
	}
	if req.NotifyOnSuccess != nil {
		task.NotifyOnSuccess = *req.NotifyOnSuccess
	}
	if req.NotifyOnFailure != nil {
		task.NotifyOnFailure = *req.NotifyOnFailure
	}
	if req.NotifyChannels != nil {
		task.NotifyChannels = req.NotifyChannels
	}
	if req.Priority != nil {
		task.Priority = *req.Priority
	}

	if err := s.taskRepo.Update(task); err != nil {
		return nil, fmt.Errorf("failed to update task: %w", err)
	}

	return task, nil
}

func (s *taskService) DeleteTask(id int64) error {
	_, err := s.taskRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}
	if err := s.depRepo.DeleteByTaskID(id); err != nil {
		return fmt.Errorf("failed to delete dependencies: %w", err)
	}
	return s.taskRepo.Delete(id)
}

func (s *taskService) GetTask(id int64) (*model.Task, error) {
	return s.taskRepo.GetByID(id)
}

func (s *taskService) ListTasks(page, pageSize int) ([]model.Task, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return s.taskRepo.List(page, pageSize)
}

func (s *taskService) TriggerTask(id int64) error {
	task, err := s.taskRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	now := time.Now()
	return s.taskRepo.UpdateNextRun(task.ID, &now)
}

func (s *taskService) PauseTask(id int64) error {
	return s.taskRepo.UpdateStatus(id, model.TaskStatusPaused)
}

func (s *taskService) ResumeTask(id int64) error {
	task, err := s.taskRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	now := time.Now()
	if err := s.taskRepo.UpdateTaskExecution(task.ID, model.TaskStatusPending, nil, &now, task.RetryCount); err != nil {
		return fmt.Errorf("failed to resume task: %w", err)
	}
	return nil
}

func (s *taskService) GetTaskDependencies(taskID int64) ([]model.TaskDependency, error) {
	return s.depRepo.GetByTaskID(taskID)
}

func (s *taskService) AddTaskDependency(taskID, parentTaskID int64) error {
	if taskID == parentTaskID {
		return fmt.Errorf("cannot add self as dependency")
	}
	dep := &model.TaskDependency{
		TaskID:       taskID,
		ParentTaskID: parentTaskID,
	}
	if err := s.depRepo.Create(dep); err != nil {
		return fmt.Errorf("failed to add dependency: %w", err)
	}
	return s.taskRepo.UpdateStatus(taskID, model.TaskStatusWaiting)
}

func (s *taskService) RemoveTaskDependency(taskID, parentTaskID int64) error {
	deps, err := s.depRepo.GetByTaskID(taskID)
	if err != nil {
		return fmt.Errorf("failed to get dependencies: %w", err)
	}

	removed := false
	for _, d := range deps {
		if d.TaskID == taskID && d.ParentTaskID == parentTaskID {
			removed = true
			break
		}
	}

	if !removed {
		return fmt.Errorf("dependency not found")
	}

	if err := s.depRepo.DeleteByTaskID(taskID); err != nil {
		return fmt.Errorf("failed to remove dependencies: %w", err)
	}

	for _, d := range deps {
		if d.ParentTaskID == parentTaskID {
			continue
		}
		_ = s.depRepo.Create(&d)
	}

	remainingDeps, _ := s.depRepo.GetByTaskID(taskID)
	if len(remainingDeps) == 0 {
		now := time.Now()
		return s.taskRepo.UpdateNextRun(taskID, &now)
	}

	return nil
}

type taskLogService struct {
	logRepo repository.TaskLogRepository
}

func NewTaskLogService(logRepo repository.TaskLogRepository) TaskLogService {
	return &taskLogService{logRepo: logRepo}
}

func (s *taskLogService) GetTaskLogs(taskID int64, page, pageSize int) ([]model.TaskLog, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return s.logRepo.GetByTaskID(taskID, page, pageSize)
}

func (s *taskLogService) GetLog(id int64) (*model.TaskLog, error) {
	return s.logRepo.GetByID(id)
}

type notifyConfigService struct {
	repo repository.NotifyConfigRepository
}

func NewNotifyConfigService(repo repository.NotifyConfigRepository) NotifyConfigService {
	return &notifyConfigService{repo: repo}
}

func (s *notifyConfigService) Create(req *model.CreateNotifyConfigRequest) (*model.NotifyConfig, error) {
	cfg := &model.NotifyConfig{
		Name:        req.Name,
		ChannelType: model.ChannelType(req.ChannelType),
		Config:      req.Config,
		IsDefault:   req.IsDefault,
		Enabled:     true,
	}

	if req.IsDefault {
		existing, _ := s.repo.GetDefault(cfg.ChannelType)
		if existing != nil && existing.ID != 0 {
			existing.IsDefault = false
			_ = s.repo.Update(existing)
		}
	}

	if err := s.repo.Create(cfg); err != nil {
		return nil, fmt.Errorf("failed to create notify config: %w", err)
	}
	return cfg, nil
}

func (s *notifyConfigService) Update(id int64, req *model.UpdateNotifyConfigRequest) (*model.NotifyConfig, error) {
	cfg, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("notify config not found: %w", err)
	}

	if req.Name != "" {
		cfg.Name = req.Name
	}
	if req.ChannelType != "" {
		cfg.ChannelType = model.ChannelType(req.ChannelType)
	}
	if req.Config != nil {
		cfg.Config = req.Config
	}
	if req.IsDefault != nil {
		if *req.IsDefault {
			existing, _ := s.repo.GetDefault(cfg.ChannelType)
			if existing != nil && existing.ID != cfg.ID {
				existing.IsDefault = false
				_ = s.repo.Update(existing)
			}
		}
		cfg.IsDefault = *req.IsDefault
	}
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}

	if err := s.repo.Update(cfg); err != nil {
		return nil, fmt.Errorf("failed to update notify config: %w", err)
	}
	return cfg, nil
}

func (s *notifyConfigService) Delete(id int64) error {
	_, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("notify config not found: %w", err)
	}
	return s.repo.Delete(id)
}

func (s *notifyConfigService) Get(id int64) (*model.NotifyConfig, error) {
	return s.repo.GetByID(id)
}

func (s *notifyConfigService) List() ([]model.NotifyConfig, error) {
	return s.repo.List()
}

type autoscaleConfigService struct {
	repo      repository.AutoscaleConfigRepository
	scheduler *scheduler.Scheduler
	updater   AutoscaleConfigUpdater
}

func NewAutoscaleConfigService(repo repository.AutoscaleConfigRepository, sched *scheduler.Scheduler, updater AutoscaleConfigUpdater) AutoscaleConfigService {
	return &autoscaleConfigService{repo: repo, scheduler: sched, updater: updater}
}

func (s *autoscaleConfigService) Get() (*model.AutoscaleConfig, error) {
	cfg, err := s.repo.GetOrCreateDefault()
	if err != nil {
		return nil, fmt.Errorf("failed to get autoscale config: %w", err)
	}
	return cfg, nil
}

func (s *autoscaleConfigService) Update(req *model.UpdateAutoscaleConfigRequest) (*model.AutoscaleConfig, error) {
	cfg, err := s.repo.GetOrCreateDefault()
	if err != nil {
		return nil, fmt.Errorf("failed to get autoscale config: %w", err)
	}

	if req.MinWorkers != nil {
		cfg.MinWorkers = *req.MinWorkers
	}
	if req.MaxWorkers != nil {
		cfg.MaxWorkers = *req.MaxWorkers
	}
	if req.ScaleUpThreshold != nil {
		cfg.ScaleUpThreshold = *req.ScaleUpThreshold
	}
	if req.ScaleDownThreshold != nil {
		cfg.ScaleDownThreshold = *req.ScaleDownThreshold
	}
	if req.ScaleUpStep != nil {
		cfg.ScaleUpStep = *req.ScaleUpStep
	}
	if req.ScaleDownStep != nil {
		cfg.ScaleDownStep = *req.ScaleDownStep
	}
	if req.CooldownSeconds != nil {
		cfg.CooldownSeconds = *req.CooldownSeconds
	}
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}

	if cfg.MinWorkers < 1 {
		cfg.MinWorkers = 1
	}
	if cfg.MaxWorkers < cfg.MinWorkers {
		cfg.MaxWorkers = cfg.MinWorkers
	}
	if cfg.ScaleDownThreshold >= cfg.ScaleUpThreshold {
		cfg.ScaleDownThreshold = cfg.ScaleUpThreshold / 2
	}

	if err := s.repo.UpdateDefault(cfg); err != nil {
		return nil, fmt.Errorf("failed to update autoscale config: %w", err)
	}

	if s.updater != nil {
		s.updater(cfg)
	}

	return cfg, nil
}
