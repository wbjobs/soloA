package channels

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/models"
	"github.com/sideshow/apns2"
	"github.com/sideshow/apns2/token"
)

type PushProvider interface {
	Send(ctx context.Context, deviceToken string, payload *models.PushPayload) (string, error)
	Name() string
}

type PushChannel struct {
	providers    map[string]PushProvider
	apnsClient   *apns2.Client
	fcmConfig    config.FCMConfig
	xiaomiConfig map[string]string
	huaweiConfig map[string]string
}

func NewPushChannel(cfg *config.Config) (*PushChannel, error) {
	channel := &PushChannel{
		providers: make(map[string]PushProvider),
		fcmConfig: cfg.FCM,
	}

	apnsProvider, err := NewAPNsProvider(cfg.APNs)
	if err != nil {
		return nil, err
	}
	channel.providers[models.ProviderTypeAPNs] = apnsProvider

	channel.providers[models.ProviderTypeFCM] = NewFCMProvider(cfg.FCM)

	return channel, nil
}

func (c *PushChannel) ChannelType() string {
	return models.ChannelTypePush
}

func (c *PushChannel) Send(ctx context.Context, payload interface{}) (string, error) {
	pushMsg, ok := payload.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid payload type")
	}

	deviceToken, _ := pushMsg["device_token"].(string)
	providerType, _ := pushMsg["provider"].(string)
	subject, _ := pushMsg["subject"].(string)
	content, _ := pushMsg["content"].(string)

	pushPayload := &models.PushPayload{
		Title: subject,
		Body:  content,
	}

	if data, ok := pushMsg["metadata"].(map[string]interface{}); ok {
		pushPayload.Data = data
	}

	if provider, exists := c.providers[providerType]; exists {
		return provider.Send(ctx, deviceToken, pushPayload)
	}

	if provider, exists := c.providers[models.ProviderTypeFCM]; exists {
		return provider.Send(ctx, deviceToken, pushPayload)
	}

	return "", fmt.Errorf("no push provider available")
}

type APNsProvider struct {
	client *apns2.Client
}

func NewAPNsProvider(cfg config.APNsConfig) (*APNsProvider, error) {
	authKey, err := token.AuthKeyFromFile(cfg.PrivateKeyPath)
	if err != nil {
		return nil, err
	}

	apnsToken := &token.Token{
		AuthKey: authKey,
		KeyID:   cfg.KeyID,
		TeamID:  cfg.TeamID,
	}

	var client *apns2.Client
	if cfg.Production {
		client = apns2.NewTokenClient(apnsToken).Production()
	} else {
		client = apns2.NewTokenClient(apnsToken).Development()
	}

	return &APNsProvider{client: client}, nil
}

func (p *APNsProvider) Name() string {
	return models.ProviderTypeAPNs
}

func (p *APNsProvider) Send(ctx context.Context, deviceToken string, payload *models.PushPayload) (string, error) {
	notification := &apns2.Notification{
		DeviceToken: deviceToken,
		Topic:       config.GetConfig().APNs.BundleID,
		Priority:    apns2.PriorityHigh,
	}

	aps := map[string]interface{}{
		"alert": map[string]string{
			"title": payload.Title,
			"body":  payload.Body,
		},
	}

	if payload.Badge > 0 {
		aps["badge"] = payload.Badge
	}
	if payload.Sound != "" {
		aps["sound"] = payload.Sound
	}

	notificationPayload := map[string]interface{}{
		"aps": aps,
	}

	if payload.Data != nil {
		for k, v := range payload.Data {
			notificationPayload[k] = v
		}
	}

	notification.Payload, _ = json.Marshal(notificationPayload)

	resp, err := p.client.PushWithContext(ctx, notification)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("apns error: %s - %s", resp.StatusCode, resp.Reason)
	}

	return resp.ApnsID, nil
}

type FCMProvider struct {
	serverKey string
	senderID  string
	client    *http.Client
}

