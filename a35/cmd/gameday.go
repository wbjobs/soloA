package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/gameday"
)

func newGameDayCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "gameday",
		Short: "GameDay自动化编排管理",
		Long:  `gameday子命令用于管理和执行GameDay自动化编排，按时间线自动执行一系列实验和检查点验证。`,
	}

	cmd.AddCommand(newGameDayRunCmd())
	cmd.AddCommand(newGameDayValidateCmd())
	cmd.AddCommand(newGameDayListCmd())

	return cmd
}

func newGameDayRunCmd() *cobra.Command {
	var gameDayFile string
	var dryRun bool

	cmd := &cobra.Command{
		Use:   "run",
		Short: "执行GameDay编排",
		Long: `根据GameDay定义文件，按时间线自动执行一系列实验和检查点验证。
支持自动回滚、检查点断言和故障恢复。`,
		Run: func(cmd *cobra.Command, args []string) {
			if gameDayFile == "" {
				er("必须指定GameDay定义文件")
			}

			loader := gameday.NewLoader()
			def, err := loader.LoadFromFile(gameDayFile)
			if err != nil {
				er(fmt.Sprintf("加载GameDay定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("GameDay定义校验失败: %v", err))
			}

			fmt.Println("GameDay定义校验通过")

			if dryRun {
				fmt.Println("\n=== 干运行模式 ===")
				fmt.Printf("GameDay名称: %s\n", def.Name)
				fmt.Printf("团队: %s | 环境: %s\n", def.Team, def.Environment)
				fmt.Printf("总步骤数: %d\n", len(def.Steps))
				fmt.Println("\n步骤列表:")
				for i, step := range def.Steps {
					fmt.Printf("  [%d/%d] %s (%s)\n", i+1, len(def.Steps), step.Name, step.StepType)
					if step.Description != "" {
						fmt.Printf("       %s\n", step.Description)
					}
				}
				fmt.Println("\n干运行完成，未执行任何操作")
				return
			}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
			go func() {
				<-sigCh
				fmt.Println("\n收到终止信号，正在停止GameDay...")
				cancel()
			}()

			executor, err := gameday.NewExecutor(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建GameDay执行器失败: %v", err))
			}

			execution, err := executor.Run(ctx, def)
			if err != nil {
				fmt.Printf("\nGameDay执行出错: %v\n", err)
			}

			fmt.Println("\n=== GameDay执行结果 ===")
			fmt.Printf("名称: %s\n", execution.GameDayName)
			fmt.Printf("状态: %s\n", execution.Status)
			fmt.Printf("开始时间: %s\n", execution.StartTime)
			fmt.Printf("结束时间: %s\n", execution.EndTime)
			fmt.Printf("总耗时: %v\n", execution.Duration)
			fmt.Printf("失败步骤: %d/%d\n", execution.FailureCount, len(execution.Steps))

			if execution.RollbackInfo != nil {
				fmt.Println("\n回滚信息:")
				fmt.Printf("  触发原因: %s\n", execution.RollbackInfo.TriggerReason)
				fmt.Printf("  回滚状态: %s\n", execution.RollbackInfo.Status)
				fmt.Printf("  回滚步骤数: %d\n", len(execution.RollbackInfo.StepsRolledBack))
			}

			fmt.Println("\n步骤详情:")
			for i, step := range execution.Steps {
				status := "✅"
				if step.Status == gameday.StepStatusFailed {
					status = "❌"
				} else if step.Status == gameday.StepStatusSkipped {
					status = "⏭️"
				}
				fmt.Printf("  [%d] %s %s (耗时: %v)\n", i+1, status, step.Name, step.Duration)
				if step.Error != "" {
					fmt.Printf("       错误: %s\n", step.Error)
				}
				if step.Checkpoint != nil {
					cpStatus := "通过"
					if !step.Checkpoint.Passed {
						cpStatus = "失败"
					}
					fmt.Printf("       检查点: %s [%s]\n", step.Checkpoint.Name, cpStatus)
				}
				if step.ExperimentInfo != nil {
					fmt.Printf("       实验: %s [%s]\n", step.ExperimentInfo.Name, step.ExperimentInfo.Status)
				}
			}
		},
	}

	cmd.Flags().StringVarP(&gameDayFile, "file", "f", "", "GameDay定义文件路径 (YAML/JSON)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "干运行模式，只验证配置不执行")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newGameDayValidateCmd() *cobra.Command {
	var gameDayFile string

	cmd := &cobra.Command{
		Use:   "validate",
		Short: "校验GameDay定义文件",
		Long:  `校验GameDay定义文件的语法和配置是否正确。`,
		Run: func(cmd *cobra.Command, args []string) {
			if gameDayFile == "" {
				er("必须指定GameDay定义文件")
			}

			loader := gameday.NewLoader()
			def, err := loader.LoadFromFile(gameDayFile)
			if err != nil {
				er(fmt.Sprintf("加载GameDay定义失败: %v", err))
			}

			if err := loader.Validate(def); err != nil {
				er(fmt.Sprintf("GameDay定义校验失败: %v", err))
			}

			fmt.Println("GameDay定义校验通过!")
			fmt.Printf("  名称: %s\n", def.Name)
			fmt.Printf("  团队: %s\n", def.Team)
			fmt.Printf("  环境: %s\n", def.Environment)
			fmt.Printf("  自动回滚: %t\n", def.AutoRollback)
			fmt.Printf("  步骤数: %d\n", len(def.Steps))
		},
	}

	cmd.Flags().StringVarP(&gameDayFile, "file", "f", "", "GameDay定义文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newGameDayListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出可用的GameDay模板",
		Long:  `列出预定义的GameDay模板和示例。`,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("可用的GameDay模板示例:")
			fmt.Println("  1. 熔断降级验证 - 验证熔断器和降级策略")
			fmt.Println("  2. 故障恢复演练 - 验证系统故障恢复能力")
			fmt.Println("  3. 容量验证 - 验证系统容量和弹性")
			fmt.Println("  4. 依赖隔离验证 - 验证服务依赖隔离")
			fmt.Println("\n使用示例:")
			fmt.Println("  chaosctl gameday run -f examples/gameday-fallback.yaml")
		},
	}

	return cmd
}
