package service

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"

	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type RuleEngineService struct {
	ruleService      *RuleService
	alertService     *AlertService
	controlService   *DeviceControlService
}

func NewRuleEngineService() *RuleEngineService {
	return &RuleEngineService{
		ruleService:    NewRuleService(),
		alertService:   NewAlertService(),
		controlService: NewDeviceControlService(),
	}
}

func (s *RuleEngineService) ProcessDeviceData(device *model.Device, data *model.DeviceData) {
	rules, err := s.getDeviceActiveRules(device.ID)
	if err != nil {
		logger.Error("Failed to get device rules", 
			logger.String("device_key", device.DeviceKey),
			logger.ErrorField(err))
		return
	}

	sort.Slice(rules, func(i, j int) bool {
		return rules[i].Priority > rules[j].Priority
	})

	for _, rule := range rules {
		if !rule.IsEnabled() {
			continue
		}

		matched, err := s.evaluateCondition(&rule, data)
		if err != nil {
			logger.Error("Failed to evaluate rule condition", 
				logger.Uint("rule_id", rule.ID),
				logger.ErrorField(err))
			continue
		}

		if matched {
			logger.Info("Rule matched", 
				logger.Uint("rule_id", rule.ID),
				logger.String("rule_name", rule.RuleName),
				logger.String("device_key", device.DeviceKey))
			s.executeActions(&rule, device, data)
		}
	}
}

func (s *RuleEngineService) getDeviceActiveRules(deviceID uint) ([]model.Rule, error) {
	var rules []model.Rule
	err := infrastructure.DB.Joins("JOIN device_rules ON device_rules.rule_id = rules.id").
		Where("device_rules.device_id = ? AND rules.status = ?", deviceID, model.RuleStatusEnabled).
		Find(&rules).Error
	return rules, err
}

func (s *RuleEngineService) evaluateCondition(rule *model.Rule, data *model.DeviceData) (bool, error) {
	var condition model.RuleCondition
	if err := json.Unmarshal([]byte(rule.Condition), &condition); err != nil {
		return false, fmt.Errorf("invalid condition JSON: %w", err)
	}

	return s.evaluateRuleCondition(&condition, data), nil
}

func (s *RuleEngineService) evaluateRuleCondition(cond *model.RuleCondition, data *model.DeviceData) bool {
	if len(cond.Conditions) > 0 {
		results := make([]bool, 0, len(cond.Conditions))
		for _, subCond := range cond.Conditions {
			results = append(results, s.evaluateRuleCondition(subCond, data))
		}

		if cond.Logic == model.LogicOr {
			for _, r := range results {
				if r {
					return true
				}
			}
			return false
		}

		for _, r := range results {
			if !r {
				return false
			}
		}
		return true
	}

	value, exists := data.Metrics[cond.Metric]
	if !exists {
		return false
	}

	return s.compareValues(value, cond.Value, cond.Operator)
}

func (s *RuleEngineService) compareValues(actual, expected interface{}, operator string) bool {
	actualFloat, isActualFloat := toFloat64(actual)
	expectedFloat, isExpectedFloat := toFloat64(expected)

	if isActualFloat && isExpectedFloat {
		return s.compareFloats(actualFloat, expectedFloat, operator)
	}

	actualStr := fmt.Sprintf("%v", actual)
	expectedStr := fmt.Sprintf("%v", expected)

	switch operator {
	case model.OperatorEqual:
		return actualStr == expectedStr
	case model.OperatorNotEqual:
		return actualStr != expectedStr
	case model.OperatorContains:
		return contains(actualStr, expectedStr)
	default:
		return actualStr == expectedStr
	}
}

func (s *RuleEngineService) compareFloats(actual, expected float64, operator string) bool {
	switch operator {
	case model.OperatorEqual:
		return actual == expected
	case model.OperatorNotEqual:
		return actual != expected
	case model.OperatorGreaterThan:
		return actual > expected
	case model.OperatorGreaterThanOrEqual:
		return actual >= expected
	case model.OperatorLessThan:
		return actual < expected
	case model.OperatorLessThanOrEqual:
		return actual <= expected
	default:
		return false
	}
}

func (s *RuleEngineService) executeActions(rule *model.Rule, device *model.Device, data *model.DeviceData) {
	var actions []model.RuleAction
	if err := json.Unmarshal([]byte(rule.Actions), &actions); err != nil {
		logger.Error("Failed to parse rule actions", 
			logger.Uint("rule_id", rule.ID),
			logger.ErrorField(err))
		return
	}

	for _, action := range actions {
		switch action.ActionType {
		case model.ActionTypeAlert:
			s.handleAlertAction(rule, device, data, action.Params)
		case model.ActionTypeCommand:
			s.handleCommandAction(device, action.Params)
		case model.ActionTypeForward:
			s.handleForwardAction(device, data, action.Params)
		case model.ActionTypeTransform:
			s.handleTransformAction(data, action.Params)
		}
	}
}

func (s *RuleEngineService) handleAlertAction(rule *model.Rule, device *model.Device, data *model.DeviceData, params map[string]interface{}) {
	level := model.AlertLevelWarning
	if l, ok := params["level"].(string); ok {
		level = l
	}

	title := fmt.Sprintf("规则触发: %s", rule.RuleName)
	if t, ok := params["title"].(string); ok {
		title = t
	}

	dataJSON, _ := json.Marshal(data.Metrics)

	alert := &model.Alert{
		UserID:     device.UserID,
		DeviceID:   device.ID,
		RuleID:     &rule.ID,
		AlertType:  model.AlertTypeRuleTriggered,
		AlertLevel: level,
		Title:      title,
		Content:    fmt.Sprintf("设备 %s 触发规则 %s，数据: %s", device.DeviceKey, rule.RuleName, string(dataJSON)),
		Data:       string(dataJSON),
	}

	if _, err := s.alertService.CreateAlert(alert); err != nil {
		logger.Error("Failed to create alert from rule", logger.ErrorField(err))
	}
}

func (s *RuleEngineService) handleCommandAction(device *model.Device, params map[string]interface{}) {
	commandType, ok := params["command_type"].(string)
	if !ok {
		logger.Warn("Command action missing command_type")
		return
	}

	commandData := make(map[string]interface{})
	if cd, ok := params["command_data"].(map[string]interface{}); ok {
		commandData = cd
	}

	_, err := s.controlService.SendCommand(device.ID, commandType, commandData)
	if err != nil {
		logger.Error("Failed to send command from rule", 
			logger.Uint("device_id", device.ID),
			logger.ErrorField(err))
	}
}

func (s *RuleEngineService) handleForwardAction(device *model.Device, data *model.DeviceData, params map[string]interface{}) {
	target, ok := params["target"].(string)
	if !ok {
		logger.Warn("Forward action missing target")
		return
	}

	logger.Info("Forwarding data", 
		logger.String("target", target),
		logger.String("device_key", device.DeviceKey))
}

func (s *RuleEngineService) handleTransformAction(data *model.DeviceData, params map[string]interface{}) {
	logger.Debug("Transform action executed", logger.Any("data", data.Metrics))
}

func toFloat64(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case int32:
		return float64(val), true
	case uint:
		return float64(val), true
	case uint64:
		return float64(val), true
	case json.Number:
		f, err := val.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func contains(str, substr string) bool {
	return len(str) >= len(substr) && (str == substr || containsCheck(str, substr))
}

func containsCheck(str, substr string) bool {
	for i := 0; i <= len(str)-len(substr); i++ {
		if str[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func init() {
	_ = reflect.TypeOf(0)
}
