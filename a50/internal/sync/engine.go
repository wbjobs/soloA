package sync

import (
	"fmt"
	"reflect"
	"strings"

	"schemasync/internal/config"
	"schemasync/internal/db"
)

type ConflictType string

const (
	ConflictColumnType       ConflictType = "column_type_incompatible"
	ConflictIndexNaming      ConflictType = "index_naming_conflict"
	ConflictDefaultValue     ConflictType = "default_value_difference"
	ConflictMissingTable     ConflictType = "missing_table"
	ConflictMissingColumn    ConflictType = "missing_column"
	ConflictPrimaryKey       ConflictType = "primary_key_difference"
)

type ConflictResolution string

const (
	ResolveUseMaster   ConflictResolution = "use_master"
	ResolveUseSlave    ConflictResolution = "use_slave"
	ResolveManual      ConflictResolution = "manual"
	ResolveRenameIndex ConflictResolution = "rename_index"
)

type SchemaObject struct {
	Type       string
	Name       string
	Definition string
	Metadata   map[string]interface{}
}

type Conflict struct {
	Type         ConflictType
	ObjectA      SchemaObject
	ObjectB      SchemaObject
	Resolution   ConflictResolution
	Description  string
	Resolved     bool
}

type SyncDirection string

const (
	DirectionMasterToSlave SyncDirection = "master_to_slave"
	DirectionSlaveToMaster SyncDirection = "slave_to_master"
	DirectionBidirectional SyncDirection = "bidirectional"
)

type SyncEngine struct {
	master    interface{}
	slave     interface{}
	dbType    config.DatabaseType
	direction SyncDirection
}

func NewSyncEngine(master, slave interface{}, direction SyncDirection) *SyncEngine {
	return &SyncEngine{
		master:    master,
		slave:     slave,
		direction: direction,
	}
}

func (e *SyncEngine) CompareSchemas() ([]Conflict, error) {
	var conflicts []Conflict
	var err error

	switch m := e.master.(type) {
	case *db.SQLConnection:
		e.dbType = m.GetType()
		conflicts, err = e.compareSQLSchemas(m, e.slave.(*db.SQLConnection))
	case *db.MongoConnection:
		e.dbType = config.MongoDB
		conflicts, err = e.compareMongoSchemas(m, e.slave.(*db.MongoConnection))
	}

	return conflicts, err
}

func (e *SyncEngine) compareSQLSchemas(master, slave *db.SQLConnection) ([]Conflict, error) {
	var conflicts []Conflict

	masterTables, err := e.getSQLTables(master)
	if err != nil {
		return nil, err
	}

	slaveTables, err := e.getSQLTables(slave)
	if err != nil {
		return nil, err
	}

	for tableName, masterTable := range masterTables {
		slaveTable, exists := slaveTables[tableName]
		if !exists {
			conflicts = append(conflicts, Conflict{
				Type:        ConflictMissingTable,
				ObjectA:     masterTable,
				Description: fmt.Sprintf("Table %s exists in master but not in slave", tableName),
			})
			continue
		}

		tableConflicts := e.compareTableSchemas(masterTable, slaveTable)
		conflicts = append(conflicts, tableConflicts...)
	}

	for tableName := range slaveTables {
		if _, exists := masterTables[tableName]; !exists {
			conflicts = append(conflicts, Conflict{
				Type:        ConflictMissingTable,
				ObjectB:     slaveTables[tableName],
				Description: fmt.Sprintf("Table %s exists in slave but not in master", tableName),
			})
		}
	}

	return conflicts, nil
}

func (e *SyncEngine) getSQLTables(conn *db.SQLConnection) (map[string]SchemaObject, error) {
	tables := make(map[string]SchemaObject)

	var query string
	switch e.dbType {
	case config.MySQL:
		query = `
			SELECT TABLE_NAME 
			FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
		`
	case config.PostgreSQL:
		query = `
			SELECT tablename 
			FROM pg_tables 
			WHERE schemaname = 'public'
		`
	}

	rows, err := conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}

		columns, err := e.getTableColumns(conn, name)
		if err != nil {
			return nil, err
		}

		indexes, err := e.getTableIndexes(conn, name)
		if err != nil {
			return nil, err
		}

		tables[name] = SchemaObject{
			Type: "table",
			Name: name,
			Metadata: map[string]interface{}{
				"columns": columns,
				"indexes": indexes,
			},
		}
	}

	return tables, nil
}

func (e *SyncEngine) getTableColumns(conn *db.SQLConnection, tableName string) (map[string]SchemaObject, error) {
	columns := make(map[string]SchemaObject)

	var query string
	switch e.dbType {
	case config.MySQL:
		query = `
			SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE
			FROM INFORMATION_SCHEMA.COLUMNS 
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
			ORDER BY ORDINAL_POSITION
		`
	case config.PostgreSQL:
		query = `
			SELECT column_name, data_type, column_default, is_nullable, data_type
			FROM information_schema.columns 
			WHERE table_schema = 'public' AND table_name = $1
			ORDER BY ordinal_position
		`
	}

	var rows *db.SQLConnection
	var err error
	switch e.dbType {
	case config.MySQL:
		_, err = conn.Query(query, tableName)
	case config.PostgreSQL:
		_, err = conn.Query(query, tableName)
	}

	if err != nil {
		return nil, err
	}

	_ = rows

	return columns, nil
}