func NewFCMProvider(cfg config.FCMConfig) *FCMProvider {
	return &FCMProvider{
		serverKey: cfg.ServerKey,
		senderID:  cfg.SenderID,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *FCMProvider) Name() string {
	return models.ProviderTypeFCM
}

func (p *FCMProvider) Send(ctx context.Context, deviceToken string, payload *models.PushPayload) (string, error) {
	fcmPayload := map[string]interface{}{
		"to": deviceToken,
		"notification": map[string]interface{}{
			"title": payload.Title,
			"body":  payload.Body,
		},
		"priority": "high",
	}

	if payload.ImageURL != "" {
		fcmPayload["notification"].(map[string]interface{})["image"] = payload.ImageURL
	}
	if payload.ClickAction != "" {
		fcmPayload["notification"].(map[string]interface{})["click_action"] = payload.ClickAction
	}
	if payload.Data != nil {
		fcmPayload["data"] = payload.Data
	}

	body, _ := json.Marshal(fcmPayload)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://fcm.googleapis.com/fcm/send", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "key="+p.serverKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fcm error: %s", string(respBody))
	}

	var fcmResp struct {
		MulticastID int64 `json:"multicast_id"`
		Success     int   `json:"success"`
		Failure     int   `json:"failure"`
		Results     []struct {
			MessageID string `json:"message_id"`
			Error     string `json:"error"`
		} `json:"results"`
	}

	json.Unmarshal(respBody, &fcmResp)

	if fcmResp.Failure > 0 && len(fcmResp.Results) > 0 && fcmResp.Results[0].Error != "" {
		return "", fmt.Errorf("fcm error: %s", fcmResp.Results[0].Error)
	}

	if len(fcmResp.Results) > 0 {
		return fcmResp.Results[0].MessageID, nil
	}

	return fmt.Sprintf("%d", fcmResp.MulticastID), nil
}

type XiaomiProvider struct {
	appSecret string
	client    *http.Client
}

func NewXiaomiProvider(appSecret string) *XiaomiProvider {
	return &XiaomiProvider{
		appSecret: appSecret,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *XiaomiProvider) Name() string {
	return models.ProviderTypeXiaomi
}

func (p *XiaomiProvider) Send(ctx context.Context, deviceToken string, payload *models.PushPayload) (string, error) {
	return p.sendWithRetry(ctx, deviceToken, payload, 2)
}

func (p *XiaomiProvider) sendWithRetry(ctx context.Context, deviceToken string, payload *models.PushPayload, maxRetries int) (string, error) {
	var lastErr error
	
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*100) * time.Millisecond)
		}

		xiaomiPayload := map[string]interface{}{
			"reg_id":                  deviceToken,
			"title":                   payload.Title,
			"description":             payload.Body,
			"pass_through":            0,
			"notify_type":             -1,
			"time_to_live":            86400000,
		}

		if payload.Data != nil {
			xiaomiPayload["extra"] = payload.Data
		}

		body, _ := json.Marshal(xiaomiPayload)

		req, err := http.NewRequestWithContext(ctx, "POST", "https://api.xmpush.xiaomi.com/v3/message/regid", bytes.NewReader(body))
		if err != nil {
			lastErr = err
			continue
		}

		req.Header.Set("Authorization", "key="+p.appSecret)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := p.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		var xiaomiResp struct {
			Result string `json:"result"`
			Code   int    `json:"code"`
			Data   struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		json.Unmarshal(respBody, &xiaomiResp)

		if xiaomiResp.Code == 0 {
			return xiaomiResp.Data.ID, nil
		}

		lastErr = fmt.Errorf("xiaomi error code=%d result=%s", xiaomiResp.Code, xiaomiResp.Result)

		if xiaomiResp.Code == 20101 || xiaomiResp.Code == 20102 || xiaomiResp.Code == 20103 {
			continue
		}

		if !isRetryableXiaomiError(xiaomiResp.Code) {
			break
		}
	}

	return "", lastErr
}

func isRetryableXiaomiError(code int) bool {
	retryableCodes := map[int]bool{
		20001: true,
		20002: true,
		20003: true,
		20004: true,
	}
	return retryableCodes[code]
}

type HuaweiProvider struct {
	appID       string
	appSecret   string
	client      *http.Client
	tokenMu     sync.RWMutex
	accessToken string
	tokenExpiry time.Time
	refreshNow  bool
}

