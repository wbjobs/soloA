package config

import (
	"errors"
	"fmt"
	"strings"
)

type Validator struct {
	loader *Loader
}

func NewValidator() *Validator {
	return &Validator{
		loader: NewLoader(),
	}
}

func (v *Validator) ValidateFromFile(path string) (*ExperimentConfig, error) {
	config, err := v.loader.LoadFromFile(path)
	if err != nil {
		return nil, err
	}

	if err := v.Validate(config); err != nil {
		return nil, err
	}

	return config, nil
}

func (v *Validator) Validate(config *ExperimentConfig) error {
	var errs []string

	if config.Name == "" {
		errs = append(errs, "实验名称(name)不能为空")
	}

	if config.Namespace == "" {
		errs = append(errs, "命名空间(namespace)不能为空")
	}

	if config.Type == "" {
		errs = append(errs, "实验类型(type)不能为空")
	}

	if err := validateExperimentType(config.Type); err != nil {
		errs = append(errs, err.Error())
	}

	if err := validateSelector(&config.Selector); err != nil {
		errs = append(errs, err.Error())
	}

	if err := validateTypeSpecificConfig(config); err != nil {
		errs = append(errs, err.Error())
	}

	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}

	return nil
}

func validateExperimentType(expType ExperimentType) error {
	switch expType {
	case ExperimentTypePodChaos,
		ExperimentTypeNetworkChaos,
		ExperimentTypeStressChaos,
		ExperimentTypeIOChaos:
		return nil
	default:
		return fmt.Errorf("不支持的实验类型: %s", expType)
	}
}

func validateSelector(selector *Selector) error {
	if selector == nil {
		return errors.New("选择器(selector)不能为空")
	}

	if len(selector.LabelSelectors) == 0 && len(selector.Pods) == 0 {
		return errors.New("选择器(selector)必须至少指定labelSelectors或pods之一")
	}

	return nil
}

func validateTypeSpecificConfig(config *ExperimentConfig) error {
	switch config.Type {
	case ExperimentTypePodChaos:
		return validatePodChaos(config)
	case ExperimentTypeNetworkChaos:
		return validateNetworkChaos(config)
	case ExperimentTypeStressChaos:
		return validateStressChaos(config)
	case ExperimentTypeIOChaos:
		return validateIOChaos(config)
	default:
		return nil
	}
}

func validatePodChaos(config *ExperimentConfig) error {
	if config.PodChaos == nil {
		return errors.New("PodChaos配置(podChaos)不能为空")
	}

	if config.PodChaos.Action == "" {
		return errors.New("PodChaos动作(podChaos.action)不能为空")
	}

	switch config.PodChaos.Action {
	case PodChaosActionPodKill,
		PodChaosActionPodDelete,
		PodChaosActionContainerKill:
		return nil
	default:
		return fmt.Errorf("不支持的PodChaos动作: %s", config.PodChaos.Action)
	}
}

func validateNetworkChaos(config *ExperimentConfig) error {
	if config.NetworkChaos == nil {
		return errors.New("NetworkChaos配置(networkChaos)不能为空")
	}

	if config.NetworkChaos.Action == "" {
		return errors.New("NetworkChaos动作(networkChaos.action)不能为空")
	}

	switch config.NetworkChaos.Action {
	case NetworkChaosActionDelay:
		if config.NetworkChaos.Delay == nil {
			return errors.New("延迟配置(networkChaos.delay)不能为空")
		}
		if config.NetworkChaos.Delay.Latency == "" {
			return errors.New("延迟时间(networkChaos.delay.latency)不能为空")
		}
	case NetworkChaosActionLoss:
		if config.NetworkChaos.Loss == nil {
			return errors.New("丢包配置(networkChaos.loss)不能为空")
		}
		if config.NetworkChaos.Loss.Percentage == "" {
			return errors.New("丢包比例(networkChaos.loss.percentage)不能为空")
		}
	case NetworkChaosActionDuplicate, NetworkChaosActionCorrupt:
	default:
		return fmt.Errorf("不支持的NetworkChaos动作: %s", config.NetworkChaos.Action)
	}

	return nil
}

func validateStressChaos(config *ExperimentConfig) error {
	if config.StressChaos == nil {
		return errors.New("StressChaos配置(stressChaos)不能为空")
	}

	if config.StressChaos.Action == "" {
		return errors.New("StressChaos动作(stressChaos.action)不能为空")
	}

	switch config.StressChaos.Action {
	case StressChaosActionCPU:
		if config.StressChaos.CPU == nil {
			return errors.New("CPU压力配置(stressChaos.cpu)不能为空")
		}
		if config.StressChaos.CPU.Workers <= 0 {
			return errors.New("CPU工作线程数(stressChaos.cpu.workers)必须大于0")
		}
	case StressChaosActionMemory:
		if config.StressChaos.Memory == nil {
			return errors.New("内存压力配置(stressChaos.memory)不能为空")
		}
		if config.StressChaos.Memory.Workers <= 0 {
			return errors.New("内存工作线程数(stressChaos.memory.workers)必须大于0")
		}
		if config.StressChaos.Memory.Size == "" {
			return errors.New("内存压力大小(stressChaos.memory.size)不能为空")
		}
	default:
		return fmt.Errorf("不支持的StressChaos动作: %s", config.StressChaos.Action)
	}

	return nil
}

func validateIOChaos(config *ExperimentConfig) error {
	if config.IOChaos == nil {
		return errors.New("IOChaos配置(ioChaos)不能为空")
	}

	if config.IOChaos.Action == "" {
		return errors.New("IOChaos动作(ioChaos.action)不能为空")
	}

	if config.IOChaos.Probability == "" {
		return errors.New("IOChaos概率(ioChaos.probability)不能为空")
	}

	return nil
}
