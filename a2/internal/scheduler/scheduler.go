package scheduler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"

	"task-scheduler/internal/config"
	"task-scheduler/internal/lock"
	"task-scheduler/internal/model"
	"task-scheduler/internal/notify"
	"task-scheduler/internal/repository"
	"task-scheduler/internal/worker"
)

const (
	taskLockKeyPrefix  = "task:lock:"
	schedulerLockKey   = "scheduler:election"

	logBatchSize      = 100
	logFlushInterval  = 500 * time.Millisecond
)

type logBatchItem struct {
	log      *model.TaskLog
	isUpdate bool
}

type Scheduler struct {
	cfg              *config.SchedulerConfig
	logger           *zap.Logger
	taskRepo         repository.TaskRepository
	logRepo          repository.TaskLogRepository
	depRepo          repository.TaskDependencyRepository
	workerPool       *worker.WorkerPool
	distLock         *lock.DistributedLock
	redisClient      *redis.Client
	nodeID           string
	cronParser       cron.Parser
	notifyManager    *notify.Manager

	wg          sync.WaitGroup
	stopChan    chan struct{}
	running     bool
	mu          sync.Mutex
	isLeader    bool

	leaderLockMu sync.Mutex
	leaderLock   *lock.Lock

	logChan      chan logBatchItem
	logStopChan  chan struct{}
}

func NewScheduler(
	cfg *config.SchedulerConfig,
	logger *zap.Logger,
	taskRepo repository.TaskRepository,
	logRepo repository.TaskLogRepository,
	depRepo repository.TaskDependencyRepository,
	workerPool *worker.WorkerPool,
	redisClient *redis.Client,
	nodeID string,
	notifyManager *notify.Manager,
) *Scheduler {
	return &Scheduler{
		cfg:           cfg,
		logger:        logger,
		taskRepo:      taskRepo,
		logRepo:       logRepo,
		depRepo:       depRepo,
		workerPool:    workerPool,
		distLock:      lock.NewDistributedLock(redisClient),
		redisClient:   redisClient,
		nodeID:        nodeID,
		cronParser:    cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow),
		notifyManager: notifyManager,
		stopChan:      make(chan struct{}),
		logChan:       make(chan logBatchItem, 2000),
		logStopChan:   make(chan struct{}),
	}
}

func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}
	s.running = true
	s.mu.Unlock()

	s.logger.Info("Starting scheduler", zap.String("nodeID", s.nodeID))

	s.workerPool.StartBaseWorkers(ctx)

	s.wg.Add(1)
	go s.logWriter(ctx)

	s.wg.Add(1)
	go s.leaderElectionLoop(ctx)

	if s.notifyManager != nil {
		s.notifyManager.Start(ctx)
	}

	go func() {
		<-ctx.Done()
		s.Stop()
	}()

	return nil
}

func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	s.mu.Unlock()

	s.logger.Info("Stopping scheduler")

	s.leaderLockMu.Lock()
	if s.leaderLock != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s.leaderLock.Release(ctx)
		cancel()
		s.leaderLock = nil
	}
	s.leaderLockMu.Unlock()

	close(s.stopChan)
	close(s.logStopChan)

	if s.notifyManager != nil {
		s.notifyManager.Stop()
	}

	s.workerPool.Stop()

	s.wg.Wait()
	s.logger.Info("Scheduler stopped")
}

func (s *Scheduler) logWriter(ctx context.Context) {
	defer s.wg.Done()
	s.logger.Info("Log writer started")

	var batch []logBatchItem
	ticker := time.NewTicker(logFlushInterval)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		s.flushLogBatch(batch)
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case <-s.stopChan:
			flush()
			return
		case <-s.logStopChan:
			flush()
			return
		case item := <-s.logChan:
			batch = append(batch, item)
			if len(batch) >= logBatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *Scheduler) flushLogBatch(batch []logBatchItem) {
	if len(batch) == 0 {
		return
	}

	s.logger.Debug("Flushing log batch", zap.Int("count", len(batch)))

	for _, item := range batch {
		var err error
		if item.isUpdate {
			err = s.logRepo.Update(item.log)
		} else {
			err = s.logRepo.Create(item.log)
		}
		if err != nil {
			s.logger.Error("Failed to write log",
				zap.Int64("taskID", item.log.TaskID),
				zap.Bool("isUpdate", item.isUpdate),
				zap.Error(err),
			)
		}
	}
}

func (s *Scheduler) asyncCreateLog(log *model.TaskLog) {
	select {
	case s.logChan <- logBatchItem{log: log, isUpdate: false}:
	default:
		s.logger.Warn("Log channel full, dropping create log", zap.Int64("taskID", log.TaskID))
	}
}

func (s *Scheduler) asyncUpdateLog(log *model.TaskLog) {
	select {
	case s.logChan <- logBatchItem{log: log, isUpdate: true}:
	default:
		s.logger.Warn("Log channel full, dropping update log", zap.Int64("taskID", log.TaskID))
	}
}

