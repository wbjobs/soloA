package tenant

import (
	"context"
	"errors"
	"time"

	"github.com/message-push-center/internal/common/auth"
	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
	"gorm.io/gorm"
)

type TenantService struct {
	db *gorm.DB
}

func NewTenantService() *TenantService {
	return &TenantService{
		db: database.GetDB(),
	}
}

type CreateTenantRequest struct {
	Name         string `json:"name" binding:"required"`
	Description  string `json:"description"`
	Plan         string `json:"plan"`
	MaxQPS       int    `json:"max_qps"`
	DailyLimit   int64  `json:"daily_limit"`
	MonthlyLimit int64  `json:"monthly_limit"`
}

type UpdateTenantRequest struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Plan         string `json:"plan"`
	MaxQPS       int    `json:"max_qps"`
	DailyLimit   int64  `json:"daily_limit"`
	MonthlyLimit int64  `json:"monthly_limit"`
	Status       *int8   `json:"status"`
}

func (s *TenantService) CreateTenant(ctx context.Context, req *CreateTenantRequest) (*models.Tenant, error) {
	tenantID := "tenant_" + utils.GenerateShortID(12)
	apiKey := utils.GenerateAPIKey()
	apiSecret := utils.GenerateAPISecret()
	hashedSecret := auth.HashSecret(apiSecret)

	tenant := &models.Tenant{
		TenantID:     tenantID,
		Name:         req.Name,
		Description:  req.Description,
		APIKey:       apiKey,
		APISecret:    hashedSecret,
		Status:       1,
		Plan:         utils.GetOrDefault(req.Plan, "basic"),
		MaxQPS:       req.MaxQPS,
		DailyLimit:   req.DailyLimit,
		MonthlyLimit: req.MonthlyLimit,
	}

	if err := s.db.WithContext(ctx).Create(tenant).Error; err != nil {
		return nil, err
	}

	return tenant, nil
}

func (s *TenantService) GetTenantByID(ctx context.Context, tenantID string) (*models.Tenant, error) {
	var tenant models.Tenant
	if err := s.db.WithContext(ctx).Where("tenant_id = ?", tenantID).First(&tenant).Error; err != nil {
		return nil, err
	}
	return &tenant, nil
}

func (s *TenantService) GetTenantByAPIKey(ctx context.Context, apiKey string) (*models.Tenant, error) {
	var tenant models.Tenant
	if err := s.db.WithContext(ctx).Where("api_key = ?", apiKey).First(&tenant).Error; err != nil {
		return nil, err
	}
	return &tenant, nil
}

func (s *TenantService) UpdateTenant(ctx context.Context, tenantID string, req *UpdateTenantRequest) error {
	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Plan != "" {
		updates["plan"] = req.Plan
	}
	if req.MaxQPS > 0 {
		updates["max_qps"] = req.MaxQPS
	}
	if req.DailyLimit > 0 {
		updates["daily_limit"] = req.DailyLimit
	}
	if req.MonthlyLimit > 0 {
		updates["monthly_limit"] = req.MonthlyLimit
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	updates["updated_at"] = time.Now()

	return s.db.WithContext(ctx).Model(&models.Tenant{}).Where("tenant_id = ?", tenantID).Updates(updates).Error
}

func (s *TenantService) DeleteTenant(ctx context.Context, tenantID string) error {
	return s.db.WithContext(ctx).Delete(&models.Tenant{}, "tenant_id = ?", tenantID).Error
}

func (s *TenantService) ListTenants(ctx context.Context, page, pageSize int) ([]*models.Tenant, int64, error) {
	var tenants []*models.Tenant
	var total int64

	offset := (page - 1) * pageSize

	if err := s.db.WithContext(ctx).Model(&models.Tenant{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := s.db.WithContext(ctx).Limit(pageSize).Offset(offset).Order("created_at DESC").Find(&tenants).Error; err != nil {
		return nil, 0, err
	}

	return tenants, total, nil
}

func (s *TenantService) ValidateTenant(ctx context.Context, apiKey, signature, timestamp, body string) (*models.Tenant, error) {
	tenant, err := s.GetTenantByAPIKey(ctx, apiKey)
	if err != nil {
		return nil, auth.ErrInvalidAPIKey
	}

	if tenant.Status != 1 {
		return nil, auth.ErrTenantDisabled
	}

	if !auth.VerifySignature(timestamp, apiKey, tenant.APISecret, body, signature, 300) {
		return nil, auth.ErrInvalidSignature
	}

	return tenant, nil
}

func (s *TenantService) GetConfig(ctx context.Context, tenantID, configKey string) (*models.TenantConfig, error) {
	var config models.TenantConfig
	if err := s.db.WithContext(ctx).Where("tenant_id = ? AND config_key = ?", tenantID, configKey).First(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

func (s *TenantService) GetConfigs(ctx context.Context, tenantID string) ([]*models.TenantConfig, error) {
	var configs []*models.TenantConfig
	if err := s.db.WithContext(ctx).Where("tenant_id = ?", tenantID).Find(&configs).Error; err != nil {
		return nil, err
	}
	return configs, nil
}

func (s *TenantService) SetConfig(ctx context.Context, tenantID, configKey, configValue, channelType string) error {
	var existingConfig models.TenantConfig
	err := s.db.WithContext(ctx).Where("tenant_id = ? AND config_key = ?", tenantID, configKey).First(&existingConfig).Error
	
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.db.WithContext(ctx).Create(&models.TenantConfig{
			TenantID:    tenantID,
			ConfigKey:   configKey,
			ConfigValue: configValue,
			ChannelType: channelType,
		}).Error
	}

	if err != nil {
		return err
	}

	return s.db.WithContext(ctx).Model(&existingConfig).Updates(map[string]interface{}{
		"config_value": configValue,
		"channel_type": channelType,
		"updated_at":   time.Now(),
	}).Error
}

func (s *TenantService) DeleteConfig(ctx context.Context, tenantID, configKey string) error {
	return s.db.WithContext(ctx).Delete(&models.TenantConfig{}, "tenant_id = ? AND config_key = ?", tenantID, configKey).Error
}
