package channels

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/models"
)

type SMSProvider interface {
	Send(ctx context.Context, phone, templateCode string, params map[string]interface{}) (string, error)
	Name() string
}

type SMSChannel struct {
	providers  map[string]SMSProvider
	aliyunCfg  config.AliyunSMSConfig
	tencentCfg config.TencentSMSConfig
	client     *http.Client
}

func NewSMSChannel(cfg *config.Config) *SMSChannel {
	return &SMSChannel{
		providers:  make(map[string]SMSProvider),
		aliyunCfg:  cfg.SMS.Aliyun,
		tencentCfg: cfg.SMS.Tencent,
		client:     &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *SMSChannel) ChannelType() string {
	return models.ChannelTypeSMS
}

func (c *SMSChannel) Send(ctx context.Context, payload interface{}) (string, error) {
	smsMsg, ok := payload.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid payload type")
	}

	phone, _ := smsMsg["phone"].(string)
	templateCode, _ := smsMsg["template"].(string)
	content, _ := smsMsg["content"].(string)
	params, _ := smsMsg["params"].(map[string]interface{})

	var provider SMSProvider
	if c.aliyunCfg.AccessKeyID != "" {
		provider = NewAliyunSMSProvider(c.aliyunCfg)
	} else if c.tencentCfg.SecretID != "" {
		provider = NewTencentSMSProvider(c.tencentCfg)
	} else {
		if content != "" {
			return "mock_" + time.Now().Format("20060102150405"), nil
		}
		return "", fmt.Errorf("no SMS provider configured")
	}

	return provider.Send(ctx, phone, templateCode, params)
}

type AliyunSMSProvider struct {
	accessKeyID     string
	accessKeySecret string
	signName        string
	client          *http.Client
}

func NewAliyunSMSProvider(cfg config.AliyunSMSConfig) *AliyunSMSProvider {
	return &AliyunSMSProvider{
		accessKeyID:     cfg.AccessKeyID,
		accessKeySecret: cfg.AccessKeySecret,
		signName:        cfg.SignName,
		client:          &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *AliyunSMSProvider) Name() string {
	return "aliyun"
}

func (p *AliyunSMSProvider) Send(ctx context.Context, phone, templateCode string, params map[string]interface{}) (string, error) {
	paramsJSON, _ := json.Marshal(params)
	paramsStr := string(paramsJSON)

	query := url.Values{}
	query.Set("AccessKeyId", p.accessKeyID)
	query.Set("Action", "SendSms")
	query.Set("Format", "JSON")
	query.Set("PhoneNumbers", phone)
	query.Set("RegionId", "cn-hangzhou")
	query.Set("SignName", p.signName)
	query.Set("SignatureMethod", "HMAC-SHA1")
	query.Set("SignatureNonce", fmt.Sprintf("%d", time.Now().UnixNano()))
	query.Set("SignatureVersion", "1.0")
	query.Set("TemplateCode", templateCode)
	query.Set("TemplateParam", paramsStr)
	query.Set("Timestamp", time.Now().UTC().Format("2006-01-02T15:04:05Z"))
	query.Set("Version", "2017-05-25")

	signature := p.generateSignature(query.Encode())
	query.Set("Signature", signature)

	reqURL := "https://dysmsapi.aliyuncs.com/?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Code    string `json:"Code"`
		Message string `json:"Message"`
		BizID   string `json:"BizId"`
	}
	json.Unmarshal(body, &result)

	if result.Code != "OK" {
		return "", fmt.Errorf("aliyun sms error: %s - %s", result.Code, result.Message)
	}

	return result.BizID, nil
}

