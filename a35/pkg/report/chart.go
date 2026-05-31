package report

import (
	"bytes"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/go-echarts/go-echarts/v2/charts"
	"github.com/go-echarts/go-echarts/v2/components"
	"github.com/go-echarts/go-echarts/v2/opts"
)

type ChartManager struct {
	page   *components.Page
	charts []*chartItem
	mu     sync.Mutex
}

type chartItem struct {
	chart     interface{}
	chartType string
	title     string
}

func NewChartManager() *ChartManager {
	return &ChartManager{
		charts: make([]*chartItem, 0),
	}
}

func (cm *ChartManager) AddLineChart(title string, xAxis []string, series map[string][]opts.LineData) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	line := charts.NewLine()
	line.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{
			Title: title,
		}),
		charts.WithTooltipOpts(opts.Tooltip{
			Show:    true,
			Trigger: "axis",
		}),
		charts.WithLegendOpts(opts.Legend{
			Show: true,
		}),
	)

	line.SetXAxis(xAxis)
	for name, data := range series {
		line.AddSeries(name, data)
	}

	cm.charts = append(cm.charts, &chartItem{
		chart:     line,
		chartType: "line",
		title:     title,
	})
}

func (cm *ChartManager) AddBarChart(title string, xAxis []string, series map[string][]opts.BarData) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	bar := charts.NewBar()
	bar.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{
			Title: title,
		}),
		charts.WithTooltipOpts(opts.Tooltip{
			Show:    true,
			Trigger: "axis",
		}),
		charts.WithLegendOpts(opts.Legend{
			Show: true,
		}),
	)

	bar.SetXAxis(xAxis)
	for name, data := range series {
		bar.AddSeries(name, data)
	}

	cm.charts = append(cm.charts, &chartItem{
		chart:     bar,
		chartType: "bar",
		title:     title,
	})
}

func (cm *ChartManager) GenerateHTML() (string, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	page := components.NewPage()

	for _, item := range cm.charts {
		switch c := item.chart.(type) {
		case *charts.Line:
			page.AddCharts(c)
		case *charts.Bar:
			page.AddCharts(c)
		}
	}

	var buf bytes.Buffer
	writer := io.Writer(&buf)

	if err := page.Render(writer); err != nil {
		return "", fmt.Errorf("渲染图表失败: %w", err)
	}

	return buf.String(), nil
}

func (cm *ChartManager) Cleanup() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for i := range cm.charts {
		cm.charts[i] = nil
	}
	cm.charts = nil
	cm.page = nil

	fmt.Printf("[%s] 图表资源已释放，共清理 %d 个图表\n",
		time.Now().Format("2006-01-02 15:04:05"),
		len(cm.charts))

	cm.charts = make([]*chartItem, 0)
}

type ReportChartBuilder struct {
	chartManager *ChartManager
}

func NewReportChartBuilder() *ReportChartBuilder {
	return &ReportChartBuilder{
		chartManager: NewChartManager(),
	}
}

func (b *ReportChartBuilder) BuildErrorRateChart(metricsData MetricsData) {
	xAxis := []string{"实验前", "实验中", "实验后"}

	series := map[string][]opts.LineData{
		"错误率 (%)": {
			{Value: metricsData.BeforeExperiment.ErrorRate * 100},
			{Value: metricsData.DuringExperiment.ErrorRate * 100},
			{Value: metricsData.AfterExperiment.ErrorRate * 100},
		},
	}

	b.chartManager.AddLineChart("错误率变化趋势", xAxis, series)
}

func (b *ReportChartBuilder) BuildLatencyChart(metricsData MetricsData) {
	xAxis := []string{"实验前", "实验中", "实验后"}

	series := map[string][]opts.BarData{
		"P99延迟 (ms)": {
			{Value: metricsData.BeforeExperiment.P99Latency.Milliseconds()},
			{Value: metricsData.DuringExperiment.P99Latency.Milliseconds()},
			{Value: metricsData.AfterExperiment.P99Latency.Milliseconds()},
		},
	}

	b.chartManager.AddBarChart("P99延迟对比", xAxis, series)
}

func (b *ReportChartBuilder) BuildThroughputChart(metricsData MetricsData) {
	xAxis := []string{"实验前", "实验中", "实验后"}

	series := map[string][]opts.LineData{
		"吞吐量 (req/s)": {
			{Value: metricsData.BeforeExperiment.Throughput},
			{Value: metricsData.DuringExperiment.Throughput},
			{Value: metricsData.AfterExperiment.Throughput},
		},
	}

	b.chartManager.AddLineChart("吞吐量变化趋势", xAxis, series)
}

func (b *ReportChartBuilder) GetChartsHTML() (string, error) {
	return b.chartManager.GenerateHTML()
}

func (b *ReportChartBuilder) Cleanup() {
	if b.chartManager != nil {
		b.chartManager.Cleanup()
		b.chartManager = nil
	}
}
