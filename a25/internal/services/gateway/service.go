package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/ratelimit"
	"github.com/message-push-center/internal/common/utils"
	"github.com/message-push-center/internal/services/device"
	"github.com/message-push-center/internal/services/router"
	"github.com/message-push-center/internal/services/template"
	"github.com/message-push-center/internal/services/tenant"
	"gorm.io/gorm"
)

type MessageGateway struct {
	db            *gorm.DB
	tenantService *tenant.TenantService
	templateService *template.TemplateService
	deviceService   *device.DeviceService
	channelRouter   *router.ChannelRouter
	rateLimiter     *ratelimit.RateLimiter
	channelProviders map[string]ChannelProvider
}

type ChannelProvider interface {
	Send(ctx context.Context, payload interface{}) (string, error)
	ChannelType() string
}

func NewMessageGateway(
	tenantService *tenant.TenantService,
	templateService *template.TemplateService,
	deviceService *device.DeviceService,
	rateLimiter *ratelimit.RateLimiter,
) *MessageGateway {
	return &MessageGateway{
		db:              database.GetDB(),
		tenantService:   tenantService,
		templateService: templateService,
		deviceService:   deviceService,
		channelRouter:   router.NewChannelRouter(deviceService),
		rateLimiter:     rateLimiter,
		channelProviders: make(map[string]ChannelProvider),
	}
}

func (g *MessageGateway) RegisterProvider(provider ChannelProvider) {
	g.channelProviders[provider.ChannelType()] = provider
}

type SendSingleRequest struct {
	TenantID       string
	UserID         string
	TemplateCode   string
	TemplateParams map[string]interface{}
	ChannelType    string
	Priority       string
	ExpireAt       *time.Time
	Language       string
	CallbackURL    string
	Metadata       map[string]interface{}
}

type SendBatchRequest struct {
	TenantID       string
	UserIDs        []string
	SegmentID      string
	TemplateCode   string
	TemplateParams map[string]interface{}
	ChannelType    string
	Priority       string
	ScheduledAt    *time.Time
	ExpireAt       *time.Time
	Language       string
	CallbackURL    string
	Metadata       map[string]interface{}
}

type SendResponse struct {
	MessageID string
	TaskID    string
	Status    string
	Error     string
}

func (g *MessageGateway) SendSingle(ctx context.Context, req *SendSingleRequest) (*SendResponse, error) {
	tenant, err := g.tenantService.GetTenantByID(ctx, req.TenantID)
	if err != nil {
		return nil, err
	}

	allowed, err := g.rateLimiter.Allow(ctx, tenant.TenantID, tenant.MaxQPS)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ratelimit.ErrRateLimitExceeded
	}

	allowed, _, err = g.rateLimiter.CheckDailyLimit(ctx, tenant.TenantID, tenant.DailyLimit)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ratelimit.ErrDailyLimitExceeded
	}

	devices, err := g.deviceService.GetUserDevices(ctx, tenant.TenantID, req.UserID, req.ChannelType)
	if err != nil {
		return nil, err
	}

	if len(devices) == 0 {
		return &SendResponse{
			MessageID: utils.GenerateMessageID(),
			Status:    models.StatusFailed,
			Error:     "No active devices found",
		}, nil
	}

	preference, err := g.deviceService.GetUserPreference(ctx, tenant.TenantID, req.UserID)
	if err != nil {
		return nil, err
	}

	language := utils.GetOrDefault(req.Language, preference.Language)
	subject, content, err := g.templateService.RenderTemplate(ctx, tenant.TenantID, req.TemplateCode, language, req.TemplateParams)
	if err != nil {
		return nil, err
	}

	routeReq := &router.RouteRequest{
		TenantID:       tenant.TenantID,
		UserID:         req.UserID,
		ChannelType:    req.ChannelType,
		Priority:       utils.GetOrDefault(req.Priority, models.PriorityNormal),
		QuietHours:     true,
		PreferredChannels: g.parseChannels(preference.PreferredChannels),
		OptOutChannels: g.parseChannels(preference.OptOutChannels),
	}

	routeResult, err := g.channelRouter.Route(ctx, routeReq)
	if err != nil {
		return nil, err
	}

	if routeResult.IsQuietHours {
		return &SendResponse{
			MessageID: utils.GenerateMessageID(),
			Status:    models.StatusQueued,
			Error:     routeResult.Reason,
		}, nil
	}

	if routeResult.IsOptedOut {
		return &SendResponse{
			MessageID: utils.GenerateMessageID(),
			Status:    models.StatusFailed,
			Error:     routeResult.Reason,
		}, nil
	}

	messageID := utils.GenerateMessageID()

	kafkaMsg := g.buildKafkaMessage(messageID, tenant, devices[0], routeResult.PrimaryChannel, subject, content, req)
	
	if err := g.sendToKafka(ctx, kafkaMsg); err != nil {
		return nil, err
	}

	g.rateLimiter.IncrementDaily(ctx, tenant.TenantID)

	g.createDeliveryLog(ctx, &models.DeliveryLog{
		TenantID:    tenant.TenantID,
		MessageID:   messageID,
		UserID:      req.UserID,
		DeviceID:    devices[0].DeviceID,
		ChannelType: routeResult.PrimaryChannel,
		Status:      models.StatusQueued,
		CreatedAt:   time.Now(),
	})

	return &SendResponse{
		MessageID: messageID,
		Status:    models.StatusQueued,
	}, nil
}

