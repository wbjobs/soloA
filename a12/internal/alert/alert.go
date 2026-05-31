package alert

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"gopkg.in/gomail.v2"

	"task-scheduler/internal/config"
	"task-scheduler/internal/logger"
)

const (
	maxRetries          = 3
	retryBaseDelay      = 1 * time.Second
	alertTimeout        = 10 * time.Second
	circuitBreakerLimit = 5
	circuitBreakerWindow = 1 * time.Minute
)

type AlertService struct {
	cfg               *config.AlertConfig
	emailCircuit      *circuitBreaker
	wechatCircuit     *circuitBreaker
	recentAlerts      map[string]time.Time
	alertsMutex       sync.RWMutex
}

type AlertMessage struct {
	Title         string
	TaskID        uint
	TaskName      string
	Status        string
	ErrorMessage  string
	ExecutionNode string
	ExecutionTime time.Time
}

type circuitBreaker struct {
	failures    int
	lastFailure time.Time
	mu          sync.Mutex
}

func (cb *circuitBreaker) isOpen() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	if cb.failures >= circuitBreakerLimit {
		if time.Since(cb.lastFailure) < circuitBreakerWindow {
			return true
		}
		cb.failures = 0
	}
	return false
}

func (cb *circuitBreaker) recordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures = 0
}

func (cb *circuitBreaker) recordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures++
	cb.lastFailure = time.Now()
}

func (cb *circuitBreaker) tryClose() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if cb.failures >= circuitBreakerLimit {
		if time.Since(cb.lastFailure) >= circuitBreakerWindow {
			cb.failures = 0
		}
	}
}

func NewAlertService(cfg *config.AlertConfig) *AlertService {
	return &AlertService{
		cfg:          cfg,
		emailCircuit: &circuitBreaker{},
		wechatCircuit: &circuitBreaker{},
		recentAlerts: make(map[string]time.Time),
	}
}

func (s *AlertService) SendAlert(msg *AlertMessage) {
	alertKey := fmt.Sprintf("%d:%s", msg.TaskID, msg.Status)
	
	if !s.shouldSendAlert(alertKey) {
		logger.Sugar.Debugf("Alert for task %d suppressed (deduplication)", msg.TaskID)
		return
	}

	s.recordAlert(alertKey)

	go func() {
		var wg sync.WaitGroup
		
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := s.sendEmailWithRetry(msg); err != nil {
				logger.Sugar.Warnf("Failed to send email alert after retries: %v", err)
			}
		}()

		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := s.sendWechatWithRetry(msg); err != nil {
				logger.Sugar.Warnf("Failed to send wechat alert after retries: %v", err)
			}
		}()

		wg.Wait()
	}()
}

func (s *AlertService) shouldSendAlert(alertKey string) bool {
	s.alertsMutex.RLock()
	defer s.alertsMutex.RUnlock()
	
	if lastSent, exists := s.recentAlerts[alertKey]; exists {
		if time.Since(lastSent) < 1*time.Minute {
			return false
		}
	}
	return true
}

func (s *AlertService) recordAlert(alertKey string) {
	s.alertsMutex.Lock()
	defer s.alertsMutex.Unlock()
	
	s.recentAlerts[alertKey] = time.Now()
	
	go func() {
		time.Sleep(2 * time.Minute)
		s.alertsMutex.Lock()
		defer s.alertsMutex.Unlock()
		if lastSent, exists := s.recentAlerts[alertKey]; exists {
			if time.Since(lastSent) >= 1*time.Minute {
				delete(s.recentAlerts, alertKey)
			}
		}
	}()
}

func (s *AlertService) sendEmailWithRetry(msg *AlertMessage) error {
	s.emailCircuit.tryClose()
	if s.emailCircuit.isOpen() {
		return fmt.Errorf("email circuit breaker is open")
	}

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		err := s.sendEmail(msg)
		if err == nil {
			s.emailCircuit.recordSuccess()
			return nil
		}
		
		lastErr = err
		logger.Sugar.Warnf("Email send attempt %d/%d failed: %v", i+1, maxRetries, err)
		
		if i < maxRetries-1 {
			delay := retryBaseDelay * time.Duration(1<<uint(i))
			time.Sleep(delay)
		}
	}

	s.emailCircuit.recordFailure()
	return lastErr
}

