package gameday

import (
	"time"

	"github.com/chaos-cli/chaosctl/pkg/config"
)

type GameDayStatus string

const (
	GameDayStatusScheduled GameDayStatus = "Scheduled"
	GameDayStatusRunning   GameDayStatus = "Running"
	GameDayStatusPaused    GameDayStatus = "Paused"
	GameDayStatusCompleted GameDayStatus = "Completed"
	GameDayStatusFailed    GameDayStatus = "Failed"
	GameDayStatusRolledBack GameDayStatus = "RolledBack"
)

type StepStatus string

const (
	StepStatusPending   StepStatus = "Pending"
	StepStatusRunning   StepStatus = "Running"
	StepStatusCompleted StepStatus = "Completed"
	StepStatusFailed    StepStatus = "Failed"
	StepStatusSkipped   StepStatus = "Skipped"
)

type CheckpointStatus string

const (
	CheckpointStatusPending    CheckpointStatus = "Pending"
	CheckpointStatusPassed     CheckpointStatus = "Passed"
	CheckpointStatusFailed     CheckpointStatus = "Failed"
	CheckpointStatusInProgress CheckpointStatus = "InProgress"
)

type GameDayDefinition struct {
	APIVersion   string            `yaml:"apiVersion" json:"apiVersion"`
	Kind         string            `yaml:"kind" json:"kind"`
	Name         string            `yaml:"name" json:"name"`
	Namespace    string            `yaml:"namespace" json:"namespace"`
	Description  string            `yaml:"description,omitempty" json:"description,omitempty"`
	Labels       map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`
	Team         string            `yaml:"team,omitempty" json:"team,omitempty"`
	Environment  string            `yaml:"environment,omitempty" json:"environment,omitempty"`

	AutoRollback  bool              `yaml:"autoRollback,omitempty" json:"autoRollback,omitempty"`
	MaxFailures   int               `yaml:"maxFailures,omitempty" json:"maxFailures,omitempty"`
	Timeout       string            `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	NotifyChannels []string         `yaml:"notifyChannels,omitempty" json:"notifyChannels,omitempty"`

	Steps []GameDayStep `yaml:"steps" json:"steps"`
}

type GameDayStep struct {
	Name           string           `yaml:"name" json:"name"`
	Description    string           `yaml:"description,omitempty" json:"description,omitempty"`
	StepType       StepType         `yaml:"stepType" json:"stepType"`
	Order          int              `yaml:"order" json:"order"`

	DelayBefore    string           `yaml:"delayBefore,omitempty" json:"delayBefore,omitempty"`
	DelayAfter     string           `yaml:"delayAfter,omitempty" json:"delayAfter,omitempty"`
	Timeout        string           `yaml:"timeout,omitempty" json:"timeout,omitempty"`

	ContinueOnFail bool             `yaml:"continueOnFail,omitempty" json:"continueOnFail,omitempty"`

	Experiment     *ExperimentRef   `yaml:"experiment,omitempty" json:"experiment,omitempty"`
	Checkpoint     *CheckpointDef   `yaml:"checkpoint,omitempty" json:"checkpoint,omitempty"`
	Action         *ActionDef       `yaml:"action,omitempty" json:"action,omitempty"`
}

type StepType string

const (
	StepTypeExperiment StepType = "experiment"
	StepTypeCheckpoint StepType = "checkpoint"
	StepTypeAction     StepType = "action"
)

type ExperimentRef struct {
	ExperimentFile string `yaml:"experimentFile" json:"experimentFile"`
	Duration       string `yaml:"duration,omitempty" json:"duration,omitempty"`
}

type CheckpointDef struct {
	Type        CheckpointType       `yaml:"type" json:"type"`
	Name        string               `yaml:"name" json:"name"`
	Description string               `yaml:"description,omitempty" json:"description,omitempty"`

	PromQL      *PromQLCheckpoint    `yaml:"promql,omitempty" json:"promql,omitempty"`
	K8s         *K8sCheckpoint       `yaml:"k8s,omitempty" json:"k8s,omitempty"`
	HTTP        *HTTPCheckpoint      `yaml:"http,omitempty" json:"http,omitempty"`
	Custom      *CustomCheckpoint    `yaml:"custom,omitempty" json:"custom,omitempty"`

	Assertions  []CheckpointAssertion `yaml:"assertions,omitempty" json:"assertions,omitempty"`
}

