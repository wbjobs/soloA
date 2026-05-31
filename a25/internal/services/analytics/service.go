package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type AnalyticsService struct {
	db          *gorm.DB
	redisClient *redis.Client
}

func NewAnalyticsService() *AnalyticsService {
	return &AnalyticsService{
		db:          database.GetDB(),
		redisClient: database.GetRedis(),
	}
}

const (
	MetricTypeSent       = "sent"
	MetricTypeDelivered  = "delivered"
	MetricTypeOpened     = "opened"
	MetricTypeClicked    = "clicked"
	MetricTypeConverted  = "converted"
	MetricTypeFailed     = "failed"
	MetricTypeDelivery   = "delivery_time"
	MetricTypeLatency    = "latency"
)

type ConversionFunnel struct {
	TotalUsers       int64   `json:"total_users"`
	Sent             int64   `json:"sent"`
	SentRate         float64 `json:"sent_rate"`
	Delivered        int64   `json:"delivered"`
	DeliveryRate     float64 `json:"delivery_rate"`
	Opened           int64   `json:"opened"`
	OpenRate         float64 `json:"open_rate"`
	Clicked          int64   `json:"clicked"`
	ClickRate        float64 `json:"click_rate"`
	Converted        int64   `json:"converted"`
	ConversionRate   float64 `json:"conversion_rate"`
}

type ChannelPerformance struct {
	ChannelType     string  `json:"channel_type"`
	TotalSent       int64   `json:"total_sent"`
	TotalDelivered  int64   `json:"total_delivered"`
	TotalOpened     int64   `json:"total_opened"`
	TotalFailed     int64   `json:"total_failed"`
	DeliveryRate    float64 `json:"delivery_rate"`
	OpenRate        float64 `json:"open_rate"`
	AvgDeliveryTime float64 `json:"avg_delivery_time_ms"`
	SuccessRate     float64 `json:"success_rate"`
}

type FailureAnalysis struct {
	ErrorCode     string `json:"error_code"`
	ErrorMessage  string `json:"error_message"`
	Count         int64  `json:"count"`
	Percentage    float64 `json:"percentage"`
	ChannelType   string `json:"channel_type"`
}

type BillingSummary struct {
	BillingMonth    string  `json:"billing_month"`
	ChannelType     string  `json:"channel_type"`
	TotalSent       int64   `json:"total_sent"`
	TotalDelivered  int64   `json:"total_delivered"`
	TotalFailed     int64   `json:"total_failed"`
	QuotaUsed       int64   `json:"quota_used"`
	QuotaLimit      int64   `json:"quota_limit"`
	QuotaUsageRate  float64 `json:"quota_usage_rate"`
	OverageCount    int64   `json:"overage_count"`
	OverageCost     float64 `json:"overage_cost"`
	TotalCost       float64 `json:"total_cost"`
}

type DashboardOverview struct {
	TodaySent       int64   `json:"today_sent"`
	TodayDelivered  int64   `json:"today_delivered"`
	TodayOpened     int64   `json:"today_opened"`
	TodayFailed     int64   `json:"today_failed"`
	DeliveryRate    float64 `json:"delivery_rate"`
	OpenRate        float64 `json:"open_rate"`
	SuccessRate     float64 `json:"success_rate"`
	ComparedYesterday struct {
		SentChange      float64 `json:"sent_change"`
		DeliveryChange  float64 `json:"delivery_change"`
		OpenChange      float64 `json:"open_change"`
	} `json:"compared_yesterday"`
}

type TimeSeriesData struct {
	Timestamp string `json:"timestamp"`
	Sent      int64  `json:"sent"`
	Delivered int64  `json:"delivered"`
	Opened    int64  `json:"opened"`
	Failed    int64  `json:"failed"`
}

