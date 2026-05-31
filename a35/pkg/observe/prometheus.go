package observe

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/client_golang/api"
	v1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"
)

type PrometheusClient struct {
	api v1.API
	url string
}

type MetricPoint struct {
	Timestamp string
	Value     string
}

func NewPrometheusClient(url string) (*PrometheusClient, error) {
	client, err := api.NewClient(api.Config{
		Address: url,
	})
	if err != nil {
		return nil, fmt.Errorf("创建Prometheus客户端失败: %w", err)
	}

	return &PrometheusClient{
		api: v1.NewAPI(client),
		url: url,
	}, nil
}

func (c *PrometheusClient) QueryErrorRate(duration time.Duration) (float64, error) {
	fmt.Printf("查询错误率，时间范围: %v\n", duration)

	query := fmt.Sprintf(
		`sum(rate(http_requests_total{status_code=~"5.."}[%s])) / sum(rate(http_requests_total[%s]))`,
		duration.String(),
		duration.String(),
	)

	result, err := c.queryInstant(query)
	if err != nil {
		return 0, fmt.Errorf("查询错误率失败: %w", err)
	}

	if len(result) > 0 {
		return float64(result[0].Value), nil
	}

	return 0, nil
}

func (c *PrometheusClient) QueryP99Latency(duration time.Duration) (time.Duration, error) {
	fmt.Printf("查询P99延迟，时间范围: %v\n", duration)

	query := fmt.Sprintf(
		`histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[%s])) by (le))`,
		duration.String(),
	)

	result, err := c.queryInstant(query)
	if err != nil {
		return 0, fmt.Errorf("查询P99延迟失败: %w", err)
	}

	if len(result) > 0 {
		return time.Duration(float64(result[0].Value) * float64(time.Second)), nil
	}

	return 0, nil
}

func (c *PrometheusClient) QueryThroughput(duration time.Duration) (float64, error) {
	fmt.Printf("查询吞吐量，时间范围: %v\n", duration)

	query := fmt.Sprintf(
		`sum(rate(http_requests_total[%s]))`,
		duration.String(),
	)

	result, err := c.queryInstant(query)
	if err != nil {
		return 0, fmt.Errorf("查询吞吐量失败: %w", err)
	}

	if len(result) > 0 {
		return float64(result[0].Value), nil
	}

	return 0, nil
}

func (c *PrometheusClient) QueryPromQL(promql string) ([]MetricPoint, error) {
	fmt.Printf("执行PromQL查询: %s\n", promql)

	nowUTC := time.Now().UTC()
	startUTC := nowUTC.Add(-1 * time.Hour)

	fmt.Printf("使用UTC时间范围: %s 到 %s\n", startUTC.Format(time.RFC3339), nowUTC.Format(time.RFC3339))

	return c.queryRange(promql, startUTC, nowUTC, 1*time.Minute)
}

func (c *PrometheusClient) QueryRangeWithTime(promql string, start, end time.Time, step time.Duration) ([]MetricPoint, error) {
	fmt.Printf("执行PromQL范围查询: %s\n", promql)

	startUTC := start.UTC()
	endUTC := end.UTC()

	fmt.Printf("使用UTC时间范围: %s 到 %s\n", startUTC.Format(time.RFC3339), endUTC.Format(time.RFC3339))

	return c.queryRange(promql, startUTC, endUTC, step)
}

func (c *PrometheusClient) queryInstant(query string) ([]model.Sample, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	nowUTC := time.Now().UTC()
	fmt.Printf("使用UTC查询时间: %s\n", nowUTC.Format(time.RFC3339))

	result, warnings, err := c.api.Query(ctx, query, nowUTC)
	if err != nil {
		return nil, fmt.Errorf("执行查询失败: %w", err)
	}
	if len(warnings) > 0 {
		fmt.Printf("警告: %v\n", warnings)
	}

	vector, ok := result.(model.Vector)
	if !ok {
		return nil, fmt.Errorf("查询结果类型不是Vector")
	}

	samples := make([]model.Sample, 0, len(vector))
	for _, sample := range vector {
		samples = append(samples, *sample)
	}

	return samples, nil
}

func (c *PrometheusClient) queryRange(query string, start, end time.Time, step time.Duration) ([]MetricPoint, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	r := v1.Range{
		Start: start,
		End:   end,
		Step:  step,
	}

	result, warnings, err := c.api.QueryRange(ctx, query, r)
	if err != nil {
		return nil, fmt.Errorf("执行范围查询失败: %w", err)
	}
	if len(warnings) > 0 {
		fmt.Printf("警告: %v\n", warnings)
	}

	matrix, ok := result.(model.Matrix)
	if !ok {
		return nil, fmt.Errorf("查询结果类型不是Matrix")
	}

	points := make([]MetricPoint, 0)
	for _, stream := range matrix {
		for _, samplePair := range stream.Values {
			points = append(points, MetricPoint{
				Timestamp: samplePair.Timestamp.Time().Format(time.RFC3339),
				Value:     samplePair.Value.String(),
			})
		}
	}

	return points, nil
}