func (s *AlertService) sendEmail(msg *AlertMessage) error {
	if s.cfg.Email.Host == "" {
		return nil
	}

	subject := fmt.Sprintf("[Task Alert] %s - Task: %s", msg.Status, msg.TaskName)
	body := s.buildEmailBody(msg)

	m := gomail.NewMessage()
	m.SetHeader("From", s.cfg.Email.From)
	m.SetHeader("To", s.cfg.Email.To)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", body)

	d := gomail.NewDialer(s.cfg.Email.Host, s.cfg.Email.Port, s.cfg.Email.Username, s.cfg.Email.Password)

	if s.cfg.Email.Port == 465 {
		d.SSL = true
	} else {
		d.SSL = false
	}

	d.TLSConfig = &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         s.cfg.Email.Host,
	}

	done := make(chan error, 1)
	go func() {
		done <- d.DialAndSend(m)
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(alertTimeout):
		return fmt.Errorf("email send timeout after %v", alertTimeout)
	}
}

func (s *AlertService) buildEmailBody(msg *AlertMessage) string {
	errorMsg := msg.ErrorMessage
	if len(errorMsg) > 500 {
		errorMsg = errorMsg[:500] + "..."
	}

	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Task Alert</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden;">
        <div style="background-color: %s; color: white; padding: 15px; text-align: center;">
            <h2 style="margin: 0;">Task Execution Alert</h2>
        </div>
        <div style="padding: 20px;">
            <table style="width: 100%%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9;">Task ID:</td>
                    <td style="padding: 10px;">%d</td>
                </tr>
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9;">Task Name:</td>
                    <td style="padding: 10px;">%s</td>
                </tr>
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9;">Status:</td>
                    <td style="padding: 10px; color: %s; font-weight: bold;">%s</td>
                </tr>
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9;">Execution Node:</td>
                    <td style="padding: 10px;">%s</td>
                </tr>
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9;">Execution Time:</td>
                    <td style="padding: 10px;">%s</td>
                </tr>
                <tr>
                    <td style="padding: 10px; font-weight: bold; background-color: #f9f9f9; vertical-align: top;">Error Message:</td>
                    <td style="padding: 10px; word-break: break-all;">%s</td>
                </tr>
            </table>
        </div>
        <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 12px; color: #666;">
            This is an automated alert. Please do not reply.
        </div>
    </div>
</body>
</html>
`, s.getStatusColor(msg.Status), msg.TaskID, msg.TaskName, s.getStatusColor(msg.Status), msg.Status, 
   msg.ExecutionNode, msg.ExecutionTime.Format("2006-01-02 15:04:05"), errorMsg)
}

func (s *AlertService) getStatusColor(status string) string {
	switch status {
	case "failed":
		return "#dc3545"
	case "timeout":
		return "#ffc107"
	default:
		return "#6c757d"
	}
}

func (s *AlertService) sendWechatWithRetry(msg *AlertMessage) error {
	s.wechatCircuit.tryClose()
	if s.wechatCircuit.isOpen() {
		return fmt.Errorf("wechat circuit breaker is open")
	}

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		err := s.sendWechat(msg)
		if err == nil {
			s.wechatCircuit.recordSuccess()
			return nil
		}
		
		lastErr = err
		logger.Sugar.Warnf("Wechat send attempt %d/%d failed: %v", i+1, maxRetries, err)
		
		if i < maxRetries-1 {
			delay := retryBaseDelay * time.Duration(1<<uint(i))
			time.Sleep(delay)
		}
	}

	s.wechatCircuit.recordFailure()
	return lastErr
}

func (s *AlertService) sendWechat(msg *AlertMessage) error {
	if s.cfg.Wechat.WebhookURL == "" {
		return nil
	}

	content := s.buildWechatContent(msg)
	payload := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"content": content,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %v", err)
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
		MaxIdleConns:        10,
		IdleConnTimeout:     30 * time.Second,
		TLSHandshakeTimeout: 5 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   alertTimeout,
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, s.cfg.Wechat.WebhookURL, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "TaskScheduler/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("wechat webhook returned status %d", resp.StatusCode)
	}

	var result map[string]interface{}
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&result); err != nil {
		return nil
	}

	if errcode, ok := result["errcode"].(float64); ok && errcode != 0 {
		return fmt.Errorf("wechat API error: %v", result)
	}

	return nil
}

func (s *AlertService) buildWechatContent(msg *AlertMessage) string {
	errorMsg := msg.ErrorMessage
	if len(errorMsg) > 300 {
		errorMsg = errorMsg[:300] + "..."
	}
	if errorMsg == "" {
		errorMsg = "N/A"
	}

	statusEmoji := "⚠️"
	if msg.Status == "timeout" {
		statusEmoji = "⏰"
	}

	return fmt.Sprintf(`%s **Task Alert**

**Task ID:** %d
**Task Name:** %s
**Status:** <font color="warning">%s</font>
**Execution Node:** %s
**Execution Time:** %s
**Error:**
```
%s
```

> This is an automated alert. Please check the task status immediately.
`, statusEmoji, msg.TaskID, msg.TaskName, msg.Status, msg.ExecutionNode, 
   msg.ExecutionTime.Format("2006-01-02 15:04:05"), errorMsg)
}
