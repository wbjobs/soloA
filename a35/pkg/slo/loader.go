package slo

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

func (l *Loader) LoadFromFile(path string) (*SLODefinition, error) {
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

func (l *Loader) loadFromYAML(content []byte) (*SLODefinition, error) {
	var def SLODefinition
	if err := yaml.Unmarshal(content, &def); err != nil {
		return nil, fmt.Errorf("YAML解析失败: %w", err)
	}
	return &def, nil
}

func (l *Loader) loadFromJSON(content []byte) (*SLODefinition, error) {
	var def SLODefinition
	if err := json.Unmarshal(content, &def); err != nil {
		return nil, fmt.Errorf("JSON解析失败: %w", err)
	}
	return &def, nil
}

func (l *Loader) Validate(def *SLODefinition) error {
	var errs []string

	if def.Name == "" {
		errs = append(errs, "SLO名称不能为空")
	}

	if def.APIVersion == "" {
		errs = append(errs, "apiVersion不能为空")
	}

	if def.Service == "" {
		errs = append(errs, "服务名称(service)不能为空")
	}

	if def.Target <= 0 || def.Target > 1 {
		errs = append(errs, "SLO目标(target)必须在0到1之间")
	}

	if def.Window.Duration == "" {
		errs = append(errs, "时间窗口(window.duration)不能为空")
	}

	if _, err := time.ParseDuration(def.Window.Duration); err != nil {
		errs = append(errs, fmt.Sprintf("时间窗口格式无效: %v", err))
	}

	if len(def.Indicators) == 0 {
		errs = append(errs, "至少需要定义一个SLO指标(indicators)")
	}

	for i, indicator := range def.Indicators {
		if indicator.Name == "" {
			errs = append(errs, fmt.Sprintf("指标[%d]名称不能为空", i))
		}

		switch indicator.Type {
		case IndicatorTypeAvailability:
			if indicator.Availability == nil {
				errs = append(errs, fmt.Sprintf("指标[%s]: availability类型需要配置availability", indicator.Name))
			}
		case IndicatorTypeLatency:
			if indicator.Latency == nil {
				errs = append(errs, fmt.Sprintf("指标[%s]: latency类型需要配置latency", indicator.Name))
			}
		case IndicatorTypeThroughput:
			if indicator.Throughput == nil {
				errs = append(errs, fmt.Sprintf("指标[%s]: throughput类型需要配置throughput", indicator.Name))
			}
		default:
			errs = append(errs, fmt.Sprintf("指标[%s]: 不支持的指标类型 %s", indicator.Name, indicator.Type))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("SLO配置校验失败: %s", strings.Join(errs, "; "))
	}

	return nil
}
