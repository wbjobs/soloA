package executor

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"task-scheduler/internal/db"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/models"
)

type DependencyChecker struct {
	mutex sync.RWMutex
}

var GlobalDependencyChecker = &DependencyChecker{}

type DependencyCheckResult struct {
	CanExecute    bool
	FailedDeps    []string
	WaitingDeps   []string
	CompletedDeps []string
	Details       string
}

func (c *DependencyChecker) CheckDependencies(task *models.Task) *DependencyCheckResult {
	if len(task.Dependencies) == 0 {
		return &DependencyCheckResult{
			CanExecute: true,
			Details:    "no dependencies",
		}
	}

	result := &DependencyCheckResult{
		CanExecute:    true,
		FailedDeps:    make([]string, 0),
		WaitingDeps:   make([]string, 0),
		CompletedDeps: make([]string, 0),
	}

	for _, dep := range task.Dependencies {
		status, err := c.getLastExecutionStatus(dep.TaskID)
		if err != nil {
			logger.Sugar.Warnf("Failed to check dependency status for task %d: %v", dep.TaskID, err)
			result.CanExecute = false
			result.WaitingDeps = append(result.WaitingDeps, dep.String())
			continue
		}

		switch dep.RequireStatus {
		case models.DependencyStatusSuccess:
			if status == "" {
				result.CanExecute = false
				result.WaitingDeps = append(result.WaitingDeps, 
					fmt.Sprintf("Task %d (%s) not executed yet", dep.TaskID, dep.TaskName))
			} else if status != models.ExecutionStatusSuccess {
				result.CanExecute = false
				result.FailedDeps = append(result.FailedDeps,
					fmt.Sprintf("Task %d (%s) last status: %s", dep.TaskID, dep.TaskName, status))
			} else {
				result.CompletedDeps = append(result.CompletedDeps,
					fmt.Sprintf("Task %d (%s) - %s", dep.TaskID, dep.TaskName, status))
			}

		case models.DependencyStatusAny:
			if status == "" {
				result.CanExecute = false
				result.WaitingDeps = append(result.WaitingDeps,
					fmt.Sprintf("Task %d (%s) not executed yet", dep.TaskID, dep.TaskName))
			} else {
				result.CompletedDeps = append(result.CompletedDeps,
					fmt.Sprintf("Task %d (%s) - %s", dep.TaskID, dep.TaskName, status))
			}
		}
	}

	if !result.CanExecute {
		details := make([]string, 0)
		if len(result.FailedDeps) > 0 {
			details = append(details, "Failed dependencies: "+strings.Join(result.FailedDeps, "; "))
		}
		if len(result.WaitingDeps) > 0 {
			details = append(details, "Waiting dependencies: "+strings.Join(result.WaitingDeps, "; "))
		}
		result.Details = strings.Join(details, " | ")
	} else {
		result.Details = fmt.Sprintf("All %d dependencies satisfied", len(task.Dependencies))
	}

	return result
}

func (c *DependencyChecker) getLastExecutionStatus(taskID uint) (models.ExecutionStatus, error) {
	var log models.TaskExecutionLog
	result := db.DB.Where("task_id = ?", taskID).
		Order("id DESC").
		First(&log)

	if result.Error != nil {
		if result.RecordNotFound() {
			return "", nil
		}
		return "", result.Error
	}

	return log.Status, nil
}

func (c *DependencyChecker) GetLastSuccessfulLog(taskID uint) (*models.TaskExecutionLog, error) {
	var log models.TaskExecutionLog
	result := db.DB.Where("task_id = ? AND status = ?", taskID, models.ExecutionStatusSuccess).
		Order("id DESC").
		First(&log)

	if result.Error != nil {
		return nil, result.Error
	}

	return &log, nil
}

type PipelineExecutor struct {
	mutex        sync.RWMutex
	runningPipes map[uint]*PipelineRun
}

type PipelineRun struct {
	PipelineID uint
	Tasks      []*models.Task
	CurrentIdx int
	StartTime  time.Time
	Status     string
	Logs       map[uint]*models.TaskExecutionLog
}

