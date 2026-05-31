package slo

import (
	"time"
)

type SLOStatus string

const (
	SLOStatusHealthy     SLOStatus = "Healthy"
	SLOStatusWarning     SLOStatus = "Warning"
	SLOStatusCritical    SLOStatus = "Critical"
	SLOStatusExhausted   SLOStatus = "Exhausted"
)

type BurnRateLevel string

const (
	BurnRateLow      BurnRateLevel = "Low"
	BurnRateModerate BurnRateLevel = "Moderate"
	BurnRateHigh     BurnRateLevel = "High"
	BurnRateSevere   BurnRateLevel = "Severe"
)

type SLODefinition struct {
	APIVersion   string            `yaml:"apiVersion" json:"apiVersion"`
	Kind         string            `yaml:"kind" json:"kind"`
	Name         string            `yaml:"name" json:"name"`
	Description  string            `yaml:"description,omitempty" json:"description,omitempty"`
	Labels       map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`
	Service      string            `yaml:"service" json:"service"`
	Environment  string            `yaml:"environment" json:"environment"`

	Window       SLOWindow         `yaml:"window" json:"window"`
	Target       float64           `yaml:"target" json:"target"`
	Indicators   []SLOIndicator    `yaml:"indicators" json:"indicators"`

	Alerting     SLOAlerting       `yaml:"alerting,omitempty" json:"alerting,omitempty"`
	BudgetPolicy BudgetPolicy      `yaml:"budgetPolicy,omitempty" json:"budgetPolicy,omitempty"`
}

type SLOWindow struct {
	Duration   string `yaml:"duration" json:"duration"`
	PeriodType string `yaml:"periodType,omitempty" json:"periodType,omitempty"`
}

type SLOIndicator struct {
	Name        string           `yaml:"name" json:"name"`
	Description string           `yaml:"description,omitempty" json:"description,omitempty"`
	Type        IndicatorType    `yaml:"type" json:"type"`

	Availability *AvailabilityIndicator `yaml:"availability,omitempty" json:"availability,omitempty"`
	Latency      *LatencyIndicator      `yaml:"latency,omitempty" json:"latency,omitempty"`
	Throughput   *ThroughputIndicator   `yaml:"throughput,omitempty" json:"throughput,omitempty"`

	Weight       float64          `yaml:"weight,omitempty" json:"weight,omitempty"`
}

type IndicatorType string

const (
	IndicatorTypeAvailability IndicatorType = "availability"
	IndicatorTypeLatency      IndicatorType = "latency"
	IndicatorTypeThroughput   IndicatorType = "throughput"
)

type AvailabilityIndicator struct {
	GoodEventsQuery   string `yaml:"goodEventsQuery" json:"goodEventsQuery"`
	TotalEventsQuery  string `yaml:"totalEventsQuery" json:"totalEventsQuery"`
	SuccessCriteria   string `yaml:"successCriteria,omitempty" json:"successCriteria,omitempty"`
}

type LatencyIndicator struct {
	Query               string `yaml:"query" json:"query"`
	Threshold           string `yaml:"threshold" json:"threshold"`
	Percentile          string `yaml:"percentile,omitempty" json:"percentile,omitempty"`
	SuccessPercentage   float64 `yaml:"successPercentage,omitempty" json:"successPercentage,omitempty"`
}

type ThroughputIndicator struct {
	Query           string `yaml:"query" json:"query"`
	MinRequestsPerMin float64 `yaml:"minRequestsPerMin,omitempty" json:"minRequestsPerMin,omitempty"`
}

type SLOAlerting struct {
	Enabled              bool     `yaml:"enabled,omitempty" json:"enabled,omitempty"`
	FastBurnThreshold    float64  `yaml:"fastBurnThreshold,omitempty" json:"fastBurnThreshold,omitempty"`
	SlowBurnThreshold    float64  `yaml:"slowBurnThreshold,omitempty" json:"slowBurnThreshold,omitempty"`
	NotificationChannels []string `yaml:"notificationChannels,omitempty" json:"notificationChannels,omitempty"`
}

type BudgetPolicy struct {
	ConsumptionLimit    float64 `yaml:"consumptionLimit,omitempty" json:"consumptionLimit,omitempty"`
	MaxExperimentsPerWeek int    `yaml:"maxExperimentsPerWeek,omitempty" json:"maxExperimentsPerWeek,omitempty"`
	SafeGuardPercentage float64 `yaml:"safeGuardPercentage,omitempty" json:"safeGuardPercentage,omitempty"`
}

type SLOReport struct {
	DefinitionName   string
	Service          string
	Environment      string
	ReportTime       time.Time
	PeriodStart      time.Time
	PeriodEnd        time.Time
	WindowDuration   time.Duration

	Status           SLOStatus
	Target           float64
	Actual           float64
	Difference       float64

	ErrorBudget      ErrorBudget
	BurnRate         BurnRateAnalysis
	Indicators       []IndicatorResult
	Recommendations  []Recommendation
}

type ErrorBudget struct {
	TotalBudget      float64
	ConsumedBudget   float64
	RemainingBudget  float64
	ConsumedRatio    float64
	RemainingRatio   float64
}

type BurnRateAnalysis struct {
	CurrentBurnRate     float64
	BurnRateLevel       BurnRateLevel
	ShortTermBurnRate   float64
	LongTermBurnRate    float64
	TimeToExhaust       time.Duration
	ProjectedConsumption float64
	IsSafeForChaos      bool
}

type IndicatorResult struct {
	Name           string
	Type           IndicatorType
	Target         float64
	Actual         float64
	Passed         bool
	Weight         float64
	Contribution   float64

	Details        map[string]interface{}
}

type Recommendation struct {
	Type        string
	Priority    string
	Title       string
	Description string
	Action      string
}

type ExperimentSchedule struct {
	ExperimentName  string
	PlannedTime     time.Time
	Status          string
	BudgetImpact    float64
	RiskLevel       string
}

type BudgetAdvisor struct {
	sloReport *SLOReport
}

func NewBudgetAdvisor(report *SLOReport) *BudgetAdvisor {
	return &BudgetAdvisor{
		sloReport: report,
	}
}

func (ba *BudgetAdvisor) CanScheduleExperiment(impactEstimate float64) bool {
	if ba.sloReport == nil {
		return false
	}

	budget := ba.sloReport.ErrorBudget

	if budget.RemainingRatio <= 0.05 {
		return false
	}

	if ba.sloReport.BurnRate.BurnRateLevel == BurnRateSevere ||
		ba.sloReport.BurnRate.BurnRateLevel == BurnRateHigh {
		return false
	}

	estimatedConsumption := budget.ConsumedRatio + impactEstimate
	if estimatedConsumption > 0.95 {
		return false
	}

	return true
}

func (ba *BudgetAdvisor) GetExperimentScheduleRecommendations() []Recommendation {
	if ba.sloReport == nil {
		return nil
	}

	recommendations := make([]Recommendation, 0)

	burnRate := ba.sloReport.BurnRate
	budget := ba.sloReport.ErrorBudget

	switch burnRate.BurnRateLevel {
	case BurnRateSevere:
		recommendations = append(recommendations, Recommendation{
			Type:        "critical",
			Priority:    "high",
			Title:       "立即停止所有混沌实验",
			Description: "错误预算燃烧率过高，系统处于风险状态",
			Action:      "暂停所有混沌实验，调查高燃烧率原因",
		})
	case BurnRateHigh:
		recommendations = append(recommendations, Recommendation{
			Type:        "warning",
			Priority:    "high",
			Title:       "限制混沌实验强度",
			Description: "错误预算消耗速度较快",
			Action:      "降低实验强度和频率，监控燃烧率趋势",
		})
	case BurnRateModerate:
		recommendations = append(recommendations, Recommendation{
			Type:        "info",
			Priority:    "medium",
			Title:       "保持当前实验节奏",
			Description: "错误预算消耗速度适中",
			Action:      "可以继续按计划执行实验，定期监控燃烧率",
		})
	case BurnRateLow:
		remainingDays := int(budget.TimeToExhaust.Hours() / 24)
		if remainingDays > 30 {
			recommendations = append(recommendations, Recommendation{
				Type:        "success",
				Priority:    "low",
				Title:       "可以增加实验频率",
				Description: "错误预算充足，燃烧率低",
				Action:      fmt.Sprintf("预计预算可维持 %d 天，可以考虑增加实验强度或频率", remainingDays),
			})
		}
	}

	if budget.RemainingRatio < 0.2 {
		recommendations = append(recommendations, Recommendation{
			Type:        "warning",
			Priority:    "high",
			Title:       "错误预算即将耗尽",
			Description: fmt.Sprintf("剩余预算仅为 %.1f%%", budget.RemainingRatio*100),
			Action:      "谨慎执行实验，优先选择低风险实验",
		})
	}

	return recommendations
}
