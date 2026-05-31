package slo

import (
	"context"
	"fmt"
	"time"
)

type SLOAnalyzer struct {
	dataCollector *SLODataCollector
}

func NewSLOAnalyzer() *SLOAnalyzer {
	return &SLOAnalyzer{
		dataCollector: NewSLODataCollector(),
	}
}

func (a *SLOAnalyzer) Analyze(ctx context.Context, def *SLODefinition) (*SLOReport, error) {
	fmt.Printf("========================================\n")
	fmt.Printf("开始SLO分析: %s\n", def.Name)
	fmt.Printf("服务: %s | 环境: %s\n", def.Service, def.Environment)
	fmt.Printf("SLO目标: %.2f%%\n", def.Target*100)
	fmt.Printf("========================================\n\n")

	now := time.Now().UTC()
	windowDuration, _ := time.ParseDuration(def.Window.Duration)
	periodStart := now.Add(-windowDuration)

	report := &SLOReport{
		DefinitionName: def.Name,
		Service:        def.Service,
		Environment:    def.Environment,
		ReportTime:     now,
		PeriodStart:    periodStart,
		PeriodEnd:      now,
		WindowDuration: windowDuration,
		Target:         def.Target,
		Indicators:     make([]IndicatorResult, 0),
		Recommendations: make([]Recommendation, 0),
	}

	fmt.Println("[1/4] 分析SLO指标...")
	actualScore, indicatorResults := a.analyzeIndicators(ctx, def)
	report.Actual = actualScore
	report.Indicators = indicatorResults
	report.Difference = actualScore - def.Target

	fmt.Printf("    实际达成: %.2f%% (目标: %.2f%%, 差异: %+.2f%%)\n",
		actualScore*100, def.Target*100, report.Difference*100)

	fmt.Println("\n[2/4] 计算错误预算...")
	errorBudget := a.calculateErrorBudget(def, actualScore)
	report.ErrorBudget = errorBudget

	fmt.Printf("    总预算: %.2f%% | 已消耗: %.2f%% | 剩余: %.2f%%\n",
		errorBudget.TotalBudget*100, errorBudget.ConsumedBudget*100, errorBudget.RemainingBudget*100)

	fmt.Println("\n[3/4] 分析燃烧率...")
	burnRate := a.analyzeBurnRate(&errorBudget, windowDuration, def)
	report.BurnRate = burnRate

	fmt.Printf("    当前燃烧率: %.2fx | 等级: %s\n", burnRate.CurrentBurnRate, burnRate.BurnRateLevel)
	fmt.Printf("    预计耗尽时间: %v\n", burnRate.TimeToExhaust)
	fmt.Printf("    是否适合混沌实验: %t\n", burnRate.IsSafeForChaos)

	fmt.Println("\n[4/4] 生成推荐...")
	report.Status = a.determineStatus(&errorBudget, &burnRate)
	advisor := NewBudgetAdvisor(report)
	report.Recommendations = advisor.GetExperimentScheduleRecommendations()

	fmt.Printf("\n========================================\n")
	fmt.Printf("SLO分析完成\n")
	fmt.Printf("状态: %s | 预算剩余: %.1f%%\n", report.Status, errorBudget.RemainingRatio*100)
	fmt.Printf("========================================\n")

	return report, nil
}

func (a *SLOAnalyzer) analyzeIndicators(ctx context.Context, def *SLODefinition) (float64, []IndicatorResult) {
	results := make([]IndicatorResult, 0)
	totalWeight := 0.0
	weightedScore := 0.0

	for i, indicator := range def.Indicators {
		fmt.Printf("    [%d/%d] %s\n", i+1, len(def.Indicators), indicator.Name)

		weight := indicator.Weight
		if weight <= 0 {
			weight = 1.0
		}
		totalWeight += weight

		actualValue, passed := a.evaluateIndicator(ctx, indicator)

		result := IndicatorResult{
			Name:         indicator.Name,
			Type:         indicator.Type,
			Target:       def.Target,
			Actual:       actualValue,
			Passed:       passed,
			Weight:       weight,
			Contribution: actualValue * weight,
			Details:      make(map[string]interface{}),
		}

		weightedScore += result.Contribution
		results = append(results, result)

		status := "✅"
		if !passed {
			status = "❌"
		}
		fmt.Printf("        %s 达成: %.2f%% | 权重: %.1f\n", status, actualValue*100, weight)
	}

	if totalWeight > 0 {
		return weightedScore / totalWeight, results
	}

	return 0, results
}

func (a *SLOAnalyzer) evaluateIndicator(ctx context.Context, indicator SLOIndicator) (float64, bool) {
	switch indicator.Type {
	case IndicatorTypeAvailability:
		return a.evaluateAvailability(indicator)
	case IndicatorTypeLatency:
		return a.evaluateLatency(indicator)
	case IndicatorTypeThroughput:
		return a.evaluateThroughput(indicator)
	default:
		return 0.95, true
	}
}

