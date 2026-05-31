package model

import (
	"time"

	"gorm.io/gorm"
)

type Rule struct {
	ID          uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID      uint           `gorm:"not null;index" json:"user_id"`
	RuleName    string         `gorm:"size:100;not null" json:"rule_name"`
	Description string         `gorm:"size:500" json:"description"`
	Condition   string         `gorm:"type:text;not null" json:"condition"`
	Actions     string         `gorm:"type:text;not null" json:"actions"`
	Status      int            `gorm:"default:1" json:"status"`
	Priority    int            `gorm:"default:0" json:"priority"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	User        *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Devices     []Device       `gorm:"many2many:device_rules" json:"devices,omitempty"`
}

type RuleCondition struct {
	Metric     string                 `json:"metric"`
	Operator   string                 `json:"operator"`
	Value      interface{}            `json:"value"`
	Logic      string                 `json:"logic,omitempty"`
	Conditions []*RuleCondition       `json:"conditions,omitempty"`
}

type RuleAction struct {
	ActionType  string                 `json:"action_type"`
	Params      map[string]interface{} `json:"params"`
}

type DeviceRule struct {
	DeviceID uint `gorm:"primaryKey;autoIncrement:false" json:"device_id"`
	RuleID   uint `gorm:"primaryKey;autoIncrement:false" json:"rule_id"`
}

func (Rule) TableName() string {
	return "rules"
}

func (DeviceRule) TableName() string {
	return "device_rules"
}

const (
	RuleStatusEnabled  = 1
	RuleStatusDisabled = 0

	ActionTypeAlert      = "alert"
	ActionTypeForward    = "forward"
	ActionTypeTransform  = "transform"
	ActionTypeCommand    = "command"

	OperatorEqual              = "eq"
	OperatorNotEqual           = "ne"
	OperatorGreaterThan        = "gt"
	OperatorGreaterThanOrEqual = "gte"
	OperatorLessThan           = "lt"
	OperatorLessThanOrEqual    = "lte"
	OperatorContains           = "contains"
	OperatorIn                 = "in"

	LogicAnd = "and"
	LogicOr  = "or"
)

func (r *Rule) IsEnabled() bool {
	return r.Status == RuleStatusEnabled
}
