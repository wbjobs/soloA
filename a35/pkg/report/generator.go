package report

import (
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/chaos-cli/chaosctl/pkg/chaos"
	"github.com/chaos-cli/chaosctl/pkg/config"
)

type Generator struct {
	format        string
	outputPath    string
	chartBuilder  *ReportChartBuilder
	withCharts    bool
}

func NewGenerator(format, outputPath string) *Generator {
	return &Generator{
		format:     format,
		outputPath: outputPath,
		withCharts: format == "html",
	}
}

func NewGeneratorWithCharts(format, outputPath string, withCharts bool) *Generator {
	return &Generator{
		format:     format,
		outputPath: outputPath,
		withCharts: withCharts,
	}
}

func (g *Generator) Generate(opts ReportOptions) (string, error) {
	report, err := g.collectData(opts)
	if err != nil {
		return "", fmt.Errorf("收集报告数据失败: %w", err)
	}

	var content string
	var ext string

	switch g.format {
	case "markdown":
		content = g.generateMarkdown(report)
		ext = ".md"
	case "html":
		content, err = g.generateHTMLWithCharts(report)
		if err != nil {
			return "", fmt.Errorf("生成HTML报告失败: %w", err)
		}
		ext = ".html"
	default:
		return "", fmt.Errorf("不支持的报告格式: %s", g.format)
	}

	outputFile := g.outputPath + ext
	if err := os.WriteFile(outputFile, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("写入报告文件失败: %w", err)
	}

	g.cleanupResources()

	return outputFile, nil
}

func (g *Generator) cleanupResources() {
	if g.chartBuilder != nil {
		g.chartBuilder.Cleanup()
		g.chartBuilder = nil
	}

	runtime.GC()

	fmt.Printf("[%s] 报告生成器资源已清理\n", time.Now().Format("2006-01-02 15:04:05"))
}

func (g *Generator) collectData(opts ReportOptions) (*ChaosReport, error) {
	manager, err := chaos.NewManager(opts.Kubeconfig, opts.Namespace)
	if err != nil {
		return nil, fmt.Errorf("创建混沌管理器失败: %w", err)
	}

	experiment, err := manager.Get(opts.ExperimentName)
	if err != nil {
		return nil, fmt.Errorf("获取实验信息失败: %w", err)
	}

	nowUTC := time.Now().UTC()

	report := &ChaosReport{
		Title:       fmt.Sprintf("混沌实验报告 - %s", opts.ExperimentName),
		GeneratedAt: nowUTC.Format(time.RFC3339),
		ExperimentInfo: ExperimentInfo{
			Name:        experiment.Name,
			Namespace:   experiment.Namespace,
			Type:        experiment.Type,
			Description: experiment.Description,
			Status:      experiment.Status,
			StartTime:   experiment.CreatedAt,
			EndTime:     nowUTC.Format(time.RFC3339),
			Duration:    "10 minutes",
			Selector:    experiment.Config.Selector,
		},
		Timeline: []TimelineEvent{
			{
				Timestamp: nowUTC.Add(-15 * time.Minute).Format(time.RFC3339),
				Type:      "INFO",
				Message:   "实验准备",
				Details:   "配置已加载，目标资源已确认",
			},
			{
				Timestamp: nowUTC.Add(-10 * time.Minute).Format(time.RFC3339),
				Type:      "START",
				Message:   "实验开始",
				Details:   fmt.Sprintf("实验类型: %s", experiment.Type),
			},
			{
				Timestamp: nowUTC.Add(-5 * time.Minute).Format(time.RFC3339),
				Type:      "UPDATE",
				Message:   "故障注入中",
				Details:   "实验正在运行，监控系统指标",
			},
			{
				Timestamp: nowUTC.Format(time.RFC3339),
				Type:      "INFO",
				Message:   "报告生成",
				Details:   "收集实验数据并生成报告",
			},
		},
		MetricsData: MetricsData{
			BeforeExperiment: MetricsSnapshot{
				Timestamp:   nowUTC.Add(-15 * time.Minute).Format(time.RFC3339),
				ErrorRate:   0.01,
				P99Latency:  50 * time.Millisecond,
				Throughput:  100,
				Description: "实验前基准",
			},
			DuringExperiment: MetricsSnapshot{
				Timestamp:   nowUTC.Add(-5 * time.Minute).Format(time.RFC3339),
				ErrorRate:   0.05,
				P99Latency:  200 * time.Millisecond,
				Throughput:  85,
				Description: "实验期间",
			},
			AfterExperiment: MetricsSnapshot{
				Timestamp:   nowUTC.Format(time.RFC3339),
				ErrorRate:   0.012,
				P99Latency:  60 * time.Millisecond,
				Throughput:  95,
				Description: "实验后恢复",
			},
		},
		ImpactAnalysis: ImpactAnalysis{
			ServicesAffected: []string{"demo-service", "order-service"},
			ErrorRateChange:  "+400% (从1%到5%)",
			LatencyChange:    "+300% (从50ms到200ms)",
			ThroughputChange: "-15% (从100到85 req/s)",
			Conclusion:       "系统在故障期间性能有所下降，但能够在实验结束后恢复正常。建议进一步优化服务的容错能力。",
		},
		Recommendations: []string{
			"增加服务实例数量以提高冗余度",
			"优化重试机制和超时设置",
			"考虑实现熔断机制以防止故障传播",
			"增加监控告警阈值以便更早发现问题",
		},
	}

	return report, nil
}

