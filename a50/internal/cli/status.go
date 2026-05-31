package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"schemasync/internal/config"
	"schemasync/internal/migration"

	"github.com/spf13/cobra"
)

var (
	statusJSON bool
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "显示迁移状态",
	Long:  `显示当前环境的迁移状态信息`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := runStatus(); err != nil {
			fmt.Printf("获取状态失败: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	statusCmd.Flags().BoolVar(&statusJSON, "json", false, "以 JSON 格式输出")
}

func runStatus() error {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return err
	}

	engine, err := migration.NewMigrationEngine(cfg, environment)
	if err != nil {
		return err
	}

	migrations, err := engine.LoadMigrations()
	if err != nil {
		return err
	}

	vm := engine.VersionManager()

	currentVersion, err := vm.GetCurrentVersion()
	if err != nil {
		return err
	}

	lastBatch, err := vm.GetLastBatch()
	if err != nil && err.Error() != "sql: no rows in result set" {
		return err
	}

	statusInfo := map[string]interface{}{
		"environment":      environment,
		"current_version":  currentVersion,
		"last_batch_id":    lastBatch,
		"total_migrations": len(migrations),
		"config_file":      cfgFile,
	}

	if statusJSON {
		data, err := json.MarshalIndent(statusInfo, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Println("SchemaSync 状态")
	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Printf("配置文件: %s\n", cfgFile)
	fmt.Printf("环境: %s\n", environment)
	fmt.Printf("当前版本: %d\n", currentVersion)
	fmt.Printf("总迁移数: %d\n", len(migrations))
	if lastBatch != "" {
		fmt.Printf("最后批次 ID: %s\n", lastBatch)
	}

	if len(migrations) > 0 {
		fmt.Println("\n迁移列表：")
		fmt.Println(stringsRepeat("-", 60))
		for _, m := range migrations {
			status := "pending"
			if m.Version <= currentVersion {
				status = "applied"
			}
			fmt.Printf("  [%s] Version %d: %s\n", status, m.Version, m.Name)
		}
	}

	return nil
}
