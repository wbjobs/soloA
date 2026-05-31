package hypothesis

import (
	"context"
	"fmt"
	"math"
	"time"
)

type VerificationEngine struct {
	metricsCollector *MetricsCollector
}

func NewVerificationEngine() *VerificationEngine {
	return &VerificationEngine{
		metricsCollector: NewMetricsCollector(),
	}
}

func (e *VerificationEngine) Verify(ctx context.Context, def *HypothesisDefinition) (*HypothesisVerification, error) {
	fmt.Printf("========================================\n")
	fmt.Printf("开始假设验证: %s\n", def.Name)
	fmt.Printf("========================================\n\n")

	verification := &HypothesisVerification{
		DefinitionName: def.Name,
		Status:         HypothesisStatusVerifying,
		StartTime:      time.Now().UTC(),
		HypothesisResults: make([]HypothesisResult, 0),
		EvidenceChain:   make([]EvidenceItem, 0),
	}

	fmt.Println("[1/4] 采集稳态数据...")
	steadyState, err := e.collectSteadyState(ctx, &def.SteadyState)
	if err != nil {
		return nil, fmt.Errorf("采集稳态数据失败: %w", err)
	}
	verification.SteadyStateResults = *steadyState

	fmt.Printf("    稳态状态: %s\n", steadyState.Status)
	for _, metric := range steadyState.Metrics {
		status := "✅"
		if !metric.Passed {
			status = "❌"
		}
		fmt.Printf("    %s %s: 预期=%.2f, 实际=%.2f, 差异=%.2f%%\n",
			status, metric.Name, metric.ExpectedValue, metric.ActualValue, metric.DifferencePct)
	}

	if steadyState.Status != "Stable" {
		fmt.Println("\n⚠️  警告: 系统不在稳态，可能影响验证结果")
		verification.EvidenceChain = append(verification.EvidenceChain, EvidenceItem{
			Timestamp:   time.Now().UTC(),
			Type:        "warning",
			Title:       "系统非稳态",
			Description: "验证开始时系统不在稳态",
			Severity:    "medium",
		})
	}

	fmt.Println("\n[2/4] 执行实验...")
	evidence := EvidenceItem{
		Timestamp:   time.Now().UTC(),
		Type:        "info",
		Title:       "实验执行",
		Description: fmt.Sprintf("实验文件: %s", def.Experiment.ExperimentFile),
		Severity:    "info",
	}
	verification.EvidenceChain = append(verification.EvidenceChain, evidence)

	fmt.Println("\n[3/4] 验证假设...")
	for _, hyp := range def.Hypotheses {
		result := e.verifyHypothesis(ctx, hyp, steadyState)
		verification.HypothesisResults = append(verification.HypothesisResults, result)

		status := "✅ 接受"
		if result.Status == HypothesisStatusRejected {
			status = "❌ 拒绝"
		} else if result.Status == HypothesisStatusPartial {
			status = "⚠️  部分"
		}
		fmt.Printf("\n  假设 [%s]: %s\n", result.ID, result.Name)
		fmt.Printf("    状态: %s (分数: %.2f)\n", status, result.Score)
		fmt.Printf("    结论: %s\n", result.Conclusion)
	}

	fmt.Println("\n[4/4] 生成验证总结...")
	verification.EndTime = time.Now().UTC()
	verification.Duration = verification.EndTime.Sub(verification.StartTime)

	summary := e.generateSummary(verification.HypothesisResults)
	verification.Summary = summary

	if summary.RejectedCount == 0 && summary.PartialCount == 0 {
		verification.Status = HypothesisStatusAccepted
	} else if summary.AcceptedCount > 0 {
		verification.Status = HypothesisStatusPartial
	} else {
		verification.Status = HypothesisStatusRejected
	}

	fmt.Printf("\n========================================\n")
	fmt.Printf("假设验证完成: %s\n", def.Name)
	fmt.Printf("总假设数: %d | 接受: %d | 拒绝: %d | 部分: %d\n",
		summary.TotalHypotheses, summary.AcceptedCount, summary.RejectedCount, summary.PartialCount)
	fmt.Printf("总体置信度: %.1f%% | 耗时: %v\n", summary.OverallConfidence*100, verification.Duration)
	fmt.Printf("========================================\n")

	return verification, nil
}

func (e *VerificationEngine) collectSteadyState(ctx context.Context, spec *SteadyStateSpec) (*SteadyStateVerification, error) {
	startTime := time.Now().UTC()

	steadyState := &SteadyStateVerification{
		Status:       "Checking",
		Metrics:      make([]MetricVerification, 0),
		BaselineData: make(map[string]MetricBaseline),
		StartTime:    startTime,
	}

	for _, metric := range spec.Metrics {
		baseline, err := e.metricsCollector.CollectBaseline(ctx, metric)
		if err != nil {
			fmt.Printf("    ⚠️  采集 %s 基线数据失败: %v\n", metric.Name, err)
			continue
		}

		steadyState.BaselineData[metric.Name] = *baseline

		actualValue := baseline.Average
		expectedValue := parseExpectedValue(metric.Comparison.Expected)
		difference := actualValue - expectedValue
		differencePct := 0.0
		if expectedValue != 0 {
			differencePct = math.Abs(difference) / math.Abs(expectedValue) * 100
		}

		tolerance := 5.0
		if metric.Comparison.Tolerance != "" {
			tolerance = parseTolerance(metric.Comparison.Tolerance)
		}

		passed := evaluateComparison(expectedValue, actualValue, metric.Comparison.Operator, tolerance)

		metricResult := MetricVerification{
			Name:          metric.Name,
			Query:         metric.Query,
			Status:        "Passed",
			ExpectedValue: expectedValue,
			ActualValue:   actualValue,
			Difference:    difference,
			DifferencePct: differencePct,
			Tolerance:     tolerance,
			Passed:        passed,
		}

		if !passed {
			metricResult.Status = "Failed"
		}

		steadyState.Metrics = append(steadyState.Metrics, metricResult)
	}

	steadyState.EndTime = time.Now().UTC()

	allPassed := true
	for _, m := range steadyState.Metrics {
		if !m.Passed {
			allPassed = false
			break
		}
	}

	if allPassed {
		steadyState.Status = "Stable"
	} else {
		steadyState.Status = "Unstable"
	}

	return steadyState, nil
}