func (s *Scheduler) leaderElectionLoop(ctx context.Context) {
	defer s.wg.Done()

	ttl := time.Duration(s.cfg.TaskLockTTL) * time.Second
	ticker := time.NewTicker(time.Duration(s.cfg.TickInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.tryBecomeLeaderAndSchedule(ctx, ttl)
		}
	}
}

func (s *Scheduler) tryBecomeLeaderAndSchedule(ctx context.Context, ttl time.Duration) {
	s.leaderLockMu.Lock()

	if s.leaderLock != nil && s.leaderLock.IsAcquired() {
		s.leaderLockMu.Unlock()
		s.scheduleTick(ctx)
		return
	}

	lockValue := fmt.Sprintf("%s:%d", s.nodeID, time.Now().UnixNano())
	lock, err := s.distLock.TryAcquire(ctx, schedulerLockKey, lockValue, ttl, 2, 500*time.Millisecond)

	if err == nil && lock != nil {
		s.leaderLock = lock
		if !s.isLeader {
			s.logger.Info("Node elected as leader", zap.String("nodeID", s.nodeID))
			s.isLeader = true
		}
		s.leaderLockMu.Unlock()
		s.scheduleTick(ctx)
	} else {
		s.leaderLock = nil
		if s.isLeader {
			s.logger.Info("Lost leadership", zap.String("nodeID", s.nodeID))
			s.isLeader = false
		}
		s.leaderLockMu.Unlock()
	}
}

func (s *Scheduler) scheduleTick(ctx context.Context) {
	now := time.Now()
	tasks, err := s.taskRepo.GetDueTasks(now, 100)
	if err != nil {
		s.logger.Error("Failed to get due tasks", zap.Error(err))
		return
	}

	s.logger.Debug("Schedule tick", zap.Int("dueTasks", len(tasks)), zap.Time("now", now))

	dispatchCount := 0
	for _, task := range tasks {
		task := task
		if s.tryAcquireAndDispatch(ctx, &task) {
			dispatchCount++
		}
	}

	if dispatchCount > 0 {
		s.logger.Debug("Dispatched tasks", zap.Int("count", dispatchCount))
	}
}

func (s *Scheduler) tryAcquireAndDispatch(ctx context.Context, task *model.Task) bool {
	deps, err := s.depRepo.GetByTaskID(task.ID)
	if err == nil && len(deps) > 0 {
		allReady := true
		for _, dep := range deps {
			parentTask, pErr := s.taskRepo.GetByID(dep.ParentTaskID)
			if pErr != nil || parentTask.Status != model.TaskStatusSuccess {
				allReady = false
				break
			}
		}
		if !allReady {
			return false
		}
	}

	lockKey := fmt.Sprintf("%s%d", taskLockKeyPrefix, task.ID)
	lockValue := fmt.Sprintf("%s:%d", s.nodeID, time.Now().UnixNano())
	ttl := time.Duration(s.cfg.TaskLockTTL) * time.Second

	lock, err := s.distLock.Acquire(ctx, lockKey, lockValue, ttl)
	if err != nil {
		return false
	}

	if err := s.taskRepo.UpdateStatus(task.ID, model.TaskStatusRunning); err != nil {
		s.logger.Error("Failed to update task status to running",
			zap.Int64("taskID", task.ID),
			zap.Error(err),
		)
		ctxRelease, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		lock.Release(ctxRelease)
		cancel()
		return false
	}

	go s.executeTaskWithLock(ctx, task, lock, ttl)
	return true
}

func (s *Scheduler) executeTaskWithLock(ctx context.Context, task *model.Task, lock *lock.Lock, ttl time.Duration) {
	defer func() {
		go func() {
			time.Sleep(ttl / 2)
			ctxRelease, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			lock.Release(ctxRelease)
			cancel()
		}()
	}()

	s.executeTask(ctx, task)
}

