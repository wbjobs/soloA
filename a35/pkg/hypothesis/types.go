package hypothesis

import (
	"time"
)

type HypothesisStatus string

const (
	HypothesisStatusPending   HypothesisStatus = "Pending"
	HypothesisStatusVerifying HypothesisStatus = "Verifying"
	HypothesisStatusAccepted  HypothesisStatus = "Accepted"
	HypothesisStatusRejected  HypothesisStatus = "Rejected"
	HypothesisStatusPartial   HypothesisStatus = "Partial"
)

type ComparisonOperator string

const (
	OperatorEqual              ComparisonOperator = "=="
	OperatorNotEqual           ComparisonOperator = "!="
	OperatorGreaterThan        ComparisonOperator = ">"
	OperatorLessThan           ComparisonOperator = "<"
	OperatorGreaterThanOrEqual ComparisonOperator = ">="
	OperatorLessThanOrEqual    ComparisonOperator = "<="
	OperatorInRange            ComparisonOperator = "in_range"
	OperatorApproximate        ComparisonOperator = "approximate"
)

type HypothesisDefinition struct {
	APIVersion  string            `yaml:"apiVersion" json:"apiVersion"`
	Kind        string            `yaml:"kind" json:"kind"`
	Name        string            `yaml:"name" json:"name"`
	Description string            `yaml:"description,omitempty" json:"description,omitempty"`
	Labels      map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`

	SteadyState  SteadyStateSpec    `yaml:"steadyState" json:"steadyState"`
	Hypotheses   []HypothesisSpec   `yaml:"hypotheses" json:"hypotheses"`
	Tolerance    ToleranceConfig    `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
	Experiment   ExperimentRef      `yaml:"experiment,omitempty" json:"experiment,omitempty"`
}

type SteadyStateSpec struct {
	Name        string              `yaml:"name" json:"name"`
	Description string              `yaml:"description,omitempty" json:"description,omitempty"`
	Metrics     []SteadyStateMetric `yaml:"metrics" json:"metrics"`
	Duration    string              `yaml:"duration,omitempty" json:"duration,omitempty"`
	SampleRate  string              `yaml:"sampleRate,omitempty" json:"sampleRate,omitempty"`
}

type SteadyStateMetric struct {
	Name           string           `yaml:"name" json:"name"`
	Query          string           `yaml:"query" json:"query"`
	DataSource     string           `yaml:"dataSource,omitempty" json:"dataSource,omitempty"`
	Unit           string           `yaml:"unit,omitempty" json:"unit,omitempty"`
	Comparison     ComparisonSpec   `yaml:"comparison" json:"comparison"`
}

type ComparisonSpec struct {
	Operator  ComparisonOperator `yaml:"operator" json:"operator"`
	Expected  string             `yaml:"expected" json:"expected"`
	Tolerance string             `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
}

type HypothesisSpec struct {
	ID            string              `yaml:"id" json:"id"`
	Name          string              `yaml:"name" json:"name"`
	Description   string              `yaml:"description,omitempty" json:"description,omitempty"`
	Assumption    string              `yaml:"assumption" json:"assumption"`
	Prediction    string              `yaml:"prediction" json:"prediction"`
	Metrics       []HypothesisMetric  `yaml:"metrics" json:"metrics"`
	Conditions    []ConditionSpec     `yaml:"conditions,omitempty" json:"conditions,omitempty"`
	Weight        float64             `yaml:"weight,omitempty" json:"weight,omitempty"`
}

type HypothesisMetric struct {
	Name           string           `yaml:"name" json:"name"`
	Query          string           `yaml:"query" json:"query"`
	DataSource     string           `yaml:"dataSource,omitempty" json:"dataSource,omitempty"`
	AnalysisMethod string           `yaml:"analysisMethod,omitempty" json:"analysisMethod,omitempty"`

	ExpectedChange string        `yaml:"expectedChange" json:"expectedChange"`
	Tolerance      float64       `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
}

type ConditionSpec struct {
	Type       string            `yaml:"type" json:"type"`
	MetricName string            `yaml:"metricName" json:"metricName"`
	Operator   ComparisonOperator `yaml:"operator" json:"operator"`
	Threshold  string            `yaml:"threshold" json:"threshold"`
}

type ToleranceConfig struct {
	GlobalTolerance float64           `yaml:"globalTolerance,omitempty" json:"globalTolerance,omitempty"`
	MetricTolerance map[string]float64 `yaml:"metricTolerance,omitempty" json:"metricTolerance,omitempty"`
}

type ExperimentRef struct {
	Name           string   `yaml:"name,omitempty" json:"name,omitempty"`
	ExperimentFile string   `yaml:"experimentFile" json:"experimentFile"`
	StartTime      string   `yaml:"startTime,omitempty" json:"startTime,omitempty"`
	EndTime        string   `yaml:"endTime,omitempty" json:"endTime,omitempty"`
}

type HypothesisVerification struct {
	DefinitionName      string
	Status              HypothesisStatus
	StartTime           time.Time
	EndTime             time.Time
	Duration            time.Duration

	SteadyStateResults  SteadyStateVerification
	HypothesisResults   []HypothesisResult
	EvidenceChain       []EvidenceItem
	Summary             VerificationSummary
}

type SteadyStateVerification struct {
	Status          string
	Metrics         []MetricVerification
	StartTime       time.Time
	EndTime         time.Time
	BaselineData    map[string]MetricBaseline
}

type MetricVerification struct {
	Name           string
	Query          string
	Status         string
	ExpectedValue  float64
	ActualValue    float64
	Difference     float64
	DifferencePct  float64
	Tolerance      float64
	Passed         bool
}

type MetricBaseline struct {
	Name          string
	Average       float64
	Min           float64
	Max           float64
	StdDev        float64
	Samples       int
	StartTime     time.Time
	EndTime       time.Time
}

type HypothesisResult struct {
	ID              string
	Name            string
	Assumption      string
	Prediction      string
	Status          HypothesisStatus
	Weight          float64
	Score           float64

	MetricResults   []HypothesisMetricResult
	Evidence        []EvidenceItem
	Conclusion      string
}

type HypothesisMetricResult struct {
	Name           string
	Query          string
	ExpectedChange string
	ActualChange   string
	Tolerance      float64

	BeforeAverage  float64
	AfterAverage   float64
	ChangePct      float64

	Passed         bool
	Evidence       []string
}

type EvidenceItem struct {
	Timestamp   time.Time
	Type        string
	Title       string
	Description string
	Details     map[string]string
	Severity    string
}

type VerificationSummary struct {
	TotalHypotheses   int
	AcceptedCount     int
	RejectedCount     int
	PartialCount      int
	OverallConfidence float64
	Recommendations   []string
}
