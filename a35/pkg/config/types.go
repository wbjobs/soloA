package config

type ExperimentType string

const (
	ExperimentTypePodChaos    ExperimentType = "PodChaos"
	ExperimentTypeNetworkChaos ExperimentType = "NetworkChaos"
	ExperimentTypeStressChaos  ExperimentType = "StressChaos"
	ExperimentTypeIOChaos      ExperimentType = "IOChaos"
)

type PodChaosAction string

const (
	PodChaosActionPodKill   PodChaosAction = "pod-kill"
	PodChaosActionPodDelete PodChaosAction = "pod-delete"
	PodChaosActionContainerKill PodChaosAction = "container-kill"
)

type NetworkChaosAction string

const (
	NetworkChaosActionDelay   NetworkChaosAction = "delay"
	NetworkChaosActionLoss    NetworkChaosAction = "loss"
	NetworkChaosActionDuplicate NetworkChaosAction = "duplicate"
	NetworkChaosActionCorrupt NetworkChaosAction = "corrupt"
)

type StressChaosAction string

const (
	StressChaosActionCPU StressChaosAction = "cpu"
	StressChaosActionMemory StressChaosAction = "memory"
)

type ExperimentConfig struct {
	APIVersion  string         `yaml:"apiVersion" json:"apiVersion"`
	Kind        string         `yaml:"kind" json:"kind"`
	Name        string         `yaml:"name" json:"name"`
	Namespace   string         `yaml:"namespace" json:"namespace"`
	Description string         `yaml:"description,omitempty" json:"description,omitempty"`
	Type        ExperimentType `yaml:"type" json:"type"`
	Duration    string         `yaml:"duration,omitempty" json:"duration,omitempty"`
	Selector    Selector       `yaml:"selector" json:"selector"`
	Action      string         `yaml:"action,omitempty" json:"action,omitempty"`
	Mode        string         `yaml:"mode,omitempty" json:"mode,omitempty"`
	Value       string         `yaml:"value,omitempty" json:"value,omitempty"`
	PodChaos    *PodChaosConfig    `yaml:"podChaos,omitempty" json:"podChaos,omitempty"`
	NetworkChaos *NetworkChaosConfig `yaml:"networkChaos,omitempty" json:"networkChaos,omitempty"`
	StressChaos *StressChaosConfig   `yaml:"stressChaos,omitempty" json:"stressChaos,omitempty"`
	IOChaos     *IOChaosConfig       `yaml:"ioChaos,omitempty" json:"ioChaos,omitempty"`
}

type Selector struct {
	LabelSelectors map[string]string `yaml:"labelSelectors,omitempty" json:"labelSelectors,omitempty"`
	Namespaces     []string          `yaml:"namespaces,omitempty" json:"namespaces,omitempty"`
	Pods           map[string][]string `yaml:"pods,omitempty" json:"pods,omitempty"`
}

type PodChaosConfig struct {
	Action      PodChaosAction `yaml:"action" json:"action"`
	GracePeriod int64          `yaml:"gracePeriod,omitempty" json:"gracePeriod,omitempty"`
}

type NetworkChaosConfig struct {
	Action   NetworkChaosAction `yaml:"action" json:"action"`
	Delay    *DelayConfig       `yaml:"delay,omitempty" json:"delay,omitempty"`
	Loss     *LossConfig        `yaml:"loss,omitempty" json:"loss,omitempty"`
}

type DelayConfig struct {
	Latency     string `yaml:"latency" json:"latency"`
	Correlation string `yaml:"correlation,omitempty" json:"correlation,omitempty"`
	Jitter      string `yaml:"jitter,omitempty" json:"jitter,omitempty"`
}

type LossConfig struct {
	Percentage  string `yaml:"percentage" json:"percentage"`
	Correlation string `yaml:"correlation,omitempty" json:"correlation,omitempty"`
}

type StressChaosConfig struct {
	Action   StressChaosAction `yaml:"action" json:"action"`
	CPU      *CPUStressConfig  `yaml:"cpu,omitempty" json:"cpu,omitempty"`
	Memory   *MemoryStressConfig `yaml:"memory,omitempty" json:"memory,omitempty"`
}

type CPUStressConfig struct {
	Workers int    `yaml:"workers" json:"workers"`
	Load    int    `yaml:"load,omitempty" json:"load,omitempty"`
}

type MemoryStressConfig struct {
	Workers int    `yaml:"workers" json:"workers"`
	Size    string `yaml:"size" json:"size"`
}

type IOChaosConfig struct {
	Action      string         `yaml:"action" json:"action"`
	Delay       string         `yaml:"delay,omitempty" json:"delay,omitempty"`
	Errno       int32          `yaml:"errno,omitempty" json:"errno,omitempty"`
	Probability string         `yaml:"probability" json:"probability"`
	Path        string         `yaml:"path,omitempty" json:"path,omitempty"`
	Percent     int            `yaml:"percent,omitempty" json:"percent,omitempty"`
}

type Experiment struct {
	Name        string
	Namespace   string
	Type        ExperimentType
	Status      string
	Description string
	CreatedAt   string
	Config      ExperimentConfig
}
