package chaos

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/chaos-cli/chaosctl/pkg/config"
)

var (
	globalScheduler  *ExperimentQueue
	globalLock       *ResourceLock
	globalRollback   *RollbackManager
	managerOnce      sync.Once
)

func initGlobalManagers() {
	managerOnce.Do(func() {
		globalScheduler = NewExperimentQueue(1)
		globalLock = NewResourceLock()
		globalRollback = NewRollbackManager()
	})
}

type Manager struct {
	kubeconfig string
	namespace  string
	scheduler  *ExperimentQueue
	lock       *ResourceLock
	rollback   *RollbackManager
}

func NewManager(kubeconfig, namespace string) (*Manager, error) {
	initGlobalManagers()

	return &Manager{
		kubeconfig: kubeconfig,
		namespace:  namespace,
		scheduler:  globalScheduler,
		lock:       globalLock,
		rollback:   globalRollback,
	}, nil
}

func (m *Manager) CreateFromFile(filePath string) (*config.Experiment, error) {
	validator := config.NewValidator()
	expConfig, err := validator.ValidateFromFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("配置校验失败: %w", err)
	}

	return m.Create(expConfig)
}

func (m *Manager) Create(expConfig *config.ExperimentConfig) (*config.Experiment, error) {
	fmt.Printf("创建实验: %s/%s (类型: %s)\n", expConfig.Namespace, expConfig.Name, expConfig.Type)

	if expConfig.Type == config.ExperimentTypeNetworkChaos {
		if m.scheduler.HasConflicts(expConfig) {
			return nil, errors.New("存在冲突的实验，新实验已加入队列等待执行")
		}

		targetPods := extractTargetPods(expConfig)
		for _, podKey := range targetPods {
			if !m.lock.TryAcquire(podKey, expConfig.Name, string(expConfig.Type)) {
				return nil, fmt.Errorf("Pod %s 已被其他实验锁定，请等待或停止其他实验", podKey)
			}
		}

		defer func() {
			if err := recover(); err != nil {
				for _, podKey := range targetPods {
					m.lock.Release(podKey, expConfig.Name)
				}
			}
		}()

		originalRules := m.captureOriginalRules(targetPods)
		m.rollback.RegisterRollback(expConfig.Name, originalRules)
	}

	m.scheduler.MarkRunning(expConfig)

	experiment := &config.Experiment{
		Name:        expConfig.Name,
		Namespace:   expConfig.Namespace,
		Type:        expConfig.Type,
		Status:      "Running",
		Description: expConfig.Description,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
		Config:      *expConfig,
	}

	fmt.Printf("实验创建成功: %s/%s\n", experiment.Namespace, experiment.Name)
	return experiment, nil
}

func (m *Manager) captureOriginalRules(pods []string) map[string]string {
	rules := make(map[string]string)
	for _, pod := range pods {
		rules[pod] = fmt.Sprintf("original_rules_%s", pod)
	}
	return rules
}

func (m *Manager) List() ([]config.Experiment, error) {
	fmt.Printf("列出命名空间 %s 中的实验\n", m.namespace)

	experiments := []config.Experiment{
		{
			Name:        "demo-pod-kill",
			Namespace:   m.namespace,
			Type:        config.ExperimentTypePodChaos,
			Status:      "Running",
			Description: "演示Pod Kill实验",
			CreatedAt:   time.Now().UTC().Add(-5 * time.Minute).Format(time.RFC3339),
		},
		{
			Name:        "demo-network-delay",
			Namespace:   m.namespace,
			Type:        config.ExperimentTypeNetworkChaos,
			Status:      "Completed",
			Description: "演示网络延迟实验",
			CreatedAt:   time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339),
		},
	}

	return experiments, nil
}

func (m *Manager) Get(name string) (*config.Experiment, error) {
	fmt.Printf("获取实验详情: %s/%s\n", m.namespace, name)

	experiment := &config.Experiment{
		Name:        name,
		Namespace:   m.namespace,
		Type:        config.ExperimentTypePodChaos,
		Status:      "Running",
		Description: "测试Pod Chaos实验",
		CreatedAt:   time.Now().UTC().Add(-10 * time.Minute).Format(time.RFC3339),
		Config: config.ExperimentConfig{
			Name:      name,
			Namespace: m.namespace,
			Type:      config.ExperimentTypePodChaos,
			Selector: config.Selector{
				LabelSelectors: map[string]string{
					"app": "demo",
				},
			},
			PodChaos: &config.PodChaosConfig{
				Action: config.PodChaosActionPodKill,
			},
		},
	}

	return experiment, nil
}

func (m *Manager) Stop(name string) error {
	fmt.Printf("停止实验: %s/%s\n", m.namespace, name)

	fmt.Printf("实验 %s 已停止，开始自动回滚...\n", name)

	if err := m.rollback.ExecuteRollback(name); err != nil {
		return fmt.Errorf("回滚失败: %w", err)
	}

	m.scheduler.MarkCompleted(name)
	m.lock.ReleaseAll(name)

	fmt.Printf("实验 %s 回滚完成\n", name)
	return nil
}

func (m *Manager) Delete(name string) error {
	fmt.Printf("删除实验: %s/%s\n", m.namespace, name)

	if err := m.Stop(name); err != nil {
		fmt.Printf("警告: 停止实验时出错: %v\n", err)
	}

	m.scheduler.MarkCompleted(name)
	m.lock.ReleaseAll(name)

	fmt.Printf("实验 %s 已删除\n", name)
	return nil
}
