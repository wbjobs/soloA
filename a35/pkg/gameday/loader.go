package gameday

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

func (l *Loader) LoadFromFile(path string) (*GameDayDefinition, error) {
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

func (l *Loader) loadFromYAML(content []byte) (*GameDayDefinition, error) {
	var gd GameDayDefinition
	if err := yaml.Unmarshal(content, &gd); err != nil {
		return nil, fmt.Errorf("YAML解析失败: %w", err)
	}
	return &gd, nil
}

func (l *Loader) loadFromJSON(content []byte) (*GameDayDefinition, error) {
	var gd GameDayDefinition
	if err := json.Unmarshal(content, &gd); err != nil {
		return nil, fmt.Errorf("JSON解析失败: %w", err)
	}
	return &gd, nil
}

func (l *Loader) Validate(gd *GameDayDefinition) error {
	var errs []string

	if gd.Name == "" {
		errs = append(errs, "GameDay名称不能为空")
	}

	if gd.APIVersion == "" {
		errs = append(errs, "apiVersion不能为空")
	}

	if len(gd.Steps) == 0 {
		errs = append(errs, "GameDay至少需要包含一个步骤")
	}

	for i, step := range gd.Steps {
		if step.Name == "" {
			errs = append(errs, fmt.Sprintf("步骤[%d]名称不能为空", i))
		}

		switch step.StepType {
		case StepTypeExperiment:
			if step.Experiment == nil || step.Experiment.ExperimentFile == "" {
				errs = append(errs, fmt.Sprintf("步骤[%s]: experiment类型需要指定experimentFile", step.Name))
			}
		case StepTypeCheckpoint:
			if step.Checkpoint == nil {
				errs = append(errs, fmt.Sprintf("步骤[%s]: checkpoint类型需要指定checkpoint配置", step.Name))
			} else {
				if err := l.validateCheckpoint(step.Checkpoint); err != nil {
					errs = append(errs, fmt.Sprintf("步骤[%s]: %s", step.Name, err.Error()))
				}
			}
		case StepTypeAction:
			if step.Action == nil {
				errs = append(errs, fmt.Sprintf("步骤[%s]: action类型需要指定action配置", step.Name))
			}
		default:
			errs = append(errs, fmt.Sprintf("步骤[%s]: 不支持的步骤类型 %s", step.Name, step.StepType))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("GameDay配置校验失败: %s", strings.Join(errs, "; "))
	}

	return nil
}

func (l *Loader) validateCheckpoint(cp *CheckpointDef) error {
	switch cp.Type {
	case CheckpointTypePromQL:
		if cp.PromQL == nil {
			return fmt.Errorf("promql类型的检查点需要配置promql")
		}
		if cp.PromQL.Query == "" {
			return fmt.Errorf("promql查询不能为空")
		}
	case CheckpointTypeK8s:
		if cp.K8s == nil {
			return fmt.Errorf("k8s类型的检查点需要配置k8s")
		}
		if cp.K8s.ResourceType == "" {
			return fmt.Errorf("k8s资源类型不能为空")
		}
	case CheckpointTypeHTTP:
		if cp.HTTP == nil {
			return fmt.Errorf("http类型的检查点需要配置http")
		}
		if cp.HTTP.URL == "" {
			return fmt.Errorf("http URL不能为空")
		}
	case CheckpointTypeCustom:
		if cp.Custom == nil {
			return fmt.Errorf("custom类型的检查点需要配置custom")
		}
		if cp.Custom.Command == "" {
			return fmt.Errorf("custom命令不能为空")
		}
	default:
		return fmt.Errorf("不支持的检查点类型: %s", cp.Type)
	}

	return nil
}