var GlobalPipelineExecutor = &PipelineExecutor{
	runningPipes: make(map[uint]*PipelineRun),
}

func (p *PipelineExecutor) ExecutePipeline(pipelineID uint, tasks []*models.Task, triggerType string) error {
	p.mutex.Lock()
	if _, exists := p.runningPipes[pipelineID]; exists {
		p.mutex.Unlock()
		return fmt.Errorf("pipeline %d is already running", pipelineID)
	}

	run := &PipelineRun{
		PipelineID: pipelineID,
		Tasks:      tasks,
		CurrentIdx: 0,
		StartTime:  time.Now(),
		Status:     "running",
		Logs:       make(map[uint]*models.TaskExecutionLog),
	}
	p.runningPipes[pipelineID] = run
	p.mutex.Unlock()

	defer func() {
		p.mutex.Lock()
		delete(p.runningPipes, pipelineID)
		p.mutex.Unlock()
	}()

	var parentLogID *uint

	for i, task := range tasks {
		logger.Sugar.Infof("Pipeline %d: Executing task %d/%d - %s", pipelineID, i+1, len(tasks), task.Name)

		if i > 0 {
			checkResult := GlobalDependencyChecker.CheckDependencies(task)
			if !checkResult.CanExecute {
				logger.Sugar.Warnf("Pipeline %d: Skipping task %s - %s", pipelineID, task.Name, checkResult.Details)
				
				skipLog := &models.TaskExecutionLog{
					TaskID:          task.ID,
					TaskName:        task.Name,
					Status:          models.ExecutionStatusSkipped,
					StartTime:       time.Now(),
					TriggerType:     triggerType,
					ParentLogID:     parentLogID,
					DependencyCheck: checkResult.Details,
				}
				db.DB.Create(skipLog)
				
				run.Status = "failed"
				return fmt.Errorf("pipeline stopped at task %s: %s", task.Name, checkResult.Details)
			}
		}

		log, err := p.executePipelineTask(task, triggerType, parentLogID)
		if err != nil {
			run.Status = "failed"
			return err
		}

		if log.Status != models.ExecutionStatusSuccess {
			run.Status = "failed"
			return fmt.Errorf("pipeline stopped: task %s %s", task.Name, log.Status)
		}

		parentLogID = &log.ID
		run.Logs[task.ID] = log
		run.CurrentIdx = i + 1
	}

	run.Status = "completed"
	return nil
}

func (p *PipelineExecutor) executePipelineTask(task *models.Task, triggerType string, parentLogID *uint) (*models.TaskExecutionLog, error) {
	if GlobalExecutor == nil {
		return nil, fmt.Errorf("executor not initialized")
	}

	err := GlobalExecutor.ExecuteTask(task, triggerType)
	
	var log models.TaskExecutionLog
	db.DB.Where("task_id = ?", task.ID).Order("id DESC").First(&log)
	
	if parentLogID != nil {
		log.ParentLogID = parentLogID
		db.DB.Save(&log)
	}

	return &log, err
}

func (p *PipelineExecutor) IsPipelineRunning(pipelineID uint) bool {
	p.mutex.RLock()
	defer p.mutex.RUnlock()
	_, exists := p.runningPipes[pipelineID]
	return exists
}

func BuildTaskChain(headTaskID uint) ([]*models.Task, error) {
	visited := make(map[uint]bool)
	result := make([]*models.Task, 0)
	
	var buildChain func(taskID uint) error
	buildChain = func(taskID uint) error {
		if visited[taskID] {
			return nil
		}
		visited[taskID] = true

		var task models.Task
		if err := db.DB.First(&task, taskID).Error; err != nil {
			return err
		}

		for _, dep := range task.Dependencies {
			if err := buildChain(dep.TaskID); err != nil {
				return err
			}
		}

		result = append(result, &task)
		return nil
	}

	if err := buildChain(headTaskID); err != nil {
		return nil, err
	}

	return result, nil
}
