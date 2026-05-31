package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/chaos-cli/chaosctl/pkg/chaos"
)

func newExperimentCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "experiment",
		Short: "管理混沌实验（创建、查看、停止、删除）",
		Long:  `experiment子命令用于管理混沌实验，包括创建新实验、查看实验状态、停止运行中的实验等操作。`,
	}

	cmd.AddCommand(newExperimentCreateCmd())
	cmd.AddCommand(newExperimentListCmd())
	cmd.AddCommand(newExperimentGetCmd())
	cmd.AddCommand(newExperimentStopCmd())
	cmd.AddCommand(newExperimentDeleteCmd())

	return cmd
}

func newExperimentCreateCmd() *cobra.Command {
	var experimentFile string

	cmd := &cobra.Command{
		Use:   "create",
		Short: "创建并运行混沌实验",
		Long:  `根据YAML或JSON格式的实验定义文件创建并运行混沌实验。`,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("创建实验，配置文件: %s\n", experimentFile)
			
			manager, err := chaos.NewManager(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建混沌管理器失败: %v", err))
			}

			experiment, err := manager.CreateFromFile(experimentFile)
			if err != nil {
				er(fmt.Sprintf("创建实验失败: %v", err))
			}

			fmt.Printf("实验创建成功: %s/%s\n", experiment.Namespace, experiment.Name)
			fmt.Printf("实验类型: %s\n", experiment.Type)
			fmt.Printf("实验状态: %s\n", experiment.Status)
		},
	}

	cmd.Flags().StringVarP(&experimentFile, "file", "f", "", "实验定义文件路径 (YAML/JSON)")
	cmd.MarkFlagRequired("file")

	return cmd
}

func newExperimentListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出所有混沌实验",
		Long:  `列出当前命名空间下所有混沌实验的状态信息。`,
		Run: func(cmd *cobra.Command, args []string) {
			manager, err := chaos.NewManager(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建混沌管理器失败: %v", err))
			}

			experiments, err := manager.List()
			if err != nil {
				er(fmt.Sprintf("列出实验失败: %v", err))
			}

			fmt.Println("实验列表:")
			fmt.Println("------------------------")
			for _, exp := range experiments {
				fmt.Printf("名称: %s\n", exp.Name)
				fmt.Printf("类型: %s\n", exp.Type)
				fmt.Printf("状态: %s\n", exp.Status)
				fmt.Printf("创建时间: %s\n", exp.CreatedAt)
				fmt.Println("------------------------")
			}
		},
	}

	return cmd
}

func newExperimentGetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get [实验名称]",
		Short: "获取指定混沌实验的详细信息",
		Long:  `获取指定混沌实验的详细信息，包括配置、状态和执行历史。`,
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			name := args[0]
			
			manager, err := chaos.NewManager(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建混沌管理器失败: %v", err))
			}

			experiment, err := manager.Get(name)
			if err != nil {
				er(fmt.Sprintf("获取实验信息失败: %v", err))
			}

			fmt.Printf("实验详情:\n")
			fmt.Printf("名称: %s\n", experiment.Name)
			fmt.Printf("命名空间: %s\n", experiment.Namespace)
			fmt.Printf("类型: %s\n", experiment.Type)
			fmt.Printf("状态: %s\n", experiment.Status)
			fmt.Printf("描述: %s\n", experiment.Description)
			fmt.Printf("创建时间: %s\n", experiment.CreatedAt)
			fmt.Printf("配置: %+v\n", experiment.Config)
		},
	}

	return cmd
}

func newExperimentStopCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop [实验名称]",
		Short: "停止运行中的混沌实验",
		Long:  `停止指定的运行中混沌实验，触发自动回滚。`,
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			name := args[0]
			
			manager, err := chaos.NewManager(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建混沌管理器失败: %v", err))
			}

			err = manager.Stop(name)
			if err != nil {
				er(fmt.Sprintf("停止实验失败: %v", err))
			}

			fmt.Printf("实验已停止: %s\n", name)
		},
	}

	return cmd
}

func newExperimentDeleteCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete [实验名称]",
		Short: "删除混沌实验",
		Long:  `删除指定的混沌实验资源。`,
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			name := args[0]
			
			manager, err := chaos.NewManager(kubeconfig, namespace)
			if err != nil {
				er(fmt.Sprintf("创建混沌管理器失败: %v", err))
			}

			err = manager.Delete(name)
			if err != nil {
				er(fmt.Sprintf("删除实验失败: %v", err))
			}

			fmt.Printf("实验已删除: %s\n", name)
		},
	}

	return cmd
}
