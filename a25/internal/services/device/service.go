package device

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"gorm.io/gorm"
)

type DeviceService struct {
	db *gorm.DB
}

func NewDeviceService() *DeviceService {
	return &DeviceService{
		db: database.GetDB(),
	}
}

type RegisterDeviceRequest struct {
	UserID       string                 `json:"user_id" binding:"required"`
	DeviceID     string                 `json:"device_id" binding:"required"`
	DeviceToken  string                 `json:"device_token" binding:"required"`
	DeviceType   string                 `json:"device_type" binding:"required"`
	DeviceModel  string                 `json:"device_model"`
	OSVersion    string                 `json:"os_version"`
	AppVersion   string                 `json:"app_version"`
	ChannelType  string                 `json:"channel_type" binding:"required"`
	PushProvider string                 `json:"push_provider"`
	Language     string                 `json:"language"`
	Timezone     string                 `json:"timezone"`
	Tags         []string               `json:"tags"`
	Attributes   map[string]interface{} `json:"attributes"`
}

func (s *DeviceService) RegisterDevice(ctx context.Context, tenantID string, req *RegisterDeviceRequest) error {
	var existing models.Device
	err := s.db.WithContext(ctx).Where("device_id = ?", req.DeviceID).First(&existing).Error
	
	if errors.Is(err, gorm.ErrRecordNotFound) {
		tagsJSON, _ := json.Marshal(req.Tags)
		attrsJSON, _ := json.Marshal(req.Attributes)

		now := time.Now()
		device := &models.Device{
			TenantID:     tenantID,
			UserID:       req.UserID,
			DeviceID:     req.DeviceID,
			DeviceToken:  req.DeviceToken,
			DeviceType:   req.DeviceType,
			DeviceModel:  req.DeviceModel,
			OSVersion:    req.OSVersion,
			AppVersion:   req.AppVersion,
			ChannelType:  req.ChannelType,
			PushProvider: req.PushProvider,
			Language:     req.Language,
			Timezone:     req.Timezone,
			IsActive:     true,
			LastActiveAt: &now,
			Tags:         string(tagsJSON),
			Attributes:   string(attrsJSON),
		}

		if err := s.db.WithContext(ctx).Create(device).Error; err != nil {
			return err
		}

		if err := s.cacheDeviceBinding(ctx, tenantID, req.UserID, req.DeviceID, req.DeviceToken, req.ChannelType, req.PushProvider); err != nil {
			return err
		}

		return nil
	}

	if err != nil {
		return err
	}

	existing.UserID = req.UserID
	existing.DeviceToken = req.DeviceToken
	existing.DeviceType = req.DeviceType
	existing.DeviceModel = req.DeviceModel
	existing.OSVersion = req.OSVersion
	existing.AppVersion = req.AppVersion
	existing.ChannelType = req.ChannelType
	existing.PushProvider = req.PushProvider
	existing.Language = req.Language
	existing.Timezone = req.Timezone
	existing.IsActive = true
	now := time.Now()
	existing.LastActiveAt = &now

	if req.Tags != nil {
		tagsJSON, _ := json.Marshal(req.Tags)
		existing.Tags = string(tagsJSON)
	}
	if req.Attributes != nil {
		attrsJSON, _ := json.Marshal(req.Attributes)
		existing.Attributes = string(attrsJSON)
	}

	if err := s.db.WithContext(ctx).Save(&existing).Error; err != nil {
		return err
	}

	if err := s.cacheDeviceBinding(ctx, tenantID, req.UserID, req.DeviceID, req.DeviceToken, req.ChannelType, req.PushProvider); err != nil {
		return err
	}

	return nil
}

func (s *DeviceService) UnregisterDevice(ctx context.Context, deviceID string) error {
	var device models.Device
	if err := s.db.WithContext(ctx).Where("device_id = ?", deviceID).First(&device).Error; err != nil {
		return err
	}

	if err := s.db.WithContext(ctx).Delete(&device).Error; err != nil {
		return err
	}

	return s.removeDeviceFromCache(ctx, device.TenantID, device.UserID, device.DeviceID)
}

func (s *DeviceService) UpdateDeviceActiveStatus(ctx context.Context, deviceID string, isActive bool) error {
	updates := map[string]interface{}{
		"is_active": isActive,
	}
	if isActive {
		now := time.Now()
		updates["last_active_at"] = &now
	}

	return s.db.WithContext(ctx).Model(&models.Device{}).Where("device_id = ?", deviceID).Updates(updates).Error
}

func (s *DeviceService) GetUserDevices(ctx context.Context, tenantID, userID string, channelTypes ...string) ([]*models.Device, error) {
	query := s.db.WithContext(ctx).Where("tenant_id = ? AND user_id = ? AND is_active = ?", tenantID, userID, true)
	
	if len(channelTypes) > 0 {
		query = query.Where("channel_type IN ?", channelTypes)
	}

	var devices []*models.Device
	if err := query.Order("last_active_at DESC").Find(&devices).Error; err != nil {
		return nil, err
	}

	return devices, nil
}

func (s *DeviceService) GetDevice(ctx context.Context, deviceID string) (*models.Device, error) {
	var device models.Device
	if err := s.db.WithContext(ctx).Where("device_id = ?", deviceID).First(&device).Error; err != nil {
		return nil, err
	}
	return &device, nil
}

