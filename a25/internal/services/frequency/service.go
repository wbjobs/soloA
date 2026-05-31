package frequency

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type FrequencyControlService struct {
	db          *gorm.DB
	redisClient *redis.Client
}

func NewFrequencyControlService() *FrequencyControlService {
	return &FrequencyControlService{
		db:          database.GetDB(),
		redisClient: database.GetRedis(),
	}
}

var (
	ErrFrequencyLimitExceeded = errors.New("frequency limit exceeded")
	ErrCoolDownActive         = errors.New("cooldown period active")
)

type CheckFrequencyRequest struct {
	TenantID   string
	UserID     string
	Category   string
	ChannelType string
}

type FrequencyLimitInfo struct {
	MaxMessagesPerDay   int
	MaxMessagesPerWeek  int
	MaxMessagesPerMonth int
	CoolDownMinutes     int
	TodayCount          int
	WeekCount           int
	MonthCount          int
	LastSentAt          *time.Time
	CoolDownEndTime     *time.Time
}

func (s *FrequencyControlService) CheckAndRecord(ctx context.Context, req *CheckFrequencyRequest) (*FrequencyLimitInfo, error) {
	if req.Category == "" {
		req.Category = models.MessageCategoryMarketing
	}

	if req.Category != models.MessageCategoryMarketing {
		return &FrequencyLimitInfo{}, nil
	}

	info, err := s.GetFrequencyInfo(ctx, req.TenantID, req.UserID, req.Category)
	if err != nil {
		return nil, err
	}

	if info.CoolDownEndTime != nil && time.Now().Before(*info.CoolDownEndTime) {
		return info, ErrCoolDownActive
	}

	if info.MaxMessagesPerDay > 0 && info.TodayCount >= info.MaxMessagesPerDay {
		return info, ErrFrequencyLimitExceeded
	}

	if info.MaxMessagesPerWeek > 0 && info.WeekCount >= info.MaxMessagesPerWeek {
		return info, ErrFrequencyLimitExceeded
	}

	if info.MaxMessagesPerMonth > 0 && info.MonthCount >= info.MaxMessagesPerMonth {
		return info, ErrFrequencyLimitExceeded
	}

	if err := s.RecordMessage(ctx, req); err != nil {
		return nil, err
	}

	return info, nil
}

func (s *FrequencyControlService) GetFrequencyInfo(ctx context.Context, tenantID, userID, category string) (*FrequencyLimitInfo, error) {
	if category == "" {
		category = models.MessageCategoryMarketing
	}

	limit, err := s.GetUserLimit(ctx, tenantID, userID, category)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	today := now.Format("20060102")
	weekStart := now.AddDate(0, 0, -int(now.Weekday())).Format("20060102")
	monthStart := now.Format("200601")

	todayCount, _ := s.getMessageCountByPeriod(ctx, tenantID, userID, category, today)
	weekCount, _ := s.getMessageCountByPeriod(ctx, tenantID, userID, category, weekStart)
	monthCount, _ := s.getMessageCountByPeriod(ctx, tenantID, userID, category, monthStart)

	lastSentAt, _ := s.getLastSentTime(ctx, tenantID, userID, category)

	info := &FrequencyLimitInfo{
		MaxMessagesPerDay:   limit.MaxMessagesPerDay,
		MaxMessagesPerWeek:  limit.MaxMessagesPerWeek,
		MaxMessagesPerMonth: limit.MaxMessagesPerMonth,
		CoolDownMinutes:     limit.CoolDownMinutes,
		TodayCount:          todayCount,
		WeekCount:           weekCount,
		MonthCount:          monthCount,
		LastSentAt:          lastSentAt,
	}

	if lastSentAt != nil && limit.CoolDownMinutes > 0 {
		endTime := lastSentAt.Add(time.Duration(limit.CoolDownMinutes) * time.Minute)
		if time.Now().Before(endTime) {
			info.CoolDownEndTime = &endTime
		}
	}

	return info, nil
}

