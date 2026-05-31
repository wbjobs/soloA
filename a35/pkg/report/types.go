package report

import (
	"time"

	"github.com/chaos-cli/chaosctl/pkg/config"
)

type ReportOptions struct {
	ExperimentName string
	PrometheusURL  string
	Kubeconfig     string
	Namespace      string
}

type ChaosReport struct {
	Title           string
	GeneratedAt     string
	ExperimentInfo  ExperimentInfo
	Timeline        []TimelineEvent
	MetricsData     MetricsData
	ImpactAnalysis  ImpactAnalysis
	Recommendations []string
}

type ExperimentInfo struct {
	Name        string
	Namespace   string
	Type        config.ExperimentType
	Description string
	Status      string
	StartTime   string
	EndTime     string
	Duration    string
	Selector    config.Selector
}

type TimelineEvent struct {
	Timestamp string
	Type      string
	Message   string
	Details   string
}

type MetricsData struct {
	BeforeExperiment MetricsSnapshot
	DuringExperiment MetricsSnapshot
	AfterExperiment  MetricsSnapshot
}

type MetricsSnapshot struct {
	Timestamp   string
	ErrorRate   float64
	P99Latency  time.Duration
	Throughput  float64
	Description string
}

type ImpactAnalysis struct {
	ServicesAffected []string
	ErrorRateChange  string
	LatencyChange    string
	ThroughputChange string
	Conclusion       string
}
