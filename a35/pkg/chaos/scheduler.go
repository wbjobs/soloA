package chaos

import (
	"fmt"
	"sync"
	"time"

	"github.com/chaos-cli/chaosctl/pkg/config"
)

type ResourceLock struct {
	mu         sync.RWMutex
	lockedPods map[string]*LockInfo
}

type LockInfo struct {
	ExperimentName string
	LockTime       time.Time
	LockType       string
}

func NewResourceLock() *ResourceLock {
	return &ResourceLock{
		lockedPods: make(map[string]*LockInfo),
	}
}

func (rl *ResourceLock) TryAcquire(podKey string, expName string, lockType string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if info, exists := rl.lockedPods[podKey]; exists {
		fmt.Printf("Pod %s 已被实验 %s 锁定，类型: %s\n", podKey, info.ExperimentName, info.LockType)
		return false
	}

	rl.lockedPods[podKey] = &LockInfo{
		ExperimentName: expName,
		LockTime:       time.Now(),
		LockType:       lockType,
	}

	fmt.Printf("Pod %s 已被实验 %s 锁定\n", podKey, expName)
	return true
}

func (rl *ResourceLock) Release(podKey string, expName string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if info, exists := rl.lockedPods[podKey]; exists {
		if info.ExperimentName == expName {
			delete(rl.lockedPods, podKey)
			fmt.Printf("Pod %s 的锁已被实验 %s 释放\n", podKey, expName)
			return true
		}
		fmt.Printf("警告: Pod %s 的锁不属于实验 %s，实际属于 %s\n", podKey, expName, info.ExperimentName)
		return false
	}

	fmt.Printf("警告: Pod %s 没有锁需要释放\n", podKey)
	return true
}

func (rl *ResourceLock) IsLocked(podKey string) bool {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	_, exists := rl.lockedPods[podKey]
	return exists
}

func (rl *ResourceLock) GetLockInfo(podKey string) *LockInfo {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	if info, exists := rl.lockedPods[podKey]; exists {
		return info
	}
	return nil
}

func (rl *ResourceLock) ReleaseAll(expName string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	for podKey, info := range rl.lockedPods {
		if info.ExperimentName == expName {
			delete(rl.lockedPods, podKey)
			fmt.Printf("清理Pod %s 的残留锁\n", podKey)
		}
	}
}

type ExperimentQueue struct {
	mu           sync.Mutex
	pendingQueue []*QueuedExperiment
	running      map[string]*QueuedExperiment
	maxConcurrent int
}

type QueuedExperiment struct {
	Config    *config.ExperimentConfig
	QueueTime time.Time
	Priority  int
	Status    string
	Pods      []string
}

func NewExperimentQueue(maxConcurrent int) *ExperimentQueue {
	if maxConcurrent <= 0 {
		maxConcurrent = 1
	}
	return &ExperimentQueue{
		pendingQueue:  make([]*QueuedExperiment, 0),
		running:       make(map[string]*QueuedExperiment),
		maxConcurrent: maxConcurrent,
	}
}

func (eq *ExperimentQueue) Enqueue(expConfig *config.ExperimentConfig, priority int) error {
	eq.mu.Lock()
	defer eq.mu.Unlock()

	pods := extractTargetPods(expConfig)

	queued := &QueuedExperiment{
		Config:    expConfig,
		QueueTime: time.Now(),
		Priority:  priority,
		Status:    "Queued",
		Pods:      pods,
	}

	eq.pendingQueue = append(eq.pendingQueue, queued)
	fmt.Printf("实验 %s 已加入队列，目标Pods: %v\n", expConfig.Name, pods)

	return nil
}

func (eq *ExperimentQueue) HasConflicts(expConfig *config.ExperimentConfig) bool {
	eq.mu.Lock()
	defer eq.mu.Unlock()

	newPods := extractTargetPods(expConfig)

	for _, runningExp := range eq.running {
		runningPods := extractTargetPods(runningExp.Config)
		for _, newPod := range newPods {
			for _, runningPod := range runningPods {
				if newPod == runningPod {
					fmt.Printf("发现冲突: 实验 %s 的Pod %s 与正在运行的实验 %s 的Pod %s 冲突\n",
						expConfig.Name, newPod, runningExp.Config.Name, runningPod)
					return true
				}
			}
		}
	}

	return false
}

