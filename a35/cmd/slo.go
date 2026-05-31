package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/slo"
)

func newSLOCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "slo",
		Short: "SLO错误预算分析",
		Long:  `slo子命令用于分析SLO错误预算燃烧率，计算可容忍的故障频率，指导实验强度与排期。`,
	}

	cmd.AddCommand(newSLOAnalyzeCmd())
	cmd.AddCommand(newSLOValidateCmd())
	cmd.AddCommand(newSLOAdvisorCmd())

	return cmd
}

func newSLOAnalyzeCmd() *cobra.Command {
	var sloFile string
	var outputFormat string

	cmd := &cobra.Command{
		Use:   "analyze",
		Short: "分析SLO错误预算",
		Long: `根据SLO定义，分析错误预算消耗情况和燃烧率。
计算可容忍的故障频率，指导混沌实验的强度与排期。`,
		Run: func(cmd *cobra.Command, args []string) {
			if sloFile == "" {
				er("必须指定SLO定义文件")
			}

			loader := slo.NewLoader()
			def, err := loader.LoadFromFile(sloFile)
			if err != nil {
				er(fmt.Sprintf("加载SLO定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("SLO定义校验失败: %v", err))
			}

			fmt.Println("SLO定义校验通过")

			ctx := context.Background()
			analyzer := slo.NewSLOAnalyzer()

			report, err := analyzer.Analyze(ctx, def)
			if err != nil {
				er(fmt.Sprintf("SLO分析失败: %v", err))
			}

			fmt.Println("\n=== SLO分析结果 ===")
			fmt.Printf("服务: %s\n", report.Service)
			fmt.Printf("环境: %s\n", report.Environment)
			fmt.Printf("状态: %s\n", report.Status)
			fmt.Printf("分析时间: %s\n", report.ReportTime)

			fmt.Println("\nSLO达成情况:")
			fmt.Printf("  目标: %.2f%%\n", report.Target*100)
			fmt.Printf("  实际: %.2f%%\n", report.Actual*100)
			fmt.Printf("  差异: %+.2f%%\n", report.Difference*100)

			fmt.Println("\n错误预算详情:")
			fmt.Printf("  总预算: %.2f%%\n", report.ErrorBudget.TotalBudget*100)
			fmt.Printf("  已消耗: %.2f%% (%.1f%%)\n",
				report.ErrorBudget.ConsumedBudget*100, report.ErrorBudget.ConsumedRatio*100)
			fmt.Printf("  剩余: %.2f%% (%.1f%%)\n",
				report.ErrorBudget.RemainingBudget*100, report.ErrorBudget.RemainingRatio*100)

			fmt.Println("\n燃烧率分析:")
			levelIcon := "🟢"
			if report.BurnRate.BurnRateLevel == slo.BurnRateModerate {
				levelIcon = "🟡"
			} else if report.BurnRate.BurnRateLevel == slo.BurnRateHigh {
				levelIcon = "🟠"
			} else if report.BurnRate.BurnRateLevel == slo.BurnRateSevere {
				levelIcon = "🔴"
			}

			fmt.Printf("  %s 燃烧率等级: %s\n", levelIcon, report.BurnRate.BurnRateLevel)
			fmt.Printf("  当前燃烧率: %.2fx\n", report.BurnRate.CurrentBurnRate)
			fmt.Printf("  短期燃烧率: %.2fx\n", report.BurnRate.ShortTermBurnRate)
			fmt.Printf("  长期燃烧率: %.2fx\n", report.BurnRate.LongTermBurnRate)
			fmt.Printf("  预计耗尽时间: %v\n", report.BurnRate.TimeToExhaust)

			chaosStatus := "✅"
			if !report.BurnRate.IsSafeForChaos {
				chaosStatus = "❌"
			}
			fmt.Printf("\n混沌实验建议: %s 适合执行\n", chaosStatus)

			fmt.Println("\nSLO指标详情:")
			for _, indicator := range report.Indicators {
				status := "✅"
				if !indicator.Passed {
					status = "❌"
				}
				fmt.Printf("  %s %s: 达成 %.2f%% (权重: %.1f)\n",
					status, indicator.Name, indicator.Actual*100, indicator.Weight)
			}

			fmt.Println("\n=== 实验排期建议 ===")
			if len(report.Recommendations) == 0 {
				fmt.Println("暂无特别建议")
			} else {
				for i, rec := range report.Recommendations {
					priorityIcon := "🔴"
					if rec.Priority == "medium" {
						priorityIcon = "🟡"
					} else if rec.Priority == "low" {
						priorityIcon = "🟢"
					}

					fmt.Printf("\n  [%d] %s %s\n", i+1, priorityIcon, rec.Title)
					fmt.Printf("      描述: %s\n", rec.Description)
					fmt.Printf("      操作: %s\n", rec.Action)
				}
			}

			if outputFormat == "json" {
				fmt.Println("\n=== JSON输出 ===")
			}
		},
	}

	cmd.Flags().StringVarP(&sloFile, "file", "f", "", "SLO定义文件路径 (YAML/JSON)")
	cmd.Flags().StringVarP(&outputFormat, "output", "o", "text", "输出格式: text, json")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newSLOValidateCmd() *cobra.Command {
	var sloFile string

	cmd := &cobra.Command{
		Use:   "validate",
		Short: "校验SLO定义文件",
		Long:  `校验SLO定义文件的语法和配置是否正确。`,
		Run: func(cmd *cobra.Command, args []string) {
			if sloFile == "" {
				er("必须指定SLO定义文件")
			}

			loader := slo.NewLoader()
			def, err := loader.LoadFromFile(sloFile)
			if err != nil {
				er(fmt.Sprintf("加载SLO定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("SLO定义校验失败: %v", err))
			}

			fmt.Println("SLO定义校验通过!")
			fmt.Printf("  名称: %s\n", def.Name)
			fmt.Printf("  服务: %s\n", def.Service)
			fmt.Printf("  环境: %s\n", def.Environment)
			fmt.Printf("  SLO目标: %.2f%%\n", def.Target*100)
			fmt.Printf("  时间窗口: %s\n", def.Window.Duration)
			fmt.Printf("  指标数: %d\n", len(def.Indicators))

			fmt.Println("\n指标列表:")
			for i, indicator := range def.Indicators {
				weight := indicator.Weight
				if weight <= 0 {
					weight = 1.0
				}
				fmt.Printf("  [%d] %s (%s) - 权重: %.1f\n",
					i+1, indicator.Name, indicator.Type, weight)
			}
		},
	}

	cmd.Flags().StringVarP(&sloFile, "file", "f", "", "SLO定义文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newSLOAdvisorCmd() *cobra.Command {
	var sloFile string

	cmd := &cobra.Command{
		Use:   "advisor",
		Short: "获取实验排期建议",
		Long:  `根据SLO错误预算分析，获取混沌实验的排期建议。`,
		Run: func(cmd *cobra.Command, args []string) {
			if sloFile == "" {
				er("必须指定SLO定义文件")
			}

			loader := slo.NewLoader()
			def, err := loader.LoadFromFile(sloFile)
			if err != nil {
				er(fmt.Sprintf("加载SLO定义失败: %v", err))
			}

			ctx := context.Background()
			analyzer := slo.NewSLOAnalyzer()

			report, err := analyzer.Analyze(ctx, def)
			if err != nil {
				er(fmt.Sprintf("SLO分析失败: %v", err))
			}

			advisor := slo.NewBudgetAdvisor(report)

			fmt.Println("=== 实验排期建议 ===")
			fmt.Printf("\n当前SLO状态: %s\n", report.Status)
			fmt.Printf("错误预算剩余: %.1f%%\n", report.ErrorBudget.RemainingRatio*100)
			fmt.Printf("燃烧率等级: %s (%.2fx)\n", report.BurnRate.BurnRateLevel, report.BurnRate.CurrentBurnRate)

			fmt.Println("\n是否可以执行混沌实验:")
			for riskLevel := 0.05; riskLevel <= 0.20; riskLevel += 0.05 {
				canSchedule := advisor.CanScheduleExperiment(riskLevel)
				status := "✅ 可以"
				if !canSchedule {
					status = "❌ 不建议"
				}
				fmt.Printf("  风险等级 %.0f%%: %s\n", riskLevel*100, status)
			}

			fmt.Println("\n建议的实验强度:")
			if report.BurnRate.BurnRateLevel == slo.BurnRateLow {
				fmt.Println("  ✅ 可以执行高强度实验")
				fmt.Println("  ✅ 可以增加实验频率")
				fmt.Println("  ✅ 可以探索新的故障类型")
			} else if report.BurnRate.BurnRateLevel == slo.BurnRateModerate {
				fmt.Println("  ✅ 可以执行中等强度实验")
				fmt.Println("  ✅ 保持当前实验频率")
				fmt.Println("  ⚠️  监控燃烧率趋势")
			} else {
				fmt.Println("  ❌ 不建议执行高强度实验")
				fmt.Println("  ❌ 建议降低实验频率")
				fmt.Println("  ❌ 优先调查高燃烧率原因")
			}

			fmt.Println("\n详细建议:")
			for i, rec := range report.Recommendations {
				fmt.Printf("  %d. %s - %s\n", i+1, rec.Title, rec.Action)
			}
		},
	}

	cmd.Flags().StringVarP(&sloFile, "file", "f", "", "SLO定义文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}
