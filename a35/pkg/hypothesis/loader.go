package hypothesis

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Loader struct{}

func NewLoader() *Loader {
	return &Loader{}
}

func (l *Loader) LoadFromFile(path string) (*HypothesisDefinition, error) {
	ext := strings.ToLower(filepath.Ext(path))

	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("无法打开文件: %w", err)
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("无法读取文件: %w", err)
	}

	switch ext {
	case ".yaml", ".yml":
		return l.loadFromYAML(content)
	case ".json":
		return l.loadFromJSON(content)
	default:
		return nil, fmt.Errorf("不支持的文件格式: %s，仅支持YAML和JSON", ext)
	}
}

func (l *Loader) loadFromYAML(content []byte) (*HypothesisDefinition, error) {
	var def HypothesisDefinition
	if err := yaml.Unmarshal(content, &def); err != nil {
		return nil, fmt.Errorf("YAML解析失败: %w", err)
	}
	return &def, nil
}

func (l *Loader) loadFromJSON(content []byte) (*HypothesisDefinition, error) {
	var def HypothesisDefinition
	if err := json.Unmarshal(content, &def); err != nil {
		return nil, fmt.Errorf("JSON解析失败: %w", err)
	}
	return &def, nil
}

func (l *Loader) Validate(def *HypothesisDefinition) error {
	var errs []string

	if def.Name == "" {
		errs = append(errs, "假设验证名称不能为空")
	}

	if def.APIVersion == "" {
		errs = append(errs, "apiVersion不能为空")
	}

	if len(def.Hypotheses) == 0 {
		errs = append(errs, "至少需要定义一个假设")
	}

	if len(def.SteadyState.Metrics) == 0 {
		errs = append(errs, "稳态状态至少需要定义一个指标")
	}

	for i, metric := range def.SteadyState.Metrics {
		if metric.Name == "" {
			errs = append(errs, fmt.Sprintf("稳态指标[%d]名称不能为空", i))
		}
		if metric.Query == "" {
			errs = append(errs, fmt.Sprintf("稳态指标[%s]查询不能为空", metric.Name))
		}
	}

	for i, hyp := range def.Hypotheses {
		if hyp.ID == "" {
			errs = append(errs, fmt.Sprintf("假设[%d]ID不能为空", i))
		}
		if hyp.Name == "" {
			errs = append(errs, fmt.Sprintf("假设[%d]名称不能为空", i))
		}
		if hyp.Assumption == "" {
			errs = append(errs, fmt.Sprintf("假设[%s]前提不能为空", hyp.Name))
		}
		if hyp.Prediction == "" {
			errs = append(errs, fmt.Sprintf("假设[%s]预测不能为空", hyp.Name))
		}
		if len(hyp.Metrics) == 0 {
			errs = append(errs, fmt.Sprintf("假设[%s]至少需要定义一个验证指标", hyp.Name))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("假设验证配置校验失败: %s", strings.Join(errs, "; "))
	}

	return nil
}
