package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	ChannelTypePush      = "push"
	ChannelTypeSMS       = "sms"
	ChannelTypeEmail     = "email"
	ChannelTypeInApp     = "inapp"
	ChannelTypeWebSocket = "websocket"

	ProviderTypeAPNs   = "apns"
	ProviderTypeFCM    = "fcm"
	ProviderTypeXiaomi = "xiaomi"
	ProviderTypeHuawei = "huawei"

	StatusPending    = "pending"
	StatusQueued     = "queued"
	StatusSending    = "sending"
	StatusSent       = "sent"
	StatusDelivered  = "delivered"
	StatusOpened     = "opened"
	StatusFailed     = "failed"
	StatusCancelled  = "cancelled"
	StatusExpired    = "expired"

	PriorityLow    = "low"
	PriorityNormal = "normal"
	PriorityHigh   = "high"

	MessageTypeSingle    = "single"
	MessageTypeBatch     = "batch"
	MessageTypeScheduled = "scheduled"
	MessageTypeABTest    = "ab_test"

	MessageCategoryMarketing   = "marketing"
	MessageCategoryTransaction = "transaction"
	MessageCategorySystem      = "system"

	ABTestStatusDraft     = "draft"
	ABTestStatusRunning   = "running"
	ABTestStatusCompleted = "completed"
	ABTestStatusPaused    = "paused"
)

type MessageRequest struct {
	TenantID       string                 `json:"tenant_id"`
	MessageID      string                 `json:"message_id"`
	UserIDs        []string               `json:"user_ids,omitempty"`
	SegmentID      string                 `json:"segment_id,omitempty"`
	TemplateCode   string                 `json:"template_code"`
	TemplateParams map[string]interface{} `json:"template_params"`
	ChannelType    string                 `json:"channel_type"`
	Priority       string                 `json:"priority"`
	ExpireAt       *time.Time             `json:"expire_at"`
	ScheduledAt    *time.Time             `json:"scheduled_at"`
	Language       string                 `json:"language"`
	CallbackURL    string                 `json:"callback_url"`
	Metadata       map[string]interface{} `json:"metadata"`
	CustomData     map[string]interface{} `json:"custom_data"`
}

type MessageTask struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TenantID    string         `gorm:"index;size:64;not null" json:"tenant_id"`
	TaskID      string         `gorm:"uniqueIndex;size:64;not null" json:"task_id"`
	TaskName    string         `gorm:"size:128" json:"task_name"`
	MessageType string         `gorm:"size:32;not null" json:"message_type"`
	TemplateID  uint           `json:"template_id"`
	SegmentID   string         `gorm:"size:64" json:"segment_id"`
	UserCount   int64          `gorm:"default:0" json:"user_count"`
	Status      string         `gorm:"size:32;default:pending" json:"status"`
	Priority    string         `gorm:"size:16;default:normal" json:"priority"`
	ScheduledAt *time.Time     `json:"scheduled_at"`
	StartedAt   *time.Time     `json:"started_at"`
	CompletedAt *time.Time     `json:"completed_at"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type InAppMessage struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TenantID    string         `gorm:"index:idx_tenant_user,priority:1;size:64;not null" json:"tenant_id"`
	UserID      string         `gorm:"index:idx_tenant_user,priority:2;size:128;not null" json:"user_id"`
	MessageID   string         `gorm:"index;size:64;not null" json:"message_id"`
	TaskID      string         `gorm:"size:64" json:"task_id"`
	Title       string         `gorm:"size:256" json:"title"`
	Content     string         `gorm:"type:text;not null" json:"content"`
	Category    string         `gorm:"size:64" json:"category"`
	IsRead      bool           `gorm:"default:false" json:"is_read"`
	ReadAt      *time.Time     `json:"read_at"`
	IsDeleted   bool           `gorm:"default:false" json:"is_deleted"`
	ExpireAt    *time.Time     `json:"expire_at"`
	ActionURL   string         `gorm:"size:512" json:"action_url"`
	Metadata    string         `gorm:"type:text" json:"metadata"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type DeliveryLog struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	TenantID        string    `gorm:"index;size:64" json:"tenant_id"`
	TaskID          string    `gorm:"index;size:64" json:"task_id"`
	MessageID       string    `gorm:"index;size:64;not null" json:"message_id"`
	UserID          string    `gorm:"index;size:128" json:"user_id"`
	DeviceID        string    `gorm:"size:128" json:"device_id"`
	ChannelType     string    `gorm:"index;size:32" json:"channel_type"`
	ProviderType    string    `gorm:"size:32" json:"provider_type"`
	Status          string    `gorm:"index;size:32" json:"status"`
	ErrorCode       string    `gorm:"size:128" json:"error_code"`
	ErrorMessage    string    `gorm:"type:text" json:"error_message"`
	ProviderMsgID   string    `gorm:"size:128" json:"provider_msg_id"`
	QueuedAt        *time.Time `json:"queued_at"`
	SentAt          *time.Time `json:"sent_at"`
	DeliveredAt     *time.Time `json:"delivered_at"`
	OpenedAt        *time.Time `json:"opened_at"`
	FailedAt        *time.Time `json:"failed_at"`
	RetryCount      int       `json:"retry_count"`
	CreatedAt       time.Time `json:"created_at"`
}