type CheckpointType string

const (
	CheckpointTypePromQL CheckpointType = "promql"
	CheckpointTypeK8s    CheckpointType = "k8s"
	CheckpointTypeHTTP   CheckpointType = "http"
	CheckpointTypeCustom CheckpointType = "custom"
)

type PromQLCheckpoint struct {
	Query          string `yaml:"query" json:"query"`
	ComparisonType string `yaml:"comparisonType" json:"comparisonType"`
	ExpectedValue  string `yaml:"expectedValue" json:"expectedValue"`
	Tolerance      string `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
	Duration       string `yaml:"duration,omitempty" json:"duration,omitempty"`
}

type K8sCheckpoint struct {
	ResourceType   string            `yaml:"resourceType" json:"resourceType"`
	Namespace      string            `yaml:"namespace,omitempty" json:"namespace,omitempty"`
	LabelSelectors map[string]string `yaml:"labelSelectors,omitempty" json:"labelSelectors,omitempty"`
	FieldSelectors map[string]string `yaml:"fieldSelectors,omitempty" json:"fieldSelectors,omitempty"`
	MinReplicas    int               `yaml:"minReplicas,omitempty" json:"minReplicas,omitempty"`
	MaxUnavailable int               `yaml:"maxUnavailable,omitempty" json:"maxUnavailable,omitempty"`
}

type HTTPCheckpoint struct {
	URL         string            `yaml:"url" json:"url"`
	Method      string            `yaml:"method,omitempty" json:"method,omitempty"`
	Headers     map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Body        string            `yaml:"body,omitempty" json:"body,omitempty"`
	ExpectedStatus int            `yaml:"expectedStatus,omitempty" json:"expectedStatus,omitempty"`
	Timeout     string            `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	Retries     int               `yaml:"retries,omitempty" json:"retries,omitempty"`
}

type CustomCheckpoint struct {
	Command string   `yaml:"command" json:"command"`
	Args    []string `yaml:"args,omitempty" json:"args,omitempty"`
}

type CheckpointAssertion struct {
	Type      string `yaml:"type" json:"type"`
	Key       string `yaml:"key" json:"key"`
	Operator  string `yaml:"operator" json:"operator"`
	Expected  string `yaml:"expected" json:"expected"`
	Actual    string `yaml:"actual,omitempty" json:"actual,omitempty"`
	Passed    bool   `yaml:"passed,omitempty" json:"passed,omitempty"`
}

type ActionDef struct {
	Type    ActionType `yaml:"type" json:"type"`
	Name    string     `yaml:"name" json:"name"`
	Command string     `yaml:"command,omitempty" json:"command,omitempty"`
	Script  string     `yaml:"script,omitempty" json:"script,omitempty"`
}

type ActionType string

const (
	ActionTypeNotify  ActionType = "notify"
	ActionTypeCommand ActionType = "command"
	ActionTypeScript  ActionType = "script"
	ActionTypePause   ActionType = "pause"
)

type GameDayExecution struct {
	GameDayName    string
	Status         GameDayStatus
	StartTime      time.Time
	EndTime        time.Time
	CurrentStep    int
	Steps          []StepExecution
	TotalDuration  time.Duration
	FailureCount   int
	RollbackInfo   *RollbackInfo
}

type StepExecution struct {
	Name           string
	StepType       StepType
	Status         StepStatus
	StartTime      time.Time
	EndTime        time.Time
	Duration       time.Duration
	Checkpoint     *CheckpointResult
	ExperimentInfo *ExperimentExecutionInfo
	Error          string
}

type CheckpointResult struct {
	Name           string
	Type           CheckpointType
	Status         CheckpointStatus
	StartTime      time.Time
	EndTime        time.Time
	Duration       time.Duration
	ExpectedValue  string
	ActualValue    string
	Assertions     []CheckpointAssertion
	Passed         bool
	Evidence       []string
}

type ExperimentExecutionInfo struct {
	Name        string
	Status      string
	StartTime   time.Time
	EndTime     time.Time
	Duration    time.Duration
	RolledBack  bool
}

type RollbackInfo struct {
	TriggeredBy   string
	TriggerReason string
	TriggerTime   time.Time
	StepsRolledBack []string
	Status        string
}
