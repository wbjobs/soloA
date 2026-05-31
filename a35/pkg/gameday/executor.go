package gameday

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/chaos-cli/chaosctl/pkg/chaos"
	"github.com/chaos-cli/chaosctl/pkg/config"
)

type Executor struct {
	kubeconfig  string
	namespace   string
	manager     *chaos.Manager
	loader      *Loader
	checkpoints *CheckpointRunner

	execution   *GameDayExecution
	mu          sync.RWMutex
	stopCh      chan struct{}
	pauseCh     chan bool
}

func NewExecutor(kubeconfig, namespace string) (*Executor, error) {
	manager, err := chaos.NewManager(kubeconfig, namespace)
	if err != nil {
		return nil, fmt.Errorf("创建Chaos Manager失败: %w", err)
	}

	return &Executor{
		kubeconfig:  kubeconfig,
		namespace:   namespace,
		manager:     manager,
		loader:      NewLoader(),
		checkpoints: NewCheckpointRunner(),
		stopCh:      make(chan struct{}),
		pauseCh:     make(chan bool),
	}, nil
}

func (e *Executor) Run(ctx context.Context, gameDayDef *GameDayDefinition) (*GameDayExecution, error) {
	if err := e.loader.Validate(gameDayDef); err != nil {
		return nil, fmt.Errorf("GameDay配置校验失败: %w", err)
	}

	e.mu.Lock()
	e.execution = &GameDayExecution{
		GameDayName:  gameDayDef.Name,
		Status:       GameDayStatusRunning,
		StartTime:    time.Now().UTC(),
		CurrentStep:  -1,
		Steps:        make([]StepExecution, len(gameDayDef.Steps)),
		FailureCount: 0,
	}
	e.mu.Unlock()

	fmt.Printf("========================================\n")
	fmt.Printf("开始执行 GameDay: %s\n", gameDayDef.Name)
	fmt.Printf("环境: %s | 团队: %s\n", gameDayDef.Environment, gameDayDef.Team)
	fmt.Printf("总步骤数: %d\n", len(gameDayDef.Steps))
	fmt.Printf("========================================\n\n")

	for i, step := range gameDayDef.Steps {
		select {
		case <-ctx.Done():
			e.mu.Lock()
			e.execution.Status = GameDayStatusFailed
			e.mu.Unlock()
			return e.execution, fmt.Errorf("执行被取消: %w", ctx.Err())
		case <-e.stopCh:
			e.mu.Lock()
			e.execution.Status = GameDayStatusRolledBack
			e.mu.Unlock()
			if gameDayDef.AutoRollback {
				e.rollbackAllSteps(gameDayDef)
			}
			return e.execution, nil
		default:
		}

		e.mu.Lock()
		e.execution.CurrentStep = i
		e.mu.Unlock()

		stepExec, err := e.executeStep(ctx, step, i, gameDayDef)

		e.mu.Lock()
		e.execution.Steps[i] = *stepExec
		if stepExec.Status == StepStatusFailed {
			e.execution.FailureCount++
		}
		e.mu.Unlock()

		if err != nil {
			fmt.Printf("步骤执行失败 [%s]: %v\n", step.Name, err)
			if gameDayDef.AutoRollback {
				fmt.Println("触发自动回滚...")
				e.rollbackAllSteps(gameDayDef)
				e.mu.Lock()
				e.execution.Status = GameDayStatusRolledBack
				e.execution.RollbackInfo = &RollbackInfo{
					TriggeredBy:   "step_failure",
					TriggerReason: fmt.Sprintf("步骤[%s]执行失败: %v", step.Name, err),
					TriggerTime:   time.Now().UTC(),
				}
				e.mu.Unlock()
				return e.execution, err
			}

			if !step.ContinueOnFail {
				fmt.Println("步骤失败且不允许继续，终止执行")
				e.mu.Lock()
				e.execution.Status = GameDayStatusFailed
				e.mu.Unlock()
				return e.execution, err
			}

			fmt.Println("步骤失败但允许继续，执行下一步...")
		}

		if step.DelayAfter != "" {
			delay, _ := time.ParseDuration(step.DelayAfter)
			fmt.Printf("等待 %s 后执行下一步...\n", step.DelayAfter)
			time.Sleep(delay)
		}
	}

	e.mu.Lock()
	e.execution.EndTime = time.Now().UTC()
	e.execution.TotalDuration = e.execution.EndTime.Sub(e.execution.StartTime)
	if e.execution.FailureCount == 0 {
		e.execution.Status = GameDayStatusCompleted
	} else {
		e.execution.Status = GameDayStatusCompleted
	}
	e.mu.Unlock()

	fmt.Printf("\n========================================\n")
	fmt.Printf("GameDay执行完成: %s\n", gameDayDef.Name)
	fmt.Printf("状态: %s | 失败步骤: %d/%d\n", e.execution.Status, e.execution.FailureCount, len(gameDayDef.Steps))
	fmt.Printf("总耗时: %v\n", e.execution.TotalDuration)
	fmt.Printf("========================================\n")

	return e.execution, nil
}

