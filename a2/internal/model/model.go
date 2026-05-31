package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type TaskType string

const (
	TaskTypeOnce     TaskType = "once"
	TaskTypeInterval TaskType = "interval"
	TaskTypeCron     TaskType = "cron"
)

type TaskStatus string

const (
	TaskStatusPending TaskStatus = "pending"
	TaskStatusRunning TaskStatus = "running"
	TaskStatusSuccess TaskStatus = "success"
	TaskStatusFailed  TaskStatus = "failed"
	TaskStatusPaused  TaskStatus = "paused"
	TaskStatusWaiting TaskStatus = "waiting"
)

type LogStatus string

const (
	LogStatusSuccess LogStatus = "success"
	LogStatusFailed  LogStatus = "failed"
	LogStatusRunning LogStatus = "running"
)

type DependencyStatus string

const (
	DependencyAllSuccess   DependencyStatus = "all_success"
	DependencyAnySuccess   DependencyStatus = "any_success"
	DependencyAllComplete  DependencyStatus = "all_complete"
)

type ChannelType string

const (
	ChannelTypeEmail     ChannelType = "email"
	ChannelTypeWechatWork ChannelType = "wechat_work"
)

type JSONMap map[string]interface{}

func (j JSONMap) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return json.Marshal(j)
}

func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = make(JSONMap)
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to scan JSONMap, value type: %T", value)
	}
	return json.Unmarshal(bytes, j)
}

type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return nil, nil
	}
	return json.Marshal(a)
}

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = StringArray{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to scan StringArray, value type: %T", value)
	}
	return json.Unmarshal(bytes, a)
}

