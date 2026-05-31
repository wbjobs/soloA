package template

import (
	"context"
	"errors"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
	"gorm.io/gorm"
)

type TemplateService struct {
	db        *gorm.DB
	engine    *utils.TemplateEngine
}

func NewTemplateService() *TemplateService {
	return &TemplateService{
		db:     database.GetDB(),
		engine: utils.NewTemplateEngine(),
	}
}

type CreateTemplateRequest struct {
	TenantID     string                 `json:"tenant_id"`
	TemplateCode string                 `json:"template_code" binding:"required"`
	Name         string                 `json:"name" binding:"required"`
	Description  string                 `json:"description"`
	ChannelType  string                 `json:"channel_type" binding:"required"`
	Category     string                 `json:"category"`
	Variables    []models.TemplateVariable `json:"variables"`
	Contents     []TemplateContentItem    `json:"contents"`
}

type TemplateContentItem struct {
	Language string `json:"language" binding:"required"`
	Subject  string `json:"subject"`
	Content  string `json:"content" binding:"required"`
}

type UpdateTemplateRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Status      *int8   `json:"status"`
}

func (s *TemplateService) CreateTemplate(ctx context.Context, req *CreateTemplateRequest) (*models.MessageTemplate, error) {
	var existing models.MessageTemplate
	err := s.db.WithContext(ctx).Where("tenant_id = ? AND template_code = ?", req.TenantID, req.TemplateCode).First(&existing).Error
	if err == nil {
		return nil, errors.New("template code already exists")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	template := &models.MessageTemplate{
		TenantID:     req.TenantID,
		TemplateCode: req.TemplateCode,
		Name:         req.Name,
		Description:  req.Description,
		ChannelType:  req.ChannelType,
		Category:     req.Category,
		Status:       1,
		IsDefault:    false,
	}

	if err := s.db.WithContext(ctx).Create(template).Error; err != nil {
		return nil, err
	}

	if len(req.Variables) > 0 {
		for i := range req.Variables {
			req.Variables[i].TemplateID = template.ID
		}
		if err := s.db.WithContext(ctx).Create(&req.Variables).Error; err != nil {
			return nil, err
		}
	}

	if len(req.Contents) > 0 {
		contents := make([]models.TemplateContent, 0, len(req.Contents))
		for _, c := range req.Contents {
			contents = append(contents, models.TemplateContent{
				TemplateID: template.ID,
				Language:   c.Language,
				Subject:    c.Subject,
				Content:    c.Content,
				Status:     1,
			})
		}
		if err := s.db.WithContext(ctx).Create(&contents).Error; err != nil {
			return nil, err
		}
	}

	if err := s.db.WithContext(ctx).Preload("Variables").Preload("Contents").First(template, template.ID).Error; err != nil {
		return nil, err
	}

	return template, nil
}

func (s *TemplateService) GetTemplate(ctx context.Context, tenantID, templateCode string) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	if err := s.db.WithContext(ctx).
		Preload("Variables").
		Preload("Contents").
		Preload("Versions", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(10)
		}).
		Where("tenant_id = ? AND template_code = ?", tenantID, templateCode).
		First(&template).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (s *TemplateService) GetTemplateByID(ctx context.Context, templateID uint) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	if err := s.db.WithContext(ctx).
		Preload("Variables").
		Preload("Contents").
		First(&template, templateID).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (s *TemplateService) ListTemplates(ctx context.Context, tenantID, channelType, category string, page, pageSize int) ([]*models.MessageTemplate, int64, error) {
	var templates []*models.MessageTemplate
	var total int64

	db := s.db.WithContext(ctx).Model(&models.MessageTemplate{}).Where("tenant_id = ?", tenantID)
	if channelType != "" {
		db = db.Where("channel_type = ?", channelType)
	}
	if category != "" {
		db = db.Where("category = ?", category)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := db.Limit(pageSize).Offset(offset).Order("created_at DESC").Find(&templates).Error; err != nil {
		return nil, 0, err
	}

	return templates, total, nil
}

func (s *TemplateService) UpdateTemplate(ctx context.Context, templateID uint, req *UpdateTemplateRequest) error {
	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	updates["updated_at"] = time.Now()

	return s.db.WithContext(ctx).Model(&models.MessageTemplate{}).Where("id = ?", templateID).Updates(updates).Error
}

func (s *TemplateService) DeleteTemplate(ctx context.Context, templateID uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.TemplateVariable{}, "template_id = ?", templateID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.TemplateContent{}, "template_id = ?", templateID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.TemplateVersion{}, "template_id = ?", templateID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.MessageTemplate{}, "id = ?", templateID).Error; err != nil {
			return err
		}
		return nil
	})
}

