package notify

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"gopkg.in/gomail.v2"

	"task-scheduler/internal/model"
)

type Notification struct {
	TaskID      int64
	TaskName    string
	Status      model.LogStatus
	StartTime   time.Time
	EndTime     *time.Time
	DurationMs  int64
	Result      string
	ErrorMsg    string
	WorkerID    string
	Channels    []string
}

type Channel interface {
	Name() string
	Send(ctx context.Context, notification *Notification) error
	Configure(config model.JSONMap) error
}

type EmailConfig struct {
	Host      string   `json:"host"`
	Port      int      `json:"port"`
	Username  string   `json:"username"`
	Password  string   `json:"password"`
	From      string   `json:"from"`
	To        []string `json:"to"`
	UseSSL    bool     `json:"use_ssl"`
	UseTLS    bool     `json:"use_tls"`
}

type WechatWorkConfig struct {
	WebhookURL string `json:"webhook_url"`
	Mentioned  []string `json:"mentioned_list"`
}

type emailChannel struct {
	cfg    *EmailConfig
	logger *zap.Logger
}

func NewEmailChannel(logger *zap.Logger) Channel {
	return &emailChannel{logger: logger}
}

func (c *emailChannel) Name() string {
	return string(model.ChannelTypeEmail)
}

func (c *emailChannel) Configure(config model.JSONMap) error {
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	var cfg EmailConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}
	if cfg.Host == "" || cfg.Port == 0 || cfg.Username == "" {
		return fmt.Errorf("incomplete email config")
	}
	c.cfg = &cfg
	return nil
}

func (c *emailChannel) Send(ctx context.Context, notification *Notification) error {
	if c.cfg == nil {
		return fmt.Errorf("email channel not configured")
	}

	subject := c.buildSubject(notification)
	body := c.buildBody(notification)

	m := gomail.NewMessage()
	m.SetHeader("From", c.cfg.From)
	m.SetHeader("To", c.cfg.To...)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", body)

	dialer := gomail.NewDialer(c.cfg.Host, c.cfg.Port, c.cfg.Username, c.cfg.Password)
	if c.cfg.UseSSL {
		dialer.SSL = true
	}
	if c.cfg.UseTLS {
		dialer.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}

	if err := dialer.DialAndSend(m); err != nil {
		c.logger.Error("Failed to send email", zap.Error(err))
		return err
	}

	c.logger.Info("Email notification sent", zap.Int64("taskID", notification.TaskID))
	return nil
}

func (c *emailChannel) buildSubject(n *Notification) string {
	statusEmoji := map[model.LogStatus]string{
		model.LogStatusSuccess: "✅",
		model.LogStatusFailed:  "❌",
		model.LogStatusRunning: "⏳",
	}
	return fmt.Sprintf("%s 任务执行通知: %s", statusEmoji[n.Status], n.TaskName)
}

func (c *emailChannel) buildBody(n *Notification) string {
	duration := "-"
	if n.DurationMs > 0 {
		duration = fmt.Sprintf("%.2fs", float64(n.DurationMs)/1000.0)
	}

	endTime := "-"
	if n.EndTime != nil {
		endTime = n.EndTime.Format("2006-01-02 15:04:05")
	}

	statusLabel := map[model.LogStatus]string{
		model.LogStatusSuccess: "成功",
		model.LogStatusFailed:  "失败",
		model.LogStatusRunning: "执行中",
	}

	result := n.Result
	if result == "" {
		result = "-"
	}

	errorMsg := n.ErrorMsg
	if errorMsg == "" {
		errorMsg = "-"
	}

	return fmt.Sprintf(`
		<html>
		<body style="font-family: Arial, sans-serif; padding: 20px;">
			<h2>任务执行通知</h2>
			<table border="1" cellpadding="10" style="border-collapse: collapse;">
				<tr><td><strong>任务ID</strong></td><td>%d</td></tr>
				<tr><td><strong>任务名称</strong></td><td>%s</td></tr>
				<tr><td><strong>执行状态</strong></td><td>%s</td></tr>
				<tr><td><strong>开始时间</strong></td><td>%s</td></tr>
				<tr><td><strong>结束时间</strong></td><td>%s</td></tr>
				<tr><td><strong>执行耗时</strong></td><td>%s</td></tr>
				<tr><td><strong>执行节点</strong></td><td>%s</td></tr>
				<tr><td><strong>执行结果</strong></td><td>%s</td></tr>
				<tr><td><strong>错误信息</strong></td><td style="color: red;">%s</td></tr>
			</table>
		</body>
		</html>
	`, n.TaskID, n.TaskName, statusLabel[n.Status],
		n.StartTime.Format("2006-01-02 15:04:05"), endTime, duration,
		n.WorkerID, result, errorMsg)
}

type wechatWorkChannel struct {
	cfg    *WechatWorkConfig
	logger *zap.Logger
	client *http.Client
}

func NewWechatWorkChannel(logger *zap.Logger) Channel {
	return &wechatWorkChannel{
		logger: logger,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *wechatWorkChannel) Name() string {
	return string(model.ChannelTypeWechatWork)
}

func (c *wechatWorkChannel) Configure(config model.JSONMap) error {
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	var cfg WechatWorkConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}
	if cfg.WebhookURL == "" {
		return fmt.Errorf("wechat_work webhook_url is required")
	}
	c.cfg = &cfg
	return nil
}

