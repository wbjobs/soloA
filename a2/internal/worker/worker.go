package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime/debug"
	"sync"
	"time"

	"go.uber.org/zap"

	"task-scheduler/internal/model"
)

type ExecutableTask struct {
	Task *model.Task
	Ctx  context.Context
	Done chan struct {
		Result string
		Err    error
	}
}

type HandlerFunc func(ctx context.Context, task *model.Task) (string, error)

type TaskHandler interface {
	Name() string
	Execute(ctx context.Context, task *model.Task) (string, error)
}

type simpleHandler struct {
	name string
	fn   HandlerFunc
}

func (h *simpleHandler) Name() string {
	return h.name
}

func (h *simpleHandler) Execute(ctx context.Context, task *model.Task) (string, error) {
	return h.fn(ctx, task)
}

type WorkerPool struct {
	handlers    map[string]TaskHandler
	handlerMu   sync.RWMutex
	logger      *zap.Logger
	baseWorkerCount int

	taskChan      chan *ExecutableTask
	runningTasks   map[int64]context.CancelFunc
	runningTasksMu sync.Mutex

	workerCtx    context.Context
	workerCancel context.CancelFunc
	wg           sync.WaitGroup
	workerIDs    sync.Map
	nextWorkerID int32

	mu           sync.RWMutex
	stopped      bool
}

func NewWorkerPool(logger *zap.Logger, workerCount int) *WorkerPool {
	if workerCount <= 0 {
		workerCount = 5
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &WorkerPool{
		handlers:        make(map[string]TaskHandler),
		logger:          logger,
		baseWorkerCount: workerCount,
		taskChan:        make(chan *ExecutableTask, 500),
		runningTasks:    make(map[int64]context.CancelFunc),
		workerCtx:       ctx,
		workerCancel:    cancel,
	}
}

func (p *WorkerPool) RegisterHandler(name string, handler HandlerFunc) {
	p.RegisterTaskHandler(&simpleHandler{name: name, fn: handler})
}

func (p *WorkerPool) RegisterTaskHandler(handler TaskHandler) {
	p.handlerMu.Lock()
	defer p.handlerMu.Unlock()
	p.handlers[handler.Name()] = handler
	p.logger.Info("Handler registered", zap.String("name", handler.Name()))
}

func (p *WorkerPool) GetHandler(name string) (TaskHandler, bool) {
	p.handlerMu.RLock()
	defer p.handlerMu.RUnlock()
	handler, ok := p.handlers[name]
	return handler, ok
}

func (p *WorkerPool) registerRunningTask(taskID int64, cancel context.CancelFunc) {
	p.runningTasksMu.Lock()
	p.runningTasks[taskID] = cancel
	p.runningTasksMu.Unlock()
}

func (p *WorkerPool) unregisterRunningTask(taskID int64) {
	p.runningTasksMu.Lock()
	delete(p.runningTasks, taskID)
	p.runningTasksMu.Unlock()
}

func (p *WorkerPool) CancelTask(taskID int64) bool {
	p.runningTasksMu.Lock()
	cancel, ok := p.runningTasks[taskID]
	p.runningTasksMu.Unlock()

	if ok && cancel != nil {
		cancel()
		return true
	}
	return false
}

func (p *WorkerPool) StartBaseWorkers(ctx context.Context) {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}

	for i := 0; i < p.baseWorkerCount; i++ {
		p.nextWorkerID++
		workerID := int(p.nextWorkerID)
		p.workerIDs.Store(workerID, true)
		p.wg.Add(1)
		go p.workerLoop(ctx, workerID)
		p.logger.Info("Base worker started", zap.Int("workerID", workerID))
	}
	p.mu.Unlock()
}

func (p *WorkerPool) AddWorker(ctx context.Context, workerID int) error {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return fmt.Errorf("worker pool is stopped")
	}
	if _, exists := p.workerIDs.LoadOrStore(workerID, true); exists {
		p.mu.Unlock()
		return fmt.Errorf("worker %d already exists", workerID)
	}
	p.wg.Add(1)
	p.mu.Unlock()

	go p.workerLoop(p.workerCtx, workerID)
	p.logger.Info("Dynamic worker added", zap.Int("workerID", workerID))
	return nil
}

func (p *WorkerPool) RemoveWorker(workerID int) bool {
	if _, loaded := p.workerIDs.LoadAndDelete(workerID); !loaded {
		return false
	}
	p.logger.Info("Dynamic worker marked for removal", zap.Int("workerID", workerID))
	return true
}

