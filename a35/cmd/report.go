package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/report"
)

func newReportCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "report",
		Short: "生成混沌实验报告（HTML/Markdown）",
		Long:  `report子命令用于生成混沌实验的分析报告，支持HTML和Markdown格式。`,
	}

	cmd.AddCommand(newReportGenerateCmd())

	return cmd
}

func newReportGenerateCmd() *cobra.Command {
	var experimentName string
	var outputFormat string
	var outputPath string
	var prometheusURL string

	cmd := &cobra.Command{
		Use:   "generate",
		Short: "生成混沌实验报告",
		Long:  `生成包含故障时间线、系统指标变化曲线、链路影响分析的混沌实验报告。`,
		Run: func(cmd *cobra.Command, args []string) {
			generator := report.NewGenerator(outputFormat, outputPath)

			opts := report.ReportOptions{
				ExperimentName: experimentName,
				PrometheusURL:  prometheusURL,
				Kubeconfig:     kubeconfig,
				Namespace:      namespace,
			}

			fmt.Printf("生成报告，实验: %s，格式: %s，输出: %s\n", experimentName, outputFormat, outputPath)

			reportPath, err := generator.Generate(opts)
			if err != nil {
				er(fmt.Sprintf("生成报告失败: %v", err))
			}

			fmt.Printf("报告生成成功: %s\n", reportPath)
		},
	}

	cmd.Flags().StringVarP(&experimentName, "experiment", "e", "", "实验名称")
	cmd.Flags().StringVarP(&outputFormat, "format", "f", "markdown", "报告格式: markdown, html")
	cmd.Flags().StringVarP(&outputPath, "output", "o", "chaos-report", "输出文件路径（不含扩展名）")
	cmd.Flags().StringVar(&prometheusURL, "prometheus-url", "http://localhost:9090", "Prometheus服务器地址")
	cmd.MarkFlagRequired("experiment")

	return cmd
}
