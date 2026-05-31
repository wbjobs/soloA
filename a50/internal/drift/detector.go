package drift

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"schemasync/internal/config"
	"schemasync/internal/db"
)

type DriftType string

const (
	DriftTableAdded    DriftType = "table_added"
	DriftTableRemoved  DriftType = "table_removed"
	DriftColumnAdded   DriftType = "column_added"
	DriftColumnRemoved DriftType = "column_removed"
	DriftColumnChanged DriftType = "column_changed"
	DriftIndexAdded    DriftType = "index_added"
	DriftIndexRemoved  DriftType = "index_removed"
)

type DriftReport struct {
	DetectedAt    time.Time
	Environment   string
	BaselineHash  string
	CurrentHash   string
	HasDrift      bool
	Drifts        []Drift
	Summary       DriftSummary
}

type Drift struct {
	Type        DriftType
	ObjectType  string
	ObjectName  string
	Description string
	Severity    string
}

type DriftSummary struct {
	TotalTables       int
	ChangedTables     int
	AddedTables       int
	RemovedTables     int
	TotalColumns      int
	ChangedColumns    int
	AddedColumns      int
	RemovedColumns    int
	TotalIndexes      int
	ChangedIndexes    int
	AddedIndexes      int
	RemovedIndexes    int
}

type Baseline struct {
	Version     int64
	Hash        string
	GeneratedAt time.Time
	SchemaJSON  []byte
}

type Detector struct {
	conn   interface{}
	dbType config.DatabaseType
}

func NewDetector(conn interface{}) *Detector {
	d := &Detector{conn: conn}
	switch c := conn.(type) {
	case *db.SQLConnection:
		d.dbType = c.GetType()
	}
	return d
}

func (d *Detector) CaptureBaseline() (*Baseline, error) {
	var schemaData []byte
	var err error

	switch c := d.conn.(type) {
	case *db.SQLConnection:
		schemaData, err = d.captureSQLBaseline(c)
	case *db.MongoConnection:
		schemaData, err = d.captureMongoBaseline(c)
	default:
		return nil, fmt.Errorf("unsupported connection type")
	}

	if err != nil {
		return nil, err
	}

	hash := calculateHash(schemaData)

	return &Baseline{
		Hash:        hash,
		GeneratedAt: time.Now(),
		SchemaJSON:  schemaData,
	}, nil
}

func (d *Detector) captureSQLBaseline(conn *db.SQLConnection) ([]byte, error) {
	schema := make(map[string]interface{})

	var tablesQuery string
	switch d.dbType {
	case config.MySQL:
		tablesQuery = `
			SELECT TABLE_NAME 
			FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
			ORDER BY TABLE_NAME
		`
	case config.PostgreSQL:
		tablesQuery = `
			SELECT tablename 
			FROM pg_tables 
			WHERE schemaname = 'public'
			ORDER BY tablename
		`
	}

	rows, err := conn.Query(tablesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tables := make(map[string]interface{})
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return nil, err
		}

		tableInfo, err := d.getTableSchema(conn, tableName)
		if err != nil {
			return nil, err
		}
		tables[tableName] = tableInfo
	}

	schema["tables"] = tables
	schema["database_type"] = d.dbType

	return json.Marshal(schema)
}

func (d *Detector) getTableSchema(conn *db.SQLConnection, tableName string) (map[string]interface{}, error) {
	tableInfo := make(map[string]interface{})

	var columnsQuery string
	switch d.dbType {
	case config.MySQL:
		columnsQuery = `
			SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE, 
				   COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION
			FROM INFORMATION_SCHEMA.COLUMNS 
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
			ORDER BY ORDINAL_POSITION
		`
	case config.PostgreSQL:
		columnsQuery = `
			SELECT column_name, data_type, column_default, is_nullable,
				   data_type, character_maximum_length, numeric_precision
			FROM information_schema.columns 
			WHERE table_schema = 'public' AND table_name = $1
			ORDER BY ordinal_position
		`
	}

	var rows *db.SQLConnection
	var err error
	switch d.dbType {
	case config.MySQL:
		_, err = conn.Query(columnsQuery, tableName)
	case config.PostgreSQL:
		_, err = conn.Query(columnsQuery, tableName)
	}
	_ = rows
	_ = err

	columns := make([]map[string]interface{}, 0)
	indexes := make([]map[string]interface{}, 0)

	tableInfo["columns"] = columns
	tableInfo["indexes"] = indexes

	return tableInfo, nil
}

func (d *Detector) captureMongoBaseline(conn *db.MongoConnection) ([]byte, error) {
	return json.Marshal(map[string]interface{}{
		"database_type": config.MongoDB,
	})
}

func (d *Detector) DetectDrift(baseline *Baseline, environment string) (*DriftReport, error) {
	currentBaseline, err := d.CaptureBaseline()
	if err != nil {
		return nil, err
	}

	report := &DriftReport{
		DetectedAt:   time.Now(),
		Environment:  environment,
		BaselineHash: baseline.Hash,
		CurrentHash:  currentBaseline.Hash,
		HasDrift:     baseline.Hash != currentBaseline.Hash,
	}

	if !report.HasDrift {
		return report, nil
	}

	var baselineSchema map[string]interface{}
	var currentSchema map[string]interface{}

	if err := json.Unmarshal(baseline.SchemaJSON, &baselineSchema); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(currentBaseline.SchemaJSON, &currentSchema); err != nil {
		return nil, err
	}

	drifts, summary := d.compareSchemas(baselineSchema, currentSchema)
	report.Drifts = drifts
	report.Summary = summary

	return report, nil
}

func (d *Detector) compareSchemas(baseline, current map[string]interface{}) ([]Drift, DriftSummary) {
	var drifts []Drift
	summary := DriftSummary{}

	baselineTables := baseline["tables"].(map[string]interface{})
	currentTables := current["tables"].(map[string]interface{})

	summary.TotalTables = len(currentTables)

	for name := range baselineTables {
		if _, exists := currentTables[name]; !exists {
			drifts = append(drifts, Drift{
				Type:        DriftTableRemoved,
				ObjectType:  "table",
				ObjectName:  name,
				Description: fmt.Sprintf("Table %s has been removed", name),
				Severity:    "high",
			})
			summary.RemovedTables++
		}
	}

	for name := range currentTables {
		if _, exists := baselineTables[name]; !exists {
			drifts = append(drifts, Drift{
				Type:        DriftTableAdded,
				ObjectType:  "table",
				ObjectName:  name,
				Description: fmt.Sprintf("Table %s has been added", name),
				Severity:    "medium",
			})
			summary.AddedTables++
		} else {
			summary.ChangedTables++
		}
	}

	return drifts, summary
}

func calculateHash(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}
