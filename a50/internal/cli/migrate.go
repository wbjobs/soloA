package cli

import (
	"context"
	"fmt"
	"os"
	"time"

	"schemasync/internal/config"
	"schemasync/internal/coordination"
	"schemasync/internal/migration"

	"github.com/spf13/cobra"
)

var (
	batchSize int
	dryRun    bool
)

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "执行数据库迁移",
	Long:  `执行所有未应用的数据库迁移脚本`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := runMigrate(); err != nil {
			fmt.Printf("迁移失败: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	migrateCmd.Flags().IntVarP(&batchSize, "batch-size", "b", 10, "每批执行的迁移数量")
	migrateCmd.Flags().BoolVar(&dryRun, "dry-run", false, "只显示将要执行的迁移，不实际执行")
}

func runMigrate() error {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Hour)
	defer cancel()

	var coord *coordination.DistributedCoordinator
	if distributed {
		coord, err = coordination.NewDistributedCoordinator(cfg)
		if err != nil {
			return err
		}

		if err := coord.Start(ctx); err != nil {
			return err
		}
		defer coord.Stop(ctx)

		if !coord.IsLeader() {
			fmt.Println("当前节点不是 Leader，等待 Leader 执行迁移...")
			return nil
		}

		acquired, err := coord.AcquireClusterLock(ctx)
		if err != nil {
			return err
		}
		if !acquired {
			return fmt.Errorf("无法获取分布式锁，可能有其他迁移正在进行")
		}
		defer coord.ReleaseClusterLock(ctx)
	}

	engine, err := migration.NewMigrationEngine(cfg, environment)
	if err != nil {
		return err
	}

	if dryRun {
		migrations, err := engine.LoadMigrations()
		if err != nil {
			return err
		}

		fmt.Println("将执行以下迁移：")
		for _, m := range migrations {
			fmt.Printf("  Version %d: %s\n", m.Version, m.Name)
		}
		return nil
	}

	result, err := engine.Migrate()
	if err != nil {
		return err
	}

	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Println("迁移结果")
	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Printf("Batch ID: %s\n", result.BatchID)
	fmt.Printf("状态: %s\n", map[bool]string{true: "成功", false: "失败"}[result.Success])
	fmt.Printf("执行迁移数: %d\n", len(result.Migrations))
	fmt.Printf("耗时: %v\n", result.Duration)

	if len(result.Migrations) > 0 {
		fmt.Println("\n已执行的迁移：")
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
		return fmt.Errorf("迁移执行失败")
	}

	return nil
}


