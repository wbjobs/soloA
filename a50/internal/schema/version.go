package schema

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"schemasync/internal/config"
	"schemasync/internal/db"
)

type MigrationStatus string

const (
	StatusPending   MigrationStatus = "pending"
	StatusApplied   MigrationStatus = "applied"
	StatusRolledBack MigrationStatus = "rolled_back"
	StatusFailed    MigrationStatus = "failed"
)

type Migration struct {
	Version     int64           `json:"version"`
	Name        string          `json:"name"`
	UpSQL       string          `json:"up_sql"`
	DownSQL     string          `json:"down_sql"`
	Checksum    string          `json:"checksum"`
	Dependencies []int64        `json:"dependencies"`
	Branch      string          `json:"branch"`
	BatchID     string          `json:"batch_id"`
	AppliedAt   time.Time       `json:"applied_at"`
	Status      MigrationStatus `json:"status"`
	Environment string          `json:"environment"`
}

type SchemaVersion struct {
	CurrentVersion int64
	Migrations     []*Migration
	Branches       map[string][]*Migration
	DependencyGraph map[int64][]int64
}

func CalculateChecksum(upSQL, downSQL string) string {
	h := sha256.New()
	h.Write([]byte(upSQL + "|" + downSQL))
	return hex.EncodeToString(h.Sum(nil))
}

func (m *Migration) GenerateChecksum() {
	m.Checksum = CalculateChecksum(m.UpSQL, m.DownSQL)
}

func ValidateChecksum(m *Migration) bool {
	return m.Checksum == CalculateChecksum(m.UpSQL, m.DownSQL)
}

type VersionManager struct {
	conn        interface{}
	dbType      config.DatabaseType
	environment string
}

func NewVersionManager(cfg *config.DatabaseConfig, environment string) (*VersionManager, error) {
	conn, err := db.GetConnection(cfg)
	if err != nil {
		return nil, err
	}

	vm := &VersionManager{
		conn:        conn,
		environment: environment,
	}

	switch c := conn.(type) {
	case *db.SQLConnection:
		vm.dbType = c.GetType()
		if err := vm.ensureVersionTable(c); err != nil {
			return nil, err
		}
	case *db.MongoConnection:
		vm.dbType = config.MongoDB
		if err := vm.ensureVersionCollection(c); err != nil {
			return nil, err
		}
	}

	return vm, nil
}

func (vm *VersionManager) ensureVersionTable(conn *db.SQLConnection) error {
	var createTableSQL string
	switch vm.dbType {
	case config.MySQL:
		createTableSQL = `
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version BIGINT NOT NULL PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				checksum VARCHAR(64) NOT NULL,
				branch VARCHAR(100) NOT NULL DEFAULT 'main',
				batch_id VARCHAR(36) NOT NULL,
				up_sql TEXT,
				down_sql TEXT,
				dependencies TEXT,
				environment VARCHAR(100) NOT NULL,
				status VARCHAR(20) NOT NULL,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				INDEX idx_batch (batch_id),
				INDEX idx_branch (branch),
				INDEX idx_status (status)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`
	case config.PostgreSQL:
		createTableSQL = `
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version BIGINT NOT NULL PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				checksum VARCHAR(64) NOT NULL,
				branch VARCHAR(100) NOT NULL DEFAULT 'main',
				batch_id VARCHAR(36) NOT NULL,
				up_sql TEXT,
				down_sql TEXT,
				dependencies TEXT,
				environment VARCHAR(100) NOT NULL,
				status VARCHAR(20) NOT NULL,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`
	}

	_, err := conn.Exec(createTableSQL)
	return err
}

func (vm *VersionManager) ensureVersionCollection(conn *db.MongoConnection) error {
	_ = conn
	return nil
}

