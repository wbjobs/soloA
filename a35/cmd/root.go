package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var cfgFile string
var kubeconfig string
var namespace string

var rootCmd = &cobra.Command{
	Use:   "chaosctl",
	Short: "混沌工程CLI工具 - 用于Kubernetes环境的故障注入与可观测性分析",
	Long: `混沌工程CLI工具 (chaosctl) 是一个面向云原生分布式系统的混沌工程工具，
支持Kubernetes环境的故障注入与可观测性分析。

主要功能：
- 故障注入：支持Pod故障、网络延迟/丢包、CPU/内存压力、IO延迟
- 可观测性：集成Prometheus查询指标，集成Jaeger/Tempo查询链路追踪
- 报告生成：生成HTML/Markdown格式的混沌实验报告
- 多集群支持：kubeconfig上下文切换、命名空间隔离
- GameDay编排：按时间线自动执行一系列实验和检查点验证
- 假设验证：基于实验前的稳态假设，自动对比实验期间的指标变化
- SLO分析：错误预算燃烧率分析，指导实验强度与排期`,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "配置文件路径 (默认: $HOME/.chaosctl.yaml)")
	rootCmd.PersistentFlags().StringVar(&kubeconfig, "kubeconfig", "", "Kubernetes配置文件路径 (默认: $HOME/.kube/config)")
	rootCmd.PersistentFlags().StringVarP(&namespace, "namespace", "n", "default", "Kubernetes命名空间")

	rootCmd.AddCommand(newExperimentCmd())
	rootCmd.AddCommand(newObserveCmd())
	rootCmd.AddCommand(newReportCmd())
	rootCmd.AddCommand(newValidateCmd())
	rootCmd.AddCommand(newGameDayCmd())
	rootCmd.AddCommand(newHypothesisCmd())
	rootCmd.AddCommand(newSLOCmd())
}

func initConfig() {
	if cfgFile != "" {
		fmt.Println("使用配置文件:", cfgFile)
	}
}

func er(msg interface{}) {
	fmt.Println("错误:", msg)
	os.Exit(1)
}
