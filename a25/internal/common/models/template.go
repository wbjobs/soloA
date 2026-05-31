package models

import (
	"time"

	"gorm.io/gorm"
)

type MessageTemplate struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TenantID    string         `gorm:"index:idx_tenant_code,priority:1;size:64;not null" json:"tenant_id"`
	TemplateCode string        `gorm:"index:idx_tenant_code,priority:2;size:64;not null" json:"template_code"`
	Name        string         `gorm:"size:128;not null" json:"name"`
	Description string         `gorm:"size:512" json:"description"`
	ChannelType string         `gorm:"index;size:32;not null" json:"channel_type"`
	Category    string         `gorm:"size:64" json:"category"`
	Status      int8           `gorm:"default:1" json:"status"`
	IsDefault   bool           `gorm:"default:false" json:"is_default"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	Versions   []TemplateVersion `gorm:"foreignKey:TemplateID" json:"versions,omitempty"`
	Contents   []TemplateContent `gorm:"foreignKey:TemplateID" json:"contents,omitempty"`
	Variables  []TemplateVariable `gorm:"foreignKey:TemplateID" json:"variables,omitempty"`
}

type TemplateVersion struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TemplateID    uint           `gorm:"index;not null" json:"template_id"`
	Version       string         `gorm:"size:32;not null" json:"version"`
	Content       string         `gorm:"type:text;not null" json:"content"`
	Subject       string         `gorm:"size:256" json:"subject"`
	IsPublished   bool           `gorm:"default:false" json:"is_published"`
	PublishedAt   *time.Time     `json:"published_at"`
	PublishedBy   string         `gorm:"size:64" json:"published_by"`
	ChangeNote    string         `gorm:"size:1024" json:"change_note"`
	CreatedAt     time.Time      `json:"created_at"`
	CreatedBy     string         `gorm:"size:64" json:"created_by"`
}

type TemplateContent struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	TemplateID   uint           `gorm:"index:idx_template_lang,priority:1;not null" json:"template_id"`
	Language     string         `gorm:"index:idx_template_lang,priority:2;size:16;not null" json:"language"`
	Subject      string         `gorm:"size:256" json:"subject"`
	Content      string         `gorm:"type:text;not null" json:"content"`
	Status       int8           `gorm:"default:1" json:"status"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type TemplateVariable struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	TemplateID   uint           `gorm:"index;not null" json:"template_id"`
	VariableName string         `gorm:"size:64;not null" json:"variable_name"`
	VariableType string         `gorm:"size:32;not null" json:"variable_type"`
	IsRequired   bool           `gorm:"default:false" json:"is_required"`
	DefaultValue string         `gorm:"size:256" json:"default_value"`
	Description  string         `gorm:"size:256" json:"description"`
	ExampleValue string         `gorm:"size:256" json:"example_value"`
}

type TemplatePreviewRequest struct {
	TemplateID   uint                   `json:"template_id"`
	Version      string                 `json:"version"`
	Language     string                 `json:"language"`
	Variables    map[string]interface{} `json:"variables"`
}

type TemplatePreviewResponse struct {
	Subject string `json:"subject"`
	Content string `json:"content"`
}
