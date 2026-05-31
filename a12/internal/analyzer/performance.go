package analyzer

import (
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"

	"task-scheduler/internal/db"
	"task-scheduler/internal/models"
)

type PerformanceAnalyzer struct{}

var GlobalAnalyzer = &PerformanceAnalyzer{}

func (a *PerformanceAnalyzer) GetTaskPerformance(taskID uint, days int) (*models.TaskPerformanceStats, error) {
	var task models.Task
	if err := db.DB.First(&task, taskID).Error; err != nil {
		return nil, err
	}

	startTime := time.Now().AddDate(0, 0, -days)

	var logs []models.TaskExecutionLog
	query := db.DB.Where("task_id = ? AND start_time >= ?", taskID, startTime).
		Order("start_time ASC").
		Find(&logs)

	if query.Error != nil {
		return nil, query.Error
	}

	return a.calculatePerformanceStats(&task, logs), nil
}

func (a *PerformanceAnalyzer) calculatePerformanceStats(task *models.Task, logs []models.TaskExecutionLog) *models.TaskPerformanceStats {
	stats := &models.TaskPerformanceStats{
		TaskID:   task.ID,
		TaskName: task.Name,
	}

	if len(logs) == 0 {
		return stats
	}

	var (
		totalDuration   int64
		totalRetries    int
		successCount    int64
		failedCount     int64
		timeoutCount    int64
		skippedCount    int64
		durations       []int64
		lastExecution   time.Time
		lastStatus      models.ExecutionStatus
	)

	for _, log := range logs {
		stats.TotalExecutions++

		switch log.Status {
		case models.ExecutionStatusSuccess:
			successCount++
			if log.Duration > 0 {
				totalDuration += log.Duration
				durations = append(durations, log.Duration)
			}
		case models.ExecutionStatusFailed:
			failedCount++
		case models.ExecutionStatusTimeout:
			timeoutCount++
		case models.ExecutionStatusSkipped:
			skippedCount++
		}

		totalRetries += log.RetryCount
		lastExecution = log.StartTime
		lastStatus = log.Status
	}

	stats.SuccessCount = successCount
	stats.FailedCount = failedCount
	stats.TimeoutCount = timeoutCount
	stats.SkippedCount = skippedCount

	if stats.TotalExecutions > 0 {
		stats.SuccessRate = float64(successCount) / float64(stats.TotalExecutions) * 100
	}

	if len(durations) > 0 {
		sort.Slice(durations, func(i, j int) bool {
			return durations[i] < durations[j]
		})

		stats.AvgDuration = float64(totalDuration) / float64(len(durations))
		stats.MinDuration = durations[0]
		stats.MaxDuration = durations[len(durations)-1]
		stats.AvgRetries = float64(totalRetries) / float64(stats.TotalExecutions)

		stats.P50Duration = calculatePercentile(durations, 50)
		stats.P95Duration = calculatePercentile(durations, 95)
		stats.P99Duration = calculatePercentile(durations, 99)
	}

	stats.LastExecution = &lastExecution
	stats.LastStatus = lastStatus

	return stats
}

func calculatePercentile(durations []int64, percentile int) float64 {
	if len(durations) == 0 {
		return 0
	}

	index := (percentile * len(durations)) / 100
	if index >= len(durations) {
		index = len(durations) - 1
	}

	if index == 0 || (percentile*len(durations))%100 == 0 {
		return float64(durations[index])
	}

	return float64(durations[index-1]+durations[index]) / 2.0
}

func (a *PerformanceAnalyzer) GetAllTasksPerformance(days int) ([]*models.TaskPerformanceStats, error) {
	var tasks []models.Task
	if err := db.DB.Where("status = ?", models.TaskStatusEnabled).Find(&tasks).Error; err != nil {
		return nil, err
	}

	results := make([]*models.TaskPerformanceStats, 0, len(tasks))
	startTime := time.Now().AddDate(0, 0, -days)

	for _, task := range tasks {
		var logs []models.TaskExecutionLog
		db.DB.Where("task_id = ? AND start_time >= ?", task.ID, startTime).
			Order("start_time ASC").
			Find(&logs)

		stats := a.calculatePerformanceStats(&task, logs)
		results = append(results, stats)
	}

	return results, nil
}