func (p *WorkerPool) workerLoop(ctx context.Context, workerID int) {
	defer p.wg.Done()
	logger := p.logger.With(zap.Int("workerID", workerID))
	logger.Info("Worker started")

	for {
		if _, exists := p.workerIDs.Load(workerID); !exists {
			logger.Info("Worker exiting (removed)")
			return
		}

		select {
		case <-ctx.Done():
			logger.Info("Worker exiting (context cancelled)")
			return
		case <-p.workerCtx.Done():
			logger.Info("Worker exiting (pool stopped)")
			return
		case execTask := <-p.taskChan:
			p.executeWorkerTask(execTask, logger)
		}
	}
}

func (p *WorkerPool) executeWorkerTask(execTask *ExecutableTask, logger *zap.Logger) {
	defer close(execTask.Done)

	handler, ok := p.GetHandler(execTask.Task.Handler)
	if !ok {
		execTask.Done <- struct {
			Result string
			Err    error
		}{"", fmt.Errorf("handler not found: %s", execTask.Task.Handler)}
		return
	}

	timeout := time.Duration(execTask.Task.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	execCtx, cancel := context.WithTimeout(execTask.Ctx, timeout)
	defer cancel()

	p.registerRunningTask(execTask.Task.ID, cancel)
	defer p.unregisterRunningTask(execTask.Task.ID)

	done := make(chan struct {
		result string
		err    error
	}, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				stack := debug.Stack()
				p.logger.Error("Task handler panicked",
					zap.Int64("taskID", execTask.Task.ID),
					zap.Any("panic", r),
					zap.String("stack", string(stack)),
				)
				done <- struct {
					result string
					err    error
				}{"", fmt.Errorf("handler panicked: %v", r)}
			}
		}()

		res, execErr := handler.Execute(execCtx, execTask.Task)
		done <- struct {
			result string
			err    error
		}{res, execErr}
	}()

	select {
	case <-execCtx.Done():
		if execCtx.Err() == context.DeadlineExceeded {
			p.logger.Warn("Task execution timed out, cancel signal sent",
				zap.Int64("taskID", execTask.Task.ID),
				zap.Duration("timeout", timeout),
			)
			execTask.Done <- struct {
				Result string
				Err    error
			}{"", fmt.Errorf("task execution timeout after %s", timeout)}
		} else {
			execTask.Done <- struct {
				Result string
				Err    error
			}{"", fmt.Errorf("task cancelled: %w", execCtx.Err())}
		}
	case res := <-done:
		execTask.Done <- struct {
			Result string
			Err    error
		}{res.result, res.err}
	}
}

func (p *WorkerPool) ExecuteTask(ctx context.Context, task *model.Task) (result string, err error) {
	execTask := &ExecutableTask{
		Task: task,
		Ctx:  ctx,
		Done: make(chan struct {
			Result string
			Err    error
		}, 1),
	}

	select {
	case p.taskChan <- execTask:
	case <-ctx.Done():
		return "", ctx.Err()
	}

	select {
	case res := <-execTask.Done:
		return res.Result, res.Err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

func (p *WorkerPool) WorkerCount() int {
	count := 0
	p.workerIDs.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

func (p *WorkerPool) Stop() {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}
	p.stopped = true
	p.mu.Unlock()

	p.workerCancel()
	p.wg.Wait()
	p.logger.Info("Worker pool stopped")
}

func (p *WorkerPool) QueueLength() int {
	return len(p.taskChan)
}

func RegisterDefaultHandlers(pool *WorkerPool) {
	pool.RegisterHandler("echo", func(ctx context.Context, task *model.Task) (string, error) {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}
		payload, _ := json.Marshal(task.Payload)
		result := fmt.Sprintf("Echo task executed: %s", string(payload))
		return result, nil
	})

	pool.RegisterHandler("print_time", func(ctx context.Context, task *model.Task) (string, error) {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}
		now := time.Now().Format(time.RFC3339)
		message, _ := task.Payload["message"].(string)
		result := fmt.Sprintf("Current time: %s, message: %s", now, message)
		return result, nil
	})

	pool.RegisterHandler("demo", func(ctx context.Context, task *model.Task) (string, error) {
		delay, _ := task.Payload["delay_seconds"].(float64)
		if delay > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(delay) * time.Second):
			}
		}
		result := fmt.Sprintf("Demo task %s completed at %s", task.Name, time.Now().Format(time.RFC3339))
		return result, nil
	})
}