func (eq *ExperimentQueue) MarkRunning(expConfig *config.ExperimentConfig) {
	eq.mu.Lock()
	defer eq.mu.Unlock()

	eq.running[expConfig.Name] = &QueuedExperiment{
		Config:    expConfig,
		QueueTime: time.Now(),
		Status:    "Running",
		Pods:      extractTargetPods(expConfig),
	}
}

func (eq *ExperimentQueue) MarkCompleted(expName string) {
	eq.mu.Lock()
	defer eq.mu.Unlock()

	delete(eq.running, expName)
}

func extractTargetPods(expConfig *config.ExperimentConfig) []string {
	pods := make([]string, 0)

	if expConfig.Selector.Pods != nil {
		for ns, podList := range expConfig.Selector.Pods {
			for _, podName := range podList {
				pods = append(pods, fmt.Sprintf("%s/%s", ns, podName))
			}
		}
	}

	if len(pods) == 0 && expConfig.Selector.LabelSelectors != nil {
		labelKey := ""
		for k, v := range expConfig.Selector.LabelSelectors {
			labelKey = fmt.Sprintf("%s=%s", k, v)
			break
		}
		pods = append(pods, fmt.Sprintf("label:%s", labelKey))
	}

	if len(pods) == 0 {
		pods = append(pods, "unknown")
	}

	return pods
}

type RollbackManager struct {
	mu          sync.Mutex
	rollbackMap map[string]*RollbackInfo
}

type RollbackInfo struct {
	ExperimentName string
	OriginalRules  map[string]string
	RollbackTime   time.Time
	Retries        int
	MaxRetries     int
}

func NewRollbackManager() *RollbackManager {
	return &RollbackManager{
		rollbackMap: make(map[string]*RollbackInfo),
	}
}

func (rm *RollbackManager) RegisterRollback(expName string, originalRules map[string]string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rm.rollbackMap[expName] = &RollbackInfo{
		ExperimentName: expName,
		OriginalRules:  originalRules,
		Retries:        0,
		MaxRetries:     3,
	}

	fmt.Printf("已为实验 %s 注册回滚信息，规则数: %d\n", expName, len(originalRules))
}

func (rm *RollbackManager) ExecuteRollback(expName string) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	info, exists := rm.rollbackMap[expName]
	if !exists {
		fmt.Printf("警告: 实验 %s 没有注册回滚信息\n", expName)
		return nil
	}

	info.RollbackTime = time.Now()
	fmt.Printf("开始执行实验 %s 的回滚，重试次数: %d\n", expName, info.Retries)

	for podKey, rules := range info.OriginalRules {
		fmt.Printf("清理Pod %s 的iptables/tc规则: %s\n", podKey, rules)
		err := cleanupPodRules(podKey)
		if err != nil {
			if info.Retries < info.MaxRetries {
				info.Retries++
				fmt.Printf("Pod %s 规则清理失败，将重试 (%d/%d)\n", podKey, info.Retries, info.MaxRetries)
				rm.mu.Unlock()
				time.Sleep(2 * time.Second)
				rm.mu.Lock()
				continue
			}
			fmt.Printf("错误: Pod %s 规则清理在 %d 次重试后仍然失败\n", podKey, info.MaxRetries)
		}
	}

	fmt.Printf("实验 %s 回滚完成\n", expName)
	delete(rm.rollbackMap, expName)
	return nil
}

func cleanupPodRules(podKey string) error {
	fmt.Printf("[模拟] 执行 cleanup 命令: kubectl exec <pod> -- tc qdisc del dev eth0 root\n")
	fmt.Printf("[模拟] 执行 cleanup 命令: kubectl exec <pod> -- iptables -F\n")
	return nil
}

func (rm *RollbackManager) CleanupOrphanedRules() {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	fmt.Println("开始清理孤立的iptables/tc规则...")
	for expName, info := range rm.rollbackMap {
		if time.Since(info.RollbackTime) > 5*time.Minute {
			fmt.Printf("发现孤立规则，实验: %s，清理时间: %s\n", expName, info.RollbackTime)
			delete(rm.rollbackMap, expName)
		}
	}
}
