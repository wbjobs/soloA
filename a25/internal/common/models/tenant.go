package models

import (
	"time"

	"gorm.io/gorm"
)

type Tenant struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TenantID      string         `gorm:"uniqueIndex;size:64;not null" json:"tenant_id"`
	Name          string         `gorm:"size:128;not null" json:"name"`
	Description   string         `gorm:"size:512" json:"description"`
	APIKey        string         `gorm:"uniqueIndex;size:128;not null" json:"api_key"`
	APISecret     string         `gorm:"size:256;not null" json:"-"`
	Status        int8           `gorm:"default:1" json:"status"`
	Plan          string         `gorm:"size:32;default:basic" json:"plan"`
	MaxQPS        int            `gorm:"default:100" json:"max_qps"`
	DailyLimit    int64          `gorm:"default:100000" json:"daily_limit"`
	MonthlyLimit  int64          `gorm:"default:3000000" json:"monthly_limit"`
	EmailQuota    int64          `gorm:"default:10000" json:"email_quota"`
	SMSQuota      int64          `gorm:"default:10000" json:"sms_quota"`
	PushQuota     int64          `gorm:"default:50000" json:"push_quota"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	Configurations []TenantConfig `gorm:"foreignKey:TenantID;references:TenantID" json:"configurations,omitempty"`
	Webhooks       []TenantWebhook `gorm:"foreignKey:TenantID;references:TenantID" json:"webhooks,omitempty"`
}

type TenantConfig struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TenantID      string         `gorm:"index;size:64;not null" json:"tenant_id"`
	ConfigKey     string         `gorm:"size:64;not null" json:"config_key"`
	ConfigValue   string         `gorm:"type:text" json:"config_value"`
	ChannelType   string         `gorm:"size:32" json:"channel_type"`
	IsEncrypted   bool           `gorm:"default:false" json:"is_encrypted"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type TenantWebhook struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TenantID      string         `gorm:"index;size:64;not null" json:"tenant_id"`
	Name          string         `gorm:"size:128;not null" json:"name"`
	URL           string         `gorm:"size:512;not null" json:"url"`
	Secret        string         `gorm:"size:256" json:"secret"`
	Events        string         `gorm:"type:text" json:"events"`
	Status        int8           `gorm:"default:1" json:"status"`
	RetryCount    int            `gorm:"default:3" json:"retry_count"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}
