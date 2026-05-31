package observe

import (
	"fmt"
	"time"
)

type Trace struct {
	TraceID    string
	Duration   time.Duration
	StartTime  string
	ServiceName string
	Spans      []Span
}

type Span struct {
	SpanID     string
	Operation  string
	Duration   time.Duration
	StartTime  string
	Tags       map[string]string
}

type JaegerClient struct {
	url string
}

func NewJaegerClient(url string) (*JaegerClient, error) {
	return &JaegerClient{
		url: url,
	}, nil
}

func (c *JaegerClient) QueryTraces(serviceName string, limit int) ([]Trace, error) {
	fmt.Printf("查询服务 %s 的链路追踪，限制: %d\n", serviceName, limit)

	traces := []Trace{
		{
			TraceID:     "trace-001",
			Duration:    150 * time.Millisecond,
			StartTime:   time.Now().Add(-2 * time.Minute).Format(time.RFC3339),
			ServiceName: serviceName,
			Spans: []Span{
				{
					SpanID:    "span-001",
					Operation: "GET /api/users",
					Duration:  150 * time.Millisecond,
					StartTime: time.Now().Add(-2 * time.Minute).Format(time.RFC3339),
					Tags: map[string]string{
						"http.method": "GET",
						"http.url":    "/api/users",
					},
				},
			},
		},
		{
			TraceID:     "trace-002",
			Duration:    200 * time.Millisecond,
			StartTime:   time.Now().Add(-5 * time.Minute).Format(time.RFC3339),
			ServiceName: serviceName,
			Spans: []Span{
				{
					SpanID:    "span-002",
					Operation: "POST /api/orders",
					Duration:  200 * time.Millisecond,
					StartTime: time.Now().Add(-5 * time.Minute).Format(time.RFC3339),
					Tags: map[string]string{
						"http.method": "POST",
						"http.url":    "/api/orders",
					},
				},
			},
		},
	}

	if len(traces) > limit {
		traces = traces[:limit]
	}

	return traces, nil
}

func (c *JaegerClient) GetTrace(traceID string) (*Trace, error) {
	fmt.Printf("获取Trace详情: %s\n", traceID)

	trace := &Trace{
		TraceID:     traceID,
		Duration:    150 * time.Millisecond,
		StartTime:   time.Now().Add(-2 * time.Minute).Format(time.RFC3339),
		ServiceName: "demo-service",
		Spans: []Span{
			{
				SpanID:    "span-001",
				Operation: "GET /api/users",
				Duration:  150 * time.Millisecond,
				StartTime: time.Now().Add(-2 * time.Minute).Format(time.RFC3339),
				Tags: map[string]string{
					"http.method": "GET",
					"http.url":    "/api/users",
					"http.status": "200",
				},
			},
		},
	}

	return trace, nil
}