func (s *DeviceService) ListDevices(ctx context.Context, tenantID string, channelType string, isActive *bool, page, pageSize int) ([]*models.Device, int64, error) {
	var devices []*models.Device
	var total int64

	query := s.db.WithContext(ctx).Model(&models.Device{}).Where("tenant_id = ?", tenantID)
	if channelType != "" {
		query = query.Where("channel_type = ?", channelType)
	}
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Limit(pageSize).Offset(offset).Order("created_at DESC").Find(&devices).Error; err != nil {
		return nil, 0, err
	}

	return devices, total, nil
}

func (s *DeviceService) UpdateUserPreference(ctx context.Context, tenantID, userID string, preferences *models.UserPreference) error {
	var existing models.UserPreference
	err := s.db.WithContext(ctx).Where("tenant_id = ? AND user_id = ?", tenantID, userID).First(&existing).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		preferences.TenantID = tenantID
		preferences.UserID = userID
		return s.db.WithContext(ctx).Create(preferences).Error
	}

	if err != nil {
		return err
	}

	return s.db.WithContext(ctx).Model(&existing).Updates(preferences).Error
}

func (s *DeviceService) GetUserPreference(ctx context.Context, tenantID, userID string) (*models.UserPreference, error) {
	var preference models.UserPreference
	if err := s.db.WithContext(ctx).Where("tenant_id = ? AND user_id = ?", tenantID, userID).First(&preference).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &models.UserPreference{
				TenantID:        tenantID,
				UserID:          userID,
				QuietHoursStart: 22,
				QuietHoursEnd:   8,
				Timezone:        "Asia/Shanghai",
				Language:        "zh-CN",
			}, nil
		}
		return nil, err
	}
	return &preference, nil
}

func (s *DeviceService) CreateSegment(ctx context.Context, segment *models.UserSegment) error {
	return s.db.WithContext(ctx).Create(segment).Error
}

func (s *DeviceService) GetSegment(ctx context.Context, segmentID uint) (*models.UserSegment, error) {
	var segment models.UserSegment
	if err := s.db.WithContext(ctx).First(&segment, segmentID).Error; err != nil {
		return nil, err
	}
	return &segment, nil
}

func (s *DeviceService) ListSegments(ctx context.Context, tenantID string, page, pageSize int) ([]*models.UserSegment, int64, error) {
	var segments []*models.UserSegment
	var total int64

	if err := s.db.WithContext(ctx).Model(&models.UserSegment{}).Where("tenant_id = ?", tenantID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := s.db.WithContext(ctx).Where("tenant_id = ?", tenantID).Limit(pageSize).Offset(offset).Order("created_at DESC").Find(&segments).Error; err != nil {
		return nil, 0, err
	}

	return segments, total, nil
}

func (s *DeviceService) DeleteSegment(ctx context.Context, segmentID uint) error {
	return s.db.WithContext(ctx).Delete(&models.UserSegment{}, "id = ?", segmentID).Error
}

func (s *DeviceService) cacheDeviceBinding(ctx context.Context, tenantID, userID, deviceID, deviceToken, channelType, pushProvider string) error {
	redis := database.GetRedis()
	
	deviceKey := fmt.Sprintf("device:%s:%s", tenantID, deviceID)
	deviceInfo := map[string]interface{}{
		"user_id":       userID,
		"device_token":  deviceToken,
		"channel_type":  channelType,
		"push_provider": pushProvider,
	}

	if err := redis.HSet(ctx, deviceKey, deviceInfo).Err(); err != nil {
		return err
	}
	if err := redis.Expire(ctx, deviceKey, 24*time.Hour).Err(); err != nil {
		return err
	}

	userDevicesKey := fmt.Sprintf("user_devices:%s:%s:%s", tenantID, userID, channelType)
	if err := redis.SAdd(ctx, userDevicesKey, deviceID).Err(); err != nil {
		return err
	}
	if err := redis.Expire(ctx, userDevicesKey, 24*time.Hour).Err(); err != nil {
		return err
	}

	return nil
}

func (s *DeviceService) removeDeviceFromCache(ctx context.Context, tenantID, userID, deviceID string) error {
	redis := database.GetRedis()

	deviceKey := fmt.Sprintf("device:%s:%s", tenantID, deviceID)
	if err := redis.Del(ctx, deviceKey).Err(); err != nil {
		return err
	}

	channelTypes := []string{models.ChannelTypePush, models.ChannelTypeSMS, models.ChannelTypeEmail, models.ChannelTypeWebSocket}
	for _, ct := range channelTypes {
		userDevicesKey := fmt.Sprintf("user_devices:%s:%s:%s", tenantID, userID, ct)
		if err := redis.SRem(ctx, userDevicesKey, deviceID).Err(); err != nil {
			return err
		}
	}

	return nil
}

func (s *DeviceService) GetCachedDevice(ctx context.Context, tenantID, deviceID string) (map[string]string, error) {
	redis := database.GetRedis()
	deviceKey := fmt.Sprintf("device:%s:%s", tenantID, deviceID)
	
	result, err := redis.HGetAll(ctx, deviceKey).Result()
	if err != nil {
		return nil, err
	}

	if len(result) == 0 {
		return nil, errors.New("device not found in cache")
	}

	return result, nil
}

func (s *DeviceService) GetCachedUserDevices(ctx context.Context, tenantID, userID, channelType string) ([]string, error) {
	redis := database.GetRedis()
	userDevicesKey := fmt.Sprintf("user_devices:%s:%s:%s", tenantID, userID, channelType)
	
	deviceIDs, err := redis.SMembers(ctx, userDevicesKey).Result()
	if err != nil {
		return nil, err
	}

	return deviceIDs, nil
}