type PushPayload struct {
	Title       string                 `json:"title"`
	Body        string                 `json:"body"`
	ImageURL    string                 `json:"image_url,omitempty"`
	Badge       int                    `json:"badge,omitempty"`
	Sound       string                 `json:"sound,omitempty"`
	ClickAction string                 `json:"click_action,omitempty"`
	Data        map[string]interface{} `json:"data,omitempty"`
}

type SMSPayload struct {
	Phone    string                 `json:"phone"`
	Template string                 `json:"template"`
	Params   map[string]interface{} `json:"params,omitempty"`
	Content  string                 `json:"content"`
	Sign     string                 `json:"sign,omitempty"`
}

type EmailPayload struct {
	From        string          `json:"from"`
	To          []string        `json:"to"`
	Cc          []string        `json:"cc,omitempty"`
	Bcc         []string        `json:"bcc,omitempty"`
	Subject     string          `json:"subject"`
	Body        string          `json:"body"`
	HTMLBody    string          `json:"html_body,omitempty"`
	Attachments []Attachment    `json:"attachments,omitempty"`
}

type Attachment struct {
	Filename string `json:"filename"`
	Content  []byte `json:"content"`
	MimeType string `json:"mime_type"`
}

type WebSocketPayload struct {
	Type    string                 `json:"type"`
	Message map[string]interface{} `json:"message"`
}