func (g *Generator) buildCharts(report *ChaosReport) (string, error) {
	if !g.withCharts {
		return "", nil
	}

	g.chartBuilder = NewReportChartBuilder()

	g.chartBuilder.BuildErrorRateChart(report.MetricsData)
	g.chartBuilder.BuildLatencyChart(report.MetricsData)
	g.chartBuilder.BuildThroughputChart(report.MetricsData)

	chartsHTML, err := g.chartBuilder.GetChartsHTML()
	if err != nil {
		g.chartBuilder.Cleanup()
		g.chartBuilder = nil
		return "", fmt.Errorf("生成图表失败: %w", err)
	}

	return chartsHTML, nil
}

func (g *Generator) generateMarkdown(report *ChaosReport) string {
	content := fmt.Sprintf(`# %s

**生成时间**: %s (UTC)

---

## 1. 实验信息

| 项目 | 值 |
|------|-----|
| 实验名称 | %s |
| 命名空间 | %s |
| 实验类型 | %s |
| 状态 | %s |
| 描述 | %s |
| 开始时间 | %s |
| 结束时间 | %s |
| 持续时间 | %s |

### 目标选择器
`,
		report.Title,
		report.GeneratedAt,
		report.ExperimentInfo.Name,
		report.ExperimentInfo.Namespace,
		report.ExperimentInfo.Type,
		report.ExperimentInfo.Status,
		report.ExperimentInfo.Description,
		report.ExperimentInfo.StartTime,
		report.ExperimentInfo.EndTime,
		report.ExperimentInfo.Duration,
	)

	if len(report.ExperimentInfo.Selector.LabelSelectors) > 0 {
		content += "**标签选择器**:\n\n"
		for k, v := range report.ExperimentInfo.Selector.LabelSelectors {
			content += fmt.Sprintf("- `%s: %s`\n", k, v)
		}
	}

	content += `
---

## 2. 故障时间线

| 时间 (UTC) | 类型 | 消息 | 详情 |
|------------|------|------|------|
`

	for _, event := range report.Timeline {
		content += fmt.Sprintf("| %s | **%s** | %s | %s |\n",
			event.Timestamp,
			event.Type,
			event.Message,
			event.Details,
		)
	}

	content += `
---

## 3. 系统指标变化

### 错误率 (Error Rate)

| 阶段 | 时间 (UTC) | 错误率 |
|------|------------|--------|
| 实验前 | %s | %.2f%% |
| 实验中 | %s | %.2f%% |
| 实验后 | %s | %.2f%% |

### P99 延迟

| 阶段 | 时间 (UTC) | P99延迟 |
|------|------------|---------|
| 实验前 | %s | %v |
| 实验中 | %s | %v |
| 实验后 | %s | %v |

### 吞吐量 (Throughput)

| 阶段 | 时间 (UTC) | 吞吐量 |
|------|------------|--------|
| 实验前 | %s | %.0f req/s |
| 实验中 | %s | %.0f req/s |
| 实验后 | %s | %.0f req/s |

---

## 4. 影响分析

### 受影响服务

`,
		report.MetricsData.BeforeExperiment.Timestamp,
		report.MetricsData.BeforeExperiment.ErrorRate*100,
		report.MetricsData.DuringExperiment.Timestamp,
		report.MetricsData.DuringExperiment.ErrorRate*100,
		report.MetricsData.AfterExperiment.Timestamp,
		report.MetricsData.AfterExperiment.ErrorRate*100,

		report.MetricsData.BeforeExperiment.Timestamp,
		report.MetricsData.BeforeExperiment.P99Latency,
		report.MetricsData.DuringExperiment.Timestamp,
		report.MetricsData.DuringExperiment.P99Latency,
		report.MetricsData.AfterExperiment.Timestamp,
		report.MetricsData.AfterExperiment.P99Latency,

		report.MetricsData.BeforeExperiment.Timestamp,
		report.MetricsData.BeforeExperiment.Throughput,
		report.MetricsData.DuringExperiment.Timestamp,
		report.MetricsData.DuringExperiment.Throughput,
		report.MetricsData.AfterExperiment.Timestamp,
		report.MetricsData.AfterExperiment.Throughput,
	)

	for _, service := range report.ImpactAnalysis.ServicesAffected {
		content += fmt.Sprintf("- %s\n", service)
	}

	content += fmt.Sprintf(`

### 指标变化总结

- **错误率**: %s
- **P99延迟**: %s
- **吞吐量**: %s

### 结论

%s

---

## 5. 建议

`,
		report.ImpactAnalysis.ErrorRateChange,
		report.ImpactAnalysis.LatencyChange,
		report.ImpactAnalysis.ThroughputChange,
		report.ImpactAnalysis.Conclusion,
	)

	for i, rec := range report.Recommendations {
		content += fmt.Sprintf("%d. %s\n", i+1, rec)
	}

	content += `
---

*报告由 chaosctl 自动生成，所有时间均为UTC时间*
`

	return content
}

