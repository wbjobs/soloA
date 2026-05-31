package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/services/device"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type ChannelRouter struct {
	db            *gorm.DB
	redisClient   *redis.Client
	deviceService *device.DeviceService
	circuitBreaker map[string]bool
}

func NewChannelRouter(deviceService *device.DeviceService) *ChannelRouter {
	return &ChannelRouter{
		db:             database.GetDB(),
		redisClient:    database.GetRedis(),
		deviceService:  deviceService,
		circuitBreaker: make(map[string]bool),
	}
}

type RouteRequest struct {
	TenantID       string
	UserID         string
	UserIDs        []string
	ChannelType    string
	Priority       string
	QuietHours     bool
	PreferredChannels []string
	OptOutChannels []string
}

type RouteResult struct {
	PrimaryChannel    string
	BackupChannels    []string
	IsQuietHours      bool
	IsOptedOut        bool
	Reason            string
}

type ChannelStatus struct {
	ChannelType string
	IsAvailable bool
	LastChecked time.Time
	ErrorCount  int
	SuccessRate float64
}

func (r *ChannelRouter) Route(ctx context.Context, req *RouteRequest) (*RouteResult, error) {
	result := &RouteResult{
		BackupChannels: make([]string, 0),
	}

	if req.QuietHours {
		isQuiet, err := r.checkQuietHours(ctx, req.TenantID, req.UserID)
		if err != nil {
			return nil, err
		}
		if isQuiet && req.Priority != models.PriorityHigh {
			result.IsQuietHours = true
			result.Reason = "Quiet hours"
			return result, nil
		}
	}

	if len(req.OptOutChannels) > 0 {
		optOutMap := make(map[string]bool)
		for _, ch := range req.OptOutChannels {
			optOutMap[ch] = true
		}
		if optOutMap[req.ChannelType] {
			result.IsOptedOut = true
			result.Reason = "User opted out"
			return result, nil
		}
	}

	if req.ChannelType != "" {
		if r.isChannelAvailable(req.ChannelType) {
			result.PrimaryChannel = req.ChannelType
			result.BackupChannels = r.getBackupChannels(req.ChannelType)
			return result, nil
		}

		backupChannel, found := r.findAvailableBackup(req.ChannelType)
		if found {
			result.PrimaryChannel = backupChannel
			result.Reason = fmt.Sprintf("Primary channel %s unavailable, switched to backup", req.ChannelType)
			return result, nil
		}
	}

	if len(req.PreferredChannels) > 0 {
		for _, ch := range req.PreferredChannels {
			if r.isChannelAvailable(ch) {
				result.PrimaryChannel = ch
				result.BackupChannels = r.getBackupChannels(ch)
				return result, nil
			}
		}
	}

	defaultChannels := []string{
		models.ChannelTypePush,
		models.ChannelTypeInApp,
		models.ChannelTypeSMS,
		models.ChannelTypeEmail,
	}

	for _, ch := range defaultChannels {
		if r.isChannelAvailable(ch) {
			result.PrimaryChannel = ch
			result.BackupChannels = r.getBackupChannels(ch)
			return result, nil
		}
	}

	return result, errors.New("no available channels")
}

func (r *ChannelRouter) checkQuietHours(ctx context.Context, tenantID, userID string) (bool, error) {
	preference, err := r.deviceService.GetUserPreference(ctx, tenantID, userID)
	if err != nil {
		return false, err
	}

	now := time.Now()
	hour := now.Hour()

	start := preference.QuietHoursStart
	end := preference.QuietHoursEnd

	if start < end {
		return hour >= start && hour < end, nil
	}

	return hour >= start || hour < end, nil
}

func (r *ChannelRouter) isChannelAvailable(channelType string) bool {
	if r.circuitBreaker[channelType] {
		return false
	}

	healthKey := fmt.Sprintf("channel_health:%s", channelType)
	status, err := r.redisClient.Get(context.Background(), healthKey).Result()
	if err != nil {
		return true
	}

	var channelStatus ChannelStatus
	if err := json.Unmarshal([]byte(status), &channelStatus); err != nil {
		return true
	}

	return channelStatus.IsAvailable
}

