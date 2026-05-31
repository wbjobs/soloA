package cli

import (
	"fmt"
	"os"

	"schemasync/internal/config"
	"schemasync/internal/migration"

	"github.com/spf13/cobra"
)

var (
	batchID string
)

var rollbackCmd = &cobra.Command{
	Use:   "rollback",
	Short: "回滚数据库迁移",
	Long:  `回滚最近一次或指定批次的数据库迁移`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := runRollback(); err != nil {
			fmt.Printf("回滚失败: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rollbackCmd.Flags().StringVarP(&batchID, "batch", "b", "", "指定要回滚的批次 ID")
}

func runRollback() error {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return err
	}

	engine, err := migration.NewMigrationEngine(cfg, environment)
	if err != nil {
		return err
	}

	result, err := engine.Rollback(batchID)
	if err != nil {
		return err
	}

	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Println("回滚结果")
	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Printf("Batch ID: %s\n", result.BatchID)
	fmt.Printf("状态: %s\n", map[bool]string{true: "成功", false: "失败"}[result.Success])
	fmt.Printf("回滚迁移数: %d\n", len(result.Migrations))
	fmt.Printf("耗时: %v\n", result.Duration)

	if len(result.Migrations) > 0 {
		fmt.Println("\n已回滚的迁移：")
		for _, m := range result.Migrations {
			fmt.Printf("  [%s] Version %d: %s\n", m.Status, m.Version, m.Name)
		}
	}

	if len(result.Errors) > 0 {
		fmt.Println("\n错误信息：")
		for _, err := range result.Errors {
			fmt.Printf("  - %v\n", err)
		}
	}

	if !result.Success {
		return fmt.Errorf("回滚执行失败")
	}

	return nil
}