func (c *wechatWorkChannel) Send(ctx context.Context, notification *Notification) error {
	if c.cfg == nil {
		return fmt.Errorf("wechat_work channel not configured")
	}

	payload := c.buildPayload(notification)
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.WebhookURL, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		c.logger.Error("Failed to send wechat work notification", zap.Error(err))
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		c.logger.Error("Wechat work notification failed",
			zap.Int("statusCode", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return fmt.Errorf("wechat work notification failed: %s", string(respBody))
	}

	c.logger.Info("Wechat work notification sent", zap.Int64("taskID", notification.TaskID))
	return nil
}

type wechatMessage struct {
	MsgType  string       `json:"msgtype"`
	Markdown markdownMsg  `json:"markdown"`
}

type markdownMsg struct {
	Content string `json:"content"`
}

func (c *wechatWorkChannel) buildPayload(n *Notification) *wechatMessage {
	statusEmoji := map[model.LogStatus]string{
		model.LogStatusSuccess: "✅",
		model.LogStatusFailed:  "❌",
		model.LogStatusRunning: "⏳",
	}
	statusLabel := map[model.LogStatus]string{
		model.LogStatusSuccess: "执行成功",
		model.LogStatusFailed:  "执行失败",
		model.LogStatusRunning: "执行中",
	}

	duration := "-"
	if n.DurationMs > 0 {
		duration = fmt.Sprintf("%.2fs", float64(n.DurationMs)/1000.0)
	}

	endTime := "-"
	if n.EndTime != nil {
		endTime = n.EndTime.Format("2006-01-02 15:04:05")
	}

	errorMsg := "-"
	if n.ErrorMsg != "" {
		errorMsg = n.ErrorMsg
	}

	mentioned := ""
	if len(c.cfg.Mentioned) > 0 {
		mentioned = "<@" + strings.Join(c.cfg.Mentioned, "> <@") + ">"
	}

	content := fmt.Sprintf(`%s **任务执行通知**
> 任务ID: <font color="comment">%d</font>
> 任务名称: <font color="comment">%s</font>
> 执行状态: <font color="%s">%s</font>
> 开始时间: <font color="comment">%s</font>
> 结束时间: <font color="comment">%s</font>
> 执行耗时: <font color="comment">%s</font>
> 执行节点: <font color="comment">%s</font>
> 错误信息: <font color="comment">%s</font>
%s`,
		statusEmoji[n.Status], n.TaskID, n.TaskName,
		c.getStatusColor(n.Status), statusLabel[n.Status],
		n.StartTime.Format("2006-01-02 15:04:05"), endTime, duration,
		n.WorkerID, errorMsg, mentioned,
	)

	return &wechatMessage{
		MsgType: "markdown",
		Markdown: markdownMsg{
			Content: content,
		},
	}
}

func (c *wechatWorkChannel) getStatusColor(status model.LogStatus) string {
	switch status {
	case model.LogStatusSuccess:
		return "green"
	case model.LogStatusFailed:
		return "red"
	default:
		return "blue"
	}
}

type Manager struct {
	logger        *zap.Logger
	channels      map[string]Channel
	defaultCfgCh  map[string]model.JSONMap
	notifyChan    chan *Notification
	stopChan      chan struct{}
	wg            sync.WaitGroup
}

func NewManager(logger *zap.Logger) *Manager {
	return &Manager{
		logger:       logger,
		channels:     make(map[string]Channel),
		defaultCfgCh: make(map[string]model.JSONMap),
		notifyChan:   make(chan *Notification, 1000),
		stopChan:     make(chan struct{}),
	}
}

func (m *Manager) RegisterDefaultConfig(channelName string, config model.JSONMap) {
	m.defaultCfgCh[channelName] = config
}

func (m *Manager) getOrCreateChannel(channelName string) (Channel, error) {
	if ch, ok := m.channels[channelName]; ok {
		return ch, nil
	}

	var ch Channel
	switch model.ChannelType(channelName) {
	case model.ChannelTypeEmail:
		ch = NewEmailChannel(m.logger)
	case model.ChannelTypeWechatWork:
		ch = NewWechatWorkChannel(m.logger)
	default:
		return nil, fmt.Errorf("unsupported channel: %s", channelName)
	}

	if cfg, ok := m.defaultCfgCh[channelName]; ok {
		if err := ch.Configure(cfg); err != nil {
			return nil, err
		}
		m.channels[channelName] = ch
	}

	return ch, nil
}

func (m *Manager) Start(ctx context.Context) {
	m.wg.Add(1)
	go m.processLoop(ctx)
}

func (m *Manager) Stop() {
	close(m.stopChan)
	m.wg.Wait()
}

func (m *Manager) processLoop(ctx context.Context) {
	defer m.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopChan:
			return
		case notification := <-m.notifyChan:
			go m.sendNotification(ctx, notification)
		}
	}
}

func (m *Manager) sendNotification(ctx context.Context, n *Notification) {
	var channels []string
	if len(n.Channels) > 0 {
		channels = n.Channels
	} else {
		for name := range m.defaultCfgCh {
			channels = append(channels, name)
		}
	}

	if len(channels) == 0 {
		m.logger.Warn("No notification channels configured", zap.Int64("taskID", n.TaskID))
		return
	}

	for _, channelName := range channels {
		ch, err := m.getOrCreateChannel(channelName)
		if err != nil {
			m.logger.Error("Failed to get channel",
				zap.String("channel", channelName),
				zap.Error(err),
			)
			continue
		}

		sendCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		if err := ch.Send(sendCtx, n); err != nil {
			m.logger.Error("Failed to send notification",
				zap.String("channel", channelName),
				zap.Int64("taskID", n.TaskID),
				zap.Error(err),
			)
		}
		cancel()
	}
}

func (m *Manager) Notify(n *Notification) {
	select {
	case m.notifyChan <- n:
	default:
		m.logger.Warn("Notification channel full, dropping",
			zap.Int64("taskID", n.TaskID),
			zap.String("taskName", n.TaskName),
		)
	}
}
