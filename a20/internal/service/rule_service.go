package service

import (
	"encoding/json"
	"fmt"

	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type RuleService struct{}

func NewRuleService() *RuleService {
	return &RuleService{}
}

func (s *RuleService) CreateRule(userID uint, ruleName, description, conditionJSON, actionsJSON string, status, priority int) (*model.Rule, error) {
	rule := &model.Rule{
		UserID:      userID,
		RuleName:    ruleName,
		Description: description,
		Condition:   conditionJSON,
		Actions:     actionsJSON,
		Status:      status,
		Priority:    priority,
	}

	result := infrastructure.DB.Create(rule)
	if result.Error != nil {
		return nil, result.Error
	}

	return rule, nil
}

func (s *RuleService) UpdateRule(ruleID uint, updates map[string]interface{}) (*model.Rule, error) {
	result := infrastructure.DB.Model(&model.Rule{}).Where("id = ?", ruleID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}

	var rule model.Rule
	infrastructure.DB.First(&rule, ruleID)
	return &rule, nil
}

func (s *RuleService) DeleteRule(ruleID uint) error {
	return infrastructure.DB.Transaction(func(tx interface{}) error {
		db := tx.(interface {
			Exec(string, ...interface{}) interface{}
			Delete(interface{}, ...interface{}) interface{}
		})

		if err := db.Exec("DELETE FROM device_rules WHERE rule_id = ?", ruleID); err != nil {
			return fmt.Errorf("delete device_rules failed")
		}
		if err := db.Delete(&model.Rule{}, ruleID); err != nil {
			return fmt.Errorf("delete rule failed")
		}
		return nil
	})
}

func (s *RuleService) GetRuleByID(ruleID uint) (*model.Rule, error) {
	var rule model.Rule
	result := infrastructure.DB.Preload("Devices").First(&rule, ruleID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &rule, nil
}

func (s *RuleService) ListRules(userID uint) ([]model.Rule, error) {
	var rules []model.Rule
	result := infrastructure.DB.Where("user_id = ?", userID).Find(&rules)
	if result.Error != nil {
		return nil, result.Error
	}
	return rules, nil
}

func (s *RuleService) BindDeviceToRule(ruleID, deviceID uint) error {
	deviceRule := &model.DeviceRule{
		DeviceID: deviceID,
		RuleID:   ruleID,
	}

	result := infrastructure.DB.Create(deviceRule)
	return result.Error
}

func (s *RuleService) UnbindDeviceFromRule(ruleID, deviceID uint) error {
	result := infrastructure.DB.Where("rule_id = ? AND device_id = ?", ruleID, deviceID).Delete(&model.DeviceRule{})
	return result.Error
}

func (s *RuleService) ToggleRule(ruleID uint, enable bool) error {
	status := model.RuleStatusDisabled
	if enable {
		status = model.RuleStatusEnabled
	}
	result := infrastructure.DB.Model(&model.Rule{}).Where("id = ?", ruleID).Update("status", status)
	return result.Error
}