func (s *FrequencyControlService) GetUserLimit(ctx context.Context, tenantID, userID, category string) (*models.UserFrequencyLimit, error) {
	if category == "" {
		category = models.MessageCategoryMarketing
	}

	cacheKey := s.getLimitCacheKey(tenantID, userID, category)

	if s.redisClient != nil {
		cached, err := s.redisClient.Get(ctx, cacheKey).Result()
		if err == nil && cached != "" {
			var limit models.UserFrequencyLimit
			if json.Unmarshal([]byte(cached), &limit) == nil {
				return &limit, nil
			}
		}
	}

	var limit models.UserFrequencyLimit
	err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND user_id = ? AND category = ?", tenantID, userID, category).
		First(&limit).Error

	if err == gorm.ErrRecordNotFound {
		limit = models.UserFrequencyLimit{
			TenantID:            tenantID,
			UserID:              userID,
			Category:            category,
			MaxMessagesPerDay:   3,
			MaxMessagesPerWeek:  10,
			MaxMessagesPerMonth: 30,
			CoolDownMinutes:     60,
		}

		if err := s.db.WithContext(ctx).Create(&limit).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	if s.redisClient != nil {
		data, _ := json.Marshal(limit)
		s.redisClient.Set(ctx, cacheKey, data, 1*time.Hour)
	}

	return &limit, nil
}

func (s *FrequencyControlService) SetUserLimit(ctx context.Context, limit *models.UserFrequencyLimit) error {
	existing, err := s.GetUserLimit(ctx, limit.TenantID, limit.UserID, limit.Category)
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	if existing != nil {
		existing.MaxMessagesPerDay = limit.MaxMessagesPerDay
		existing.MaxMessagesPerWeek = limit.MaxMessagesPerWeek
		existing.MaxMessagesPerMonth = limit.MaxMessagesPerMonth
		existing.CoolDownMinutes = limit.CoolDownMinutes

		if err := s.db.WithContext(ctx).Save(existing).Error; err != nil {
			return err
		}
	} else {
		if err := s.db.WithContext(ctx).Create(limit).Error; err != nil {
			return err
		}
	}

	cacheKey := s.getLimitCacheKey(limit.TenantID, limit.UserID, limit.Category)
	if s.redisClient != nil {
		s.redisClient.Del(ctx, cacheKey)
	}

	return nil
}

func (s *FrequencyControlService) RecordMessage(ctx context.Context, req *CheckFrequencyRequest) error {
	now := time.Now()
	today := now.Format("20060102")

	if s.redisClient != nil {
		pipe := s.redisClient.Pipeline()

		dayKey := s.getCountCacheKey(req.TenantID, req.UserID, req.Category, "day", today)
		weekKey := s.getCountCacheKey(req.TenantID, req.UserID, req.Category, "week", 
			now.AddDate(0, 0, -int(now.Weekday())).Format("20060102"))
		monthKey := s.getCountCacheKey(req.TenantID, req.UserID, req.Category, "month", now.Format("200601"))
		lastSentKey := s.getLastSentCacheKey(req.TenantID, req.UserID, req.Category)

		pipe.Incr(ctx, dayKey)
		pipe.Expire(ctx, dayKey, 48*time.Hour)
		pipe.Incr(ctx, weekKey)
		pipe.Expire(ctx, weekKey, 14*24*time.Hour)
		pipe.Incr(ctx, monthKey)
		pipe.Expire(ctx, monthKey, 60*24*time.Hour)
		pipe.Set(ctx, lastSentKey, now.Unix(), 7*24*time.Hour)

		_, _ = pipe.Exec(ctx)
	}

	history := &models.UserMessageHistory{
		TenantID:    req.TenantID,
		UserID:      req.UserID,
		MessageID:   utils.GenerateMessageID(),
		Category:    req.Category,
		ChannelType: req.ChannelType,
		SentAt:      now,
	}

	return s.db.WithContext(ctx).Create(history).Error
}

func (s *FrequencyControlService) getMessageCountByPeriod(ctx context.Context, tenantID, userID, category, periodKey string) (int, error) {
	if s.redisClient != nil {
		cacheKey := s.getCountCacheKey(tenantID, userID, category, "period", periodKey)
		count, err := s.redisClient.Get(ctx, cacheKey).Int()
		if err == nil {
			return count, nil
		}
	}

	now := time.Now()
	var startTime, endTime time.Time

	if len(periodKey) == 8 {
		startTime, _ = time.Parse("20060102", periodKey)
		endTime = startTime.Add(24 * time.Hour)
	} else if len(periodKey) == 6 {
		year, _ := time.Parse("200601", periodKey)
		startTime = year
		endTime = startTime.AddDate(0, 1, 0)
	}

	var count int64
	err := s.db.WithContext(ctx).Model(&models.UserMessageHistory{}).
		Where("tenant_id = ? AND user_id = ? AND category = ? AND sent_at >= ? AND sent_at < ?",
			tenantID, userID, category, startTime, endTime).
		Count(&count).Error

	if err == nil {
		if s.redisClient != nil {
			cacheKey := s.getCountCacheKey(tenantID, userID, category, "period", periodKey)
			s.redisClient.Set(ctx, cacheKey, count, 1*time.Hour)
		}
	}

	return int(count), err
}

func (s *FrequencyControlService) getLastSentTime(ctx context.Context, tenantID, userID, category string) (*time.Time, error) {
	if s.redisClient != nil {
		cacheKey := s.getLastSentCacheKey(tenantID, userID, category)
		unixTime, err := s.redisClient.Get(ctx, cacheKey).Int64()
		if err == nil && unixTime > 0 {
			t := time.Unix(unixTime, 0)
			return &t, nil
		}
	}

	var history models.UserMessageHistory
	err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND user_id = ? AND category = ?", tenantID, userID, category).
		Order("sent_at DESC").
		First(&history).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	} else if err != nil {
		return nil, err
	}

	return &history.SentAt, nil
}

