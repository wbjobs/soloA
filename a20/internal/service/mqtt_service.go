package service

import (
	"encoding/json"
	"fmt"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type MQTTService struct {
	protocolService  *ProtocolService
	deviceService    *DeviceService
	ruleEngineService *RuleEngineService
	dataService      *DataService
}

func NewMQTTService() *MQTTService {
	return &MQTTService{
		protocolService:  NewProtocolService(),
		deviceService:    NewDeviceService(),
		ruleEngineService: NewRuleEngineService(),
		dataService:      NewDataService(),
	}
}

func (s *MQTTService) Start() error {
	cfg := config.AppConfig.MQTT

	err := infrastructure.Subscribe(cfg.TopicDeviceData, s.handleDeviceData, byte(cfg.QOS))
	if err != nil {
		return fmt.Errorf("failed to subscribe to device data topic: %w", err)
	}

	err = infrastructure.Subscribe(cfg.TopicDeviceResponse, s.handleDeviceResponse, byte(cfg.QOS))
	if err != nil {
		return fmt.Errorf("failed to subscribe to device response topic: %w", err)
	}

	logger.Info("MQTT Service started successfully")
	return nil
}

func (s *MQTTService) handleDeviceData(client mqtt.Client, msg mqtt.Message) {
	logger.Debug("Received device data", 
		logger.String("topic", msg.Topic()),
		logger.Int("qos", int(msg.Qos())))

	deviceKey := s.extractDeviceKey(msg.Topic())
	if deviceKey == "" {
		logger.Warn("Could not extract device key from topic", logger.String("topic", msg.Topic()))
		return
	}

	var deviceData *model.DeviceData
	var err error

	device, err := s.deviceService.GetDeviceByKey(deviceKey)
	if err != nil {
		logger.Warn("Device not found, attempting auto-parse", logger.String("device_key", deviceKey))
		deviceData, err = s.protocolService.AutoParse(string(msg.Payload()))
	} else {
		deviceData, err = s.protocolService.Parse(string(msg.Payload()), device.Protocol)
	}

	if err != nil {
		logger.Error("Failed to parse device data", 
			logger.String("device_key", deviceKey),
			logger.ErrorField(err))
		return
	}

	if deviceData.DeviceKey == "" {
		deviceData.DeviceKey = deviceKey
	}

	err = s.processDeviceData(deviceData)
	if err != nil {
		logger.Error("Failed to process device data", 
			logger.String("device_key", deviceData.DeviceKey),
			logger.ErrorField(err))
	}
}

func (s *MQTTService) handleDeviceResponse(client mqtt.Client, msg mqtt.Message) {
	logger.Debug("Received device response", logger.String("topic", msg.Topic()))

	deviceKey := s.extractDeviceKey(msg.Topic())
	if deviceKey == "" {
		logger.Warn("Could not extract device key from response topic", logger.String("topic", msg.Topic()))
		return
	}

	var response model.CommandResponse
	if err := json.Unmarshal(msg.Payload(), &response); err != nil {
		logger.Error("Failed to parse command response", 
			logger.String("device_key", deviceKey),
			logger.ErrorField(err))
		return
	}

	if response.DeviceKey == "" {
		response.DeviceKey = deviceKey
	}

	controlService := NewDeviceControlService()
	if err := controlService.HandleResponse(&response); err != nil {
		logger.Error("Failed to handle command response", 
			logger.String("command_id", response.CommandID),
			logger.ErrorField(err))
	}
}

func (s *MQTTService) extractDeviceKey(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}

func (s *MQTTService) processDeviceData(data *model.DeviceData) error {
	err := s.deviceService.DeviceHeartbeat(data.DeviceKey)
	if err != nil {
		logger.Warn("Failed to update device heartbeat", 
			logger.String("device_key", data.DeviceKey),
			logger.ErrorField(err))
	}

	err = infrastructure.ProduceDeviceData(data)
	if err != nil {
		logger.Error("Failed to produce device data to Kafka", logger.ErrorField(err))
	}

	err = s.dataService.WriteData(data)
	if err != nil {
		logger.Error("Failed to write data to InfluxDB", logger.ErrorField(err))
	}

	device, err := s.deviceService.GetDeviceByKey(data.DeviceKey)
	if err == nil {
		go s.ruleEngineService.ProcessDeviceData(device, data)
	}

	return nil
}

func (s *MQTTService) PublishCommand(deviceKey string, command *model.ControlCommand) error {
	cfg := config.AppConfig.MQTT
	topic := fmt.Sprintf(cfg.TopicDeviceCommand, deviceKey)

	payload, err := command.Marshal()
	if err != nil {
		return err
	}

	return infrastructure.Publish(topic, payload, byte(cfg.QOS), false)
}
