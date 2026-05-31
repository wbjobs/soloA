package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"task-scheduler/internal/alert"
	"task-scheduler/internal/config"
	"task-scheduler/internal/db"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/metrics"
	"task-scheduler/internal/models"
)

type TaskExecutor struct {
	cfg          *config.Config
	alertService *alert.AlertService
	runningTasks map[uint]context.CancelFunc
	mutex        sync.RWMutex
}

var GlobalExecutor *TaskExecutor

type ExecutionResult struct {
	Success bool
	Output  string
	Error   string
	Duration time.Duration
}

func NewTaskExecutor(cfg *config.Config) *TaskExecutor {
	return &TaskExecutor{
		cfg:          cfg,
		alertService: alert.NewAlertService(&cfg.Alert),
		runningTasks: make(map[uint]context.CancelFunc),
	}
}

func InitExecutor(cfg *config.Config) {
	GlobalExecutor = NewTaskExecutor(cfg)
}

func (e *TaskExecutor) ExecuteTask(task *models.Task, triggerType string) error {
	if e.isTaskRunning(task.ID) {
		return fmt.Errorf("task %d is already running", task.ID)
	}

	depCheck := GlobalDependencyChecker.CheckDependencies(task)
	if !depCheck.CanExecute {
		logger.Sugar.Warnf("Task %d skipped: %s", task.ID, depCheck.Details)
		skipLog := &models.TaskExecutionLog{
			TaskID:          task.ID,
			TaskName:        task.Name,
			ExecutionNode:   e.cfg.Node.ID,
			Status:          models.ExecutionStatusSkipped,
			StartTime:       time.Now(),
			TriggerType:     triggerType,
			DependencyCheck: depCheck.Details,
		}
		endTime := time.Now()
		skipLog.EndTime = &endTime
		db.DB.Create(skipLog)
		return fmt.Errorf("dependencies not satisfied: %s", depCheck.Details)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(task.Timeout)*time.Second)
	e.registerTask(task.ID, cancel)
	defer e.unregisterTask(task.ID)

	logRecord := &models.TaskExecutionLog{
		TaskID:          task.ID,
		TaskName:        task.Name,
		ExecutionNode:   e.cfg.Node.ID,
		Status:          models.ExecutionStatusRunning,
		StartTime:       time.Now(),
		TriggerType:     triggerType,
		DependencyCheck: depCheck.Details,
	}
	db.DB.Create(logRecord)

	recordFn := metrics.RecordTaskStart(task.Name, string(task.TaskType))

	var result *ExecutionResult
	var err error
	retryCount := 0

	for retryCount <= task.RetryCount {
		result, err = e.executeSingleTask(ctx, task)
		
		endTime := time.Now()
		duration := endTime.Sub(logRecord.StartTime)
		logRecord.EndTime = &endTime
		logRecord.Duration = duration.Milliseconds()
		logRecord.RetryCount = retryCount

		if ctx.Err() != nil {
			logRecord.Status = models.ExecutionStatusTimeout
			logRecord.ErrorMessage = "task timeout"
			recordFn("timeout")
			e.sendAlert(task, logRecord)
			break
		}

		if err != nil || !result.Success {
			logRecord.Status = models.ExecutionStatusFailed
			if result != nil {
				logRecord.ErrorMessage = result.Error
				logRecord.Output = result.Output
			} else {
				logRecord.ErrorMessage = err.Error()
			}

			if retryCount < task.RetryCount {
				metrics.RecordTaskRetry(task.Name)
				logger.Sugar.Infof("Task %d failed, retry %d/%d after %d seconds", 
					task.ID, retryCount+1, task.RetryCount, task.RetryInterval)
				time.Sleep(time.Duration(task.RetryInterval) * time.Second)
				retryCount++
				continue
			}

			recordFn("failed")
			e.sendAlert(task, logRecord)
			break
		}

		logRecord.Status = models.ExecutionStatusSuccess
		logRecord.Output = result.Output
		recordFn("success")
		break
	}

	db.DB.Save(logRecord)

	if len(task.Callbacks) > 0 {
		ExecuteAllCallbacks(task, logRecord)
	}

	return nil
}

func (e *TaskExecutor) executeSingleTask(ctx context.Context, task *models.Task) (*ExecutionResult, error) {
	start := time.Now()

	switch task.TaskType {
	case models.TaskTypeShell:
		return e.executeShellTask(ctx, task)
	case models.TaskTypeHTTP:
		return e.executeHTTPTask(ctx, task)
	case models.TaskTypeGo:
		return e.executeGoTask(ctx, task)
	default:
		return nil, fmt.Errorf("unknown task type: %s", task.TaskType)
	}

	_ = start
}

