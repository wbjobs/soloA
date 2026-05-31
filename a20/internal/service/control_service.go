package service

import (
	"encoding/json"
	"fmt"
	"time"

	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type DeviceControlService struct{}

func NewDeviceControlService() *DeviceControlService {
	return &DeviceControlService{}
}

func (s *DeviceControlService) SendCommand(deviceID uint, commandType string, commandData map[string]interface{}) (*model.DeviceCommand, error) {
	device, err := NewDeviceService().GetDeviceByID(deviceID)
	if err != nil {
		return nil, err
	}

	if !device.IsOnline() {
		return nil, fmt.Errorf("device is offline")
	}

	commandDataJSON, _ := json.Marshal(commandData)

	command := &model.DeviceCommand{
		DeviceID:    deviceID,
		CommandType: commandType,
		CommandData: string(commandDataJSON),
		Status:      model.CommandStatusPending,
	}

	result := infrastructure.DB.Create(command)
	if result.Error != nil {
		return nil, result.Error
	}

	commandID := fmt.Sprintf("%d", command.ID)
	controlCommand := &model.ControlCommand{
		DeviceKey:   device.DeviceKey,
		CommandID:   commandID,
		CommandType: commandType,
		CommandData: commandData,
		Timestamp:   time.Now(),
	}

	mqttService := NewMQTTService()
	err = mqttService.PublishCommand(device.DeviceKey, controlCommand)
	if err != nil {
		now := time.Now()
		infrastructure.DB.Model(command).Updates(map[string]interface{}{
			"status":    model.CommandStatusFailed,
			"error_msg": err.Error(),
			"sent_at":   &now,
		})
		return nil, err
	}

	now := time.Now()
	infrastructure.DB.Model(command).Updates(map[string]interface{}{
		"status":  model.CommandStatusSent,
		"sent_at": &now,
	})

	logger.Info("Control command sent", 
		logger.Uint("command_id", command.ID),
		logger.String("device_key", device.DeviceKey),
		logger.String("command_type", commandType))

	return command, nil
}

func (s *DeviceControlService) HandleResponse(response *model.CommandResponse) error {
	var commandID uint
	_, err := fmt.Sscanf(response.CommandID, "%d", &commandID)
	if err != nil {
		return fmt.Errorf("invalid command ID: %s", response.CommandID)
	}

	var command model.DeviceCommand
	result := infrastructure.DB.First(&command, commandID)
	if result.Error != nil {
		return result.Error
	}

	now := time.Now()
	updates := map[string]interface{}{
		"response_at": &now,
	}

	if response.Status == "success" {
		updates["status"] = model.CommandStatusSuccess
		if responseDataJSON, err := json.Marshal(response.ResponseData); err == nil {
			updates["response_data"] = string(responseDataJSON)
		}
	} else {
		updates["status"] = model.CommandStatusFailed
		if response.ErrorMsg != "" {
			updates["error_msg"] = response.ErrorMsg
		}
	}

	result = infrastructure.DB.Model(&command).Updates(updates)
	if result.Error != nil {
		return result.Error
	}

	logger.Info("Command response received", 
		logger.Uint("command_id", commandID),
		logger.String("status", response.Status))

	return nil
}

func (s *DeviceControlService) GetCommandByID(commandID uint) (*model.DeviceCommand, error) {
	var command model.DeviceCommand
	result := infrastructure.DB.Preload("Device").First(&command, commandID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &command, nil
}

func (s *DeviceControlService) ListDeviceCommands(deviceID uint, page, pageSize int) ([]model.DeviceCommand, int64, error) {
	var commands []model.DeviceCommand
	var total int64

	offset := (page - 1) * pageSize

	query := infrastructure.DB.Model(&model.DeviceCommand{}).Where("device_id = ?", deviceID)
	query.Count(&total)
	query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&commands)

	return commands, total, nil
}

func (s *DeviceControlService) CheckCommandTimeout(timeoutSeconds int) {
	cutoffTime := time.Now().Add(-time.Duration(timeoutSeconds) * time.Second)

	var commands []model.DeviceCommand
	infrastructure.DB.Where("status IN ? AND sent_at < ?", 
		[]string{model.CommandStatusPending, model.CommandStatusSent}, cutoffTime).Find(&commands)

	for _, command := range commands {
		infrastructure.DB.Model(&command).Update("status", model.CommandStatusTimeout)
		logger.Warn("Command timeout", logger.Uint("command_id", command.ID))
	}
}
