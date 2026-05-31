package repository

import (
	"time"

	"gorm.io/gorm"

	"task-scheduler/internal/model"
)

type TaskRepository interface {
	Create(task *model.Task) error
	Update(task *model.Task) error
	Delete(id int64) error
	GetByID(id int64) (*model.Task, error)
	List(page, pageSize int) ([]model.Task, int64, error)
	GetDueTasks(now time.Time, limit int) ([]model.Task, error)
	UpdateStatus(id int64, status model.TaskStatus) error
	UpdateNextRun(id int64, nextRunAt *time.Time) error
	UpdateTaskExecution(id int64, status model.TaskStatus, lastRunAt *time.Time, nextRunAt *time.Time, retryCount int) error
	GetWaitingChildren(parentID int64) ([]model.Task, error)
}

type TaskLogRepository interface {
	Create(log *model.TaskLog) error
	Update(log *model.TaskLog) error
	GetByTaskID(taskID int64, page, pageSize int) ([]model.TaskLog, int64, error)
	GetByID(id int64) (*model.TaskLog, error)
	GetLatestByTaskID(taskID int64) (*model.TaskLog, error)
}

type TaskDependencyRepository interface {
	Create(dep *model.TaskDependency) error
	DeleteByTaskID(taskID int64) error
	GetByTaskID(taskID int64) ([]model.TaskDependency, error)
	GetByParentTaskID(parentTaskID int64) ([]model.TaskDependency, error)
}

type NotifyConfigRepository interface {
	Create(cfg *model.NotifyConfig) error
	Update(cfg *model.NotifyConfig) error
	Delete(id int64) error
	GetByID(id int64) (*model.NotifyConfig, error)
	List() ([]model.NotifyConfig, error)
	GetByChannel(channelType model.ChannelType) ([]model.NotifyConfig, error)
	GetDefault(channelType model.ChannelType) (*model.NotifyConfig, error)
}

type AutoscaleConfigRepository interface {
	GetDefault() (*model.AutoscaleConfig, error)
	GetOrCreateDefault() (*model.AutoscaleConfig, error)
	UpdateDefault(cfg *model.AutoscaleConfig) error
}

type taskRepository struct {
	db *gorm.DB
}

func NewTaskRepository(db *gorm.DB) TaskRepository {
	return &taskRepository{db: db}
}

func (r *taskRepository) Create(task *model.Task) error {
	return r.db.Create(task).Error
}

func (r *taskRepository) Update(task *model.Task) error {
	return r.db.Save(task).Error
}

func (r *taskRepository) Delete(id int64) error {
	return r.db.Delete(&model.Task{}, id).Error
}

