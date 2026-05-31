package scheduler

import (
	"context"
	"fmt"
	"hash/fnv"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/robfig/cron/v3"

	"task-scheduler/internal/config"
	"task-scheduler/internal/db"
	"task-scheduler/internal/executor"
	"task-scheduler/internal/logger"
	"task-scheduler/internal/metrics"
	"task-scheduler/internal/models"
)

const (
	virtualNodeCount   = 100
	loadBalanceKey     = "task:load_balance"
	nodeLoadPrefix     = "task:node_load:"
)

type TaskScheduler struct {
	cron          *cron.Cron
	cfg           *config.Config
	entries       map[uint]cron.EntryID
	hashRing      *ConsistentHash
	runningTasks  map[uint]struct{}
	runningMutex  sync.RWMutex
}

type ConsistentHash struct {
	virtualNodes map[uint32]string
	nodeKeys     []uint32
	nodes        map[string]struct{}
	ringMutex    sync.RWMutex
}

var GlobalScheduler *TaskScheduler

func NewTaskScheduler(cfg *config.Config) *TaskScheduler {
	return &TaskScheduler{
		cron:         cron.New(cron.WithSeconds()),
		cfg:          cfg,
		entries:      make(map[uint]cron.EntryID),
		hashRing:     NewConsistentHash(),
		runningTasks: make(map[uint]struct{}),
	}
}

func InitScheduler(cfg *config.Config) {
	GlobalScheduler = NewTaskScheduler(cfg)
}

func NewConsistentHash() *ConsistentHash {
	return &ConsistentHash{
		virtualNodes: make(map[uint32]string),
		nodeKeys:     make([]uint32, 0),
		nodes:        make(map[string]struct{}),
	}
}

func (ch *ConsistentHash) AddNode(nodeID string) {
	ch.ringMutex.Lock()
	defer ch.ringMutex.Unlock()

	if _, exists := ch.nodes[nodeID]; exists {
		return
	}

	ch.nodes[nodeID] = struct{}{}

	for i := 0; i < virtualNodeCount; i++ {
		virtualKey := ch.hash(fmt.Sprintf("%s#%d", nodeID, i))
		ch.virtualNodes[virtualKey] = nodeID
		ch.nodeKeys = append(ch.nodeKeys, virtualKey)
	}

	sort.Slice(ch.nodeKeys, func(i, j int) bool {
		return ch.nodeKeys[i] < ch.nodeKeys[j]
	})
}

func (ch *ConsistentHash) RemoveNode(nodeID string) {
	ch.ringMutex.Lock()
	defer ch.ringMutex.Unlock()

	if _, exists := ch.nodes[nodeID]; !exists {
		return
	}

	delete(ch.nodes, nodeID)

	newKeys := make([]uint32, 0, len(ch.nodeKeys))
	for i := 0; i < virtualNodeCount; i++ {
		virtualKey := ch.hash(fmt.Sprintf("%s#%d", nodeID, i))
		delete(ch.virtualNodes, virtualKey)
	}

	for _, key := range ch.nodeKeys {
		if _, exists := ch.virtualNodes[key]; exists {
			newKeys = append(newKeys, key)
		}
	}
	ch.nodeKeys = newKeys
}

func (ch *ConsistentHash) GetNode(taskID uint) (string, bool) {
	ch.ringMutex.RLock()
	defer ch.ringMutex.RUnlock()

	if len(ch.nodeKeys) == 0 {
		return "", false
	}

	taskKey := ch.hash(strconv.FormatUint(uint64(taskID), 10))

	idx := sort.Search(len(ch.nodeKeys), func(i int) bool {
		return ch.nodeKeys[i] >= taskKey
	})

	if idx >= len(ch.nodeKeys) {
		idx = 0
	}

	nodeID, exists := ch.virtualNodes[ch.nodeKeys[idx]]
	return nodeID, exists
}

func (ch *ConsistentHash) hash(key string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(key))
	return h.Sum32()
}

func (s *TaskScheduler) Start() {
	go s.nodeDiscoveryLoop()
	s.cron.Start()
	s.loadAllTasks()
}

func (s *TaskScheduler) Stop() {
	s.cron.Stop()
}

func (s *TaskScheduler) nodeDiscoveryLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	s.refreshNodeList()

	for range ticker.C {
		s.refreshNodeList()
	}
}

func (s *TaskScheduler) refreshNodeList() {
	nodes, err := db.GetActiveNodes()
	if err != nil {
		logger.Sugar.Warnf("Failed to get active nodes: %v", err)
		return
	}

	if len(nodes) == 0 {
		return
	}

	for _, node := range nodes {
		s.hashRing.AddNode(node)
	}

	logger.Sugar.Debugf("Refreshed node list: %v, current nodes in ring: %d", nodes, len(s.hashRing.virtualNodes)/virtualNodeCount)
}

func (s *TaskScheduler) loadAllTasks() {
	var tasks []models.Task
	if err := db.DB.Where("status = ?", models.TaskStatusEnabled).Find(&tasks).Error; err != nil {
		logger.Sugar.Errorf("Failed to load tasks: %v", err)
		return
	}

	for _, task := range tasks {
		if err := s.AddTask(&task); err != nil {
			logger.Sugar.Errorf("Failed to add task %d: %v", task.ID, err)
		}
	}

	logger.Sugar.Infof("Loaded %d enabled tasks", len(tasks))
}