func (s *FrequencyControlService) getLimitCacheKey(tenantID, userID, category string) string {
	return fmt.Sprintf("mpc:freq:limit:%s:%s:%s", tenantID, userID, category)
}

func (s *FrequencyControlService) getCountCacheKey(tenantID, userID, category, period, periodKey string) string {
	return fmt.Sprintf("mpc:freq:count:%s:%s:%s:%s:%s", tenantID, userID, category, period, periodKey)
}

func (s *FrequencyControlService) getLastSentCacheKey(tenantID, userID, category string) string {
	return fmt.Sprintf("mpc:freq:last:%s:%s:%s", tenantID, userID, category)
}

func (s *FrequencyControlService) GetUserMessageHistory(ctx context.Context, tenantID, userID string, limit int) ([]*models.UserMessageHistory, error) {
	var histories []*models.UserMessageHistory
	err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND user_id = ?", tenantID, userID).
		Order("sent_at DESC").
		Limit(limit).
		Find(&histories).Error
	return histories, err
}

func (s *FrequencyControlService) RecordConversion(ctx context.Context, messageID, userID, eventType string, eventData map[string]interface{}) error {
	now := time.Now()

	result := s.db.WithContext(ctx).Model(&models.UserMessageHistory{}).
		Where("message_id = ? AND user_id = ?", messageID, userID).
		Updates(map[string]interface{}{
			"converted":    true,
			"converted_at": &now,
		})

	if result.Error != nil {
		return result.Error
	}

	var history models.UserMessageHistory
	if err := s.db.WithContext(ctx).
		Where("message_id = ?", messageID).
		First(&history).Error; err != nil {
		return err
	}

	eventDataStr := ""
	if eventData != nil {
		data, _ := json.Marshal(eventData)
		eventDataStr = string(data)
	}

	conversionEvent := &models.ConversionEvent{
		TenantID:    history.TenantID,
		EventID:     utils.GenerateID(),
		MessageID:   messageID,
		TaskID:      history.TaskID,
		UserID:      userID,
		EventType:   eventType,
		EventData:   eventDataStr,
		ConvertedAt: now,
		CreatedAt:   now,
	}

	return s.db.WithContext(ctx).Create(conversionEvent).Error
}

func (s *FrequencyControlService) GetDefaultFrequencyLimits() map[string]interface{} {
	return map[string]interface{}{
		"marketing": map[string]int{
			"max_messages_per_day":   3,
			"max_messages_per_week":  10,
			"max_messages_per_month": 30,
			"cooldown_minutes":       60,
		},
		"transaction": map[string]int{
			"max_messages_per_day":   -1,
			"max_messages_per_week":  -1,
			"max_messages_per_month": -1,
			"cooldown_minutes":       0,
		},
		"system": map[string]int{
			"max_messages_per_day":   -1,
			"max_messages_per_week":  -1,
			"max_messages_per_month": -1,
			"cooldown_minutes":       0,
		},
	}
}