func (g *MessageGateway) SendBatch(ctx context.Context, req *SendBatchRequest) (*SendResponse, error) {
	tenant, err := g.tenantService.GetTenantByID(ctx, req.TenantID)
	if err != nil {
		return nil, err
	}

	taskID := utils.GenerateTaskID()

	userIDs := req.UserIDs
	if req.SegmentID != "" {
		userIDs, err = g.getSegmentUsers(ctx, req.SegmentID)
		if err != nil {
			return nil, err
		}
	}

	if len(userIDs) == 0 {
		return nil, errors.New("no users found")
	}

	task := &models.MessageTask{
		TenantID:    tenant.TenantID,
		TaskID:      taskID,
		TaskName:    fmt.Sprintf("Batch - %s", req.TemplateCode),
		MessageType: models.MessageTypeBatch,
		UserCount:   int64(len(userIDs)),
		Status:      models.StatusPending,
		Priority:    utils.GetOrDefault(req.Priority, models.PriorityNormal),
		ScheduledAt: req.ScheduledAt,
		CreatedAt:   time.Now(),
	}

	if err := g.db.WithContext(ctx).Create(task).Error; err != nil {
		return nil, err
	}

	if req.ScheduledAt != nil && req.ScheduledAt.After(time.Now()) {
		task.Status = models.StatusScheduled
		g.db.WithContext(ctx).Save(task)

		if err := g.scheduleTask(ctx, task); err != nil {
			return nil, err
		}

		return &SendResponse{
			TaskID: taskID,
			Status: models.StatusScheduled,
		}, nil
	}

	go g.processBatchTask(ctx, task, req, userIDs)

	return &SendResponse{
		TaskID: taskID,
		Status: models.StatusQueued,
	}, nil
}

func (g *MessageGateway) processBatchTask(ctx context.Context, task *models.MessageTask, req *SendBatchRequest, userIDs []string) {
	task.Status = models.StatusSending
	now := time.Now()
	task.StartedAt = &now
	g.db.Save(task)

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 100)
	successCount := 0
	failCount := 0

	for _, userID := range userIDs {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(uid string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			_, err := g.SendSingle(ctx, &SendSingleRequest{
				TenantID:       req.TenantID,
				UserID:         uid,
				TemplateCode:   req.TemplateCode,
				TemplateParams: req.TemplateParams,
				ChannelType:    req.ChannelType,
				Priority:       req.Priority,
				ExpireAt:       req.ExpireAt,
				Language:       req.Language,
				CallbackURL:    req.CallbackURL,
				Metadata:       req.Metadata,
			})

			if err != nil {
				failCount++
			} else {
				successCount++
			}
		}(userID)
	}

	wg.Wait()

	completedAt := time.Now()
	task.CompletedAt = &completedAt
	task.Status = models.StatusSent
	g.db.Save(task)
}

func (g *MessageGateway) buildKafkaMessage(
	messageID string,
	tenant *models.Tenant,
	device *models.Device,
	channelType string,
	subject string,
	content string,
	req *SendSingleRequest,
) []byte {
	msg := map[string]interface{}{
		"message_id":   messageID,
		"tenant_id":    tenant.TenantID,
		"user_id":      req.UserID,
		"device_id":    device.DeviceID,
		"device_token": device.DeviceToken,
		"channel_type": channelType,
		"provider":     device.PushProvider,
		"subject":      subject,
		"content":      content,
		"priority":     req.Priority,
		"language":     req.Language,
		"expire_at":    req.ExpireAt,
		"callback_url": req.CallbackURL,
		"metadata":     req.Metadata,
		"created_at":   time.Now(),
	}

	data, _ := json.Marshal(msg)
	return data
}

func (g *MessageGateway) sendToKafka(ctx context.Context, data []byte) error {
	if database.Producer == nil {
		return errors.New("kafka producer not initialized")
	}

	return database.Producer.SendMessage(
		ctx,
		config.GetConfig().Kafka.Topics["message_send"],
		[]byte(utils.GenerateID()),
		data,
	)
}

func (g *MessageGateway) createDeliveryLog(ctx context.Context, log *models.DeliveryLog) error {
	now := time.Now()
	log.QueuedAt = &now
	return g.db.WithContext(ctx).Create(log).Error
}

func (g *MessageGateway) parseChannels(channelsStr string) []string {
	if channelsStr == "" {
		return nil
	}
	var channels []string
	json.Unmarshal([]byte(channelsStr), &channels)
	return channels
}

func (g *MessageGateway) getSegmentUsers(ctx context.Context, segmentID string) ([]string, error) {
	return nil, errors.New("segment resolution not implemented")
}

func (g *MessageGateway) scheduleTask(ctx context.Context, task *models.MessageTask) error {
	delay := task.ScheduledAt.Sub(time.Now())
	if delay < 0 {
		delay = 0
	}

	go func() {
		time.Sleep(delay)
	}()

	return nil
}

func (g *MessageGateway) GetTaskStatus(ctx context.Context, taskID string) (*models.MessageTask, error) {
	var task models.MessageTask
	if err := g.db.WithContext(ctx).Where("task_id = ?", taskID).First(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (g *MessageGateway) GetMessageStatus(ctx context.Context, messageID string) (*models.DeliveryLog, error) {
	var log models.DeliveryLog
	if err := g.db.WithContext(ctx).Where("message_id = ?", messageID).First(&log).Error; err != nil {
		return nil, err
	}
	return &log, nil
}

func (g *MessageGateway) CancelTask(ctx context.Context, taskID string) error {
	task, err := g.GetTaskStatus(ctx, taskID)
	if err != nil {
		return err
	}

	if task.Status != models.StatusPending && task.Status != models.StatusScheduled {
		return errors.New("task cannot be cancelled")
	}

	task.Status = models.StatusCancelled
	return g.db.WithContext(ctx).Save(task).Error
}

func (g *MessageGateway) GetChannelStatus(ctx context.Context) (map[string]*router.ChannelStatus, error) {
	return g.channelRouter.GetAllChannelStatus()
}