func (e *TaskExecutor) executeShellTask(ctx context.Context, task *models.Task) (*ExecutionResult, error) {
	if task.TaskConfig.ShellConfig == nil {
		return nil, fmt.Errorf("shell config is nil")
	}

	cmd := exec.CommandContext(ctx, task.TaskConfig.ShellConfig.Command, task.TaskConfig.ShellConfig.Args...)
	
	if task.TaskConfig.ShellConfig.WorkDir != "" {
		cmd.Dir = task.TaskConfig.ShellConfig.WorkDir
	}
	if len(task.TaskConfig.ShellConfig.Env) > 0 {
		cmd.Env = append(cmd.Env, task.TaskConfig.ShellConfig.Env...)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	output := stdout.String()
	errOutput := stderr.String()

	if err != nil {
		return &ExecutionResult{
			Success:  false,
			Output:   output,
			Error:    errOutput + " " + err.Error(),
			Duration: duration,
		}, err
	}

	return &ExecutionResult{
		Success:  true,
		Output:   output,
		Duration: duration,
	}, nil
}

func (e *TaskExecutor) executeHTTPTask(ctx context.Context, task *models.Task) (*ExecutionResult, error) {
	if task.TaskConfig.HTTPConfig == nil {
		return nil, fmt.Errorf("http config is nil")
	}

	httpConfig := task.TaskConfig.HTTPConfig
	method := httpConfig.Method
	if method == "" {
		method = http.MethodGet
	}

	var bodyReader io.Reader
	if httpConfig.Body != "" {
		bodyReader = strings.NewReader(httpConfig.Body)
	}

	req, err := http.NewRequestWithContext(ctx, method, httpConfig.URL, bodyReader)
	if err != nil {
		return nil, err
	}

	for key, value := range httpConfig.Headers {
		req.Header.Set(key, value)
	}

	client := &http.Client{}
	start := time.Now()
	resp, err := client.Do(req)
	duration := time.Since(start)

	if err != nil {
		return &ExecutionResult{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	output := fmt.Sprintf("Status: %d\nHeaders: %v\nBody: %s", resp.StatusCode, resp.Header, string(respBody))

	if resp.StatusCode >= 400 {
		return &ExecutionResult{
			Success:  false,
			Output:   output,
			Error:    fmt.Sprintf("HTTP request failed with status %d", resp.StatusCode),
			Duration: duration,
		}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return &ExecutionResult{
		Success:  true,
		Output:   output,
		Duration: duration,
	}, nil
}

func (e *TaskExecutor) executeGoTask(ctx context.Context, task *models.Task) (*ExecutionResult, error) {
	if task.TaskConfig.GoConfig == nil {
		return nil, fmt.Errorf("go config is nil")
	}

	goConfig := task.TaskConfig.GoConfig
	start := time.Now()

	result, err := executeGoFunction(ctx, goConfig.FunctionName, goConfig.Params)
	duration := time.Since(start)

	if err != nil {
		return &ExecutionResult{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		}, err
	}

	output, _ := json.Marshal(result)
	return &ExecutionResult{
		Success:  true,
		Output:   string(output),
		Duration: duration,
	}, nil
}

type GoFunction func(ctx context.Context, params map[string]string) (interface{}, error)

var goFunctions = make(map[string]GoFunction)

func RegisterGoFunction(name string, fn GoFunction) {
	goFunctions[name] = fn
}

func executeGoFunction(ctx context.Context, name string, params map[string]string) (interface{}, error) {
	fn, ok := goFunctions[name]
	if !ok {
		return nil, fmt.Errorf("go function not registered: %s", name)
	}

	done := make(chan struct {
		result interface{}
		err    error
	}, 1)

	go func() {
		result, err := fn(ctx, params)
		done <- struct {
			result interface{}
			err    error
		}{result, err}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case res := <-done:
		return res.result, res.err
	}
}

func (e *TaskExecutor) isTaskRunning(taskID uint) bool {
	e.mutex.RLock()
	defer e.mutex.RUnlock()
	_, exists := e.runningTasks[taskID]
	return exists
}

func (e *TaskExecutor) registerTask(taskID uint, cancel context.CancelFunc) {
	e.mutex.Lock()
	defer e.mutex.Unlock()
	e.runningTasks[taskID] = cancel
}

func (e *TaskExecutor) unregisterTask(taskID uint) {
	e.mutex.Lock()
	defer e.mutex.Unlock()
	delete(e.runningTasks, taskID)
}

func (e *TaskExecutor) sendAlert(task *models.Task, log *models.TaskExecutionLog) {
	if log.Status != models.ExecutionStatusFailed && log.Status != models.ExecutionStatusTimeout {
		return
	}

	e.alertService.SendAlert(&alert.AlertMessage{
		Title:         fmt.Sprintf("Task %s: %s", log.Status, task.Name),
		TaskID:        task.ID,
		TaskName:      task.Name,
		Status:        string(log.Status),
		ErrorMessage:  log.ErrorMessage,
		ExecutionNode: log.ExecutionNode,
		ExecutionTime: log.StartTime,
	})
}
