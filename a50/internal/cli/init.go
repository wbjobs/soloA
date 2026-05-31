package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化 schemasync 项目",
	Long:  `创建配置文件模板和迁移目录结构`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := initializeProject(); err != nil {
			fmt.Printf("初始化失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("项目初始化成功！")
		fmt.Printf("配置文件: %s\n", cfgFile)
		fmt.Println("请根据实际情况修改配置文件后使用。")
	},
}

func initializeProject() error {
	if _, err := os.Stat(cfgFile); err == nil {
		return fmt.Errorf("配置文件 %s 已存在", cfgFile)
	}

	defaultConfig := map[string]interface{}{
		"environments": map[string]interface{}{
			"development": map[string]interface{}{
				"type":     "mysql",
				"host":     "localhost",
				"port":     3306,
				"username": "root",
				"password": "",
				"database": "myapp_dev",
			},
			"test": map[string]interface{}{
				"type":     "mysql",
				"host":     "localhost",
				"port":     3306,
				"username": "root",
				"password": "",
				"database": "myapp_test",
			},
			"production": map[string]interface{}{
				"type":     "mysql",
				"host":     "db.example.com",
				"port":     3306,
				"username": "root",
				"password": "secret",
				"database": "myapp_prod",
			},
		},
		"redis": map[string]interface{}{
			"host":     "localhost",
			"port":     6379,
			"password": "",
			"db":       0,
			"nodes":    []string{},
		},
		"grpc": map[string]interface{}{
			"address":    "localhost:50051",
			"node_id":    "node-1",
			"cluster_id": "schemasync-cluster",
		},
		"migrations": map[string]interface{}{
			"directory":  "migrations",
			"batch_size": 10,
		},
		"online_ddl": map[string]interface{}{
			"mysql_tool": "direct",
		},
	}

	data, err := yaml.Marshal(defaultConfig)
	if err != nil {
		return err
	}

	if err := os.WriteFile(cfgFile, data, 0644); err != nil {
		return err
	}

	migrationsDir := "migrations"
	if err := os.MkdirAll(migrationsDir, 0755); err != nil {
		return err
	}

	exampleMigrationDir := filepath.Join(migrationsDir, "000001_initial_schema")
	if err := os.MkdirAll(exampleMigrationDir, 0755); err != nil {
		return err
	}

	exampleUp := `-- 创建用户表
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建索引
CREATE INDEX idx_users_email ON users(email);
`
	if err := os.WriteFile(filepath.Join(exampleMigrationDir, "000001_initial_schema.up.sql"), []byte(exampleUp), 0644); err != nil {
		return err
	}

	exampleDown := `-- 删除索引
DROP INDEX idx_users_email ON users;

-- 删除用户表
DROP TABLE IF EXISTS users;
`
	if err := os.WriteFile(filepath.Join(exampleMigrationDir, "000001_initial_schema.down.sql"), []byte(exampleDown), 0644); err != nil {
		return err
	}

	return nil
}