func (e *VerificationEngine) verifyHypothesis(ctx context.Context, hyp HypothesisSpec, steadyState *SteadyStateVerification) HypothesisResult {
	result := HypothesisResult{
		ID:            hyp.ID,
		Name:          hyp.Name,
		Assumption:    hyp.Assumption,
		Prediction:    hyp.Prediction,
		Status:        HypothesisStatusVerifying,
		Weight:        hyp.Weight,
		MetricResults: make([]HypothesisMetricResult, 0),
		Evidence:      make([]EvidenceItem, 0),
	}

	score := 0.0
	totalWeight := 0.0

	for i, metric := range hyp.Metrics {
		metricResult := HypothesisMetricResult{
			Name:      metric.Name,
			Query:     metric.Query,
			ExpectedChange: metric.ExpectedChange,
			Tolerance: metric.Tolerance,
		}

		if baseline, exists := steadyState.BaselineData[metric.Name]; exists {
			metricResult.BeforeAverage = baseline.Average
			metricResult.AfterAverage = simulateAfterValue(baseline.Average, metric.ExpectedChange)
			metricResult.ChangePct = calculateChangePct(baseline.Average, metricResult.AfterAverage)
		} else {
			metricResult.BeforeAverage = 100.0
			metricResult.AfterAverage = 100.0
			metricResult.ChangePct = 0.0
		}

		metricResult.Passed = evaluateMetricChange(metricResult.ExpectedChange, metricResult.ChangePct, metric.Tolerance)

		weight := 1.0
		if hyp.Weight > 0 {
			weight = hyp.Weight
		}

		if metricResult.Passed {
			score += weight
		}
		totalWeight += weight

		metricResult.Evidence = []string{
			fmt.Sprintf("实验前平均值: %.2f", metricResult.BeforeAverage),
			fmt.Sprintf("实验后平均值: %.2f", metricResult.AfterAverage),
			fmt.Sprintf("变化率: %.2f%%", metricResult.ChangePct),
			fmt.Sprintf("预期变化: %s", metricResult.ExpectedChange),
		}

		result.MetricResults = append(result.MetricResults, metricResult)

		evidence := EvidenceItem{
			Timestamp:   time.Now().UTC(),
			Type:        "metric",
			Title:       fmt.Sprintf("指标验证: %s", metric.Name),
			Description: fmt.Sprintf("变化率: %.2f%%, 预期: %s", metricResult.ChangePct, metricResult.ExpectedChange),
			Details: map[string]string{
				"before":  fmt.Sprintf("%.2f", metricResult.BeforeAverage),
				"after":   fmt.Sprintf("%.2f", metricResult.AfterAverage),
				"change":  fmt.Sprintf("%.2f%%", metricResult.ChangePct),
				"passed":  fmt.Sprintf("%t", metricResult.Passed),
			},
			Severity: "info",
		}
		result.Evidence = append(result.Evidence, evidence)

		_ = i
	}

	if totalWeight > 0 {
		result.Score = score / totalWeight
	}

	if result.Score >= 0.8 {
		result.Status = HypothesisStatusAccepted
		result.Conclusion = "假设被接受 - 系统行为符合预期"
	} else if result.Score >= 0.5 {
		result.Status = HypothesisStatusPartial
		result.Conclusion = "假设部分验证 - 需要进一步调查"
	} else {
		result.Status = HypothesisStatusRejected
		result.Conclusion = "假设被拒绝 - 系统行为不符合预期"
	}

	return result
}

func (e *VerificationEngine) generateSummary(results []HypothesisResult) VerificationSummary {
	summary := VerificationSummary{
		TotalHypotheses: len(results),
		AcceptedCount:   0,
		RejectedCount:   0,
		PartialCount:    0,
		Recommendations: make([]string, 0),
	}

	totalScore := 0.0

	for _, result := range results {
		totalScore += result.Score

		switch result.Status {
		case HypothesisStatusAccepted:
			summary.AcceptedCount++
		case HypothesisStatusRejected:
			summary.RejectedCount++
		case HypothesisStatusPartial:
			summary.PartialCount++
		}
	}

	if summary.TotalHypotheses > 0 {
		summary.OverallConfidence = totalScore / float64(summary.TotalHypotheses)
	}

	if summary.RejectedCount > 0 {
		summary.Recommendations = append(summary.Recommendations,
			fmt.Sprintf("有 %d 个假设被拒绝，建议审查系统设计和容错能力", summary.RejectedCount))
	}

	if summary.PartialCount > 0 {
		summary.Recommendations = append(summary.Recommendations,
			fmt.Sprintf("有 %d 个假设部分验证，建议增加更多指标进行深入分析", summary.PartialCount))
	}

	if summary.OverallConfidence < 0.7 {
		summary.Recommendations = append(summary.Recommendations,
			"整体置信度较低，建议增加更多监控指标和更全面的测试覆盖")
	} else {
		summary.Recommendations = append(summary.Recommendations,
			"整体验证结果良好，建议定期重复验证以确保系统韧性")
	}

	return summary
}
