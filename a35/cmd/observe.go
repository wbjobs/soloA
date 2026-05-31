package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/observe"
)

func newObserveCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "observe",
		Short: "可观测性分析（查询Prometheus指标、Jaeger链路追踪）",
		Long:  `observe子命令用于在混沌实验期间进行可观测性分析，包括查询Prometheus指标和Jaeger链路追踪。`,
	}

	cmd.AddCommand(newObserveMetricsCmd())
	cmd.AddCommand(newObserveTraceCmd())
	cmd.AddCommand(newObserveQueryCmd())

	return cmd
}

func newObserveMetricsCmd() *cobra.Command {
	var prometheusURL string
	var metricType string
	var duration string

	cmd := &cobra.Command{
		Use:   "metrics",
		Short: "查询Prometheus基础指标（错误率、延迟、吞吐量）",
		Long:  `查询Prometheus中的关键性能指标，包括HTTP错误率、P99延迟、吞吐量等。`,
		Run: func(cmd *cobra.Command, args []string) {
			client, err := observe.NewPrometheusClient(prometheusURL)
			if err != nil {
				er(fmt.Sprintf("创建Prometheus客户端失败: %v", err))
			}

			d, err := time.ParseDuration(duration)
			if err != nil {
				er(fmt.Sprintf("解析持续时间失败: %v", err))
			}

			fmt.Printf("查询Prometheus指标，类型: %s，持续时间: %v\n", metricType, d)

			switch metricType {
			case "error_rate":
				rate, err := client.QueryErrorRate(d)
				if err != nil {
					er(fmt.Sprintf("查询错误率失败: %v", err))
				}
				fmt.Printf("HTTP错误率: %.2f%%\n", rate*100)
			case "latency":
				latency, err := client.QueryP99Latency(d)
				if err != nil {
					er(fmt.Sprintf("查询延迟失败: %v", err))
				}
				fmt.Printf("P99延迟: %.2fms\n", latency.Seconds()*1000)
			case "throughput":
				tp, err := client.QueryThroughput(d)
				if err != nil {
					er(fmt.Sprintf("查询吞吐量失败: %v", err))
				}
				fmt.Printf("吞吐量: %.2f req/s\n", tp)
			default:
				er(fmt.Sprintf("不支持的指标类型: %s", metricType))
			}
		},
	}

	cmd.Flags().StringVar(&prometheusURL, "prometheus-url", "http://localhost:9090", "Prometheus服务器地址")
	cmd.Flags().StringVarP(&metricType, "type", "t", "error_rate", "指标类型: error_rate, latency, throughput")
	cmd.Flags().StringVarP(&duration, "duration", "d", "5m", "查询时间范围 (如: 5m, 1h)")

	return cmd
}

func newObserveTraceCmd() *cobra.Command {
	var jaegerURL string
	var serviceName string
	var limit int

	cmd := &cobra.Command{
		Use:   "trace",
		Short: "查询Jaeger/Tempo链路追踪",
		Long:  `查询Jaeger或Tempo中的分布式链路追踪数据。`,
		Run: func(cmd *cobra.Command, args []string) {
			client, err := observe.NewJaegerClient(jaegerURL)
			if err != nil {
				er(fmt.Sprintf("创建Jaeger客户端失败: %v", err))
			}

			fmt.Printf("查询链路追踪，服务: %s，限制: %d\n", serviceName, limit)

			traces, err := client.QueryTraces(serviceName, limit)
			if err != nil {
				er(fmt.Sprintf("查询链路追踪失败: %v", err))
			}

			fmt.Println("链路追踪结果:")
			fmt.Println("------------------------")
			for _, trace := range traces {
				fmt.Printf("TraceID: %s\n", trace.TraceID)
				fmt.Printf("持续时间: %v\n", trace.Duration)
				fmt.Printf("开始时间: %s\n", trace.StartTime)
				fmt.Println("------------------------")
			}
		},
	}

	cmd.Flags().StringVar(&jaegerURL, "jaeger-url", "http://localhost:16686", "Jaeger服务器地址")
	cmd.Flags().StringVarP(&serviceName, "service", "s", "", "服务名称")
	cmd.Flags().IntVarP(&limit, "limit", "l", 10, "返回结果数量限制")
	cmd.MarkFlagRequired("service")

	return cmd
}

func newObserveQueryCmd() *cobra.Command {
	var prometheusURL string
	var promql string

	cmd := &cobra.Command{
		Use:   "query",
		Short: "执行自定义PromQL查询",
		Long:  `执行自定义的PromQL查询，获取Prometheus指标数据。`,
		Run: func(cmd *cobra.Command, args []string) {
			client, err := observe.NewPrometheusClient(prometheusURL)
			if err != nil {
				er(fmt.Sprintf("创建Prometheus客户端失败: %v", err))
			}

			fmt.Printf("执行PromQL查询: %s\n", promql)

			result, err := client.QueryPromQL(promql)
			if err != nil {
				er(fmt.Sprintf("执行PromQL查询失败: %v", err))
			}

			fmt.Println("查询结果:")
			fmt.Println("------------------------")
			for _, point := range result {
				fmt.Printf("时间: %s, 值: %s\n", point.Timestamp, point.Value)
			}
		},
	}

	cmd.Flags().StringVar(&prometheusURL, "prometheus-url", "http://localhost:9090", "Prometheus服务器地址")
	cmd.Flags().StringVarP(&promql, "promql", "q", "", "PromQL查询语句")
	cmd.MarkFlagRequired("promql")

	return cmd
}