func (s *TemplateService) AddContent(ctx context.Context, templateID uint, language, subject, content string) error {
	existing, err := s.GetContent(ctx, templateID, language)
	if err == nil {
		return s.db.WithContext(ctx).Model(existing).Updates(map[string]interface{}{
			"subject":    subject,
			"content":    content,
			"updated_at": time.Now(),
		}).Error
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return s.db.WithContext(ctx).Create(&models.TemplateContent{
		TemplateID: templateID,
		Language:   language,
		Subject:    subject,
		Content:    content,
		Status:     1,
	}).Error
}

func (s *TemplateService) GetContent(ctx context.Context, templateID uint, language string) (*models.TemplateContent, error) {
	var content models.TemplateContent
	if err := s.db.WithContext(ctx).Where("template_id = ? AND language = ?", templateID, language).First(&content).Error; err != nil {
		return nil, err
	}
	return &content, nil
}

func (s *TemplateService) DeleteContent(ctx context.Context, templateID uint, language string) error {
	return s.db.WithContext(ctx).Delete(&models.TemplateContent{}, "template_id = ? AND language = ?", templateID, language).Error
}

func (s *TemplateService) AddVariable(ctx context.Context, templateID uint, variable *models.TemplateVariable) error {
	variable.TemplateID = templateID
	return s.db.WithContext(ctx).Create(variable).Error
}

func (s *TemplateService) DeleteVariable(ctx context.Context, variableID uint) error {
	return s.db.WithContext(ctx).Delete(&models.TemplateVariable{}, "id = ?", variableID).Error
}

func (s *TemplateService) CreateVersion(ctx context.Context, templateID uint, version, changeNote, createdBy string) error {
	var template models.MessageTemplate
	if err := s.db.WithContext(ctx).Preload("Contents").First(&template, templateID).Error; err != nil {
		return err
	}

	var content string
	if len(template.Contents) > 0 {
		content = template.Contents[0].Content
	}

	return s.db.WithContext(ctx).Create(&models.TemplateVersion{
		TemplateID:  templateID,
		Version:     version,
		Content:     content,
		IsPublished: false,
		ChangeNote:  changeNote,
		CreatedBy:   createdBy,
	}).Error
}

func (s *TemplateService) PublishVersion(ctx context.Context, versionID uint, publishedBy string) error {
	var version models.TemplateVersion
	if err := s.db.WithContext(ctx).First(&version, versionID).Error; err != nil {
		return err
	}

	now := time.Now()
	return s.db.WithContext(ctx).Model(&version).Updates(map[string]interface{}{
		"is_published": true,
		"published_at": &now,
		"published_by": publishedBy,
	}).Error
}

func (s *TemplateService) Preview(ctx context.Context, templateID uint, language string, params map[string]interface{}) (*models.TemplatePreviewResponse, error) {
	content, err := s.GetContent(ctx, templateID, language)
	if err != nil {
		return nil, err
	}

	renderedContent, err := s.engine.Render(content.Content, params)
	if err != nil {
		return nil, err
	}

	renderedSubject := content.Subject
	if content.Subject != "" {
		renderedSubject, err = s.engine.Render(content.Subject, params)
		if err != nil {
			return nil, err
		}
	}

	return &models.TemplatePreviewResponse{
		Subject: renderedSubject,
		Content: renderedContent,
	}, nil
}

func (s *TemplateService) RenderTemplate(ctx context.Context, tenantID, templateCode, language string, params map[string]interface{}) (string, string, error) {
	template, err := s.GetTemplate(ctx, tenantID, templateCode)
	if err != nil {
		return "", "", err
	}

	var content *models.TemplateContent
	for _, c := range template.Contents {
		if c.Language == language {
			content = &c
			break
		}
	}

	if content == nil && len(template.Contents) > 0 {
		content = &template.Contents[0]
	}

	if content == nil {
		return "", "", errors.New("no content found for template")
	}

	renderedContent, err := s.engine.Render(content.Content, params)
	if err != nil {
		return "", "", err
	}

	renderedSubject := content.Subject
	if content.Subject != "" {
		renderedSubject, err = s.engine.Render(content.Subject, params)
		if err != nil {
			return "", "", err
		}
	}

	return renderedSubject, renderedContent, nil
}
