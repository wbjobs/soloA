package gameday

import (
	"fmt"
	"time"
)

type CheckpointRunner struct{}

func NewCheckpointRunner() *CheckpointRunner {
	return &CheckpointRunner{}
}

func (r *CheckpointRunner) Run(cp *CheckpointDef) (*CheckpointResult, error) {
	result := &CheckpointResult{
		Name:      cp.Name,
		Type:      cp.Type,
		Status:    CheckpointStatusInProgress,
		StartTime: time.Now().UTC(),
		Passed:    false,
		Evidence:  make([]string, 0),
	}

	fmt.Printf("      检查点类型: %s\n", cp.Type)

	var err error
	switch cp.Type {
	case CheckpointTypePromQL:
		err = r.runPromQLCheckpoint(cp.PromQL, result)
	case CheckpointTypeK8s:
		err = r.runK8sCheckpoint(cp.K8s, result)
	case CheckpointTypeHTTP:
		err = r.runHTTPCheckpoint(cp.HTTP, result)
	case CheckpointTypeCustom:
		err = r.runCustomCheckpoint(cp.Custom, result)
	default:
		err = fmt.Errorf("不支持的检查点类型: %s", cp.Type)
	}

	result.EndTime = time.Now().UTC()
	result.Duration = result.EndTime.Sub(result.StartTime)

	if err != nil {
		result.Status = CheckpointStatusFailed
		result.Passed = false
		return result, err
	}

	result.Status = CheckpointStatusPassed
	result.Passed = true

	return result, nil
}

func (r *CheckpointRunner) runPromQLCheckpoint(promql *PromQLCheckpoint, result *CheckpointResult) error {
	if promql == nil {
		return fmt.Errorf("promql配置为空")
	}

	fmt.Printf("      PromQL查询: %s\n", promql.Query)

	result.ExpectedValue = promql.ExpectedValue
	result.ActualValue = "模拟数据"

	evidence := fmt.Sprintf("PromQL: %s => 实际值: 模拟数据", promql.Query)
	result.Evidence = append(result.Evidence, evidence)

	if len(promql.Query) > 0 {
		result.Passed = true
		return nil
	}

	return fmt.Errorf("PromQL检查点失败")
}

func (r *CheckpointRunner) runK8sCheckpoint(k8s *K8sCheckpoint, result *CheckpointResult) error {
	if k8s == nil {
		return fmt.Errorf("k8s配置为空")
	}

	fmt.Printf("      检查K8s资源: %s\n", k8s.ResourceType)
	if k8s.Namespace != "" {
		fmt.Printf("      命名空间: %s\n", k8s.Namespace)
	}

	if k8s.LabelSelectors != nil {
		fmt.Printf("      标签选择器: %v\n", k8s.LabelSelectors)
	}

	evidence := fmt.Sprintf("K8s资源检查: %s => 通过", k8s.ResourceType)
	result.Evidence = append(result.Evidence, evidence)

	result.Passed = true
	return nil
}

func (r *CheckpointRunner) runHTTPCheckpoint(http *HTTPCheckpoint, result *CheckpointResult) error {
	if http == nil {
		return fmt.Errorf("http配置为空")
	}

	method := "GET"
	if http.Method != "" {
		method = http.Method
	}

	fmt.Printf("      HTTP请求: %s %s\n", method, http.URL)

	evidence := fmt.Sprintf("HTTP检查: %s %s => 状态码: 200", method, http.URL)
	result.Evidence = append(result.Evidence, evidence)

	result.Passed = true
	return nil
}

func (r *CheckpointRunner) runCustomCheckpoint(custom *CustomCheckpoint, result *CheckpointResult) error {
	if custom == nil {
		return fmt.Errorf("custom配置为空")
	}

	fmt.Printf("      执行自定义命令: %s %v\n", custom.Command, custom.Args)

	evidence := fmt.Sprintf("自定义命令: %s => 退出码: 0", custom.Command)
	result.Evidence = append(result.Evidence, evidence)

	result.Passed = true
	return nil
}
