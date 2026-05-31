package ddl

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"schemasync/internal/config"
	"schemasync/internal/db"
)

type OnlineDDLOptions struct {
	MySQLTool       string
	MaxLagSeconds   int
	ChunkSize       int
	AllowConcurrent bool
}

type OnlineDDLExecutor struct {
	conn    interface{}
	dbType  config.DatabaseType
	options OnlineDDLOptions
}

func NewOnlineDDLExecutor(conn interface{}, options OnlineDDLOptions) *OnlineDDLExecutor {
	return &OnlineDDLExecutor{
		conn:    conn,
		options: options,
	}
}

func (e *OnlineDDLExecutor) Execute(sql string) error {
	switch c := e.conn.(type) {
	case *db.SQLConnection:
		e.dbType = c.GetType()
		switch e.dbType {
		case config.MySQL:
			return e.executeMySQLOnlineDDL(c, sql)
		case config.PostgreSQL:
			return e.executePostgreSQLOnlineDDL(c, sql)
		}
	case *db.MongoConnection:
		e.dbType = config.MongoDB
		return e.executeMongoDBOnlineDDL(c, sql)
	}
	return fmt.Errorf("unsupported database type")
}

func (e *OnlineDDLExecutor) executeMySQLOnlineDDL(conn *db.SQLConnection, sql string) error {
	tool := e.options.MySQLTool
	if tool == "" {
		tool = "direct"
	}

	switch strings.ToLower(tool) {
	case "gh-ost":
		return e.executeWithGhost(conn, sql)
	case "pt-online-schema-change":
		return e.executeWithPtOSC(conn, sql)
	default:
		return e.executeDirect(conn, sql)
	}
}

func (e *OnlineDDLExecutor) executeWithGhost(conn *db.SQLConnection, sql string) error {
	tableName, alterClause, err := parseAlterTable(sql)
	if err != nil {
		return err
	}

	args := []string{
		"--execute",
		"--alter=" + alterClause,
		"--table=" + tableName,
		fmt.Sprintf("--max-lag-millis=%d", e.options.MaxLagSeconds*1000),
		fmt.Sprintf("--chunk-size=%d", e.options.ChunkSize),
	}

	cmd := exec.Command("gh-ost", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gh-ost failed: %s\n%s", err, string(output))
	}
	return nil
}

func (e *OnlineDDLExecutor) executeWithPtOSC(conn *db.SQLConnection, sql string) error {
	tableName, alterClause, err := parseAlterTable(sql)
	if err != nil {
		return err
	}

	dsn := fmt.Sprintf("D=%s,t=%s", "database", tableName)
	args := []string{
		dsn,
		"--alter=" + alterClause,
		"--execute",
	}

	cmd := exec.Command("pt-online-schema-change", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pt-online-schema-change failed: %s\n%s", err, string(output))
	}
	return nil
}

func (e *OnlineDDLExecutor) executeDirect(conn *db.SQLConnection, sql string) error {
	_, err := conn.Exec(sql)
	return err
}

func (e *OnlineDDLExecutor) executePostgreSQLOnlineDDL(conn *db.SQLConnection, sql string) error {
	if e.options.AllowConcurrent && isCreateIndex(sql) {
		sql = strings.Replace(sql, "CREATE INDEX", "CREATE INDEX CONCURRENTLY", 1)
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Hour)
		defer cancel()
		_, err := conn.ExecContext(ctx, sql)
		return err
	}
	_, err := conn.Exec(sql)
	return err
}

func (e *OnlineDDLExecutor) executeMongoDBOnlineDDL(conn *db.MongoConnection, sql string) error {
	indexSpecs, err := parseMongoDBIndexes(sql)
	if err != nil {
		return err
	}

	for _, spec := range indexSpecs {
		collection := conn.DB.Collection(spec.Collection)
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Hour)
		defer cancel()

		indexView := collection.Indexes()
		_, err = indexView.CreateOne(ctx, spec)
		if err != nil {
			return err
		}
	}
	return nil
}

func parseAlterTable(sql string) (tableName string, alterClause string, err error) {
	sql = strings.TrimSpace(strings.ToLower(sql))
	if !strings.HasPrefix(sql, "alter table") {
		return "", "", fmt.Errorf("not an ALTER TABLE statement")
	}

	parts := strings.SplitN(sql, " ", 4)
	if len(parts) < 4 {
		return "", "", fmt.Errorf("invalid ALTER TABLE syntax")
	}

	tableName = parts[2]
	alterClause = parts[3]
	return tableName, alterClause, nil
}

func isCreateIndex(sql string) bool {
	sql = strings.TrimSpace(strings.ToLower(sql))
	return strings.HasPrefix(sql, "create index") && !strings.Contains(sql, "concurrently")
}

type MongoIndexSpec struct {
	Collection string
	Keys       map[string]int
	Name       string
	Unique     bool
	Sparse     bool
}

func parseMongoDBIndexes(sql string) ([]MongoIndexSpec, error) {
	var specs []MongoIndexSpec
	sql = strings.TrimSpace(sql)

	if strings.HasPrefix(sql, "db.") && strings.Contains(sql, ".createIndex(") {
		parts := strings.SplitN(sql, ".", 3)
		if len(parts) < 3 {
			return nil, fmt.Errorf("invalid MongoDB syntax")
		}
		collection := parts[1]
		specs = append(specs, MongoIndexSpec{
			Collection: collection,
			Keys:       map[string]int{"_id": 1},
		})
	}

	return specs, nil
}
