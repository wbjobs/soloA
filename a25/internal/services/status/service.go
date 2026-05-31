package status

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type DeliveryStatusService struct {
	db          *gorm.DB
	redisClient *redis.Client
}

func NewDeliveryStatusService() *DeliveryStatusService {
	return &DeliveryStatusService{
		db:          database.GetDB(),
		redisClient: database.GetRedis(),
	}
}

type UpdateStatusRequest struct {
	MessageID     string
	DeviceID      string
	ChannelType   string
	ProviderType  string
	Status        string
	ProviderMsgID string
	ErrorCode     string
	ErrorMessage  string
}

func (s *DeliveryStatusService) UpdateStatus(ctx context.Context, req *UpdateStatusRequest) error {
	now := time.Now()

	updates := map[string]interface{}{
		"status": req.Status,
	}

	switch req.Status {
	case models.StatusQueued:
		updates["queued_at"] = &now
	case models.StatusSending:
		updates["sent_at"] = &now
	case models.StatusSent:
		updates["sent_at"] = &now
	case models.StatusDelivered:
		updates["delivered_at"] = &now
	case models.StatusOpened:
		updates["opened_at"] = &now
	case models.StatusFailed:
		updates["failed_at"] = &now
		if req.ErrorCode != "" {
			updates["error_code"] = req.ErrorCode
		}
		if req.ErrorMessage != "" {
			updates["error_message"] = req.ErrorMessage
		}
	}

	if req.ProviderMsgID != "" {
		updates["provider_msg_id"] = req.ProviderMsgID
	}

	if req.Status == models.StatusFailed {
		updates["retry_count"] = gorm.Expr("retry_count + 1")
	}

	result := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Where("message_id = ?", req.MessageID).
		Updates(updates)

	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		log := &models.DeliveryLog{
			MessageID:     req.MessageID,
			DeviceID:      req.DeviceID,
			ChannelType:   req.ChannelType,
			ProviderType:  req.ProviderType,
			Status:        req.Status,
			ProviderMsgID: req.ProviderMsgID,
			ErrorCode:     req.ErrorCode,
			ErrorMessage:  req.ErrorMessage,
			CreatedAt:     now,
		}

		switch req.Status {
		case models.StatusQueued:
			log.QueuedAt = &now
		case models.StatusSent:
			log.SentAt = &now
		case models.StatusDelivered:
			log.DeliveredAt = &now
		case models.StatusOpened:
			log.OpenedAt = &now
		case models.StatusFailed:
			log.FailedAt = &now
		}

		if err := s.db.WithContext(ctx).Create(log).Error; err != nil {
			return err
		}
	}

	if err := s.cacheStatus(ctx, req.MessageID, req.Status); err != nil {
		return err
	}

	if err := s.publishStatusUpdate(ctx, req); err != nil {
		return err
	}

	return nil
}

func (s *DeliveryStatusService) GetStatus(ctx context.Context, messageID string) (*models.DeliveryLog, error) {
	cachedStatus, err := s.getCachedStatus(ctx, messageID)
	if err == nil && cachedStatus != "" {
		var log models.DeliveryLog
		if err := json.Unmarshal([]byte(cachedStatus), &log); err == nil {
			return &log, nil
		}
	}

	var log models.DeliveryLog
	if err := s.db.WithContext(ctx).Where("message_id = ?", messageID).First(&log).Error; err != nil {
		return nil, err
	}

	s.cacheStatus(ctx, messageID, log.Status)

	return &log, nil
}

func (s *DeliveryStatusService) GetTaskStatus(ctx context.Context, taskID string) (*models.MessageTask, []*models.DeliveryLog, error) {
	var task models.MessageTask
	if err := s.db.WithContext(ctx).Where("task_id = ?", taskID).First(&task).Error; err != nil {
		return nil, nil, err
	}

	var logs []*models.DeliveryLog
	if err := s.db.WithContext(ctx).Where("task_id = ?", taskID).Order("created_at DESC").Limit(1000).Find(&logs).Error; err != nil {
		return nil, nil, err
	}

	return &task, logs, nil
}

func (s *DeliveryStatusService) GetDeliveryStatistics(ctx context.Context, tenantID string, startTime, endTime time.Time) (map[string]int64, error) {
	var results []struct {
		Status string
		Count  int64
	}

	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select("status, COUNT(*) as count").
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("status")

	if err := query.Find(&results).Error; err != nil {
		return nil, err
	}

	stats := make(map[string]int64)
	for _, r := range results {
		stats[r.Status] = r.Count
	}

	return stats, nil
}

