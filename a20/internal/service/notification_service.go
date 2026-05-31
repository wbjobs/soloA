package service

import (
	"crypto/tls"
	"fmt"

	"gopkg.in/gomail.v2"

	"iot-platform/internal/config"
	"iot-platform/internal/model"
)

type EmailService struct{}

func NewEmailService() *EmailService {
	return &EmailService{}
}

func (s *EmailService) Send(to, subject, body string) error {
	cfg := config.AppConfig.Email

	d := gomail.NewDialer(
		cfg.SMTPHost,
		cfg.SMTPPort,
		cfg.Sender,
		cfg.Password,
	)
	d.TLSConfig = &tls.Config{InsecureSkipVerify: true}

	m := gomail.NewMessage()
	m.SetHeader("From", cfg.Sender)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body)

	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

func (s *EmailService) SendHTML(to, subject, htmlBody string) error {
	cfg := config.AppConfig.Email

	d := gomail.NewDialer(
		cfg.SMTPHost,
		cfg.SMTPPort,
		cfg.Sender,
		cfg.Password,
	)
	d.TLSConfig = &tls.Config{InsecureSkipVerify: true}

	m := gomail.NewMessage()
	m.SetHeader("From", cfg.Sender)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", htmlBody)

	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send HTML email: %w", err)
	}

	return nil
}

type SMSService struct{}

func NewSMSService() *SMSService {
	return &SMSService{}
}

func (s *SMSService) Send(phone string, alert *model.Alert) error {
	cfg := config.AppConfig.SMS

	switch cfg.Provider {
	case "aliyun":
		return s.sendAliyunSMS(phone, alert)
	case "tencent":
		return s.sendTencentSMS(phone, alert)
	default:
		return fmt.Errorf("unsupported SMS provider: %s", cfg.Provider)
	}
}

func (s *SMSService) sendAliyunSMS(phone string, alert *model.Alert) error {
	return fmt.Errorf("SMS sending not implemented - placeholder for Aliyun SMS API")
}

func (s *SMSService) sendTencentSMS(phone string, alert *model.Alert) error {
	return fmt.Errorf("SMS sending not implemented - placeholder for Tencent SMS API")
}
