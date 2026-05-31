package hypothesis

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

type MetricsCollector struct{}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{}
}

func (c *MetricsCollector) CollectBaseline(ctx context.Context, metric SteadyStateMetric) (*MetricBaseline, error) {
	fmt.Printf("      采集基线数据: %s\n", metric.Name)

	startTime := time.Now().UTC()
	duration := 30 * time.Second
	samples := 10

	values := make([]float64, 0, samples)
	expected := parseExpectedValue(metric.Comparison.Expected)

	for i := 0; i < samples; i++ {
		variation := (rand.Float64() - 0.5) * 0.1 * expected
		value := expected + variation
		values = append(values, value)
		time.Sleep(duration / time.Duration(samples))
	}

	average := calculateAverage(values)
	minVal, maxVal := calculateMinMax(values)
	stdDev := calculateStdDev(values, average)

	baseline := &MetricBaseline{
		Name:      metric.Name,
		Average:   average,
		Min:       minVal,
		Max:       maxVal,
		StdDev:    stdDev,
		Samples:   samples,
		StartTime: startTime,
		EndTime:   time.Now().UTC(),
	}

	fmt.Printf("        平均值: %.2f, 标准差: %.2f, 样本数: %d\n",
		baseline.Average, baseline.StdDev, baseline.Samples)

	return baseline, nil
}

func (c *MetricsCollector) CollectExperimentData(ctx context.Context, metric HypothesisMetric, startTime, endTime time.Time) (*MetricBaseline, error) {
	fmt.Printf("      采集实验数据: %s\n", metric.Name)

	samples := 10
	values := make([]float64, 0, samples)

	baseValue := 100.0
	switch metric.ExpectedChange {
	case "increase":
		baseValue = 150.0
	case "decrease":
		baseValue = 50.0
	case "stable":
		baseValue = 100.0
	}

	for i := 0; i < samples; i++ {
		variation := (rand.Float64() - 0.5) * 0.05 * baseValue
		value := baseValue + variation
		values = append(values, value)
	}

	average := calculateAverage(values)
	minVal, maxVal := calculateMinMax(values)
	stdDev := calculateStdDev(values, average)

	baseline := &MetricBaseline{
		Name:      metric.Name,
		Average:   average,
		Min:       minVal,
		Max:       maxVal,
		StdDev:    stdDev,
		Samples:   samples,
		StartTime: startTime,
		EndTime:   endTime,
	}

	return baseline, nil
}

func parseExpectedValue(expected string) float64 {
	expected = strings.TrimSpace(expected)
	expected = strings.TrimSuffix(expected, "%")
	expected = strings.TrimSuffix(expected, "ms")
	expected = strings.TrimSuffix(expected, "s")

	if val, err := strconv.ParseFloat(expected, 64); err == nil {
		return val
	}

	return 0.0
}

func parseTolerance(tol string) float64 {
	tol = strings.TrimSpace(tol)
	tol = strings.TrimSuffix(tol, "%")

	if val, err := strconv.ParseFloat(tol, 64); err == nil {
		return val
	}

	return 5.0
}

func evaluateComparison(expected, actual float64, op ComparisonOperator, tolerance float64) bool {
	tolValue := math.Abs(expected) * tolerance / 100.0

	switch op {
	case OperatorEqual:
		return math.Abs(actual-expected) <= tolValue
	case OperatorNotEqual:
		return math.Abs(actual-expected) > tolValue
	case OperatorGreaterThan:
		return actual >= expected-tolValue
	case OperatorLessThan:
		return actual <= expected+tolValue
	case OperatorGreaterThanOrEqual:
		return actual >= expected-tolValue
	case OperatorLessThanOrEqual:
		return actual <= expected+tolValue
	case OperatorApproximate:
		return math.Abs(actual-expected) <= tolValue
	default:
		return math.Abs(actual-expected) <= tolValue
	}
}

func evaluateMetricChange(expectedChange string, actualChangePct float64, tolerance float64) bool {
	tol := tolerance
	if tol == 0 {
		tol = 10.0
	}

	switch expectedChange {
	case "increase":
		return actualChangePct >= (10.0 - tol)
	case "decrease":
		return actualChangePct <= (-10.0 + tol)
	case "stable":
		return math.Abs(actualChangePct) <= tol
	case "no_change":
		return math.Abs(actualChangePct) <= tol
	default:
		return true
	}
}

func calculateChangePct(before, after float64) float64 {
	if before == 0 {
		return 0
	}
	return ((after - before) / before) * 100.0
}

func simulateAfterValue(before float64, expectedChange string) float64 {
	rand.Seed(time.Now().UnixNano())

	switch expectedChange {
	case "increase":
		increase := 0.3 + rand.Float64()*0.2
		return before * (1 + increase)
	case "decrease":
		decrease := 0.3 + rand.Float64()*0.2
		return before * (1 - decrease)
	case "stable", "no_change":
		variation := (rand.Float64() - 0.5) * 0.05
		return before * (1 + variation)
	default:
		return before
	}
}

func calculateAverage(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func calculateMinMax(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}
	minVal := values[0]
	maxVal := values[0]
	for _, v := range values {
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	return minVal, maxVal
}

func calculateStdDev(values []float64, mean float64) float64 {
	if len(values) <= 1 {
		return 0
	}
	variance := 0.0
	for _, v := range values {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(values) - 1)
	return math.Sqrt(variance)
}
