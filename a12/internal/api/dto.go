package api

import (
	"task-scheduler/internal/analyzer"
	"task-scheduler/internal/models"
)

type CreateTaskRequest struct {
	Name           string                `json:"name" binding:"required"`
	CronExpression string                `json:"cron_expression" binding:"required"`
	TaskType       models.TaskType       `json:"task_type" binding:"required,oneof=shell http go"`
	TaskConfig     models.TaskConfig     `json:"task_config" binding:"required"`
	Timeout        int                   `json:"timeout"`
	RetryCount     int                   `json:"retry_count"`
	RetryInterval  int                   `json:"retry_interval"`
	Status         models.TaskStatus     `json:"status"`
	Description    string                `json:"description"`
	Dependencies   models.TaskDependencies `json:"dependencies"`
	Callbacks      models.TaskCallbacks  `json:"callbacks"`
}

type UpdateTaskRequest struct {
	Name           *string                `json:"name"`
	CronExpression *string                `json:"cron_expression"`
	TaskType       *models.TaskType       `json:"task_type"`
	TaskConfig     *models.TaskConfig     `json:"task_config"`
	Timeout        *int                   `json:"timeout"`
	RetryCount     *int                   `json:"retry_count"`
	RetryInterval  *int                   `json:"retry_interval"`
	Status         *models.TaskStatus     `json:"status"`
	Description    *string                `json:"description"`
	Dependencies   *models.TaskDependencies `json:"dependencies"`
	Callbacks      *models.TaskCallbacks  `json:"callbacks"`
}

type TaskResponse struct {
	ID             uint                    `json:"id"`
	Name           string                  `json:"name"`
	CronExpression string                  `json:"cron_expression"`
	TaskType       models.TaskType         `json:"task_type"`
	TaskConfig     models.TaskConfig       `json:"task_config"`
	Timeout        int                     `json:"timeout"`
	RetryCount     int                     `json:"retry_count"`
	RetryInterval  int                     `json:"retry_interval"`
	Status         models.TaskStatus       `json:"status"`
	Description    string                  `json:"description"`
	Dependencies   models.TaskDependencies `json:"dependencies"`
	Callbacks      models.TaskCallbacks    `json:"callbacks"`
	CreatedAt      string                  `json:"created_at"`
	UpdatedAt      string                  `json:"updated_at"`
}

type TaskListResponse struct {
	Total int64          `json:"total"`
	Tasks []TaskResponse `json:"tasks"`
}

type LogListRequest struct {
	TaskID    *uint   `form:"task_id"`
	StartTime *string `form:"start_time"`
	EndTime   *string `form:"end_time"`
	Status    *string `form:"status"`
	Page      int     `form:"page,default=1"`
	PageSize  int     `form:"page_size,default=20"`
}

type LogResponse struct {
	ID               uint                    `json:"id"`
	TaskID           uint                    `json:"task_id"`
	TaskName         string                  `json:"task_name"`
	ExecutionNode    string                  `json:"execution_node"`
	Status           models.ExecutionStatus  `json:"status"`
	StartTime        string                  `json:"start_time"`
	EndTime          *string                 `json:"end_time"`
	Duration         int64                   `json:"duration"`
	RetryCount       int                     `json:"retry_count"`
	ErrorMessage     string                  `json:"error_message"`
	Output           string                  `json:"output"`
	TriggerType      string                  `json:"trigger_type"`
	ParentLogID      *uint                   `json:"parent_log_id"`
	CallbackResults  models.JSONStringSlice  `json:"callback_results"`
	DependencyCheck  string                  `json:"dependency_check"`
}

type LogListResponse struct {
	Total int64         `json:"total"`
	Logs  []LogResponse `json:"logs"`
}

type TriggerTaskResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type PerformanceRequest struct {
	Days       int   `form:"days,default=7"`
	TaskID     *uint `form:"task_id"`
	Threshold  int64 `form:"threshold,default=1000"`
	Limit      int   `form:"limit,default=50"`
}
