package executor

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"task-scheduler/internal/logger"
	"task-scheduler/internal/models"
)

type CallbackContext struct {
	Task        *models.Task
	Log         *models.TaskExecutionLog
	Status      models.ExecutionStatus
	Output      string
	Error       string
	Duration    time.Duration
	RetryCount  int
	StartTime   time.Time
	EndTime     time.Time
}

type CallbackExecutor struct {
	httpClient *http.Client
	goFuncs    map[string]CallbackGoFunc
}

type CallbackGoFunc func(ctx context.Context, callbackContext *CallbackContext) error

var GlobalCallbackExecutor = &CallbackExecutor{
	httpClient: &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
			MaxIdleConns:        100,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		},
	},
	goFuncs: make(map[string]CallbackGoFunc),
}

func RegisterCallbackFunc(name string, fn CallbackGoFunc) {
	GlobalCallbackExecutor.goFuncs[name] = fn
}

func (e *CallbackExecutor) ExecuteCallbacks(task *models.Task, log *models.TaskExecutionLog) []string {
	if len(task.Callbacks) == 0 {
		return []string{}
	}

	results := make([]string, 0)
	status := log.Status

	for _, callback := range task.Callbacks {
		if !e.shouldExecuteCallback(callback, status) {
			continue
		}

		callbackCtx := &CallbackContext{
			Task:       task,
			Log:        log,
			Status:     status,
			Output:     log.Output,
			Error:      log.ErrorMessage,
			Duration:   time.Duration(log.Duration) * time.Millisecond,
			RetryCount: log.RetryCount,
			StartTime:  log.StartTime,
		}
		if log.EndTime != nil {
			callbackCtx.EndTime = *log.EndTime
		}

		result := e.executeCallback(callback, callbackCtx)
		results = append(results, result)
	}

	return results
}

func (e *CallbackExecutor) shouldExecuteCallback(cb models.TaskCallback, status models.ExecutionStatus) bool {
	switch status {
	case models.ExecutionStatusSuccess:
		return cb.OnSuccess
	case models.ExecutionStatusFailed:
		return cb.OnFailure
	case models.ExecutionStatusTimeout:
		return cb.OnTimeout
	default:
		return false
	}
}

func (e *CallbackExecutor) executeCallback(cb models.TaskCallback, ctx *CallbackContext) string {
	maxRetries := cb.Retries
	if maxRetries <= 0 {
		maxRetries = 1
	}

	timeout := time.Duration(cb.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		var result string
		var err error

		switch cb.Type {
		case models.CallbackTypeHTTP:
			result, err = e.executeHTTPCallback(cb, ctx, timeout)
		case models.CallbackTypeGo:
			result, err = e.executeGoCallback(cb, ctx, timeout)
		default:
			return fmt.Sprintf("ERROR: unknown callback type: %s", cb.Type)
		}

		if err == nil {
			return fmt.Sprintf("SUCCESS: %s", result)
		}

		lastErr = err
		logger.Sugar.Warnf("Callback attempt %d/%d failed: %v", attempt+1, maxRetries, err)

		if attempt < maxRetries-1 {
			time.Sleep(time.Duration(1<<uint(attempt)) * time.Second)
		}
	}

	return fmt.Sprintf("FAILED: %v", lastErr)
}

func (e *CallbackExecutor) executeHTTPCallback(cb models.TaskCallback, ctx *CallbackContext, timeout time.Duration) (string, error) {
	if cb.URL == "" {
		return "", fmt.Errorf("callback URL is empty")
	}

	payload := e.buildCallbackPayload(ctx)
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %v", err)
	}

	method := cb.Method
	if method == "" {
		method = http.MethodPost
	}

	reqCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, cb.URL, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "TaskScheduler/1.0")
	for k, v := range cb.Headers {
		req.Header.Set(k, v)
	}

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return string(respBody), fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return fmt.Sprintf("HTTP %d", resp.StatusCode), nil
}

func (e *CallbackExecutor) executeGoCallback(cb models.TaskCallback, ctx *CallbackContext, timeout time.Duration) (string, error) {
	fn, exists := e.goFuncs[cb.FuncName]
	if !exists {
		return "", fmt.Errorf("go callback function not registered: %s", cb.FuncName)
	}

	done := make(chan error, 1)
	goCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	go func() {
		done <- fn(goCtx, ctx)
	}()

	select {
	case <-goCtx.Done():
		return "", fmt.Errorf("callback timeout after %v", timeout)
	case err := <-done:
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("GO %s executed successfully", cb.FuncName), nil
	}
}

func (e *CallbackExecutor) buildCallbackPayload(ctx *CallbackContext) map[string]interface{} {
	return map[string]interface{}{
		"task_id":          ctx.Task.ID,
		"task_name":        ctx.Task.Name,
		"task_type":        ctx.Task.TaskType,
		"status":           ctx.Status,
		"log_id":           ctx.Log.ID,
		"execution_node":   ctx.Log.ExecutionNode,
		"start_time":       ctx.StartTime.Format(time.RFC3339),
		"end_time":         ctx.EndTime.Format(time.RFC3339),
		"duration_ms":      ctx.Duration.Milliseconds(),
		"retry_count":      ctx.RetryCount,
		"trigger_type":     ctx.Log.TriggerType,
		"output":           truncateString(ctx.Output, 10000),
		"error":            truncateString(ctx.Error, 2000),
		"task_description": ctx.Task.Description,
		"parent_log_id":    ctx.Log.ParentLogID,
	}
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "...(truncated)"
}

func ExecuteAllCallbacks(task *models.Task, log *models.TaskExecutionLog) {
	if len(task.Callbacks) == 0 {
		return
	}

	go func() {
		results := GlobalCallbackExecutor.ExecuteCallbacks(task, log)
		if len(results) > 0 {
			log.CallbackResults = models.JSONStringSlice(results)
			if err := saveCallbackResults(log); err != nil {
				logger.Sugar.Warnf("Failed to save callback results: %v", err)
			}
			logger.Sugar.Infof("Callbacks executed for task %d: %d results", task.ID, len(results))
		}
	}()
}

func saveCallbackResults(log *models.TaskExecutionLog) error {
	return db.DB.Model(&models.TaskExecutionLog{}).
		Where("id = ?", log.ID).
		Update("callback_results", log.CallbackResults).Error
}

func init() {
	RegisterCallbackFunc("log_result", func(ctx context.Context, cbCtx *CallbackContext) error {
		logger.Sugar.Infof("[Callback] Task %d (%s) completed with status: %s, duration: %v",
			cbCtx.Task.ID, cbCtx.Task.Name, cbCtx.Status, cbCtx.Duration)
		return nil
	})

	RegisterCallbackFunc("format_summary", func(ctx context.Context, cbCtx *CallbackContext) error {
		summary := fmt.Sprintf(
			"Task: %s | Status: %s | Duration: %v | Retries: %d",
			cbCtx.Task.Name, cbCtx.Status, cbCtx.Duration, cbCtx.RetryCount,
		)
		logger.Sugar.Infof("[Callback Summary] %s", summary)
		return nil
	})
}