func (a *PerformanceAnalyzer) GetSystemPerformance(days int) (*SystemPerformanceStats, error) {
	startTime := time.Now().AddDate(0, 0, -days)

	type AggregatedStats struct {
		TotalExecutions int64
		SuccessCount    int64
		FailedCount     int64
		TimeoutCount    int64
		SkippedCount    int64
		TotalDuration   int64
		TotalTasks      int64
		ActiveTasks     int64
	}

	var stats AggregatedStats

	db.DB.Model(&models.TaskExecutionLog{}).
		Where("start_time >= ?", startTime).
		Select(`
			COUNT(*) as total_executions,
			SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
			SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
			SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
			COALESCE(SUM(duration), 0) as total_duration
		`).Scan(&stats)

	db.DB.Model(&models.Task{}).Count(&stats.TotalTasks)
	db.DB.Model(&models.Task{}).Where("status = ?", models.TaskStatusEnabled).Count(&stats.ActiveTasks)

	result := &SystemPerformanceStats{
		TimeRangeDays:   days,
		TotalExecutions: stats.TotalExecutions,
		SuccessCount:    stats.SuccessCount,
		FailedCount:     stats.FailedCount,
		TimeoutCount:    stats.TimeoutCount,
		SkippedCount:    stats.SkippedCount,
		TotalTasks:      stats.TotalTasks,
		ActiveTasks:     stats.ActiveTasks,
	}

	if stats.TotalExecutions > 0 {
		result.SuccessRate = float64(stats.SuccessCount) / float64(stats.TotalExecutions) * 100
		result.AvgDuration = float64(stats.TotalDuration) / float64(stats.TotalExecutions)
	}

	result.DailyStats = a.getDailyStats(days)

	return result, nil
}

func (a *PerformanceAnalyzer) getDailyStats(days int) []DailyPerformanceStats {
	results := make([]DailyPerformanceStats, 0)
	
	type DailyAgg struct {
		Date            string
		TotalExecutions int64
		SuccessCount    int64
		FailedCount     int64
		TimeoutCount    int64
		AvgDuration     float64
	}

	startTime := time.Now().AddDate(0, 0, -days)
	
	db.DB.Raw(`
		SELECT 
			DATE(start_time) as date,
			COUNT(*) as total_executions,
			SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
			SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
			AVG(duration) as avg_duration
		FROM task_execution_logs
		WHERE start_time >= ?
		GROUP BY DATE(start_time)
		ORDER BY date DESC
	`, startTime).Scan(&results)

	for i := range results {
		if results[i].TotalExecutions > 0 {
			results[i].SuccessRate = float64(results[i].SuccessCount) / float64(results[i].TotalExecutions) * 100
		}
	}

	return results
}

func (a *PerformanceAnalyzer) GetSlowTasks(days int, thresholdMs int64, limit int) ([]*SlowTaskInfo, error) {
	startTime := time.Now().AddDate(0, 0, -days)

	type RawSlowTask struct {
		TaskID      uint
		TaskName    string
		AvgDuration float64
		MaxDuration int64
		ExecCount   int64
	}

	var rawTasks []RawSlowTask
	
	err := db.DB.Raw(`
		SELECT 
			t.id as task_id,
			t.name as task_name,
			AVG(l.duration) as avg_duration,
			MAX(l.duration) as max_duration,
			COUNT(*) as exec_count
		FROM task_execution_logs l
		JOIN tasks t ON l.task_id = t.id
		WHERE l.start_time >= ? AND l.status = 'success'
		GROUP BY l.task_id, t.name
		HAVING AVG(l.duration) >= ?
		ORDER BY avg_duration DESC
		LIMIT ?
	`, startTime, thresholdMs, limit).Scan(&rawTasks).Error

	if err != nil {
		return nil, err
	}

	results := make([]*SlowTaskInfo, 0, len(rawTasks))
	for _, raw := range rawTasks {
		results = append(results, &SlowTaskInfo{
			TaskID:       raw.TaskID,
			TaskName:     raw.TaskName,
			AvgDuration:  raw.AvgDuration,
			MaxDuration:  raw.MaxDuration,
			ExecCount:    raw.ExecCount,
			ThresholdMs:  thresholdMs,
		})
	}

	return results, nil
}

func (a *PerformanceAnalyzer) GetFailureRate(days int) (*FailureRateStats, error) {
	startTime := time.Now().AddDate(0, 0, -days)

	type RawFailure struct {
		TaskID       uint
		TaskName     string
		TotalExec    int64
		FailedExec   int64
		TimeoutExec  int64
	}

	var rawFailures []RawFailure
	
	err := db.DB.Raw(`
		SELECT 
			l.task_id,
			t.name as task_name,
			COUNT(*) as total_exec,
			SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END) as failed_exec,
			SUM(CASE WHEN l.status = 'timeout' THEN 1 ELSE 0 END) as timeout_exec
		FROM task_execution_logs l
		JOIN tasks t ON l.task_id = t.id
		WHERE l.start_time >= ?
		GROUP BY l.task_id, t.name
		HAVING SUM(CASE WHEN l.status IN ('failed', 'timeout') THEN 1 ELSE 0 END) > 0
		ORDER BY (SUM(CASE WHEN l.status IN ('failed', 'timeout') THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) DESC
	`, startTime).Scan(&rawFailures).Error

	if err != nil {
		return nil, err
	}

	stats := &FailureRateStats{
		TimeRangeDays: days,
		Tasks:         make([]*TaskFailureRate, 0, len(rawFailures)),
	}

	for _, raw := range rawFailures {
		failureRate := 0.0
		if raw.TotalExec > 0 {
			failureRate = float64(raw.FailedExec+raw.TimeoutExec) / float64(raw.TotalExec) * 100
		}

		stats.Tasks = append(stats.Tasks, &TaskFailureRate{
			TaskID:       raw.TaskID,
			TaskName:     raw.TaskName,
			TotalExec:    raw.TotalExec,
			FailedExec:   raw.FailedExec,
			TimeoutExec:  raw.TimeoutExec,
			FailureRate:  failureRate,
		})
	}

	return stats, nil
}