func (r *ChannelRouter) getBackupChannels(primaryChannel string) []string {
	backupMap := map[string][]string{
		models.ChannelTypePush: {
			models.ChannelTypeInApp,
			models.ChannelTypeSMS,
			models.ChannelTypeEmail,
		},
		models.ChannelTypeSMS: {
			models.ChannelTypeEmail,
			models.ChannelTypePush,
		},
		models.ChannelTypeEmail: {
			models.ChannelTypePush,
			models.ChannelTypeInApp,
		},
		models.ChannelTypeInApp: {
			models.ChannelTypeWebSocket,
			models.ChannelTypePush,
		},
		models.ChannelTypeWebSocket: {
			models.ChannelTypePush,
			models.ChannelTypeInApp,
		},
	}

	if backups, exists := backupMap[primaryChannel]; exists {
		return backups
	}

	return []string{models.ChannelTypeEmail}
}

func (r *ChannelRouter) findAvailableBackup(failedChannel string) (string, bool) {
	backups := r.getBackupChannels(failedChannel)
	for _, backup := range backups {
		if r.isChannelAvailable(backup) {
			return backup, true
		}
	}
	return "", false
}

func (r *ChannelRouter) UpdateChannelHealth(channelType string, success bool) error {
	healthKey := fmt.Sprintf("channel_health:%s", channelType)
	
	ctx := context.Background()
	var status ChannelStatus

	existing, err := r.redisClient.Get(ctx, healthKey).Result()
	if err == nil {
		json.Unmarshal([]byte(existing), &status)
	}

	if status.ChannelType == "" {
		status = ChannelStatus{
			ChannelType: channelType,
			IsAvailable: true,
			LastChecked: time.Now(),
			ErrorCount:  0,
			SuccessRate: 1.0,
		}
	}

	if success {
		status.ErrorCount = max(0, status.ErrorCount-1)
	} else {
		status.ErrorCount++
	}

	if status.ErrorCount >= 10 {
		status.IsAvailable = false
		r.circuitBreaker[channelType] = true

		go func() {
			time.Sleep(5 * time.Minute)
			r.circuitBreaker[channelType] = false
			status.IsAvailable = true
			status.ErrorCount = 0
			r.saveChannelStatus(healthKey, status)
		}()
	}

	status.LastChecked = time.Now()
	return r.saveChannelStatus(healthKey, status)
}

func (r *ChannelRouter) saveChannelStatus(key string, status ChannelStatus) error {
	data, err := json.Marshal(status)
	if err != nil {
		return err
	}
	return r.redisClient.Set(context.Background(), key, data, 24*time.Hour).Err()
}

func (r *ChannelRouter) DetectDeviceChannel(devices []*models.Device) string {
	if len(devices) == 0 {
		return models.ChannelTypeEmail
	}

	device := devices[0]
	
	switch device.DeviceType {
	case "ios":
		if strings.Contains(device.PushProvider, models.ProviderTypeAPNs) {
			return models.ChannelTypePush
		}
	case "android":
		if strings.Contains(device.PushProvider, models.ProviderTypeFCM) ||
		   strings.Contains(device.PushProvider, models.ProviderTypeXiaomi) ||
		   strings.Contains(device.PushProvider, models.ProviderTypeHuawei) {
			return models.ChannelTypePush
		}
	}

	return device.ChannelType
}

func (r *ChannelRouter) GetChannelStatus(channelType string) (*ChannelStatus, error) {
	healthKey := fmt.Sprintf("channel_health:%s", channelType)
	data, err := r.redisClient.Get(context.Background(), healthKey).Result()
	if err != nil {
		return &ChannelStatus{
			ChannelType: channelType,
			IsAvailable: true,
			SuccessRate: 1.0,
		}, nil
	}

	var status ChannelStatus
	if err := json.Unmarshal([]byte(data), &status); err != nil {
		return nil, err
	}

	return &status, nil
}

func (r *ChannelRouter) GetAllChannelStatus() (map[string]*ChannelStatus, error) {
	channels := []string{
		models.ChannelTypePush,
		models.ChannelTypeSMS,
		models.ChannelTypeEmail,
		models.ChannelTypeInApp,
		models.ChannelTypeWebSocket,
	}

	result := make(map[string]*ChannelStatus)
	for _, ch := range channels {
		status, err := r.GetChannelStatus(ch)
		if err != nil {
			return nil, err
		}
		result[ch] = status
	}

	return result, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