func (p *AliyunSMSProvider) generateSignature(queryStr string) string {
	keys := []string{}
	for k := range url.Values{} {
		keys = append(keys, k)
	}

	sortedQuery := strings.Split(queryStr, "&")
	sort.Strings(sortedQuery)

	canonicalizedQuery := strings.Join(sortedQuery, "&")
	canonicalizedQuery = url.QueryEscape(canonicalizedQuery)
	canonicalizedQuery = strings.ReplaceAll(canonicalizedQuery, "+", "%20")
	canonicalizedQuery = strings.ReplaceAll(canonicalizedQuery, "*", "%2A")
	canonicalizedQuery = strings.ReplaceAll(canonicalizedQuery, "%7E", "~")

	stringToSign := "GET&" + url.QueryEscape("/") + "&" + canonicalizedQuery

	mac := hmac.New(sha1.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return signature
}

type TencentSMSProvider struct {
	secretID  string
	secretKey string
	sign      string
	client    *http.Client
}

func NewTencentSMSProvider(cfg config.TencentSMSConfig) *TencentSMSProvider {
	return &TencentSMSProvider{
		secretID:  cfg.SecretID,
		secretKey: cfg.SecretKey,
		sign:      cfg.Sign,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *TencentSMSProvider) Name() string {
	return "tencent"
}

func (p *TencentSMSProvider) Send(ctx context.Context, phone, templateCode string, params map[string]interface{}) (string, error) {
	paramList := []string{}
	for _, v := range params {
		paramList = append(paramList, fmt.Sprintf("%v", v))
	}

	payload := map[string]interface{}{
		"PhoneNumberSet":   []string{"+" + phone},
		"TemplateID":       templateCode,
		"SignName":         p.sign,
		"TemplateParamSet": paramList,
	}

	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://sms.tencentcloudapi.com", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	date := time.Now().UTC().Format("2006-01-02")

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-TC-Timestamp", timestamp)
	req.Header.Set("X-TC-Version", "2021-01-11")
	req.Header.Set("X-TC-Action", "SendSms")

	authorization := p.generateAuthorization("sms", body, date, timestamp)
	req.Header.Set("Authorization", authorization)

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Response struct {
			SendStatusSet []struct {
				SerialNo string `json:"SerialNo"`
				Code     string `json:"Code"`
				Message  string `json:"Message"`
			} `json:"SendStatusSet"`
			Error struct {
				Code    string `json:"Code"`
				Message string `json:"Message"`
			} `json:"Error"`
		} `json:"Response"`
	}
	json.Unmarshal(respBody, &result)

	if result.Response.Error.Code != "" {
		return "", fmt.Errorf("tencent sms error: %s - %s", result.Response.Error.Code, result.Response.Error.Message)
	}

	if len(result.Response.SendStatusSet) > 0 {
		status := result.Response.SendStatusSet[0]
		if status.Code != "Ok" {
			return "", fmt.Errorf("tencent sms error: %s - %s", status.Code, status.Message)
		}
		return status.SerialNo, nil
	}

	return "", fmt.Errorf("no response from tencent sms")
}

func (p *TencentSMSProvider) generateAuthorization(service string, payload []byte, date, timestamp string) string {
	algorithm := "TC3-HMAC-SHA256"

	hashedRequestPayload := fmt.Sprintf("%x", sha1.Sum(payload))
	canonicalRequest := "POST\n/\n\ncontent-type:application/json\n\ncontent-type\n" + hashedRequestPayload

	credentialScope := date + "/" + service + "/tc3_request"
	hashedCanonicalRequest := fmt.Sprintf("%x", sha1.Sum([]byte(canonicalRequest)))
	stringToSign := algorithm + "\n" + timestamp + "\n" + credentialScope + "\n" + hashedCanonicalRequest

	secretDate := hmacSHA256([]byte("TC3"+p.secretKey), []byte(date))
	secretService := hmacSHA256(secretDate, []byte(service))
	secretSigning := hmacSHA256(secretService, []byte("tc3_request"))
	signature := fmt.Sprintf("%x", hmacSHA256(secretSigning, []byte(stringToSign)))

	return fmt.Sprintf("%s Credential=%s/%s, SignedHeaders=content-type, Signature=%s",
		algorithm, p.secretID, credentialScope, signature)
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha1.New, key)
	h.Write(data)
	return h.Sum(nil)
}