func (s *AnalyticsService) GetConversionFunnel(ctx context.Context, tenantID string, startTime, endTime time.Time, taskID string) (*ConversionFunnel, error) {
	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime)

	if taskID != "" {
		query = query.Where("task_id = ?", taskID)
	}

	var counts []struct {
		Status string
		Count  int64
	}

	query.Select("status, COUNT(*) as count").Group("status").Find(&counts)

	result := &ConversionFunnel{}
	var total int64

	for _, c := range counts {
		switch c.Status {
		case models.StatusSent:
			result.Sent = c.Count
		case models.StatusDelivered:
			result.Delivered = c.Count
		case models.StatusOpened:
			result.Opened = c.Count
		case models.StatusFailed:
			result.TotalUsers += c.Count
		case models.StatusQueued, models.StatusSending:
			result.TotalUsers += c.Count
		}
		total += c.Count
	}

	result.TotalUsers = total

	if total > 0 {
		result.SentRate = float64(result.Sent) / float64(total) * 100
	}
	if result.Sent > 0 {
		result.DeliveryRate = float64(result.Delivered) / float64(result.Sent) * 100
		result.OpenRate = float64(result.Opened) / float64(result.Sent) * 100
	}

	var clickCount int64
	s.db.WithContext(ctx).Model(&models.ConversionEvent{}).
		Where("tenant_id = ? AND event_type = 'click' AND converted_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Count(&clickCount)
	result.Clicked = clickCount

	var convertCount int64
	s.db.WithContext(ctx).Model(&models.ConversionEvent{}).
		Where("tenant_id = ? AND event_type = 'conversion' AND converted_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Count(&convertCount)
	result.Converted = convertCount

	if result.Sent > 0 {
		result.ClickRate = float64(result.Clicked) / float64(result.Sent) * 100
		result.ConversionRate = float64(result.Converted) / float64(result.Sent) * 100
	}

	return result, nil
}

func (s *AnalyticsService) GetChannelPerformance(ctx context.Context, tenantID string, startTime, endTime time.Time) ([]*ChannelPerformance, error) {
	var results []struct {
		ChannelType    string
		TotalSent      int64
		TotalDelivered int64
		TotalOpened    int64
		TotalFailed    int64
	}

	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select(`
			channel_type,
			SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as total_sent,
			SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as total_delivered,
			SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as total_opened,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed
		`).
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("channel_type")

	if err := query.Find(&results).Error; err != nil {
		return nil, err
	}

	performanceList := make([]*ChannelPerformance, 0, len(results))

	for _, r := range results {
		perf := &ChannelPerformance{
			ChannelType:    r.ChannelType,
			TotalSent:      r.TotalSent,
			TotalDelivered: r.TotalDelivered,
			TotalOpened:    r.TotalOpened,
			TotalFailed:    r.TotalFailed,
		}

		if r.TotalSent > 0 {
			perf.DeliveryRate = float64(r.TotalDelivered) / float64(r.TotalSent) * 100
			perf.OpenRate = float64(r.TotalOpened) / float64(r.TotalSent) * 100

			total := r.TotalSent + r.TotalFailed
			if total > 0 {
				perf.SuccessRate = float64(r.TotalSent) / float64(total) * 100
			}
		}

		avgTime := s.calculateAverageDeliveryTime(ctx, tenantID, r.ChannelType, startTime, endTime)
		perf.AvgDeliveryTime = avgTime

		performanceList = append(performanceList, perf)
	}

	return performanceList, nil
}

func (s *AnalyticsService) calculateAverageDeliveryTime(ctx context.Context, tenantID, channelType string, startTime, endTime time.Time) float64 {
	var result struct {
		AvgTime float64
	}

	s.db.WithContext(ctx).Raw(`
		SELECT AVG(UNIX_TIMESTAMP(delivered_at) - UNIX_TIMESTAMP(queued_at)) * 1000 as avg_time
		FROM delivery_logs
		WHERE tenant_id = ? 
		  AND channel_type = ? 
		  AND created_at BETWEEN ? AND ?
		  AND delivered_at IS NOT NULL
		  AND queued_at IS NOT NULL
	`, tenantID, channelType, startTime, endTime).Scan(&result)

	return result.AvgTime
}

func (s *AnalyticsService) GetFailureAnalysis(ctx context.Context, tenantID string, startTime, endTime time.Time, limit int) ([]*FailureAnalysis, error) {
	var results []struct {
		ErrorCode    string
		ErrorMessage string
		ChannelType  string
		Count        int64
	}

	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select("error_code, error_message, channel_type, COUNT(*) as count").
		Where("tenant_id = ? AND status = ? AND created_at BETWEEN ? AND ?", 
			tenantID, models.StatusFailed, startTime, endTime).
		Group("error_code, error_message, channel_type").
		Order("count DESC").
		Limit(limit)

	if err := query.Find(&results).Error; err != nil {
		return nil, err
	}

	var total int64
	s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Where("tenant_id = ? AND status = ? AND created_at BETWEEN ? AND ?", 
			tenantID, models.StatusFailed, startTime, endTime).
		Count(&total)

	failures := make([]*FailureAnalysis, 0, len(results))
	for _, r := range results {
		failure := &FailureAnalysis{
			ErrorCode:    r.ErrorCode,
			ErrorMessage: r.ErrorMessage,
			Count:        r.Count,
			ChannelType:  r.ChannelType,
		}

		if total > 0 {
			failure.Percentage = float64(r.Count) / float64(total) * 100
		}

		failures = append(failures, failure)
	}

	return failures, nil
}

func (s *AnalyticsService) GetBillingSummary(ctx context.Context, tenantID string, month string) ([]*BillingSummary, error) {
	var records []*models.TenantBillingRecord
	err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND billing_month = ?", tenantID, month).
		Find(&records).Error

	if err != nil {
		return nil, err
	}

	if len(records) == 0 {
		records, err = s.calculateBillingSummary(ctx, tenantID, month)
		if err != nil {
			return nil, err
		}
	}

	summaryList := make([]*BillingSummary, 0, len(records))
	for _, r := range records {
		summary := &BillingSummary{
			BillingMonth:   r.BillingMonth,
			ChannelType:    r.ChannelType,
			TotalSent:      r.TotalSent,
			TotalDelivered: r.TotalDelivered,
			TotalFailed:    r.TotalFailed,
			QuotaUsed:      r.QuotaUsed,
			QuotaLimit:     r.QuotaLimit,
			OverageCount:   r.OverageCount,
			OverageCost:    r.OverageCost,
			TotalCost:      r.TotalCost,
		}

		if r.QuotaLimit > 0 {
			summary.QuotaUsageRate = float64(r.QuotaUsed) / float64(r.QuotaLimit) * 100
		}

		summaryList = append(summaryList, summary)
	}

	return summaryList, nil
}

func (s *AnalyticsService) calculateBillingSummary(ctx context.Context, tenantID, month string) ([]*models.TenantBillingRecord, error) {
	startTime, _ := time.Parse("2006-01", month)
	endTime := startTime.AddDate(0, 1, 0)

	var results []struct {
		ChannelType    string
		TotalSent      int64
		TotalDelivered int64
		TotalFailed    int64
	}

	err := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select(`
			channel_type,
			SUM(CASE WHEN status IN ('sent', 'delivered', 'opened') THEN 1 ELSE 0 END) as total_sent,
			SUM(CASE WHEN status IN ('delivered', 'opened') THEN 1 ELSE 0 END) as total_delivered,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed
		`).
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("channel_type").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	var tenant models.Tenant
	s.db.WithContext(ctx).Where("tenant_id = ?", tenantID).First(&tenant)

	records := make([]*models.TenantBillingRecord, 0, len(results))
	now := time.Now()

	for _, r := range results {
		var quotaLimit int64
		switch r.ChannelType {
		case models.ChannelTypeEmail:
			quotaLimit = tenant.EmailQuota
		case models.ChannelTypeSMS:
			quotaLimit = tenant.SMSQuota
		case models.ChannelTypePush:
			quotaLimit = tenant.PushQuota
		default:
			quotaLimit = tenant.DailyLimit * 30
		}

		quotaUsed := r.TotalSent
		overageCount := int64(0)
		overageCost := 0.0
		if quotaLimit > 0 && quotaUsed > quotaLimit {
			overageCount = quotaUsed - quotaLimit
			overageCost = float64(overageCount) * 0.01
		}

		record := &models.TenantBillingRecord{
			TenantID:      tenantID,
			BillingMonth:  month,
			ChannelType:   r.ChannelType,
			TotalSent:     r.TotalSent,
			TotalDelivered: r.TotalDelivered,
			TotalFailed:   r.TotalFailed,
			QuotaUsed:     quotaUsed,
			QuotaLimit:    quotaLimit,
			OverageCount:  overageCount,
			OverageCost:   overageCost,
			TotalCost:     overageCost,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		records = append(records, record)
	}

	return records, nil
}

func (s *AnalyticsService) GetDashboardOverview(ctx context.Context, tenantID string) (*DashboardOverview, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.AddDate(0, 0, 1)
	yesterdayStart := todayStart.AddDate(0, 0, -1)

	todayStats, err := s.getTimeRangeStats(ctx, tenantID, todayStart, todayEnd)
	if err != nil {
		return nil, err
	}

	yesterdayStats, err := s.getTimeRangeStats(ctx, tenantID, yesterdayStart, todayStart)
	if err != nil {
		return nil, err
	}

	overview := &DashboardOverview{
		TodaySent:      todayStats.Sent,
		TodayDelivered: todayStats.Delivered,
		TodayOpened:    todayStats.Opened,
		TodayFailed:    todayStats.Failed,
	}

	if todayStats.Sent > 0 {
		overview.DeliveryRate = float64(todayStats.Delivered) / float64(todayStats.Sent) * 100
		overview.OpenRate = float64(todayStats.Opened) / float64(todayStats.Sent) * 100

		total := todayStats.Sent + todayStats.Failed
		if total > 0 {
			overview.SuccessRate = float64(todayStats.Sent) / float64(total) * 100
		}
	}

	if yesterdayStats.Sent > 0 {
		overview.ComparedYesterday.SentChange = float64(todayStats.Sent-yesterdayStats.Sent) / float64(yesterdayStats.Sent) * 100
		overview.ComparedYesterday.DeliveryChange = float64(todayStats.Delivered-yesterdayStats.Delivered) / float64(yesterdayStats.Delivered) * 100
		overview.ComparedYesterday.OpenChange = float64(todayStats.Opened-yesterdayStats.Opened) / float64(yesterdayStats.Opened) * 100
	}

	return overview, nil
}

type timeRangeStats struct {
	Sent      int64
	Delivered int64
	Opened    int64
	Failed    int64
}

func (s *AnalyticsService) getTimeRangeStats(ctx context.Context, tenantID string, startTime, endTime time.Time) (*timeRangeStats, error) {
	var results []struct {
		Status string
		Count  int64
	}

	err := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select("status, COUNT(*) as count").
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("status").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	stats := &timeRangeStats{}
	for _, r := range results {
		switch r.Status {
		case models.StatusSent:
			stats.Sent += r.Count
		case models.StatusDelivered:
			stats.Delivered += r.Count
		case models.StatusOpened:
			stats.Opened += r.Count
		case models.StatusFailed:
			stats.Failed += r.Count
		}
	}

	return stats, nil
}

func (s *AnalyticsService) GetTimeSeriesData(ctx context.Context, tenantID string, startTime, endTime time.Time, interval string) ([]*TimeSeriesData, error) {
	var results []struct {
		TimeBucket string
		Sent       int64
		Delivered  int64
		Opened     int64
		Failed     int64
	}

	var intervalExpr string
	switch interval {
	case "hour":
		intervalExpr = "DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')"
	case "day":
		intervalExpr = "DATE_FORMAT(created_at, '%Y-%m-%d')"
	default:
		intervalExpr = "DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')"
	}

	err := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select(fmt.Sprintf(`
			%s as time_bucket,
			SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
			SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
			SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
		`, intervalExpr)).
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("time_bucket").
		Order("time_bucket ASC").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	dataList := make([]*TimeSeriesData, 0, len(results))
	for _, r := range results {
		dataList = append(dataList, &TimeSeriesData{
			Timestamp: r.TimeBucket,
			Sent:      r.Sent,
			Delivered: r.Delivered,
			Opened:    r.Opened,
			Failed:    r.Failed,
		})
	}

	return dataList, nil
}

func (s *AnalyticsService) RecordMetric(ctx context.Context, tenantID, metricType string, value int64, floatValue float64, channelType, category, taskID, testID, variantID string) error {
	now := time.Now()
	metric := &models.DashboardMetric{
		TenantID:   tenantID,
		MetricDate: now.Format("2006-01-02"),
		MetricType: metricType,
		ChannelType: channelType,
		Category:   category,
		Value:      value,
		FloatValue: floatValue,
		TaskID:     taskID,
		TestID:     testID,
		VariantID:  variantID,
		CreatedAt:  now,
	}

	return s.db.WithContext(ctx).Create(metric).Error
}

func (s *AnalyticsService) GetRealtimeMetrics(ctx context.Context, tenantID string, duration time.Duration) (map[string]int64, error) {
	endTime := time.Now()
	startTime := endTime.Add(-duration)

	results := make(map[string]int64)

	var counts []struct {
		Status string
		Count  int64
	}

	err := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select("status, COUNT(*) as count").
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("status").
		Find(&counts).Error

	if err != nil {
		return nil, err
	}

	for _, c := range counts {
		results[c.Status] = c.Count
	}

	return results, nil
}

func (s *AnalyticsService) GetChannelLatency(ctx context.Context, tenantID string, startTime, endTime time.Time) (map[string]float64, error) {
	var results []struct {
		ChannelType string
		AvgLatency  float64
	}

	err := s.db.WithContext(ctx).Raw(`
		SELECT 
			channel_type,
			AVG(UNIX_TIMESTAMP(delivered_at) - UNIX_TIMESTAMP(sent_at)) as avg_latency
		FROM delivery_logs
		WHERE tenant_id = ? 
		  AND created_at BETWEEN ? AND ?
		  AND delivered_at IS NOT NULL
		  AND sent_at IS NOT NULL
		GROUP BY channel_type
	`, tenantID, startTime, endTime).Scan(&results).Error

	if err != nil {
		return nil, err
	}

	latencyMap := make(map[string]float64)
	for _, r := range results {
		latencyMap[r.ChannelType] = r.AvgLatency
	}

	return latencyMap, nil
}
