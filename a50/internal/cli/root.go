package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	cfgFile string
	environment string
	distributed bool
)

var rootCmd = &cobra.Command{
	Use:   "schemasync",
	Short: "分布式数据库 Schema 迁移与双向同步工具",
	Long: `schemasync 是一个用于管理微服务架构中多数据库、多环境 Schema 一致性的工具，
支持 MySQL、PostgreSQL、MongoDB。

特性：
- Schema 版本化管理（基于线性版本号和依赖图）
- 在线 DDL 执行
- 双向同步引擎
- Schema 漂移检测
- 事务性迁移和回滚
- gRPC 多节点协调和分布式锁`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "schemasync.yaml", "配置文件路径")
	rootCmd.PersistentFlags().StringVarP(&environment, "environment", "e", "default", "目标环境")
	rootCmd.PersistentFlags().BoolVarP(&distributed, "distributed", "d", false, "启用分布式模式")

	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(migrateCmd)
	rootCmd.AddCommand(rollbackCmd)
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(driftDetectCmd)
	rootCmd.AddCommand(statusCmd)
}