func (s *TaskScheduler) AddTask(task *models.Task) error {
	if err := s.RemoveTask(task.ID); err != nil {
		return err
	}

	entryID, err := s.cron.AddFunc(task.CronExpression, func() {
		s.executeTask(task.ID)
	})
	if err != nil {
		return err
	}

	s.entries[task.ID] = entryID
	logger.Sugar.Infof("Task %d scheduled with cron: %s", task.ID, task.CronExpression)
	return nil
}

func (s *TaskScheduler) RemoveTask(taskID uint) error {
	if entryID, exists := s.entries[taskID]; exists {
		s.cron.Remove(entryID)
		delete(s.entries, taskID)
		logger.Sugar.Infof("Task %d removed from scheduler", taskID)
	}
	return nil
}

func (s *TaskScheduler) UpdateTask(task *models.Task) error {
	if task.Status == models.TaskStatusEnabled {
		return s.AddTask(task)
	}
	return s.RemoveTask(task.ID)
}

func (s *TaskScheduler) TriggerTask(taskID uint) error {
	var task models.Task
	if err := db.DB.First(&task, taskID).Error; err != nil {
		return err
	}

	go func() {
		if err := s.acquireAndExecute(&task, "manual"); err != nil {
			logger.Sugar.Errorf("Failed to execute task %d: %v", taskID, err)
		}
	}()

	return nil
}

func (s *TaskScheduler) executeTask(taskID uint) {
	var task models.Task
	if err := db.DB.First(&task, taskID).Error; err != nil {
		logger.Sugar.Errorf("Task %d not found: %v", taskID, err)
		return
	}

	if task.Status != models.TaskStatusEnabled {
		logger.Sugar.Infof("Task %d is disabled, skipping", taskID)
		return
	}

	assignedNode, hasRing := s.hashRing.GetNode(task.ID)
	if hasRing && assignedNode != "" && assignedNode != s.cfg.Node.ID {
		logger.Sugar.Debugf("Task %d assigned to node %s, current node %s skipping", task.ID, assignedNode, s.cfg.Node.ID)
		return
	}

	if err := s.acquireAndExecute(&task, "scheduled"); err != nil {
		logger.Sugar.Errorf("Failed to execute task %d: %v", taskID, err)
	}
}

func (s *TaskScheduler) acquireAndExecute(task *models.Task, triggerType string) error {
	if s.isTaskRunning(task.ID) {
		logger.Sugar.Infof("Task %d is already running, skipping this execution", task.ID)
		return nil
	}

	s.markTaskRunning(task.ID)
	defer s.markTaskNotRunning(task.ID)

	lockTTL := time.Duration(task.Timeout+60) * time.Second
	lock := db.NewDistributedLock(task.ID, lockTTL)

	acquired, err := lock.Acquire()
	if err != nil {
		logger.Sugar.Errorf("Failed to acquire lock for task %d: %v", task.ID, err)
		return err
	}

	if !acquired {
		logger.Sugar.Infof("Task %d already locked by another node, skipping", task.ID)
		return nil
	}

	defer func() {
		if releaseErr := lock.Release(); releaseErr != nil {
			logger.Sugar.Warnf("Failed to release lock for task %d: %v", task.ID, releaseErr)
		}
	}()

	logger.Sugar.Infof("Node %s acquired lock for task %d", s.cfg.Node.ID, task.ID)

	if executor.GlobalExecutor == nil {
		return fmt.Errorf("executor not initialized")
	}

	return s.executeWithLockCheck(task, triggerType, lock)
}

func (s *TaskScheduler) executeWithLockCheck(task *models.Task, triggerType string, lock *db.DistributedLock) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	lockCheckTicker := time.NewTicker(1 * time.Second)
	defer lockCheckTicker.Stop()

	execDone := make(chan error, 1)
	go func() {
		execDone <- executor.GlobalExecutor.ExecuteTask(task, triggerType)
	}()

	for {
		select {
		case err := <-execDone:
			return err
		case <-lockCheckTicker.C:
			if !lock.IsHeld() {
				logger.Sugar.Warnf("Lock lost for task %d during execution, will not retry", task.ID)
				cancel()
				return fmt.Errorf("lock lost during execution")
			}
		}
	}
}

func (s *TaskScheduler) isTaskRunning(taskID uint) bool {
	s.runningMutex.RLock()
	defer s.runningMutex.RUnlock()
	_, exists := s.runningTasks[taskID]
	return exists
}

func (s *TaskScheduler) markTaskRunning(taskID uint) {
	s.runningMutex.Lock()
	defer s.runningMutex.Unlock()
	s.runningTasks[taskID] = struct{}{}
	metrics.TaskActive.WithLabelValues(s.cfg.Node.ID).Inc()
}

func (s *TaskScheduler) markTaskNotRunning(taskID uint) {
	s.runningMutex.Lock()
	defer s.runningMutex.Unlock()
	delete(s.runningTasks, taskID)
	metrics.TaskActive.WithLabelValues(s.cfg.Node.ID).Dec()
}