func (a *PerformanceAnalyzer) GetExecutionTrend(days int, taskID *uint) (*ExecutionTrend, error) {
	startTime := time.Now().AddDate(0, 0, -days)

	var query *gorm.DB
	if taskID != nil {
		query = db.DB.Model(&models.TaskExecutionLog{}).
			Where("task_id = ? AND start_time >= ?", *taskID, startTime)
	} else {
		query = db.DB.Model(&models.TaskExecutionLog{}).
			Where("start_time >= ?", startTime)
	}

	type HourlyData struct {
		Hour        string
		Total       int64
		Success     int64
		Failed      int64
		Timeout     int64
		AvgDuration float64
	}

	var hourlyData []HourlyData

	query.Select(`
		DATE_FORMAT(start_time, '%Y-%m-%d %H:00') as hour,
		COUNT(*) as total,
		SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
		SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
		SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout,
		AVG(duration) as avg_duration
	`).Group("hour").Order("hour DESC").Scan(&hourlyData)

	trend := &ExecutionTrend{
		TimeRangeDays: days,
		HourlyData:    make([]TrendDataPoint, 0, len(hourlyData)),
	}

	for _, hd := range hourlyData {
		trend.HourlyData = append(trend.HourlyData, TrendDataPoint{
			Hour:         hd.Hour,
			Total:        hd.Total,
			Success:      hd.Success,
			Failed:       hd.Failed,
			Timeout:      hd.Timeout,
			AvgDuration:  hd.AvgDuration,
		})
	}

	return trend, nil
}

type SystemPerformanceStats struct {
	TimeRangeDays   int                     `json:"time_range_days"`
	TotalTasks      int64                   `json:"total_tasks"`
	ActiveTasks     int64                   `json:"active_tasks"`
	TotalExecutions int64                   `json:"total_executions"`
	SuccessCount    int64                   `json:"success_count"`
	FailedCount     int64                   `json:"failed_count"`
	TimeoutCount    int64                   `json:"timeout_count"`
	SkippedCount    int64                   `json:"skipped_count"`
	SuccessRate     float64                 `json:"success_rate"`
	AvgDuration     float64                 `json:"avg_duration_ms"`
	DailyStats      []DailyPerformanceStats `json:"daily_stats"`
}

type DailyPerformanceStats struct {
	Date            string  `json:"date"`
	TotalExecutions int64   `json:"total_executions"`
	SuccessCount    int64   `json:"success_count"`
	FailedCount     int64   `json:"failed_count"`
	TimeoutCount    int64   `json:"timeout_count"`
	SuccessRate     float64 `json:"success_rate"`
	AvgDuration     float64 `json:"avg_duration_ms"`
}

type SlowTaskInfo struct {
	TaskID      uint    `json:"task_id"`
	TaskName    string  `json:"task_name"`
	AvgDuration float64 `json:"avg_duration_ms"`
	MaxDuration int64   `json:"max_duration_ms"`
	ExecCount   int64   `json:"execution_count"`
	ThresholdMs int64   `json:"threshold_ms"`
}

type FailureRateStats struct {
	TimeRangeDays int                 `json:"time_range_days"`
	Tasks         []*TaskFailureRate  `json:"tasks"`
}

type TaskFailureRate struct {
	TaskID      uint    `json:"task_id"`
	TaskName    string  `json:"task_name"`
	TotalExec   int64   `json:"total_executions"`
	FailedExec  int64   `json:"failed_executions"`
	TimeoutExec int64   `json:"timeout_executions"`
	FailureRate float64 `json:"failure_rate_percent"`
}

type ExecutionTrend struct {
	TimeRangeDays int               `json:"time_range_days"`
	HourlyData    []TrendDataPoint `json:"hourly_data"`
}

type TrendDataPoint struct {
	Hour        string  `json:"hour"`
	Total       int64   `json:"total"`
	Success     int64   `json:"success"`
	Failed      int64   `json:"failed"`
	Timeout     int64   `json:"timeout"`
	AvgDuration float64 `json:"avg_duration_ms"`
}

func (d TrendDataPoint) String() string {
	return fmt.Sprintf("%s: Total=%d, Success=%d, Failed=%d, Timeout=%d, AvgDuration=%.2fms",
		d.Hour, d.Total, d.Success, d.Failed, d.Timeout, d.AvgDuration)
}
