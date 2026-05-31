package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"schemasync/internal/config"
	"schemasync/internal/db"
	"schemasync/internal/drift"

	"github.com/spf13/cobra"
)

var (
	baselineFile string
	jsonOutput   bool
)

var driftDetectCmd = &cobra.Command{
	Use:   "drift-detect",
	Short: "检测 Schema 漂移",
	Long:  `定期比对目标数据库与基准 Schema，报告差异`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := runDriftDetect(); err != nil {
			fmt.Printf("漂移检测失败: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	driftDetectCmd.Flags().StringVarP(&baselineFile, "baseline", "b", "", "基准 Schema 文件路径")
	driftDetectCmd.Flags().BoolVar(&jsonOutput, "json", false, "以 JSON 格式输出结果")
}

func runDriftDetect() error {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		return err
	}

	dbCfg := cfg.GetDatabase(environment)
	if dbCfg == nil {
		return fmt.Errorf("环境 %s 不存在", environment)
	}

	conn, err := db.GetConnection(dbCfg)
	if err != nil {
		return err
	}

	detector := drift.NewDetector(conn)

	if baselineFile == "" {
		baselineFile = filepath.Join(".", "baseline_"+environment+".json")
	}

	var baseline *drift.Baseline

	if _, err := os.Stat(baselineFile); err != nil {
		fmt.Printf("基准文件不存在，正在创建基准 Schema: %s\n", baselineFile)
		baseline, err = detector.CaptureBaseline()
		if err != nil {
			return err
		}

		data, err := json.MarshalIndent(baseline, "", "  ")
		if err != nil {
			return err
		}

		if err := os.WriteFile(baselineFile, data, 0644); err != nil {
			return err
		}

		fmt.Println("基准 Schema 已保存。")
		return nil
	}

	data, err := os.ReadFile(baselineFile)
	if err != nil {
		return err
	}

	baseline = &drift.Baseline{}
	if err := json.Unmarshal(data, baseline); err != nil {
		return err
	}

	report, err := detector.DetectDrift(baseline, environment)
	if err != nil {
		return err
	}

	if jsonOutput {
		jsonData, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(jsonData))
		return nil
	}

	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Println("Schema 漂移检测报告")
	fmt.Println("=" + stringsRepeat("=", 60))
	fmt.Printf("环境: %s\n", report.Environment)
	fmt.Printf("检测时间: %s\n", report.DetectedAt.Format("2006-01-02 15:04:05"))
	fmt.Printf("基准 Hash: %s\n", report.BaselineHash)
	fmt.Printf("当前 Hash: %s\n", report.CurrentHash)
	fmt.Printf("是否漂移: %s\n", map[bool]string{true: "是", false: "否"}[report.HasDrift])

	if !report.HasDrift {
		fmt.Println("\nSchema 与基准一致，无漂移。")
		return nil
	}

	fmt.Println("\n" + stringsRepeat("-", 60))
	fmt.Println("漂移摘要")
	fmt.Println(stringsRepeat("-", 60))
	fmt.Printf("总表数: %d\n", report.Summary.TotalTables)
	fmt.Printf("新增表: %d\n", report.Summary.AddedTables)
	fmt.Printf("删除表: %d\n", report.Summary.RemovedTables)
	fmt.Printf("变更表: %d\n", report.Summary.ChangedTables)
	fmt.Printf("总列数: %d\n", report.Summary.TotalColumns)
	fmt.Printf("总索引数: %d\n", report.Summary.TotalIndexes)

	if len(report.Drifts) > 0 {
		fmt.Println("\n" + stringsRepeat("-", 60))
		fmt.Println("漂移详情")
		fmt.Println(stringsRepeat("-", 60))
		for i, d := range report.Drifts {
			fmt.Printf("\n漂移 %d:\n", i+1)
			fmt.Printf("  类型: %s\n", d.Type)
			fmt.Printf("  对象: %s %s\n", d.ObjectType, d.ObjectName)
			fmt.Printf("  描述: %s\n", d.Description)
			fmt.Printf("  严重程度: %s\n", d.Severity)
		}
	}

	return nil
}
