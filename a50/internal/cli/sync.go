package cli

import (
	"fmt"
	"os"

	"schemasync/internal/config"
	"schemasync/internal/db"
	"schemasync/internal/sync"

	"github.com/spf13/cobra"
)

var (
	sourceEnv string
	targetEnv string
	direction string
	autoResolve bool
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Schema 双向同步",
	Long:  `在主从架构之间进行 Schema 双向同步，检测并解决冲突`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := runSync(); err != nil {
			fmt.Printf("同步失败: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	syncCmd.Flags().StringVarP(&sourceEnv, "source", "s", "", "源环境（master）")
	syncCmd.Flags().StringVarP(&targetEnv, "target", "t", "", "目标环境（slave）")
	syncCmd.Flags().StringVarP(&direction, "direction", "d", "master_to_slave", "同步方向：master_to_slave|slave_to_master|bidirectional")
	syncCmd.Flags().BoolVar(&autoResolve, "auto-resolve", true, "自动解决冲突")
}

func runSync() error {
	if sourceEnv == "" || targetEnv == "" {
		return fmt.Errorf("必须指定源环境 (--source) 和目标环境 (--target)")
	}

	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return err
	}

	sourceCfg := cfg.GetDatabase(sourceEnv)
	if sourceCfg == nil {
		return fmt.Errorf("源环境 %s 不存在", sourceEnv)
	}

	targetCfg := cfg.GetDatabase(targetEnv)
	if targetCfg == nil {
		return fmt.Errorf("目标环境 %s 不存在", targetEnv)
	}

	sourceConn, err := db.GetConnection(sourceCfg)
	if err != nil {
		return err
	}

	targetConn, err := db.GetConnection(targetCfg)
	if err != nil {
		return err
	}

	var syncDir sync.SyncDirection
	switch direction {
	case "master_to_slave":
		syncDir = sync.DirectionMasterToSlave
	case "slave_to_master":
		syncDir = sync.DirectionSlaveToMaster
	case "bidirectional":
		syncDir = sync.DirectionBidirectional
	default:
		return fmt.Errorf("无效的同步方向: %s", direction)
	}

	engine := sync.NewSyncEngine(sourceConn, targetConn, syncDir)

	fmt.Println("正在比较 Schema...")
	conflicts, err := engine.CompareSchemas()
	if err != nil {
		return err
	}

	if len(conflicts) == 0 {
		fmt.Println("Schema 一致，无需同步")
		return nil
	}

	fmt.Printf("检测到 %d 个冲突:\n", len(conflicts))
	for i, conflict := range conflicts {
		fmt.Printf("  %d. [%s] %s\n", i+1, conflict.Type, conflict.Description)
	}

	if autoResolve {
		fmt.Println("\n正在自动解决冲突...")
		if err := engine.ResolveConflicts(conflicts); err != nil {
			return err
		}

		fmt.Println("正在应用同步...")
		if err := engine.Sync(conflicts); err != nil {
			return err
		}

		fmt.Println("同步完成！")
	} else {
		fmt.Println("\n请手动解决以下冲突：")
		for i, conflict := range conflicts {
			fmt.Printf("\n冲突 %d:\n", i+1)
			fmt.Printf("  类型: %s\n", conflict.Type)
			fmt.Printf("  描述: %s\n", conflict.Description)
			if conflict.ObjectA.Name != "" {
				fmt.Printf("  源对象: %s\n", conflict.ObjectA.Name)
			}
			if conflict.ObjectB.Name != "" {
				fmt.Printf("  目标对象: %s\n", conflict.ObjectB.Name)
			}
		}
	}

	return nil
}