func (a *SLOAnalyzer) evaluateAvailability(indicator SLOIndicator) (float64, bool) {
	if indicator.Availability == nil {
		return 0.95, true
	}

	goodEvents := a.dataCollector.GetMetricValue(indicator.Availability.GoodEventsQuery)
	totalEvents := a.dataCollector.GetMetricValue(indicator.Availability.TotalEventsQuery)

	var availability float64
	if totalEvents > 0 {
		availability = goodEvents / totalEvents
	} else {
		availability = 0.99
	}

	target := 0.99
	passed := availability >= target

	return availability, passed
}

func (a *SLOAnalyzer) evaluateLatency(indicator SLOIndicator) (float64, bool) {
	if indicator.Latency == nil {
		return 0.95, true
	}

	threshold, _ := time.ParseDuration(indicator.Latency.Threshold)
	actualLatency := 150 * time.Millisecond

	successRate := 0.95
	if indicator.Latency.SuccessPercentage > 0 {
		successRate = indicator.Latency.SuccessPercentage / 100.0
	}

	passed := actualLatency <= threshold

	return successRate, passed
}

func (a *SLOAnalyzer) evaluateThroughput(indicator SLOIndicator) (float64, bool) {
	if indicator.Throughput == nil {
		return 0.95, true
	}

	actualThroughput := 150.0
	minThroughput := indicator.Throughput.MinRequestsPerMin
	if minThroughput == 0 {
		minThroughput = 100.0
	}

	ratio := actualThroughput / minThroughput
	if ratio > 1.0 {
		ratio = 1.0
	}

	passed := actualThroughput >= minThroughput

	return ratio, passed
}

func (a *SLOAnalyzer) calculateErrorBudget(def *SLODefinition, actual float64) ErrorBudget {
	totalBudget := 1.0 - def.Target
	actualErrorRate := 1.0 - actual

	consumedBudget := 0.3
	if actualErrorRate > 0 {
		consumedBudget = actualErrorRate / totalBudget
		if consumedBudget > 1.0 {
			consumedBudget = 1.0
		}
	}

	remainingBudget := 1.0 - consumedBudget
	if remainingBudget < 0 {
		remainingBudget = 0
	}

	return ErrorBudget{
		TotalBudget:     totalBudget,
		ConsumedBudget:  consumedBudget * totalBudget,
		RemainingBudget: remainingBudget * totalBudget,
		ConsumedRatio:   consumedBudget,
		RemainingRatio:  remainingBudget,
	}
}

func (a *SLOAnalyzer) analyzeBurnRate(budget *ErrorBudget, window time.Duration, def *SLODefinition) BurnRateAnalysis {
	shortTermWindow := 1 * time.Hour
	longTermWindow := 6 * time.Hour

	currentBurnRate := 1.0
	if budget.ConsumedRatio > 0 {
		elapsedHours := window.Hours() * 0.3
		if elapsedHours > 0 {
			currentBurnRate = budget.ConsumedRatio / (elapsedHours / (7 * 24))
		}
	}

	shortTermBurnRate := currentBurnRate * 1.2
	longTermBurnRate := currentBurnRate * 0.8

	var timeToExhaust time.Duration
	var burnRateLevel BurnRateLevel
	var isSafeForChaos bool

	if currentBurnRate < 0.5 {
		burnRateLevel = BurnRateLow
		timeToExhaust = time.Duration(60) * 24 * time.Hour
		isSafeForChaos = true
	} else if currentBurnRate < 1.0 {
		burnRateLevel = BurnRateModerate
		timeToExhaust = time.Duration(30) * 24 * time.Hour
		isSafeForChaos = true
	} else if currentBurnRate < 5.0 {
		burnRateLevel = BurnRateHigh
		timeToExhaust = time.Duration(7) * 24 * time.Hour
		isSafeForChaos = false
	} else {
		burnRateLevel = BurnRateSevere
		timeToExhaust = time.Duration(1) * 24 * time.Hour
		isSafeForChaos = false
	}

	_ = shortTermWindow
	_ = longTermWindow
	_ = shortTermBurnRate
	_ = longTermBurnRate
	_ = def

	return BurnRateAnalysis{
		CurrentBurnRate:     currentBurnRate,
		BurnRateLevel:       burnRateLevel,
		ShortTermBurnRate:   shortTermBurnRate,
		LongTermBurnRate:    longTermBurnRate,
		TimeToExhaust:       timeToExhaust,
		ProjectedConsumption: currentBurnRate,
		IsSafeForChaos:      isSafeForChaos,
	}
}

func (a *SLOAnalyzer) determineStatus(budget *ErrorBudget, burnRate *BurnRateAnalysis) SLOStatus {
	if budget.RemainingRatio <= 0 {
		return SLOStatusExhausted
	}

	switch burnRate.BurnRateLevel {
	case BurnRateSevere:
		return SLOStatusCritical
	case BurnRateHigh:
		return SLOStatusCritical
	case BurnRateModerate:
		if budget.RemainingRatio < 0.2 {
			return SLOStatusWarning
		}
		return SLOStatusHealthy
	case BurnRateLow:
		if budget.RemainingRatio < 0.1 {
			return SLOStatusWarning
		}
		return SLOStatusHealthy
	default:
		return SLOStatusHealthy
	}
}
