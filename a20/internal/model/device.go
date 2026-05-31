package model

import (
	"time"

	"gorm.io/gorm"
)

type Device struct {
	ID            uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	GroupID       *uint          `gorm:"index" json:"group_id,omitempty"`
	DeviceKey     string         `gorm:"uniqueIndex;size:64;not null" json:"device_key"`
	DeviceName    string         `gorm:"size:100;not null" json:"device_name"`
	DeviceType    string         `gorm:"size:50" json:"device_type"`
	Protocol      string         `gorm:"size:20;default:mqtt" json:"protocol"`
	DeviceSecret  string         `gorm:"size:128;not null" json:"-"`
	Status        string         `gorm:"size:20;default:offline" json:"status"`
	LastOnline    *time.Time     `json:"last_online,omitempty"`
	LastHeartbeat *time.Time     `json:"last_heartbeat,omitempty"`
	Description   string         `gorm:"size:500" json:"description"`
	Metadata      string         `gorm:"type:text" json:"metadata,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	Group         *DeviceGroup   `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	User          *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Rules         []Rule         `gorm:"many2many:device_rules" json:"rules,omitempty"`
	Commands      []DeviceCommand `gorm:"foreignKey:DeviceID" json:"commands,omitempty"`
}

type DeviceGroup struct {
	ID          uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID      uint           `gorm:"not null;index" json:"user_id"`
	GroupName   string         `gorm:"size:100;not null" json:"group_name"`
	Description string         `gorm:"size:500" json:"description"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	User        *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Devices     []Device       `gorm:"foreignKey:GroupID" json:"devices,omitempty"`
}

type DeviceCommand struct {
	ID            uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	DeviceID      uint           `gorm:"not null;index" json:"device_id"`
	CommandType   string         `gorm:"size:50;not null" json:"command_type"`
	CommandData   string         `gorm:"type:text" json:"command_data"`
	Status        string         `gorm:"size:20;default:pending" json:"status"`
	ResponseData  string         `gorm:"type:text" json:"response_data,omitempty"`
	SentAt        *time.Time     `json:"sent_at,omitempty"`
	ResponseAt    *time.Time     `json:"response_at,omitempty"`
	ErrorMsg      string         `gorm:"size:500" json:"error_msg,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`

	Device        *Device        `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
}

func (Device) TableName() string {
	return "devices"
}

func (DeviceGroup) TableName() string {
	return "device_groups"
}

func (DeviceCommand) TableName() string {
	return "device_commands"
}

const (
	DeviceStatusOnline  = "online"
	DeviceStatusOffline = "offline"

	CommandStatusPending   = "pending"
	CommandStatusSent      = "sent"
	CommandStatusSuccess   = "success"
	CommandStatusFailed    = "failed"
	CommandStatusTimeout   = "timeout"
)

func (d *Device) IsOnline() bool {
	return d.Status == DeviceStatusOnline
}

func (d *Device) MarkOnline() {
	now := time.Now()
	d.Status = DeviceStatusOnline
	d.LastOnline = &now
	d.LastHeartbeat = &now
}

func (d *Device) MarkOffline() {
	d.Status = DeviceStatusOffline
}
