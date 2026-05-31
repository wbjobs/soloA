package model

import (
	"time"

	"gorm.io/gorm"
)

type Alert struct {
	ID            uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	DeviceID      uint           `gorm:"index" json:"device_id"`
	RuleID        *uint          `gorm:"index" json:"rule_id,omitempty"`
	AlertType     string         `gorm:"size:50;not null" json:"alert_type"`
	AlertLevel    string         `gorm:"size:20;default:warning" json:"alert_level"`
	Title         string         `gorm:"size:200;not null" json:"title"`
	Content       string         `gorm:"type:text;not null" json:"content"`
	Data          string         `gorm:"type:text" json:"data,omitempty"`
	Status        int            `gorm:"default:0" json:"status"`
	NotifiedAt    *time.Time     `json:"notified_at,omitempty"`
	HandledAt     *time.Time     `json:"handled_at,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	User          *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Device        *Device        `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
	Rule          *Rule          `gorm:"foreignKey:RuleID" json:"rule,omitempty"`
	Notifications []Notification `gorm:"foreignKey:AlertID" json:"notifications,omitempty"`
}

type Notification struct {
	ID               uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	AlertID          uint           `gorm:"not null;index" json:"alert_id"`
	NotificationType string         `gorm:"size:20;not null" json:"notification_type"`
	Recipient        string         `gorm:"size:100;not null" json:"recipient"`
	Status           int            `gorm:"default:0" json:"status"`
	ErrorMsg         string         `gorm:"size:500" json:"error_msg,omitempty"`
	SentAt           *time.Time     `json:"sent_at,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`

	Alert            *Alert         `gorm:"foreignKey:AlertID" json:"alert,omitempty"`
}

func (Alert) TableName() string {
	return "alerts"
}

func (Notification) TableName() string {
	return "notifications"
}

const (
	AlertTypeThresholdExceeded = "threshold_exceeded"
	AlertTypeDeviceOffline     = "device_offline"
	AlertTypeDeviceOnline      = "device_online"
	AlertTypeRuleTriggered     = "rule_triggered"
	AlertTypeDeviceError       = "device_error"

	AlertLevelCritical = "critical"
	AlertLevelWarning  = "warning"
	AlertLevelInfo     = "info"

	AlertStatusUnhandled = 0
	AlertStatusHandled   = 1
	AlertStatusIgnored   = 2

	NotificationStatusPending = 0
	NotificationStatusSuccess = 1
	NotificationStatusFailed  = 2

	NotificationTypeEmail = "email"
	NotificationTypeSMS   = "sms"
)

func (a *Alert) IsHandled() bool {
	return a.Status == AlertStatusHandled || a.Status == AlertStatusIgnored
}

func (a *Alert) MarkHandled() {
	now := time.Now()
	a.Status = AlertStatusHandled
	a.HandledAt = &now
}
