package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	namespace = "task_scheduler"
)

var (
	TaskTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "task_total",
			Help:      "Total number of tasks processed",
		},
		[]string{"task_name", "status", "task_type"},
	)

	TaskDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "task_duration_seconds",
			Help:      "Task execution duration in seconds",
			Buckets:   prometheus.DefBuckets,
		},
		[]string{"task_name", "task_type"},
	)

	TaskActive = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: namespace,
			Name:      "task_active",
			Help:      "Number of currently running tasks",
		},
		[]string{"node_id"},
	)

	TaskFailed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "task_failed_total",
			Help:      "Total number of failed tasks",
		},
		[]string{"task_name", "task_type"},
	)

	TaskRetry = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "task_retry_total",
			Help:      "Total number of task retries",
		},
		[]string{"task_name"},
	)

	HTTPRequestTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "http_requests_total",
			Help:      "Total number of HTTP requests",
		},
		[]string{"method", "path", "status_code"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "http_request_duration_seconds",
			Help:      "HTTP request duration in seconds",
			Buckets:   prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	NodeHeartbeat = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: namespace,
			Name:      "node_heartbeat_timestamp",
			Help:      "Last heartbeat timestamp of nodes",
		},
		[]string{"node_id"},
	)
)

func RecordTaskStart(taskName, taskType string) func(status string) {
	start := time.Now()
	TaskActive.WithLabelValues("").Inc()

	return func(status string) {
		TaskActive.WithLabelValues("").Dec()
		TaskTotal.WithLabelValues(taskName, status, taskType).Inc()
		TaskDuration.WithLabelValues(taskName, taskType).Observe(time.Since(start).Seconds())

		if status == "failed" || status == "timeout" {
			TaskFailed.WithLabelValues(taskName, taskType).Inc()
		}
	}
}

func RecordTaskRetry(taskName string) {
	TaskRetry.WithLabelValues(taskName).Inc()
}

func RecordNodeHeartbeat(nodeID string) {
	NodeHeartbeat.WithLabelValues(nodeID).Set(float64(time.Now().Unix()))
}

func PrometheusHandler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}

func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.FullPath()
		method := c.Request.Method

		c.Next()

		statusCode := strconv.Itoa(c.Writer.Status())
		HTTPRequestTotal.WithLabelValues(method, path, statusCode).Inc()
		HTTPRequestDuration.WithLabelValues(method, path).Observe(time.Since(start).Seconds())
	}
}