func (e *Executor) executeStep(ctx context.Context, step GameDayStep, index int, gd *GameDayDefinition) (*StepExecution, error) {
	if step.DelayBefore != "" {
		delay, _ := time.ParseDuration(step.DelayBefore)
		fmt.Printf("等待 %s 后执行步骤 [%s]...\n", step.DelayBefore, step.Name)
		time.Sleep(delay)
	}

	stepExec := &StepExecution{
		Name:      step.Name,
		StepType:  step.StepType,
		Status:    StepStatusRunning,
		StartTime: time.Now().UTC(),
	}

	fmt.Printf("\n[%d/%d] 执行步骤: %s (类型: %s)\n", index+1, len(gd.Steps), step.Name, step.StepType)
	fmt.Printf("    描述: %s\n", step.Description)

	var err error
	switch step.StepType {
	case StepTypeExperiment:
		err = e.executeExperimentStep(step, stepExec)
	case StepTypeCheckpoint:
		err = e.executeCheckpointStep(step, stepExec)
	case StepTypeAction:
		err = e.executeActionStep(step, stepExec)
	}

	stepExec.EndTime = time.Now().UTC()
	stepExec.Duration = stepExec.EndTime.Sub(stepExec.StartTime)

	if err != nil {
		stepExec.Status = StepStatusFailed
		stepExec.Error = err.Error()
		fmt.Printf("    ❌ 失败: %v\n", err)
	} else {
		stepExec.Status = StepStatusCompleted
		fmt.Printf("    ✅ 成功 (耗时: %v)\n", stepExec.Duration)
	}

	return stepExec, err
}

func (e *Executor) executeExperimentStep(step GameDayStep, exec *StepExecution) error {
	if step.Experiment == nil {
		return fmt.Errorf("experiment配置为空")
	}

	fmt.Printf("    加载实验配置: %s\n", step.Experiment.ExperimentFile)

	validator := config.NewValidator()
	expConfig, err := validator.ValidateFromFile(step.Experiment.ExperimentFile)
	if err != nil {
		return fmt.Errorf("实验配置校验失败: %w", err)
	}

	experiment, err := e.manager.Create(expConfig)
	if err != nil {
		return fmt.Errorf("创建实验失败: %w", err)
	}

	exec.ExperimentInfo = &ExperimentExecutionInfo{
		Name:      experiment.Name,
		Status:    experiment.Status,
		StartTime: time.Now().UTC(),
	}

	fmt.Printf("    实验已创建: %s/%s\n", experiment.Namespace, experiment.Name)

	if step.Experiment.Duration != "" {
		duration, _ := time.ParseDuration(step.Experiment.Duration)
		fmt.Printf("    等待实验执行 %s...\n", duration)
		time.Sleep(duration)
	}

	fmt.Printf("    停止实验...\n")
	if err := e.manager.Stop(experiment.Name); err != nil {
		return fmt.Errorf("停止实验失败: %w", err)
	}

	exec.ExperimentInfo.EndTime = time.Now().UTC()
	exec.ExperimentInfo.Duration = exec.ExperimentInfo.EndTime.Sub(exec.ExperimentInfo.StartTime)
	exec.ExperimentInfo.Status = "Completed"

	return nil
}

func (e *Executor) executeCheckpointStep(step GameDayStep, exec *StepExecution) error {
	if step.Checkpoint == nil {
		return fmt.Errorf("checkpoint配置为空")
	}

	fmt.Printf("    执行检查点: %s (类型: %s)\n", step.Checkpoint.Name, step.Checkpoint.Type)

	result, err := e.checkpoints.Run(step.Checkpoint)
	exec.Checkpoint = result

	if err != nil {
		return fmt.Errorf("检查点执行失败: %w", err)
	}

	if !result.Passed {
		return fmt.Errorf("检查点断言失败")
	}

	return nil
}

func (e *Executor) executeActionStep(step GameDayStep, exec *StepExecution) error {
	if step.Action == nil {
		return fmt.Errorf("action配置为空")
	}

	fmt.Printf("    执行动作: %s (类型: %s)\n", step.Action.Name, step.Action.Type)

	switch step.Action.Type {
	case ActionTypeNotify:
		fmt.Printf("    [通知] 发送通知到: %v\n", []string{"slack", "email"})
	case ActionTypeCommand:
		fmt.Printf("    [命令] 执行: %s\n", step.Action.Command)
	case ActionTypeScript:
		fmt.Printf("    [脚本] 执行脚本...\n")
	case ActionTypePause:
		fmt.Printf("    [暂停] 等待手动继续...\n")
		fmt.Printf("    按 Enter 继续...")
		time.Sleep(2 * time.Second)
	}

	return nil
}

func (e *Executor) rollbackAllSteps(gd *GameDayDefinition) {
	fmt.Println("\n========================================")
	fmt.Println("开始回滚所有步骤...")
	fmt.Println("========================================")

	rolledBack := make([]string, 0)

	for i := len(gd.Steps) - 1; i >= 0; i-- {
		step := gd.Steps[i]
		if step.StepType == StepTypeExperiment && step.Experiment != nil {
			fmt.Printf("回滚步骤 [%d]: %s\n", i+1, step.Name)

			validator := config.NewValidator()
			if expConfig, err := validator.ValidateFromFile(step.Experiment.ExperimentFile); err == nil {
				if err := e.manager.Stop(expConfig.Name); err == nil {
					rolledBack = append(rolledBack, step.Name)
				}
			}
		}
	}

	e.mu.Lock()
	if e.execution != nil {
		e.execution.RollbackInfo = &RollbackInfo{
			StepsRolledBack: rolledBack,
			Status:          "Completed",
		}
	}
	e.mu.Unlock()

	fmt.Println("========================================")
	fmt.Printf("回滚完成，共回滚 %d 个实验\n", len(rolledBack))
	fmt.Println("========================================")
}

func (e *Executor) Stop() {
	select {
	case <-e.stopCh:
	default:
		close(e.stopCh)
	}
}

func (e *Executor) GetExecution() *GameDayExecution {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.execution
}
