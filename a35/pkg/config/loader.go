package config

import (
	"encoding/json"
	"errors"
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

func (l *Loader) LoadFromFile(path string) (*ExperimentConfig, error) {
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

func (l *Loader) loadFromYAML(content []byte) (*ExperimentConfig, error) {
	var config ExperimentConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		return nil, fmt.Errorf("YAML解析失败: %w", err)
	}
	return &config, nil
}

func (l *Loader) loadFromJSON(content []byte) (*ExperimentConfig, error) {
	var config ExperimentConfig
	if err := json.Unmarshal(content, &config); err != nil {
		return nil, fmt.Errorf("JSON解析失败: %w", err)
	}
	return &config, nil
}