func (s *Scheduler) executeTask(ctx context.Context, task *model.Task) {
	logger := s.logger.With(zap.Int64("taskID", task.ID), zap.String("taskName", task.Name))
	logger.Info("Executing task")

	startTime := time.Now()
	taskLog := &model.TaskLog{
		TaskID:    task.ID,
		Status:    model.LogStatusRunning,
		StartTime: startTime,
		WorkerID:  s.nodeID,
	}
	s.asyncCreateLog(taskLog)

	result, execErr := s.workerPool.ExecuteTask(ctx, task)
	endTime := time.Now()
	durationMs := endTime.Sub(startTime).Milliseconds()

	taskLog.EndTime = &endTime
	taskLog.DurationMs = durationMs
	taskLog.Result = result

	var newStatus model.TaskStatus
	var nextRunAt *time.Time
	var newRetryCount int

	if execErr != nil {
		logger.Error("Task execution failed",
			zap.Error(execErr),
			zap.Int64("durationMs", durationMs),
		)
		taskLog.Status = model.LogStatusFailed
		taskLog.ErrorMsg = execErr.Error()

		task.RetryCount++
		newRetryCount = task.RetryCount

		if task.RetryCount < task.MaxRetry {
			newStatus = model.TaskStatusFailed
			nextRunAt = s.calculateNextRun(task, true)
			logger.Info("Task will be retried",
				zap.Int("retryCount", task.RetryCount),
				zap.Int("maxRetry", task.MaxRetry),
			)
		} else {
			if task.Type == model.TaskTypeOnce {
				newStatus = model.TaskStatusFailed
			} else {
				newStatus = model.TaskStatusFailed
				nextRunAt = s.calculateNextRun(task, false)
			}
		}

		if task.NotifyOnFailure && s.notifyManager != nil {
			s.sendNotification(task, model.LogStatusFailed, startTime, &endTime, durationMs, result, execErr.Error())
		}
	} else {
		logger.Info("Task executed successfully", zap.Int64("durationMs", durationMs))
		taskLog.Status = model.LogStatusSuccess
		newRetryCount = 0

		if task.Type == model.TaskTypeOnce {
			newStatus = model.TaskStatusSuccess
		} else {
			newStatus = model.TaskStatusPending
			nextRunAt = s.calculateNextRun(task, false)
		}

		if task.NotifyOnSuccess && s.notifyManager != nil {
			s.sendNotification(task, model.LogStatusSuccess, startTime, &endTime, durationMs, result, "")
		}

		go s.triggerDependentTasks(task.ID)
	}

	s.asyncUpdateLog(taskLog)

	now := time.Now()
	if err := s.taskRepo.UpdateTaskExecution(task.ID, newStatus, &now, nextRunAt, newRetryCount); err != nil {
		logger.Error("Failed to update task after execution", zap.Error(err))
	}
}

func (s *Scheduler) sendNotification(
	task *model.Task,
	status model.LogStatus,
	startTime time.Time,
	endTime *time.Time,
	durationMs int64,
	result string,
	errorMsg string,
) {
	n := &notify.Notification{
		TaskID:     task.ID,
		TaskName:   task.Name,
		Status:     status,
		StartTime:  startTime,
		EndTime:    endTime,
		DurationMs: durationMs,
		Result:     result,
		ErrorMsg:   errorMsg,
		WorkerID:   s.nodeID,
		Channels:   task.NotifyChannels,
	}
	s.notifyManager.Notify(n)
}

func (s *Scheduler) triggerDependentTasks(parentTaskID int64) {
	deps, err := s.depRepo.GetByParentTaskID(parentTaskID)
	if err != nil || len(deps) == 0 {
		return
	}

	for _, dep := range deps {
		childTask, err := s.taskRepo.GetByID(dep.TaskID)
		if err != nil {
			continue
		}

		allDeps, err := s.depRepo.GetByTaskID(childTask.ID)
		if err != nil {
			continue
		}

		allSuccess := true
		for _, d := range allDeps {
			parent, err := s.taskRepo.GetByID(d.ParentTaskID)
			if err != nil || parent.Status != model.TaskStatusSuccess {
				allSuccess = false
				break
			}
		}

		if allSuccess {
			now := time.Now()
			if err := s.taskRepo.UpdateTaskExecution(childTask.ID, model.TaskStatusPending, nil, &now, 0); err != nil {
				s.logger.Error("Failed to trigger dependent task",
					zap.Int64("taskID", childTask.ID),
					zap.Error(err),
				)
			} else {
				s.logger.Info("Dependent task triggered",
					zap.Int64("parentTaskID", parentTaskID),
					zap.Int64("childTaskID", childTask.ID),
				)
			}
		}
	}
}

func (s *Scheduler) calculateNextRun(task *model.Task, isRetry bool) *time.Time {
	now := time.Now()

	if isRetry {
		backoff := time.Duration(1<<task.RetryCount) * time.Second
		if backoff > 5*time.Minute {
			backoff = 5*time.Minute
		}
		next := now.Add(backoff)
		return &next
	}

	switch task.Type {
	case model.TaskTypeInterval:
		if task.IntervalSeconds > 0 {
			next := now.Add(time.Duration(task.IntervalSeconds) * time.Second)
			return &next
		}
	case model.TaskTypeCron:
		if task.CronExpr != "" {
			schedule, err := s.cronParser.Parse(task.CronExpr)
			if err == nil {
				next := schedule.Next(now)
				return &next
			}
			s.logger.Error("Failed to parse cron expression",
				zap.String("cron", task.CronExpr),
				zap.Error(err),
			)
		}
	case model.TaskTypeOnce:
		return nil
	}

	return nil
}

func (s *Scheduler) CalculateNextRunTime(task *model.Task) *time.Time {
	return s.calculateNextRun(task, false)
}

func (s *Scheduler) IsLeader() bool {
	return s.isLeader
}

func (s *Scheduler) CancelRunningTask(taskID int64) bool {
	return s.workerPool.CancelTask(taskID)
}

func (s *Scheduler) QueueLength() int {
	return s.workerPool.QueueLength()
}

func (s *Scheduler) WorkerCount() int {
	return s.workerPool.WorkerCount()
}
