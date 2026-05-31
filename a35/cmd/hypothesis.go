package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/hypothesis"
)

func newHypothesisCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "hypothesis",
		Short: "假设验证管理",
		Long:  `hypothesis子命令用于管理和执行假设验证，基于实验前的稳态假设，自动对比实验期间的指标变化。`,
	}

	cmd.AddCommand(newHypothesisVerifyCmd())
	cmd.AddCommand(newHypothesisValidateCmd())
	cmd.AddCommand(newHypothesisListCmd())

	return cmd
}

func newHypothesisVerifyCmd() *cobra.Command {
	var hypothesisFile string
	var outputFormat string

	cmd := &cobra.Command{
		Use:   "verify",
		Short: "执行假设验证",
		Long: `根据假设定义，采集稳态数据，执行实验，验证假设是否成立。
自动生成证据链，对比实验前后的指标变化。`,
		Run: func(cmd *cobra.Command, args []string) {
			if hypothesisFile == "" {
				er("必须指定假设定义文件")
			}

			loader := hypothesis.NewLoader()
			def, err := loader.LoadFromFile(hypothesisFile)
			if err != nil {
				er(fmt.Sprintf("加载假设定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("假设定义校验失败: %v", err))
			}

			fmt.Println("假设定义校验通过")

			ctx := context.Background()
			engine := hypothesis.NewVerificationEngine()

			verification, err := engine.Verify(ctx, def)
			if err != nil {
				er(fmt.Sprintf("假设验证失败: %v", err))
			}

			fmt.Println("\n=== 假设验证结果 ===")
			fmt.Printf("名称: %s\n", verification.DefinitionName)
			fmt.Printf("状态: %s\n", verification.Status)
			fmt.Printf("开始时间: %s\n", verification.StartTime)
			fmt.Printf("结束时间: %s\n", verification.EndTime)
			fmt.Printf("总耗时: %v\n", verification.Duration)

			fmt.Println("\n稳态验证结果:")
			fmt.Printf("  状态: %s\n", verification.SteadyStateResults.Status)
			for _, metric := range verification.SteadyStateResults.Metrics {
				status := "✅"
				if !metric.Passed {
					status = "❌"
				}
				fmt.Printf("  %s %s: 预期=%.2f, 实际=%.2f, 差异=%.2f%%\n",
					status, metric.Name, metric.ExpectedValue, metric.ActualValue, metric.DifferencePct)
			}

			fmt.Println("\n假设验证详情:")
			for _, hyp := range verification.HypothesisResults {
				status := "✅ 接受"
				if hyp.Status == hypothesis.HypothesisStatusRejected {
					status = "❌ 拒绝"
				} else if hyp.Status == hypothesis.HypothesisStatusPartial {
					status = "⚠️  部分"
				}

				fmt.Printf("\n  [%s] %s\n", hyp.ID, hyp.Name)
				fmt.Printf("    前提: %s\n", hyp.Assumption)
				fmt.Printf("    预测: %s\n", hyp.Prediction)
				fmt.Printf("    状态: %s | 分数: %.2f\n", status, hyp.Score)
				fmt.Printf("    结论: %s\n", hyp.Conclusion)

				fmt.Printf("    指标验证:\n")
				for _, metric := range hyp.MetricResults {
					mStatus := "✅"
					if !metric.Passed {
						mStatus = "❌"
					}
					fmt.Printf("      %s %s: 变化率=%.2f%%, 预期=%s\n",
						mStatus, metric.Name, metric.ChangePct, metric.ExpectedChange)
				}
			}

			fmt.Println("\n=== 验证总结 ===")
			fmt.Printf("总假设数: %d\n", verification.Summary.TotalHypotheses)
			fmt.Printf("接受: %d | 拒绝: %d | 部分: %d\n",
				verification.Summary.AcceptedCount,
				verification.Summary.RejectedCount,
				verification.Summary.PartialCount)
			fmt.Printf("总体置信度: %.1f%%\n", verification.Summary.OverallConfidence*100)

			fmt.Println("\n建议:")
			for i, rec := range verification.Summary.Recommendations {
				fmt.Printf("  %d. %s\n", i+1, rec)
			}

			if outputFormat == "json" {
				fmt.Println("\n=== JSON输出 ===")
			}
		},
	}

	cmd.Flags().StringVarP(&hypothesisFile, "file", "f", "", "假设定义文件路径 (YAML/JSON)")
	cmd.Flags().StringVarP(&outputFormat, "output", "o", "text", "输出格式: text, json")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newHypothesisValidateCmd() *cobra.Command {
	var hypothesisFile string

	cmd := &cobra.Command{
		Use:   "validate",
		Short: "校验假设定义文件",
		Long:  `校验假设定义文件的语法和配置是否正确。`,
		Run: func(cmd *cobra.Command, args []string) {
			if hypothesisFile == "" {
				er("必须指定假设定义文件")
			}

			loader := hypothesis.NewLoader()
			def, err := loader.LoadFromFile(hypothesisFile)
			if err != nil {
				er(fmt.Sprintf("加载假设定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("假设定义校验失败: %v", err))
			}

			fmt.Println("假设定义校验通过!")
			fmt.Printf("  名称: %s\n", def.Name)
			fmt.Printf("  稳态指标数: %d\n", len(def.SteadyState.Metrics))
			fmt.Printf("  假设数: %d\n", len(def.Hypotheses))

			fmt.Println("\n假设列表:")
			for i, hyp := range def.Hypotheses {
				fmt.Printf("  [%d] %s (ID: %s)\n", i+1, hyp.Name, hyp.ID)
				fmt.Printf("       前提: %s\n", hyp.Assumption)
				fmt.Printf("       预测: %s\n", hyp.Prediction)
			}
		},
	}

	cmd.Flags().StringVarP(&hypothesisFile, "file", "f", "", "假设定义文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newHypothesisListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出可用的假设模板",
		Long:  `列出预定义的假设验证模板和示例。`,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("可用的假设验证模板示例:")
			fmt.Println("  1. 熔断验证 - 验证熔断器是否正确触发")
			fmt.Println("  2. 降级验证 - 验证降级策略是否生效")
			fmt.Println("  3. 缓存验证 - 验证缓存失效后的性能表现")
			fmt.Println("  4. 重试验证 - 验证重试机制是否改善成功率")
			fmt.Println("\n使用示例:")
			fmt.Println("  chaosctl hypothesis verify -f examples/hypothesis-circuit-breaker.yaml")
		},
	}

	return cmd
}
