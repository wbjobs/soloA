package autoscale

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

type ScalableWorkerPool interface {
	WorkerCount() int
	AddWorker(ctx context.Context, id int) error
	RemoveWorker(id int) bool
}

type Autoscaler struct {
	logger      *zap.Logger
	workerPool  ScalableWorkerPool
	queueMetric func() int

	cfg atomic.Value

	lastScaleTime atomic.Int64
	currentWorkers atomic.Int32
	workerIDs      sync.Map
	nextWorkerID   atomic.Int32

	stopChan chan struct{}
	wg       sync.WaitGroup
	running  bool
	mu       sync.Mutex
}

type Config struct {
	MinWorkers         int
	MaxWorkers         int
	ScaleUpThreshold   int
	ScaleDownThreshold int
	ScaleUpStep        int
	ScaleDownStep      int
	CooldownSeconds    int
	Enabled            bool
}

func NewAutoscaler(
	logger *zap.Logger,
	workerPool ScalableWorkerPool,
	queueMetric func() int,
	initialConfig *Config,
) *Autoscaler {
	a := &Autoscaler{
		logger:      logger,
		workerPool:  workerPool,
		queueMetric: queueMetric,
		stopChan:    make(chan struct{}),
	}

	if initialConfig == nil {
		initialConfig = &Config{
			MinWorkers:         2,
			MaxWorkers:         20,
			ScaleUpThreshold:   50,
			ScaleDownThreshold: 10,
			ScaleUpStep:        2,
			ScaleDownStep:      1,
			CooldownSeconds:    60,
			Enabled:            true,
		}
	}
	a.cfg.Store(initialConfig)
	a.currentWorkers.Store(int32(workerPool.WorkerCount()))

	return a
}

func (a *Autoscaler) UpdateConfig(cfg *Config) {
	if cfg == nil {
		return
	}
	a.cfg.Store(cfg)
	a.logger.Info("Autoscaler config updated",
		zap.Int("minWorkers", cfg.MinWorkers),
		zap.Int("maxWorkers", cfg.MaxWorkers),
		zap.Int("scaleUpThreshold", cfg.ScaleUpThreshold),
		zap.Bool("enabled", cfg.Enabled),
	)
}

func (a *Autoscaler) GetConfig() *Config {
	cfg := a.cfg.Load()
	if cfg == nil {
		return nil
	}
	return cfg.(*Config)
}

func (a *Autoscaler) Start(ctx context.Context) {
	a.mu.Lock()
	if a.running {
		a.mu.Unlock()
		return
	}
	a.running = true
	a.mu.Unlock()

	a.logger.Info("Starting autoscaler")
	a.wg.Add(1)
	go a.scaleLoop(ctx)
}

func (a *Autoscaler) Stop() {
	a.mu.Lock()
	if !a.running {
		a.mu.Unlock()
		return
	}
	a.running = false
	a.mu.Unlock()

	a.logger.Info("Stopping autoscaler")
	close(a.stopChan)
	a.wg.Wait()
	a.logger.Info("Autoscaler stopped")
}

func (a *Autoscaler) scaleLoop(ctx context.Context) {
	defer a.wg.Done()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopChan:
			return
		case <-ticker.C:
			a.evaluateScale(ctx)
		}
	}
}

func (a *Autoscaler) evaluateScale(ctx context.Context) {
	cfg := a.GetConfig()
	if cfg == nil || !cfg.Enabled {
		return
	}

	now := time.Now().Unix()
	lastScale := a.lastScaleTime.Load()
	if now-lastScale < int64(cfg.CooldownSeconds) {
		return
	}

	queueLen := a.queueMetric()
	current := int(a.currentWorkers.Load())

	a.logger.Debug("Evaluating autoscale",
		zap.Int("queueLength", queueLen),
		zap.Int("currentWorkers", current),
		zap.Int("scaleUpThreshold", cfg.ScaleUpThreshold),
		zap.Int("scaleDownThreshold", cfg.ScaleDownThreshold),
	)

	if queueLen >= cfg.ScaleUpThreshold && current < cfg.MaxWorkers {
		a.scaleUp(ctx, cfg)
	} else if queueLen <= cfg.ScaleDownThreshold && current > cfg.MinWorkers {
		a.scaleDown(ctx, cfg)
	}
}

func (a *Autoscaler) scaleUp(ctx context.Context, cfg *Config) {
	current := int(a.currentWorkers.Load())
	toAdd := cfg.ScaleUpStep
	if current+toAdd > cfg.MaxWorkers {
		toAdd = cfg.MaxWorkers - current
	}

	if toAdd <= 0 {
		return
	}

	added := 0
	for i := 0; i < toAdd; i++ {
		newID := int(a.nextWorkerID.Add(1))
		if err := a.workerPool.AddWorker(ctx, newID); err != nil {
			a.logger.Error("Failed to add worker", zap.Int("workerID", newID), zap.Error(err))
			continue
		}
		a.workerIDs.Store(newID, true)
		added++
		a.logger.Info("Scaled up: added worker", zap.Int("workerID", newID))
	}

	if added > 0 {
		a.currentWorkers.Add(int32(added))
		a.lastScaleTime.Store(time.Now().Unix())
		a.logger.Info("Scale up complete",
			zap.Int("added", added),
			zap.Int("newTotal", current+added),
		)
	}
}

func (a *Autoscaler) scaleDown(ctx context.Context, cfg *Config) {
	current := int(a.currentWorkers.Load())
	toRemove := cfg.ScaleDownStep
	if current-toRemove < cfg.MinWorkers {
		toRemove = current - cfg.MinWorkers
	}

	if toRemove <= 0 {
		return
	}

	removed := 0
	a.workerIDs.Range(func(key, value interface{}) bool {
		if removed >= toRemove {
			return false
		}
		id := key.(int)
		if a.workerPool.RemoveWorker(id) {
			a.workerIDs.Delete(id)
			removed++
			a.logger.Info("Scaled down: removed worker", zap.Int("workerID", id))
		}
		return true
	})

	if removed > 0 {
		a.currentWorkers.Add(-int32(removed))
		a.lastScaleTime.Store(time.Now().Unix())
		a.logger.Info("Scale down complete",
			zap.Int("removed", removed),
			zap.Int("newTotal", current-removed),
		)
	}
}

func (a *Autoscaler) Stats() map[string]interface{} {
	cfg := a.GetConfig()
	current := a.currentWorkers.Load()

	return map[string]interface{}{
		"current_workers":   current,
		"config":            cfg,
		"last_scale_time":   a.lastScaleTime.Load(),
		"queue_length":      a.queueMetric(),
	}
}
