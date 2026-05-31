package migration

import (
	"database/sql"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"schemasync/internal/config"
	"schemasync/internal/db"
	"schemasync/internal/ddl"
	"schemasync/internal/schema"

	"github.com/google/uuid"
)

type MigrationEngine struct {
	cfg           *config.Config
	environment   string
	vm            *schema.VersionManager
	ddlExecutor   *ddl.OnlineDDLExecutor
	conn          interface{}
	dbType        config.DatabaseType
}

type MigrationResult struct {
	Success   bool
	BatchID   string
	Migrations []*schema.Migration
	Errors    []error
	Duration  time.Duration
}

func NewMigrationEngine(cfg *config.Config, environment string) (*MigrationEngine, error) {
	dbCfg := cfg.GetDatabase(environment)
	if dbCfg == nil {
		return nil, fmt.Errorf("environment %s not found in configuration", environment)
	}

	vm, err := schema.NewVersionManager(dbCfg, environment)
	if err != nil {
		return nil, err
	}

	conn, err := db.GetConnection(dbCfg)
	if err != nil {
		return nil, err
	}

	options := ddl.OnlineDDLOptions{
		MySQLTool:       cfg.OnlineDDL.MySQLTool,
		MaxLagSeconds:   5,
		ChunkSize:       1000,
		AllowConcurrent: true,
	}

	return &MigrationEngine{
		cfg:         cfg,
		environment: environment,
		vm:          vm,
		conn:        conn,
		ddlExecutor: ddl.NewOnlineDDLExecutor(conn, options),
	}, nil
}

func (e *MigrationEngine) LoadMigrations() ([]*schema.Migration, error) {
	dir := e.cfg.Migrations.Directory
	if dir == "" {
		dir = "migrations"
	}

	files, err := ioutil.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*schema.Migration{}, nil
		}
		return nil, err
	}

	var migrations []*schema.Migration
	re := regexp.MustCompile(`^(\d+)_([a-zA-Z0-9_]+)\.(up|down)\.sql$`)

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		matches := re.FindStringSubmatch(file.Name())
		if len(matches) != 4 {
			continue
		}

		version, err := strconv.ParseInt(matches[1], 10, 64)
		if err != nil {
			continue
		}

		name := matches[2]
		direction := matches[3]

		content, err := ioutil.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			return nil, err
		}

		var existing *schema.Migration
		for _, m := range migrations {
			if m.Version == version {
				existing = m
				break
			}
		}

		if existing == nil {
			existing = &schema.Migration{
				Version: version,
				Name:    name,
				Branch:  "main",
			}
			migrations = append(migrations, existing)
		}

		if direction == "up" {
			existing.UpSQL = string(content)
		} else {
			existing.DownSQL = string(content)
		}
	}

	for _, m := range migrations {
		m.GenerateChecksum()
	}

	return migrations, nil
}

func (e *MigrationEngine) Migrate() (*MigrationResult, error) {
	start := time.Now()
	result := &MigrationResult{
		BatchID: uuid.New().String(),
		Success: true,
	}

	migrations, err := e.LoadMigrations()
	if err != nil {
		return nil, err
	}

	currentVersion, err := e.vm.GetCurrentVersion()
	if err != nil {
		return nil, err
	}

	var pendingMigrations []*schema.Migration
	for _, m := range migrations {
		if m.Version > currentVersion {
			pendingMigrations = append(pendingMigrations, m)
		}
	}

	if len(pendingMigrations) == 0 {
		result.Duration = time.Since(start)
		return result, nil
	}

	sorted, err := e.vm.TopologicalSort(pendingMigrations)
	if err != nil {
		return nil, err
	}

	for _, m := range sorted {
		m.BatchID = result.BatchID
		m.Status = schema.StatusApplied

		if err := e.executeMigration(m.UpSQL, m); err != nil {
			result.Errors = append(result.Errors, err)
			m.Status = schema.StatusFailed
			result.Success = false
			if err := e.rollbackMigrations(result.Migrations); err != nil {
				result.Errors = append(result.Errors, fmt.Errorf("rollback failed: %w", err))
			}
			break
		}

		if err := e.vm.RecordMigration(m); err != nil {
			result.Errors = append(result.Errors, err)
			result.Success = false
			break
		}

		result.Migrations = append(result.Migrations, m)
	}

	result.Duration = time.Since(start)
	return result, nil
}

func (e *MigrationEngine) executeMigration(sql string, migration *schema.Migration) error {
	statements := splitStatements(sql)

	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}

		if e.dbType == "" {
			switch c := e.conn.(type) {
			case *db.SQLConnection:
				e.dbType = c.GetType()
			case *db.MongoConnection:
				e.dbType = config.MongoDB
			}
		}

		if err := e.ddlExecutor.Execute(stmt); err != nil {
			return fmt.Errorf("migration %d failed: %w", migration.Version, err)
		}
	}

	return nil
}

func (e *MigrationEngine) Rollback(batchID string) (*MigrationResult, error) {
	start := time.Now()
	result := &MigrationResult{
		BatchID: batchID,
		Success: true,
	}

	if batchID == "" {
		var err error
		batchID, err = e.vm.GetLastBatch()
		if err != nil {
			if err == sql.ErrNoRows {
				result.Duration = time.Since(start)
				return result, nil
			}
			return nil, err
		}
		result.BatchID = batchID
	}

	migrations, err := e.vm.GetMigrationsByBatch(batchID)
	if err != nil {
		return nil, err
	}

	for _, m := range migrations {
		m.Status = schema.StatusRolledBack

		if m.DownSQL == "" {
			result.Errors = append(result.Errors, fmt.Errorf("no down SQL for migration %d", m.Version))
			continue
		}

		if err := e.executeMigration(m.DownSQL, m); err != nil {
			result.Errors = append(result.Errors, err)
			result.Success = false
			break
		}

		if err := e.vm.RecordMigration(m); err != nil {
			result.Errors = append(result.Errors, err)
			result.Success = false
			break
		}

		result.Migrations = append(result.Migrations, m)
	}

	result.Duration = time.Since(start)
	return result, nil
}

func (e *MigrationEngine) rollbackMigrations(migrations []*schema.Migration) error {
	for i := len(migrations) - 1; i >= 0; i-- {
		m := migrations[i]
		if m.DownSQL == "" {
			continue
		}

		if err := e.executeMigration(m.DownSQL, m); err != nil {
			return err
		}

		m.Status = schema.StatusRolledBack
		if err := e.vm.RecordMigration(m); err != nil {
			return err
		}
	}
	return nil
}

func (e *MigrationEngine) VersionManager() *schema.VersionManager {
	return e.vm
}

func splitStatements(sql string) []string {
	var statements []string
	var current strings.Builder
	inString := false
	var stringChar rune

	for _, ch := range sql {
		if inString {
			current.WriteRune(ch)
			if ch == stringChar {
				inString = false
			}
			continue
		}

		if ch == '\'' || ch == '"' {
			inString = true
			stringChar = ch
			current.WriteRune(ch)
			continue
		}

		if ch == ';' {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}

		current.WriteRune(ch)
	}

	stmt := strings.TrimSpace(current.String())
	if stmt != "" {
		statements = append(statements, stmt)
	}

	return statements
}