func (s *DeliveryStatusService) GetChannelStatistics(ctx context.Context, tenantID string, startTime, endTime time.Time) (map[string]map[string]int64, error) {
	var results []struct {
		ChannelType string
		Status      string
		Count       int64
	}

	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Select("channel_type, status, COUNT(*) as count").
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, startTime, endTime).
		Group("channel_type, status")

	if err := query.Find(&results).Error; err != nil {
		return nil, err
	}

	stats := make(map[string]map[string]int64)
	for _, r := range results {
		if stats[r.ChannelType] == nil {
			stats[r.ChannelType] = make(map[string]int64)
		}
		stats[r.ChannelType][r.Status] = r.Count
	}

	return stats, nil
}

func (s *DeliveryStatusService) cacheStatus(ctx context.Context, messageID, status string) error {
	key := fmt.Sprintf("delivery_status:%s", messageID)
	data := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now().Unix(),
	}

	jsonData, _ := json.Marshal(data)
	return s.redisClient.Set(ctx, key, jsonData, 24*time.Hour).Err()
}

func (s *DeliveryStatusService) getCachedStatus(ctx context.Context, messageID string) (string, error) {
	key := fmt.Sprintf("delivery_status:%s", messageID)
	return s.redisClient.Get(ctx, key).Result()
}

func (s *DeliveryStatusService) publishStatusUpdate(ctx context.Context, req *UpdateStatusRequest) error {
	if database.Producer == nil {
		return nil
	}

	msg := map[string]interface{}{
		"message_id":   req.MessageID,
		"device_id":    req.DeviceID,
		"channel_type": req.ChannelType,
		"status":       req.Status,
		"error_code":   req.ErrorCode,
		"error_msg":    req.ErrorMessage,
		"provider_id":  req.ProviderMsgID,
		"timestamp":    time.Now(),
	}

	data, _ := json.Marshal(msg)

	return database.Producer.SendMessage(
		ctx,
		config.GetConfig().Kafka.Topics["delivery_status"],
		[]byte(req.MessageID),
		data,
	)
}

func (s *DeliveryStatusService) ListDeliveryLogs(ctx context.Context, tenantID string, userID string, startTime, endTime time.Time, page, pageSize int) ([]*models.DeliveryLog, int64, error) {
	var logs []*models.DeliveryLog
	var total int64

	query := s.db.WithContext(ctx).Model(&models.DeliveryLog{}).
		Where("tenant_id = ?", tenantID)

	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	if !startTime.IsZero() {
		query = query.Where("created_at >= ?", startTime)
	}
	if !endTime.IsZero() {
		query = query.Where("created_at <= ?", endTime)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Limit(pageSize).Offset(offset).Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

func (s *DeliveryStatusService) GetFailedMessages(ctx context.Context, tenantID string, limit int) ([]*models.DeliveryLog, error) {
	var logs []*models.DeliveryLog
	if err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND status = ?", tenantID, models.StatusFailed).
		Order("failed_at DESC").
		Limit(limit).
		Find(&logs).Error; err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *DeliveryStatusService) RetryFailedMessage(ctx context.Context, messageID string) error {
	var log models.DeliveryLog
	if err := s.db.WithContext(ctx).Where("message_id = ?", messageID).First(&log).Error; err != nil {
		return err
	}

	if log.Status != models.StatusFailed {
		return fmt.Errorf("message is not in failed state")
	}

	if log.RetryCount >= 3 {
		return fmt.Errorf("maximum retry count reached")
	}

	if database.Producer == nil {
		return nil
	}

	retryMsg := map[string]interface{}{
		"message_id":   log.MessageID,
		"tenant_id":    log.TenantID,
		"user_id":      log.UserID,
		"device_id":    log.DeviceID,
		"channel_type": log.ChannelType,
		"provider":     log.ProviderType,
		"retry_count":  log.RetryCount + 1,
	}

	data, _ := json.Marshal(retryMsg)
	return database.Producer.SendMessage(
		ctx,
		config.GetConfig().Kafka.Topics["message_send"],
		[]byte(log.MessageID),
		data,
	)
}
