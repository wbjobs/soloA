package models

import (
	"time"

	"gorm.io/gorm"
)

type Device struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	TenantID     string         `gorm:"index:idx_tenant_user,priority:1;size:64;not null" json:"tenant_id"`
	UserID       string         `gorm:"index:idx_tenant_user,priority:2;size:128;not null" json:"user_id"`
	DeviceID     string         `gorm:"uniqueIndex;size:128;not null" json:"device_id"`
	DeviceToken  string         `gorm:"size:512;not null" json:"device_token"`
	DeviceType   string         `gorm:"index;size:32;not null" json:"device_type"`
	DeviceModel  string         `gorm:"size:128" json:"device_model"`
	OSVersion    string         `gorm:"size:64" json:"os_version"`
	AppVersion   string         `gorm:"size:64" json:"app_version"`
	ChannelType  string         `gorm:"index;size:32;not null" json:"channel_type"`
	PushProvider string         `gorm:"size:32" json:"push_provider"`
	Language     string         `gorm:"size:16" json:"language"`
	Timezone     string         `gorm:"size:64" json:"timezone"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	LastActiveAt *time.Time     `json:"last_active_at"`
	Tags         string         `gorm:"type:text" json:"tags"`
	Attributes   string         `gorm:"type:text" json:"attributes"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

type UserPreference struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	TenantID          string         `gorm:"index:idx_tenant_user,priority:1;size:64;not null" json:"tenant_id"`
	UserID            string         `gorm:"index:idx_tenant_user,priority:2;size:128;not null" json:"user_id"`
	PreferredChannels string         `gorm:"type:text" json:"preferred_channels"`
	QuietHoursStart   int            `gorm:"default:22" json:"quiet_hours_start"`
	QuietHoursEnd     int            `gorm:"default:8" json:"quiet_hours_end"`
	OptOutChannels    string         `gorm:"type:text" json:"opt_out_channels"`
	OptOutCategories  string         `gorm:"type:text" json:"opt_out_categories"`
	DoNotDisturb      bool           `gorm:"default:false" json:"do_not_disturb"`
	Timezone          string         `gorm:"size:64" json:"timezone"`
	Language          string         `gorm:"size:16" json:"language"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

type UserSegment struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TenantID    string         `gorm:"index;size:64;not null" json:"tenant_id"`
	Name        string         `gorm:"size:128;not null" json:"name"`
	Description string         `gorm:"size:512" json:"description"`
	SegmentType string         `gorm:"size:32;not null" json:"segment_type"`
	Conditions  string         `gorm:"type:text;not null" json:"conditions"`
	UserCount   int64          `gorm:"default:0" json:"user_count"`
	Status      int8           `gorm:"default:1" json:"status"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
