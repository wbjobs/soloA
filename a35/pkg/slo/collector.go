package slo

import (
	"context"
	"fmt"
	"math/rand"
	"time"
)

type SLODataCollector struct{}

func NewSLODataCollector() *SLODataCollector {
	return &SLODataCollector{}
}

func (c *SLODataCollector) GetMetricValue(query string) float64 {
	rand.Seed(time.Now().UnixNano())
	baseValue := 1000.0 + rand.Float64()*500.0
	return baseValue
}

func (c *SLODataCollector) CollectAvailability(ctx context.Context, goodQuery, totalQuery string, start, end time.Time) (float64, float64, error) {
	fmt.Printf("      采集可用性数据: %s\n", goodQuery)

	totalEvents := 10000.0
	goodEvents := totalEvents * 0.995

	return goodEvents, totalEvents, nil
}

func (c *SLODataCollector) CollectLatency(ctx context.Context, query string, percentile string, start, end time.Time) (time.Duration, float64, error) {
	fmt.Printf("      采集延迟数据: %s\n", query)

	avgLatency := 150 * time.Millisecond
	successRate := 0.98

	return avgLatency, successRate, nil
}

func (c *SLODataCollector) CollectThroughput(ctx context.Context, query string, start, end time.Time) (float64, error) {
	fmt.Printf("      采集吞吐量数据: %s\n", query)

	throughput := 150.0

	return throughput, nil
}

func (c *SLODataCollector) CollectBurnRateHistory(ctx context.Context, query string, window time.Duration) (map[time.Time]float64, error) {
	fmt.Println("      采集燃烧率历史数据...")

	history := make(map[time.Time]float64)
	now := time.Now().UTC()

	for i := 0; i < 7; i++ {
		timestamp := now.Add(-time.Duration(i) * 24 * time.Hour)
		burnRate := 0.8 + rand.Float64()*0.6
		history[timestamp] = burnRate
	}

	return history, nil
}

func (c *SLODataCollector) CalculateTimeSeriesStats(values []float64) (avg, min, max, stdDev float64) {
	if len(values) == 0 {
		return 0, 0, 0, 0
	}

	sum := 0.0
	min = values[0]
	max = values[0]

	for _, v := range values {
		sum += v
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}

	avg = sum / float64(len(values))

	variance := 0.0
	for _, v := range values {
		diff := v - avg
		variance += diff * diff
	}
	if len(values) > 1 {
		variance /= float64(len(values) - 1)
	}

	stdDev = 0.0
	if variance > 0 {
		stdDev = variance
	}

	return avg, min, max, stdDev
}
