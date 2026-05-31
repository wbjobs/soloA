package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/config"
)

func newValidateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "validate",
		Short: "校验实验配置文件",
		Long:  `validate子命令用于校验YAML或JSON格式的实验配置文件是否符合规范。`,
	}

	cmd.AddCommand(newValidateConfigCmd())

	return cmd
}

func newValidateConfigCmd() *cobra.Command {
	var configFile string

	cmd := &cobra.Command{
		Use:   "config",
		Short: "校验实验配置文件",
		Long:  `校验YAML或JSON格式的实验配置文件是否符合混沌实验定义规范。`,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("校验配置文件: %s\n", configFile)

			validator := config.NewValidator()
			expConfig, err := validator.ValidateFromFile(configFile)
			if err != nil {
				er(fmt.Sprintf("配置校验失败: %v", err))
			}

			fmt.Println("配置校验通过!")
			fmt.Println("------------------------")
			fmt.Printf("实验名称: %s\n", expConfig.Name)
			fmt.Printf("实验类型: %s\n", expConfig.Type)
			fmt.Printf("命名空间: %s\n", expConfig.Namespace)
			fmt.Printf("描述: %s\n", expConfig.Description)
			fmt.Printf("持续时间: %s\n", expConfig.Duration)
		},
	}

	cmd.Flags().StringVarP(&configFile, "file", "f", "", "实验配置文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}