type Task struct {
	ID                int64            `gorm:"primaryKey;column:id" json:"id"`
	Name              string           `gorm:"column:name;not null" json:"name"`
	Type              TaskType         `gorm:"column:type;not null" json:"type"`
	Handler           string           `gorm:"column:handler;not null" json:"handler"`
	Payload           JSONMap          `gorm:"column:payload;type:json" json:"payload"`
	Status            TaskStatus       `gorm:"column:status;not null;default:pending" json:"status"`
	CronExpr          string           `gorm:"column:cron_expr" json:"cron_expr,omitempty"`
	IntervalSeconds   int              `gorm:"column:interval_seconds" json:"interval_seconds,omitempty"`
	RunAt             *time.Time       `gorm:"column:run_at" json:"run_at,omitempty"`
	MaxRetry          int              `gorm:"column:max_retry;not null;default:3" json:"max_retry"`
	RetryCount        int              `gorm:"column:retry_count;not null;default:0" json:"retry_count"`
	TimeoutSeconds    int              `gorm:"column:timeout_seconds;not null;default:60" json:"timeout_seconds"`
	LastRunAt         *time.Time       `gorm:"column:last_run_at" json:"last_run_at,omitempty"`
	NextRunAt         *time.Time       `gorm:"column:next_run_at" json:"next_run_at,omitempty"`
	ParentTaskID      *int64           `gorm:"column:parent_task_id" json:"parent_task_id,omitempty"`
	DependencyStatus  DependencyStatus `gorm:"column:dependency_status;default:all_success" json:"dependency_status,omitempty"`
	NotifyOnSuccess   bool             `gorm:"column:notify_on_success;default:0" json:"notify_on_success"`
	NotifyOnFailure   bool             `gorm:"column:notify_on_failure;default:1" json:"notify_on_failure"`
	NotifyChannels    StringArray      `gorm:"column:notify_channels;type:json" json:"notify_channels,omitempty"`
	Priority          int              `gorm:"column:priority;not null;default:0" json:"priority"`
	CreatedAt         time.Time        `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time        `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (Task) TableName() string {
	return "tasks"
}

type TaskLog struct {
	ID         int64      `gorm:"primaryKey;column:id" json:"id"`
	TaskID     int64      `gorm:"column:task_id;not null" json:"task_id"`
	Status     LogStatus  `gorm:"column:status;not null" json:"status"`
	StartTime  time.Time  `gorm:"column:start_time;not null" json:"start_time"`
	EndTime    *time.Time `gorm:"column:end_time" json:"end_time,omitempty"`
	DurationMs int64      `gorm:"column:duration_ms" json:"duration_ms,omitempty"`
	Result     string     `gorm:"column:result;type:text" json:"result,omitempty"`
	ErrorMsg   string     `gorm:"column:error_msg;type:text" json:"error_msg,omitempty"`
	WorkerID   string     `gorm:"column:worker_id" json:"worker_id,omitempty"`
	CreatedAt  time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (TaskLog) TableName() string {
	return "task_logs"
}

type TaskDependency struct {
	ID           int64     `gorm:"primaryKey;column:id" json:"id"`
	TaskID       int64     `gorm:"column:task_id;not null" json:"task_id"`
	ParentTaskID int64     `gorm:"column:parent_task_id;not null" json:"parent_task_id"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (TaskDependency) TableName() string {
	return "task_dependencies"
}

type NotifyConfig struct {
	ID          int64       `gorm:"primaryKey;column:id" json:"id"`
	Name        string      `gorm:"column:name;not null" json:"name"`
	ChannelType ChannelType `gorm:"column:channel_type;not null" json:"channel_type"`
	Config      JSONMap     `gorm:"column:config;type:json;not null" json:"config"`
	IsDefault   bool        `gorm:"column:is_default;default:0" json:"is_default"`
	Enabled     bool        `gorm:"column:enabled;default:1" json:"enabled"`
	CreatedAt   time.Time   `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time   `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (NotifyConfig) TableName() string {
	return "notify_configs"
}

type AutoscaleConfig struct {
	ID                 int64     `gorm:"primaryKey;column:id" json:"id"`
	Name               string    `gorm:"column:name;not null;default:default" json:"name"`
	MinWorkers         int       `gorm:"column:min_workers;not null;default:1" json:"min_workers"`
	MaxWorkers         int       `gorm:"column:max_workers;not null;default:20" json:"max_workers"`
	ScaleUpThreshold   int       `gorm:"column:scale_up_threshold;not null;default:100" json:"scale_up_threshold"`
	ScaleDownThreshold int       `gorm:"column:scale_down_threshold;not null;default:10" json:"scale_down_threshold"`
	ScaleUpStep        int       `gorm:"column:scale_up_step;not null;default:2" json:"scale_up_step"`
	ScaleDownStep      int       `gorm:"column:scale_down_step;not null;default:1" json:"scale_down_step"`
	CooldownSeconds    int       `gorm:"column:cooldown_seconds;not null;default:60" json:"cooldown_seconds"`
	Enabled            bool      `gorm:"column:enabled;default:1" json:"enabled"`
	UpdatedAt          time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
	CreatedAt          time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (AutoscaleConfig) TableName() string {
	return "autoscale_configs"
}

type CreateTaskRequest struct {
	Name             string         `json:"name" binding:"required"`
	Type             string         `json:"type" binding:"required,oneof=once interval cron"`
	Handler          string         `json:"handler" binding:"required"`
	Payload          JSONMap        `json:"payload"`
	CronExpr         string         `json:"cron_expr"`
	IntervalSeconds  int            `json:"interval_seconds"`
	RunAt            string         `json:"run_at"`
	MaxRetry         int            `json:"max_retry"`
	TimeoutSeconds   int            `json:"timeout_seconds"`
	ParentTaskID     *int64         `json:"parent_task_id"`
	DependencyIDs    []int64        `json:"dependency_ids"`
	DependencyStatus string         `json:"dependency_status"`
	NotifyOnSuccess  bool           `json:"notify_on_success"`
	NotifyOnFailure  bool           `json:"notify_on_failure"`
	NotifyChannels   []string       `json:"notify_channels"`
	Priority         int            `json:"priority"`
}

type UpdateTaskRequest struct {
	Name             string   `json:"name"`
	Type             string   `json:"type"`
	Handler          string   `json:"handler"`
	Payload          JSONMap  `json:"payload"`
	CronExpr         string   `json:"cron_expr"`
	IntervalSeconds  int      `json:"interval_seconds"`
	RunAt            string   `json:"run_at"`
	MaxRetry         int      `json:"max_retry"`
	TimeoutSeconds   int      `json:"timeout_seconds"`
	Status           string   `json:"status"`
	DependencyStatus string   `json:"dependency_status"`
	NotifyOnSuccess  *bool    `json:"notify_on_success"`
	NotifyOnFailure  *bool    `json:"notify_on_failure"`
	NotifyChannels   []string `json:"notify_channels"`
	Priority         *int     `json:"priority"`
}

type TaskResponse struct {
	Task
}

type PagedResponse struct {
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	Data     interface{} `json:"data"`
}

type CreateNotifyConfigRequest struct {
	Name        string      `json:"name" binding:"required"`
	ChannelType string      `json:"channel_type" binding:"required,oneof=email wechat_work"`
	Config      JSONMap     `json:"config" binding:"required"`
	IsDefault   bool        `json:"is_default"`
}

type UpdateNotifyConfigRequest struct {
	Name        string  `json:"name"`
	ChannelType string  `json:"channel_type"`
	Config      JSONMap `json:"config"`
	IsDefault   *bool   `json:"is_default"`
	Enabled     *bool   `json:"enabled"`
}

type UpdateAutoscaleConfigRequest struct {
	MinWorkers         *int  `json:"min_workers"`
	MaxWorkers         *int  `json:"max_workers"`
	ScaleUpThreshold   *int  `json:"scale_up_threshold"`
	ScaleDownThreshold *int  `json:"scale_down_threshold"`
	ScaleUpStep        *int  `json:"scale_up_step"`
	ScaleDownStep      *int  `json:"scale_down_step"`
	CooldownSeconds    *int  `json:"cooldown_seconds"`
	Enabled            *bool `json:"enabled"`
}