func (e *SyncEngine) getTableIndexes(conn *db.SQLConnection, tableName string) (map[string]SchemaObject, error) {
	indexes := make(map[string]SchemaObject)
	return indexes, nil
}

func (e *SyncEngine) compareTableSchemas(master, slave SchemaObject) []Conflict {
	var conflicts []Conflict

	masterCols := master.Metadata["columns"].(map[string]SchemaObject)
	slaveCols := slave.Metadata["columns"].(map[string]SchemaObject)

	for colName, masterCol := range masterCols {
		slaveCol, exists := slaveCols[colName]
		if !exists {
			conflicts = append(conflicts, Conflict{
				Type:        ConflictMissingColumn,
				ObjectA:     masterCol,
				Description: fmt.Sprintf("Column %s.%s exists in master but not in slave", master.Name, colName),
			})
			continue
		}

		colConflicts := e.compareColumns(masterCol, slaveCol)
		conflicts = append(conflicts, colConflicts...)
	}

	masterIdx := master.Metadata["indexes"].(map[string]SchemaObject)
	slaveIdx := slave.Metadata["indexes"].(map[string]SchemaObject)

	conflicts = append(conflicts, e.compareIndexes(masterIdx, slaveIdx)...)

	return conflicts
}

func (e *SyncEngine) compareColumns(master, slave SchemaObject) []Conflict {
	var conflicts []Conflict

	masterType := fmt.Sprintf("%v", master.Metadata["data_type"])
	slaveType := fmt.Sprintf("%v", slave.Metadata["data_type"])

	if !strings.EqualFold(masterType, slaveType) {
		conflicts = append(conflicts, Conflict{
			Type:        ConflictColumnType,
			ObjectA:     master,
			ObjectB:     slave,
			Description: fmt.Sprintf("Column %s has incompatible types: master=%s, slave=%s", master.Name, masterType, slaveType),
		})
	}

	masterDefault := master.Metadata["default_value"]
	slaveDefault := slave.Metadata["default_value"]

	if masterDefault != slaveDefault {
		if !reflect.DeepEqual(masterDefault, slaveDefault) {
			conflicts = append(conflicts, Conflict{
				Type:        ConflictDefaultValue,
				ObjectA:     master,
				ObjectB:     slave,
				Description: fmt.Sprintf("Column %s has different default values", master.Name),
			})
		}
	}

	return conflicts
}

func (e *SyncEngine) compareIndexes(master, slave map[string]SchemaObject) []Conflict {
	var conflicts []Conflict

	for idxName, masterIdx := range master {
		if _, exists := slave[idxName]; !exists {
			continue
		}

		for slaveIdxName := range slave {
			if idxName != slaveIdxName {
				conflicts = append(conflicts, Conflict{
					Type:        ConflictIndexNaming,
					ObjectA:     masterIdx,
					Description: fmt.Sprintf("Potential index naming conflict between %s and %s", idxName, slaveIdxName),
				})
			}
		}
	}

	return conflicts
}

func (e *SyncEngine) compareMongoSchemas(master, slave *db.MongoConnection) ([]Conflict, error) {
	var conflicts []Conflict
	return conflicts, nil
}

func (e *SyncEngine) ResolveConflicts(conflicts []Conflict) error {
	for i := range conflicts {
		conflict := &conflicts[i]
		switch conflict.Type {
		case ConflictColumnType:
			conflict.Resolution = ResolveUseMaster
		case ConflictDefaultValue:
			conflict.Resolution = ResolveUseMaster
		case ConflictIndexNaming:
			conflict.Resolution = ResolveRenameIndex
		case ConflictMissingTable, ConflictMissingColumn:
			if e.direction == DirectionMasterToSlave || e.direction == DirectionBidirectional {
				conflict.Resolution = ResolveUseMaster
			} else {
				conflict.Resolution = ResolveUseSlave
			}
		}
		conflict.Resolved = true
	}
	return nil
}

func (e *SyncEngine) Sync(conflicts []Conflict) error {
	for _, conflict := range conflicts {
		if !conflict.Resolved {
			continue
		}
		switch conflict.Resolution {
		case ResolveUseMaster:
			if err := e.applyToSlave(conflict.ObjectA); err != nil {
				return err
			}
		case ResolveUseSlave:
			if err := e.applyToMaster(conflict.ObjectB); err != nil {
				return err
			}
		case ResolveRenameIndex:
			if err := e.renameIndex(conflict.ObjectA, conflict.ObjectB); err != nil {
				return err
			}
		}
	}
	return nil
}

func (e *SyncEngine) applyToSlave(obj SchemaObject) error {
	return nil
}

func (e *SyncEngine) applyToMaster(obj SchemaObject) error {
	return nil
}

func (e *SyncEngine) renameIndex(a, b SchemaObject) error {
	return nil
}
