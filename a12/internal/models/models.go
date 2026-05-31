package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type TaskStatus string
type TaskType string
type ExecutionStatus string
type DependencyStatus string
type CallbackType string

const (
	TaskStatusEnabled  TaskStatus = "enabled"
	TaskStatusDisabled TaskStatus = "disabled"

	TaskTypeShell TaskType = "shell"
	TaskTypeHTTP  TaskType = "http"
	TaskTypeGo    TaskType = "go"

	ExecutionStatusSuccess ExecutionStatus = "success"
	ExecutionStatusFailed  ExecutionStatus = "failed"
	ExecutionStatusRunning ExecutionStatus = "running"
	ExecutionStatusTimeout ExecutionStatus = "timeout"
	ExecutionStatusSkipped ExecutionStatus = "skipped"

	DependencyStatusSuccess DependencyStatus = "success"
	DependencyStatusAny     DependencyStatus = "any"

	CallbackTypeHTTP CallbackType = "http"
	CallbackTypeGo   CallbackType = "go"
)

type Task struct {
	ID             uint             `json:"id" gorm:"primaryKey;autoIncrement"`
	Name           string           `json:"name" gorm:"size:255;not null;index"`
	CronExpression string           `json:"cron_expression" gorm:"size:100;not null"`
	TaskType       TaskType         `json:"task_type" gorm:"size:20;not null"`
	TaskConfig     TaskConfig       `json:"task_config" gorm:"type:json"`
	Timeout        int              `json:"timeout" gorm:"default:300"`
	RetryCount     int              `json:"retry_count" gorm:"default:0"`
	RetryInterval  int              `json:"retry_interval" gorm:"default:60"`
	Status         TaskStatus       `json:"status" gorm:"size:20;default:'enabled'"`
	Description    string           `json:"description" gorm:"size:500"`
	Dependencies   TaskDependencies `json:"dependencies" gorm:"type:json"`
	Callbacks      TaskCallbacks    `json:"callbacks" gorm:"type:json"`
	CreatedAt      time.Time        `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt      time.Time        `json:"updated_at" gorm:"autoUpdateTime"`
}

type TaskDependency struct {
	TaskID       uint             `json:"task_id"`
	TaskName     string           `json:"task_name"`
	RequireStatus DependencyStatus `json:"require_status"`
}

type TaskDependencies []TaskDependency

type TaskCallback struct {
	Type    CallbackType         `json:"type"`
	URL     string               `json:"url,omitempty"`
	Method  string               `json:"method,omitempty"`
	Headers map[string]string    `json:"headers,omitempty"`
	FuncName string               `json:"func_name,omitempty"`
	OnSuccess bool               `json:"on_success"`
	OnFailure bool               `json:"on_failure"`
	OnTimeout bool               `json:"on_timeout"`
	Retries   int                `json:"retries,omitempty"`
	Timeout   int                `json:"timeout,omitempty"`
}

type TaskCallbacks []TaskCallback

type TaskConfig struct {
	ShellConfig *ShellTaskConfig `json:"shell_config,omitempty"`
	HTTPConfig  *HTTPTaskConfig  `json:"http_config,omitempty"`
	GoConfig    *GoTaskConfig    `json:"go_config,omitempty"`
}

type ShellTaskConfig struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Env     []string `json:"env,omitempty"`
	WorkDir string   `json:"work_dir,omitempty"`
}

type HTTPTaskConfig struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	Timeout int               `json:"timeout,omitempty"`
}

type GoTaskConfig struct {
	FunctionName string            `json:"function_name"`
	Params       map[string]string `json:"params,omitempty"`
}

func (t *TaskConfig) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, t)
}

func (t TaskConfig) Value() (driver.Value, error) {
	return json.Marshal(t)
}

func (d *TaskDependencies) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok || len(bytes) == 0 {
		*d = TaskDependencies{}
		return nil
	}
	return json.Unmarshal(bytes, d)
}

func (d TaskDependencies) Value() (driver.Value, error) {
	if d == nil {
		return "[]", nil
	}
	return json.Marshal(d)
}

func (c *TaskCallbacks) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok || len(bytes) == 0 {
		*c = TaskCallbacks{}
		return nil
	}
	return json.Unmarshal(bytes, c)
}

func (c TaskCallbacks) Value() (driver.Value, error) {
	if c == nil {
		return "[]", nil
	}
	return json.Marshal(c)
}

type TaskExecutionLog struct {
	ID               uint            `json:"id" gorm:"primaryKey;autoIncrement"`
	TaskID           uint            `json:"task_id" gorm:"not null;index"`
	TaskName         string          `json:"task_name" gorm:"size:255;not null"`
	ExecutionNode    string          `json:"execution_node" gorm:"size:100"`
	Status           ExecutionStatus `json:"status" gorm:"size:20;not null"`
	StartTime        time.Time       `json:"start_time" gorm:"not null"`
	EndTime          *time.Time      `json:"end_time"`
	Duration         int64           `json:"duration"`
	RetryCount       int             `json:"retry_count" gorm:"default:0"`
	ErrorMessage     string          `json:"error_message" gorm:"type:text"`
	Output           string          `json:"output" gorm:"type:longtext"`
	TriggerType      string          `json:"trigger_type" gorm:"size:20"`
	ParentLogID      *uint           `json:"parent_log_id" gorm:"index"`
	CallbackResults  JSONStringSlice `json:"callback_results" gorm:"type:json"`
	DependencyCheck  string          `json:"dependency_check" gorm:"size:500"`
	CreatedAt        time.Time       `json:"created_at" gorm:"autoCreateTime"`
}

type JSONStringSlice []string

func (s *JSONStringSlice) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok || len(bytes) == 0 {
		*s = JSONStringSlice{}
		return nil
	}
	return json.Unmarshal(bytes, s)
}

func (s JSONStringSlice) Value() (driver.Value, error) {
	if s == nil {
		return "[]", nil
	}
	return json.Marshal(s)
}

type Node struct {
	ID          string    `json:"id" gorm:"primaryKey;size:100"`
	Host        string    `json:"host" gorm:"size:100"`
	GRPCPort    int       `json:"grpc_port"`
	Status      string    `json:"status" gorm:"size:20"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	CreatedAt   time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

type TaskPerformanceStats struct {
	TaskID          uint            `json:"task_id"`
	TaskName        string          `json:"task_name"`
	TotalExecutions int64           `json:"total_executions"`
	SuccessCount    int64           `json:"success_count"`
	FailedCount     int64           `json:"failed_count"`
	TimeoutCount    int64           `json:"timeout_count"`
	SkippedCount    int64           `json:"skipped_count"`
	SuccessRate     float64         `json:"success_rate"`
	AvgDuration     float64         `json:"avg_duration_ms"`
	MinDuration     int64           `json:"min_duration_ms"`
	MaxDuration     int64           `json:"max_duration_ms"`
	P50Duration     float64         `json:"p50_duration_ms"`
	P95Duration     float64         `json:"p95_duration_ms"`
	P99Duration     float64         `json:"p99_duration_ms"`
	AvgRetries      float64         `json:"avg_retries"`
	LastExecution   *time.Time      `json:"last_execution"`
	LastStatus      ExecutionStatus `json:"last_status"`
}

type TaskPipeline struct {
	ID              uint        `json:"id"`
	Name            string      `json:"name"`
	TotalTasks      int         `json:"total_tasks"`
	CompletedTasks  int         `json:"completed_tasks"`
	RunningTasks    int         `json:"running_tasks"`
	FailedTasks     int         `json:"failed_tasks"`
	Status          string      `json:"status"`
	StartTime       *time.Time  `json:"start_time"`
	EndTime         *time.Time  `json:"end_time"`
	Tasks           []PipelineTask `json:"tasks"`
}

type PipelineTask struct {
	TaskID     uint            `json:"task_id"`
	TaskName   string          `json:"task_name"`
	Order      int             `json:"order"`
	Status     ExecutionStatus `json:"status"`
	LogID      *uint           `json:"log_id"`
	Duration   int64           `json:"duration_ms"`
	StartTime  *time.Time      `json:"start_time"`
	EndTime    *time.Time      `json:"end_time"`
}

func (d TaskDependency) String() string {
	return fmt.Sprintf("Task%d(%s requires %s)", d.TaskID, d.TaskName, d.RequireStatus)
}