func (vm *VersionManager) GetCurrentVersion() (int64, error) {
	switch c := vm.conn.(type) {
	case *db.SQLConnection:
		var version int64
		err := c.QueryRow(`
			SELECT COALESCE(MAX(version), 0) 
			FROM schema_migrations 
			WHERE status = 'applied' AND environment = ?
		`, vm.environment).Scan(&version)
		return version, err
	}
	return 0, fmt.Errorf("unsupported connection type")
}

func (vm *VersionManager) RecordMigration(migration *Migration) error {
	migration.Environment = vm.environment
	migration.AppliedAt = time.Now()

	switch c := vm.conn.(type) {
	case *db.SQLConnection:
		deps := ""
		if len(migration.Dependencies) > 0 {
			depStrs := make([]string, len(migration.Dependencies))
			for i, d := range migration.Dependencies {
				depStrs[i] = fmt.Sprintf("%d", d)
			}
			deps = strings.Join(depStrs, ",")
		}
		_, err := c.Exec(`
			INSERT INTO schema_migrations 
			(version, name, checksum, branch, batch_id, up_sql, down_sql, dependencies, environment, status, applied_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE 
				status = VALUES(status),
				applied_at = VALUES(applied_at)
		`, migration.Version, migration.Name, migration.Checksum, migration.Branch,
			migration.BatchID, migration.UpSQL, migration.DownSQL, deps,
			migration.Environment, migration.Status, migration.AppliedAt)
		return err
	}
	return fmt.Errorf("unsupported connection type")
}

func (vm *VersionManager) GetMigrationsByBatch(batchID string) ([]*Migration, error) {
	switch c := vm.conn.(type) {
	case *db.SQLConnection:
		rows, err := c.Query(`
			SELECT version, name, checksum, branch, batch_id, up_sql, down_sql, status, applied_at
			FROM schema_migrations
			WHERE batch_id = ? AND environment = ?
			ORDER BY version DESC
		`, batchID, vm.environment)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var migrations []*Migration
		for rows.Next() {
			m := &Migration{}
			err := rows.Scan(&m.Version, &m.Name, &m.Checksum, &m.Branch,
				&m.BatchID, &m.UpSQL, &m.DownSQL, &m.Status, &m.AppliedAt)
			if err != nil {
				return nil, err
			}
			migrations = append(migrations, m)
		}
		return migrations, nil
	}
	return nil, fmt.Errorf("unsupported connection type")
}

func (vm *VersionManager) GetLastBatch() (string, error) {
	switch c := vm.conn.(type) {
	case *db.SQLConnection:
		var batchID string
		err := c.QueryRow(`
			SELECT batch_id 
			FROM schema_migrations 
			WHERE environment = ? AND status = 'applied'
			ORDER BY applied_at DESC 
			LIMIT 1
		`, vm.environment).Scan(&batchID)
		return batchID, err
	}
	return "", fmt.Errorf("unsupported connection type")
}

func (vm *VersionManager) TopologicalSort(migrations []*Migration) ([]*Migration, error) {
	graph := make(map[int64][]int64)
	inDegree := make(map[int64]int)
	versionMap := make(map[int64]*Migration)

	for _, m := range migrations {
		graph[m.Version] = []int64{}
		inDegree[m.Version] = 0
		versionMap[m.Version] = m
	}

	for _, m := range migrations {
		for _, dep := range m.Dependencies {
			if _, exists := versionMap[dep]; exists {
				graph[dep] = append(graph[dep], m.Version)
				inDegree[m.Version]++
			}
		}
	}

	var queue []int64
	for v, d := range inDegree {
		if d == 0 {
			queue = append(queue, v)
		}
	}

	var result []*Migration
	for len(queue) > 0 {
		sort.Slice(queue, func(i, j int) bool { return queue[i] < queue[j] })
		v := queue[0]
		queue = queue[1:]
		result = append(result, versionMap[v])

		for _, neighbor := range graph[v] {
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	if len(result) != len(migrations) {
		return nil, fmt.Errorf("cyclic dependency detected in migrations")
	}

	return result, nil
}