type UserFrequencyLimit struct {
	ID                  uint           `gorm:"primaryKey" json:"id"`
	TenantID            string         `gorm:"index;size:64;not null" json:"tenant_id"`
	UserID              string         `gorm:"index;size:128;not null" json:"user_id"`
	Category            string         `gorm:"index;size:32;not null" json:"category"`
	MaxMessagesPerDay   int            `gorm:"default:3" json:"max_messages_per_day"`
	MaxMessagesPerWeek  int            `gorm:"default:10" json:"max_messages_per_week"`
	MaxMessagesPerMonth int            `gorm:"default:30" json:"max_messages_per_month"`
	CoolDownMinutes     int            `gorm:"default:60" json:"cooldown_minutes"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
}

type UserMessageHistory struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	TenantID    string     `gorm:"index:idx_tenant_user,priority:1;size:64;not null" json:"tenant_id"`
	UserID      string     `gorm:"index:idx_tenant_user,priority:2;size:128;not null" json:"user_id"`
	MessageID   string     `gorm:"index;size:64;not null" json:"message_id"`
	TaskID      string     `gorm:"size:64" json:"task_id"`
	Category    string     `gorm:"index;size:32;not null" json:"category"`
	ChannelType string     `gorm:"size:32" json:"channel_type"`
	SentAt      time.Time  `gorm:"index" json:"sent_at"`
	OpenedAt    *time.Time `json:"opened_at"`
	Converted   bool       `gorm:"default:false" json:"converted"`
	ConvertedAt *time.Time `json:"converted_at"`
}

type ABTest struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TenantID      string         `gorm:"index;size:64;not null" json:"tenant_id"`
	TestID        string         `gorm:"uniqueIndex;size:64;not null" json:"test_id"`
	TestName      string         `gorm:"size:128;not null" json:"test_name"`
	Description   string         `gorm:"size:512" json:"description"`
	SegmentID     string         `gorm:"size:64" json:"segment_id"`
	UserIDs       string         `gorm:"type:text" json:"user_ids"`
	Status        string         `gorm:"size:32;default:draft" json:"status"`
	TrafficSplit  string         `gorm:"type:text;not null" json:"traffic_split"`
	ScheduledAt   *time.Time     `json:"scheduled_at"`
	StartedAt     *time.Time     `json:"started_at"`
	CompletedAt   *time.Time     `json:"completed_at"`
	WinningVariant string        `gorm:"size:64" json:"winning_variant"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type ABTestVariant struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	TenantID        string     `gorm:"index;size:64;not null" json:"tenant_id"`
	TestID          string     `gorm:"index;size:64;not null" json:"test_id"`
	VariantID       string     `gorm:"index;size:64;not null" json:"variant_id"`
	VariantName     string     `gorm:"size:128;not null" json:"variant_name"`
	TemplateCode    string     `gorm:"size:64" json:"template_code"`
	ChannelType     string     `gorm:"size:32" json:"channel_type"`
	Weight          int        `gorm:"default:50" json:"weight"`
	UserCount       int64      `gorm:"default:0" json:"user_count"`
	SentCount       int64      `gorm:"default:0" json:"sent_count"`
	DeliveredCount  int64      `gorm:"default:0" json:"delivered_count"`
	OpenedCount     int64      `gorm:"default:0" json:"opened_count"`
	ClickedCount    int64      `gorm:"default:0" json:"clicked_count"`
	ConvertedCount  int64      `gorm:"default:0" json:"converted_count"`
	FailedCount     int64      `gorm:"default:0" json:"failed_count"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type DashboardMetric struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	TenantID      string     `gorm:"index:idx_tenant_date,priority:1;size:64;not null" json:"tenant_id"`
	MetricDate    string     `gorm:"index:idx_tenant_date,priority:2;size:10" json:"metric_date"`
	MetricType    string     `gorm:"index;size:32;not null" json:"metric_type"`
	ChannelType   string     `gorm:"index;size:32" json:"channel_type"`
	Category      string     `gorm:"index;size:32" json:"category"`
	Value         int64      `gorm:"default:0" json:"value"`
	FloatValue    float64    `gorm:"default:0" json:"float_value"`
	TaskID        string     `gorm:"index;size:64" json:"task_id"`
	TestID        string     `gorm:"index;size:64" json:"test_id"`
	VariantID     string     `gorm:"size:64" json:"variant_id"`
	CreatedAt     time.Time  `gorm:"index" json:"created_at"`
}

type ConversionEvent struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	TenantID      string     `gorm:"index;size:64;not null" json:"tenant_id"`
	EventID       string     `gorm:"uniqueIndex;size:64;not null" json:"event_id"`
	MessageID     string     `gorm:"index;size:64;not null" json:"message_id"`
	TaskID        string     `gorm:"index;size:64" json:"task_id"`
	TestID        string     `gorm:"index;size:64" json:"test_id"`
	VariantID     string     `gorm:"size:64" json:"variant_id"`
	UserID        string     `gorm:"index;size:128;not null" json:"user_id"`
	EventType     string     `gorm:"index;size:32;not null" json:"event_type"`
	EventValue    string     `gorm:"size:256" json:"event_value"`
	EventData     string     `gorm:"type:text" json:"event_data"`
	ConvertedAt   time.Time  `gorm:"index" json:"converted_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

type TenantBillingRecord struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	TenantID         string     `gorm:"index:idx_tenant_month,priority:1;size:64;not null" json:"tenant_id"`
	BillingMonth     string     `gorm:"index:idx_tenant_month,priority:2;size:7" json:"billing_month"`
	ChannelType      string     `gorm:"index;size:32" json:"channel_type"`
	TotalSent        int64      `gorm:"default:0" json:"total_sent"`
	TotalDelivered   int64      `gorm:"default:0" json:"total_delivered"`
	TotalFailed      int64      `gorm:"default:0" json:"total_failed"`
	QuotaUsed        int64      `gorm:"default:0" json:"quota_used"`
	QuotaLimit       int64      `gorm:"default:0" json:"quota_limit"`
	OverageCount     int64      `gorm:"default:0" json:"overage_count"`
	OverageCost      float64    `gorm:"default:0" json:"overage_cost"`
	TotalCost        float64    `gorm:"default:0" json:"total_cost"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}
