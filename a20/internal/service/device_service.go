package service

import (
	"errors"
	"time"

	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
	"gorm.io/gorm"
)

type DeviceService struct {
	alertService *AlertService
}

func NewDeviceService() *DeviceService {
	return &DeviceService{
		alertService: NewAlertService(),
	}
}

func (s *DeviceService) RegisterDevice(userID uint, deviceName, deviceType, description, protocol string, metadata string) (*model.Device, error) {
	device := &model.Device{
		UserID:       userID,
		DeviceKey:    GenerateDeviceKey(),
		DeviceSecret: GenerateDeviceSecret(),
		DeviceName:   deviceName,
		DeviceType:   deviceType,
		Protocol:     protocol,
		Status:       model.DeviceStatusOffline,
		Description:  description,
		Metadata:     metadata,
	}

	result := infrastructure.DB.Create(device)
	if result.Error != nil {
		return nil, result.Error
	}

	return device, nil
}

func (s *DeviceService) UpdateDevice(deviceID uint, updates map[string]interface{}) (*model.Device, error) {
	result := infrastructure.DB.Model(&model.Device{}).Where("id = ?", deviceID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}

	var device model.Device
	infrastructure.DB.First(&device, deviceID)
	return &device, nil
}

func (s *DeviceService) DeleteDevice(deviceID uint) error {
	result := infrastructure.DB.Delete(&model.Device{}, deviceID)
	return result.Error
}

func (s *DeviceService) GetDeviceByID(deviceID uint) (*model.Device, error) {
	var device model.Device
	result := infrastructure.DB.Preload("Group").First(&device, deviceID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &device, nil
}

func (s *DeviceService) GetDeviceByKey(deviceKey string) (*model.Device, error) {
	var device model.Device
	result := infrastructure.DB.Where("device_key = ?", deviceKey).First(&device)
	if result.Error != nil {
		return nil, result.Error
	}
	return &device, nil
}

func (s *DeviceService) ListDevices(userID uint, page, pageSize int) ([]model.Device, int64, error) {
	var devices []model.Device
	var total int64

	offset := (page - 1) * pageSize

	query := infrastructure.DB.Model(&model.Device{}).Where("user_id = ?", userID)
	query.Count(&total)
	query.Preload("Group").Offset(offset).Limit(pageSize).Find(&devices)

	return devices, total, nil
}

func (s *DeviceService) DeviceHeartbeat(deviceKey string) error {
	var device model.Device
	result := infrastructure.DB.Where("device_key = ?", deviceKey).First(&device)
	if result.Error != nil {
		return result.Error
	}

	wasOffline := !device.IsOnline()
	now := time.Now()

	updates := map[string]interface{}{
		"status":          model.DeviceStatusOnline,
		"last_heartbeat":  &now,
		"updated_at":      now,
	}

	if wasOffline {
		updates["last_online"] = &now
	}

	infrastructure.DB.Model(&device).Updates(updates)

	if wasOffline {
		logger.Info("Device came online", logger.String("device_key", deviceKey))
		s.alertService.CreateDeviceOnlineAlert(&device)
	}

	return nil
}

func (s *DeviceService) CheckDeviceStatus() {
	timeoutDuration := time.Duration(config.AppConfig.DeviceHeartbeat.TimeoutSeconds) * time.Second
	cutoffTime := time.Now().Add(-timeoutDuration)

	var devices []model.Device
	infrastructure.DB.Where("status = ? AND (last_heartbeat IS NULL OR last_heartbeat < ?)", 
		model.DeviceStatusOnline, cutoffTime).Find(&devices)

	for _, device := range devices {
		s.markDeviceOffline(&device)
	}
}

func (s *DeviceService) markDeviceOffline(device *model.Device) {
	infrastructure.DB.Model(device).Update("status", model.DeviceStatusOffline)
	logger.Warn("Device went offline", logger.String("device_key", device.DeviceKey))
	s.alertService.CreateDeviceOfflineAlert(device)
}

func (s *DeviceService) AssignToGroup(deviceID, groupID uint) error {
	result := infrastructure.DB.Model(&model.Device{}).Where("id = ?", deviceID).Update("group_id", groupID)
	return result.Error
}

func (s *DeviceService) RemoveFromGroup(deviceID uint) error {
	result := infrastructure.DB.Model(&model.Device{}).Where("id = ?", deviceID).Update("group_id", nil)
	return result.Error
}

func (s *DeviceService) GetDeviceRules(deviceID uint) ([]model.Rule, error) {
	var device model.Device
	result := infrastructure.DB.Preload("Rules").First(&device, deviceID)
	if result.Error != nil {
		return nil, result.Error
	}
	return device.Rules, nil
}

type DeviceGroupService struct{}

func NewDeviceGroupService() *DeviceGroupService {
	return &DeviceGroupService{}
}

func (s *DeviceGroupService) CreateGroup(userID uint, groupName, description string) (*model.DeviceGroup, error) {
	group := &model.DeviceGroup{
		UserID:      userID,
		GroupName:   groupName,
		Description: description,
	}

	result := infrastructure.DB.Create(group)
	if result.Error != nil {
		return nil, result.Error
	}

	return group, nil
}

func (s *DeviceGroupService) UpdateGroup(groupID uint, updates map[string]interface{}) (*model.DeviceGroup, error) {
	result := infrastructure.DB.Model(&model.DeviceGroup{}).Where("id = ?", groupID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}

	var group model.DeviceGroup
	infrastructure.DB.First(&group, groupID)
	return &group, nil
}

func (s *DeviceGroupService) DeleteGroup(groupID uint) error {
	return infrastructure.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Device{}).Where("group_id = ?", groupID).Update("group_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.DeviceGroup{}, groupID).Error; err != nil {
			return err
		}
		return nil
	})
}

func (s *DeviceGroupService) GetGroupByID(groupID uint) (*model.DeviceGroup, error) {
	var group model.DeviceGroup
	result := infrastructure.DB.Preload("Devices").First(&group, groupID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &group, nil
}

func (s *DeviceGroupService) ListGroups(userID uint) ([]model.DeviceGroup, error) {
	var groups []model.DeviceGroup
	result := infrastructure.DB.Where("user_id = ?", userID).Find(&groups)
	if result.Error != nil {
		return nil, result.Error
	}
	return groups, nil
}

func (s *DeviceGroupService) CheckDeviceOwnership(deviceID, userID uint) error {
	var device model.Device
	result := infrastructure.DB.First(&device, deviceID)
	if result.Error != nil {
		return errors.New("device not found")
	}
	if device.UserID != userID {
		return errors.New("device not owned by user")
	}
	return nil
}
