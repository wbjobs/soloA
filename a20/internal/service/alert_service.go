package service

import (
	"time"

	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type AlertService struct {
	notificationService *NotificationService
}

func NewAlertService() *AlertService {
	return &AlertService{
		notificationService: NewNotificationService(),
	}
}

func (s *AlertService) CreateAlert(alert *model.Alert) (*model.Alert, error) {
	alert.Status = model.AlertStatusUnhandled

	result := infrastructure.DB.Create(alert)
	if result.Error != nil {
		return nil, result.Error
	}

	go s.notificationService.SendNotifications(alert)

	if err := infrastructure.ProduceAlert(alert); err != nil {
		logger.Warn("Failed to produce alert to Kafka", logger.ErrorField(err))
	}

	return alert, nil
}

func (s *AlertService) CreateDeviceOfflineAlert(device *model.Device) (*model.Alert, error) {
	alert := &model.Alert{
		UserID:     device.UserID,
		DeviceID:   device.ID,
		AlertType:  model.AlertTypeDeviceOffline,
		AlertLevel: model.AlertLevelWarning,
		Title:      "设备离线告警",
		Content:    "设备 [" + device.DeviceName + "] 已离线",
	}
	return s.CreateAlert(alert)
}

func (s *AlertService) CreateDeviceOnlineAlert(device *model.Device) (*model.Alert, error) {
	alert := &model.Alert{
		UserID:     device.UserID,
		DeviceID:   device.ID,
		AlertType:  model.AlertTypeDeviceOnline,
		AlertLevel: model.AlertLevelInfo,
		Title:      "设备上线通知",
		Content:    "设备 [" + device.DeviceName + "] 已上线",
	}
	return s.CreateAlert(alert)
}

func (s *AlertService) CreateThresholdAlert(device *model.Device, metric string, actual, threshold float64) (*model.Alert, error) {
	alert := &model.Alert{
		UserID:     device.UserID,
		DeviceID:   device.ID,
		AlertType:  model.AlertTypeThresholdExceeded,
		AlertLevel: model.AlertLevelCritical,
		Title:      "数据阈值告警",
		Content:    "设备 [" + device.DeviceName + "] 指标 [" + metric + "] 超出阈值",
	}
	return s.CreateAlert(alert)
}

func (s *AlertService) HandleAlert(alertID uint) error {
	now := time.Now()
	result := infrastructure.DB.Model(&model.Alert{}).Where("id = ?", alertID).Updates(map[string]interface{}{
		"status":     model.AlertStatusHandled,
		"handled_at": &now,
	})
	return result.Error
}

func (s *AlertService) GetAlertByID(alertID uint) (*model.Alert, error) {
	var alert model.Alert
	result := infrastructure.DB.Preload("Device").Preload("Rule").First(&alert, alertID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &alert, nil
}

func (s *AlertService) ListAlerts(userID uint, page, pageSize int, status *int) ([]model.Alert, int64, error) {
	var alerts []model.Alert
	var total int64

	offset := (page - 1) * pageSize

	query := infrastructure.DB.Model(&model.Alert{}).Where("user_id = ?", userID)
	if status != nil {
		query = query.Where("status = ?", *status)
	}

	query.Count(&total)
	query.Preload("Device").Preload("Rule").
		Order("created_at DESC").
		Offset(offset).Limit(pageSize).Find(&alerts)

	return alerts, total, nil
}

type NotificationService struct {
	emailService *EmailService
	smsService   *SMSService
}

func NewNotificationService() *NotificationService {
	return &NotificationService{
		emailService: NewEmailService(),
		smsService:   NewSMSService(),
	}
}

func (s *NotificationService) SendNotifications(alert *model.Alert) {
	cfg := config.AppConfig

	for _, recipient := range cfg.Email.Recipients {
		notif := &model.Notification{
			AlertID:          alert.ID,
			NotificationType: model.NotificationTypeEmail,
			Recipient:        recipient,
			Status:           model.NotificationStatusPending,
		}
		infrastructure.DB.Create(notif)

		go s.sendEmail(notif, alert)
	}

	for _, phone := range cfg.SMS.Phones {
		notif := &model.Notification{
			AlertID:          alert.ID,
			NotificationType: model.NotificationTypeSMS,
			Recipient:        phone,
			Status:           model.NotificationStatusPending,
		}
		infrastructure.DB.Create(notif)

		go s.sendSMS(notif, alert)
	}
}

func (s *NotificationService) sendEmail(notif *model.Notification, alert *model.Alert) {
	now := time.Now()
	err := s.emailService.Send(notif.Recipient, alert.Title, alert.Content)

	if err != nil {
		logger.Error("Failed to send email notification", 
			logger.String("recipient", notif.Recipient),
			logger.ErrorField(err))
		infrastructure.DB.Model(notif).Updates(map[string]interface{}{
			"status":    model.NotificationStatusFailed,
			"error_msg": err.Error(),
		})
		return
	}

	logger.Info("Email notification sent successfully", logger.String("recipient", notif.Recipient))
	infrastructure.DB.Model(notif).Updates(map[string]interface{}{
		"status":   model.NotificationStatusSuccess,
		"sent_at":  &now,
	})
}

func (s *NotificationService) sendSMS(notif *model.Notification, alert *model.Alert) {
	now := time.Now()
	err := s.smsService.Send(notif.Recipient, alert)

	if err != nil {
		logger.Error("Failed to send SMS notification", 
			logger.String("phone", notif.Recipient),
			logger.ErrorField(err))
		infrastructure.DB.Model(notif).Updates(map[string]interface{}{
			"status":    model.NotificationStatusFailed,
			"error_msg": err.Error(),
		})
		return
	}

	logger.Info("SMS notification sent successfully", logger.String("phone", notif.Recipient))
	infrastructure.DB.Model(notif).Updates(map[string]interface{}{
		"status":   model.NotificationStatusSuccess,
		"sent_at":  &now,
	})
}