func (r *taskRepository) GetByID(id int64) (*model.Task, error) {
	var task model.Task
	err := r.db.First(&task, id).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *taskRepository) List(page, pageSize int) ([]model.Task, int64, error) {
	var tasks []model.Task
	var total int64

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	err := r.db.Model(&model.Task{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	err = r.db.Order("priority desc, id desc").Offset(offset).Limit(pageSize).Find(&tasks).Error
	if err != nil {
		return nil, 0, err
	}

	return tasks, total, nil
}

func (r *taskRepository) GetDueTasks(now time.Time, limit int) ([]model.Task, error) {
	var tasks []model.Task

	err := r.db.Where(
		"status IN ? AND next_run_at <= ?",
		[]model.TaskStatus{model.TaskStatusPending, model.TaskStatusFailed, model.TaskStatusWaiting},
		now,
	).Order("priority desc, next_run_at ASC").Limit(limit).Find(&tasks).Error

	return tasks, err
}

func (r *taskRepository) UpdateStatus(id int64, status model.TaskStatus) error {
	return r.db.Model(&model.Task{}).Where("id = ?", id).Update("status", status).Error
}

func (r *taskRepository) UpdateNextRun(id int64, nextRunAt *time.Time) error {
	updates := map[string]interface{}{}
	if nextRunAt != nil {
		updates["next_run_at"] = *nextRunAt
	}
	return r.db.Model(&model.Task{}).Where("id = ?", id).Updates(updates).Error
}

func (r *taskRepository) UpdateTaskExecution(id int64, status model.TaskStatus, lastRunAt *time.Time, nextRunAt *time.Time, retryCount int) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if lastRunAt != nil {
		updates["last_run_at"] = *lastRunAt
	}
	if nextRunAt != nil {
		updates["next_run_at"] = *nextRunAt
	}
	if retryCount >= 0 {
		updates["retry_count"] = retryCount
	}
	return r.db.Model(&model.Task{}).Where("id = ?", id).Updates(updates).Error
}

func (r *taskRepository) GetWaitingChildren(parentID int64) ([]model.Task, error) {
	var tasks []model.Task
	err := r.db.Joins(
		"JOIN task_dependencies td ON td.task_id = tasks.id",
	).Where(
		"td.parent_task_id = ? AND tasks.status = ?",
		parentID, model.TaskStatusWaiting,
	).Find(&tasks).Error
	return tasks, err
}

type taskLogRepository struct {
	db *gorm.DB
}

func NewTaskLogRepository(db *gorm.DB) TaskLogRepository {
	return &taskLogRepository{db: db}
}

func (r *taskLogRepository) Create(log *model.TaskLog) error {
	return r.db.Create(log).Error
}

func (r *taskLogRepository) Update(log *model.TaskLog) error {
	return r.db.Save(log).Error
}

func (r *taskLogRepository) GetByTaskID(taskID int64, page, pageSize int) ([]model.TaskLog, int64, error) {
	var logs []model.TaskLog
	var total int64

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	err := r.db.Model(&model.TaskLog{}).Where("task_id = ?", taskID).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	err = r.db.Where("task_id = ?", taskID).Order("created_at desc").Offset(offset).Limit(pageSize).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

func (r *taskLogRepository) GetByID(id int64) (*model.TaskLog, error) {
	var log model.TaskLog
	err := r.db.First(&log, id).Error
	if err != nil {
		return nil, err
	}
	return &log, nil
}

func (r *taskLogRepository) GetLatestByTaskID(taskID int64) (*model.TaskLog, error) {
	var log model.TaskLog
	err := r.db.Where("task_id = ?", taskID).Order("created_at desc").First(&log).Error
	if err != nil {
		return nil, err
	}
	return &log, nil
}

type taskDependencyRepository struct {
	db *gorm.DB
}

func NewTaskDependencyRepository(db *gorm.DB) TaskDependencyRepository {
	return &taskDependencyRepository{db: db}
}

func (r *taskDependencyRepository) Create(dep *model.TaskDependency) error {
	return r.db.Create(dep).Error
}

func (r *taskDependencyRepository) DeleteByTaskID(taskID int64) error {
	return r.db.Where("task_id = ?", taskID).Delete(&model.TaskDependency{}).Error
}

func (r *taskDependencyRepository) GetByTaskID(taskID int64) ([]model.TaskDependency, error) {
	var deps []model.TaskDependency
	err := r.db.Where("task_id = ?", taskID).Find(&deps).Error
	return deps, err
}

func (r *taskDependencyRepository) GetByParentTaskID(parentTaskID int64) ([]model.TaskDependency, error) {
	var deps []model.TaskDependency
	err := r.db.Where("parent_task_id = ?", parentTaskID).Find(&deps).Error
	return deps, err
}

type notifyConfigRepository struct {
	db *gorm.DB
}

func NewNotifyConfigRepository(db *gorm.DB) NotifyConfigRepository {
	return &notifyConfigRepository{db: db}
}

func (r *notifyConfigRepository) Create(cfg *model.NotifyConfig) error {
	return r.db.Create(cfg).Error
}

func (r *notifyConfigRepository) Update(cfg *model.NotifyConfig) error {
	return r.db.Save(cfg).Error
}

func (r *notifyConfigRepository) Delete(id int64) error {
	return r.db.Delete(&model.NotifyConfig{}, id).Error
}

func (r *notifyConfigRepository) GetByID(id int64) (*model.NotifyConfig, error) {
	var cfg model.NotifyConfig
	err := r.db.First(&cfg, id).Error
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *notifyConfigRepository) List() ([]model.NotifyConfig, error) {
	var cfgs []model.NotifyConfig
	err := r.db.Order("id asc").Find(&cfgs).Error
	return cfgs, err
}

func (r *notifyConfigRepository) GetByChannel(channelType model.ChannelType) ([]model.NotifyConfig, error) {
	var cfgs []model.NotifyConfig
	err := r.db.Where("channel_type = ? AND enabled = ?", channelType, true).Find(&cfgs).Error
	return cfgs, err
}

func (r *notifyConfigRepository) GetDefault(channelType model.ChannelType) (*model.NotifyConfig, error) {
	var cfg model.NotifyConfig
	err := r.db.Where("channel_type = ? AND is_default = ? AND enabled = ?", channelType, true, true).First(&cfg).Error
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

type autoscaleConfigRepository struct {
	db *gorm.DB
}

func NewAutoscaleConfigRepository(db *gorm.DB) AutoscaleConfigRepository {
	return &autoscaleConfigRepository{db: db}
}

func (r *autoscaleConfigRepository) GetDefault() (*model.AutoscaleConfig, error) {
	var cfg model.AutoscaleConfig
	err := r.db.Where("name = ?", "default").First(&cfg).Error
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *autoscaleConfigRepository) GetOrCreateDefault() (*model.AutoscaleConfig, error) {
	var cfg model.AutoscaleConfig
	err := r.db.Where("name = ?", "default").First(&cfg).Error
	if err == nil {
		return &cfg, nil
	}

	cfg = model.AutoscaleConfig{
		Name:               "default",
		MinWorkers:         1,
		MaxWorkers:         20,
		ScaleUpThreshold:   50,
		ScaleDownThreshold: 10,
		ScaleUpStep:        2,
		ScaleDownStep:      1,
		CooldownSeconds:    60,
		Enabled:            true,
	}

	if err := r.db.Create(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *autoscaleConfigRepository) UpdateDefault(cfg *model.AutoscaleConfig) error {
	return r.db.Save(cfg).Error
}