func NewHuaweiProvider(appID, appSecret string) *HuaweiProvider {
	return &HuaweiProvider{
		appID:     appID,
		appSecret: appSecret,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *HuaweiProvider) Name() string {
	return models.ProviderTypeHuawei
}

func (p *HuaweiProvider) getAccessToken(ctx context.Context, forceRefresh bool) (string, error) {
	p.tokenMu.RLock()
	if !forceRefresh && p.accessToken != "" && time.Now().Before(p.tokenExpiry) && !p.refreshNow {
		token := p.accessToken
		p.tokenMu.RUnlock()
		return token, nil
	}
	p.tokenMu.RUnlock()

	p.tokenMu.Lock()
	defer p.tokenMu.Unlock()

	if !forceRefresh && p.accessToken != "" && time.Now().Before(p.tokenExpiry) && !p.refreshNow {
		return p.accessToken, nil
	}

	authPayload := map[string]interface{}{
		"grant_type":    "client_credentials",
		"client_id":     p.appID,
		"client_secret": p.appSecret,
	}

	body, _ := json.Marshal(authPayload)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://oauth-login.cloud.huawei.com/oauth2/v3/token", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	json.Unmarshal(respBody, &tokenResp)

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("failed to get huawei access token: %s", string(respBody))
	}

	p.accessToken = tokenResp.AccessToken
	p.tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn-60) * time.Second)
	p.refreshNow = false

	return p.accessToken, nil
}

func (p *HuaweiProvider) forceTokenRefresh() {
	p.tokenMu.Lock()
	p.refreshNow = true
	p.tokenMu.Unlock()
}

func (p *HuaweiProvider) Send(ctx context.Context, deviceToken string, payload *models.PushPayload) (string, error) {
	return p.sendWithRetry(ctx, deviceToken, payload, 2)
}

func (p *HuaweiProvider) sendWithRetry(ctx context.Context, deviceToken string, payload *models.PushPayload, maxRetries int) (string, error) {
	var lastErr error
	forceRefresh := false

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*100) * time.Millisecond)
		}

		accessToken, err := p.getAccessToken(ctx, forceRefresh)
		if err != nil {
			lastErr = err
			forceRefresh = true
			continue
		}

		huaweiPayload := map[string]interface{}{
			"message": map[string]interface{}{
				"token": []string{deviceToken},
				"notification": map[string]interface{}{
					"title": payload.Title,
					"body":  payload.Body,
				},
				"android": map[string]interface{}{
					"notification": map[string]interface{}{
						"title": payload.Title,
						"body":  payload.Body,
						"click_action": map[string]interface{}{
							"type": 3,
						},
					},
				},
			},
		}

		if payload.Data != nil {
			huaweiPayload["message"].(map[string]interface{})["data"] = payload.Data
		}

		body, _ := json.Marshal(huaweiPayload)

		url := fmt.Sprintf("https://push-api.cloud.huawei.com/v1/%s/messages:send", p.appID)
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		if err != nil {
			lastErr = err
			continue
		}

		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := p.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		var huaweiResp struct {
			Code      string `json:"code"`
			Msg       string `json:"msg"`
			RequestID string `json:"requestId"`
		}
		json.Unmarshal(respBody, &huaweiResp)

		if huaweiResp.Code == "80000000" {
			return huaweiResp.RequestID, nil
		}

		lastErr = fmt.Errorf("huawei error: %s - %s", huaweiResp.Code, huaweiResp.Msg)

		if huaweiResp.Code == "6" || huaweiResp.Code == "1101" || huaweiResp.Code == "1102" ||
		   huaweiResp.Code == "1103" || huaweiResp.Code == "1105" {
			p.forceTokenRefresh()
			forceRefresh = true
			continue
		}

		if !isRetryableHuaweiError(huaweiResp.Code) {
			break
		}
	}

	return "", lastErr
}

func isRetryableHuaweiError(code string) bool {
	retryableCodes := map[string]bool{
		"80000001": true,
		"80000002": true,
		"80000003": true,
		"1000":     true,
		"1001":     true,
		"1002":     true,
	}
	return retryableCodes[code]
}