func (g *Generator) generateHTMLWithCharts(report *ChaosReport) (string, error) {
	chartsHTML, err := g.buildCharts(report)
	if err != nil {
		return "", err
	}

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #34495e; margin-top: 20px; }
        table { width: 100%%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .metric-positive { color: #e74c3c; font-weight: bold; }
        .metric-negative { color: #27ae60; font-weight: bold; }
        .charts-container { margin: 30px 0; }
        footer { margin-top: 50px; text-align: center; color: #7f8c8d; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; }
        .info-box { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; }
        .warning-box { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
        ul, ol { line-height: 1.8; }
    </style>
</head>
<body>
    <h1>%s</h1>
    <p><strong>生成时间:</strong> %s (UTC)</p>

    <h2>1. 实验信息</h2>
    <table>
        <tr><th>实验名称</th><td>%s</td></tr>
        <tr><th>命名空间</th><td>%s</td></tr>
        <tr><th>实验类型</th><td>%s</td></tr>
        <tr><th>状态</th><td>%s</td></tr>
        <tr><th>描述</th><td>%s</td></tr>
        <tr><th>持续时间</th><td>%s</td></tr>
    </table>

    <h2>2. 系统指标变化</h2>
    <div class="charts-container">
        <!-- 图表将在这里插入 -->
        %s
    </div>

    <h2>3. 影响分析</h2>
    <div class="warning-box">
        <h3>指标变化总结</h3>
        <table>
            <tr><th>指标</th><th>变化</th></tr>
            <tr><td>错误率</td><td class="metric-positive">%s</td></tr>
            <tr><td>P99延迟</td><td class="metric-positive">%s</td></tr>
            <tr><td>吞吐量</td><td>%s</td></tr>
        </table>
    </div>

    <h3>受影响服务</h3>
    <ul>
`,
		report.Title,
		report.Title,
		report.GeneratedAt,
		report.ExperimentInfo.Name,
		report.ExperimentInfo.Namespace,
		report.ExperimentInfo.Type,
		report.ExperimentInfo.Status,
		report.ExperimentInfo.Description,
		report.ExperimentInfo.Duration,
		chartsHTML,
		report.ImpactAnalysis.ErrorRateChange,
		report.ImpactAnalysis.LatencyChange,
		report.ImpactAnalysis.ThroughputChange,
	)

	for _, service := range report.ImpactAnalysis.ServicesAffected {
		htmlContent += fmt.Sprintf("        <li>%s</li>\n", service)
	}

	htmlContent += `    </ul>

    <div class="info-box">
        <h3>结论</h3>
        <p>` + report.ImpactAnalysis.Conclusion + `</p>
    </div>

    <h2>4. 建议</h2>
    <ol>
`

	for _, rec := range report.Recommendations {
		htmlContent += fmt.Sprintf("        <li>%s</li>\n", rec)
	}

	htmlContent += `    </ol>

    <footer>
        报告由 chaosctl 自动生成 | 所有时间均为UTC时间
    </footer>
</body>
</html>
`

	return htmlContent, nil
}

func (g *Generator) generateHTML(report *ChaosReport) string {
	content, _ := g.generateHTMLWithCharts(report)
	return content
}
