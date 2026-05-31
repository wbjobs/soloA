package channels

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"path/filepath"
	"time"

	"github.com/message-push-center/internal/common/config"
	"github.com/message-push-center/internal/common/models"
)

type EmailChannel struct {
	smtpHost string
	smtpPort int
	username string
	password string
	fromName string
	fromAddr string
}

func NewEmailChannel(cfg *config.Config) *EmailChannel {
	return &EmailChannel{
		smtpHost: cfg.Email.SMTP.Host,
		smtpPort: cfg.Email.SMTP.Port,
		username: cfg.Email.SMTP.Username,
		password: cfg.Email.SMTP.Password,
		fromName: cfg.Email.SMTP.FromName,
		fromAddr: cfg.Email.SMTP.Username,
	}
}

func (c *EmailChannel) ChannelType() string {
	return models.ChannelTypeEmail
}

func (c *EmailChannel) Send(ctx context.Context, payload interface{}) (string, error) {
	emailMsg, ok := payload.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid payload type")
	}

	subject, _ := emailMsg["subject"].(string)
	body, _ := emailMsg["content"].(string)
	htmlBody, _ := emailMsg["html_body"].(string)
	toStr, _ := emailMsg["to"].(string)
	var to []string
	if toStr != "" {
		to = []string{toStr}
	}

	emailPayload := &models.EmailPayload{
		From:     c.fromAddr,
		To:       to,
		Subject:  subject,
		Body:     body,
		HTMLBody: htmlBody,
	}

	return c.sendEmail(emailPayload)
}

func (c *EmailChannel) sendEmail(payload *models.EmailPayload) (string, error) {
	if len(payload.To) == 0 {
		return "", fmt.Errorf("no recipients specified")
	}

	from := mail.Address{
		Name:    c.fromName,
		Address: c.fromAddr,
	}

	to := make([]string, len(payload.To))
	for i, addr := range payload.To {
		to[i] = addr
	}

	auth := smtp.PlainAuth("", c.username, c.password, c.smtpHost)

	message, err := c.buildMessage(from, payload)
	if err != nil {
		return "", err
	}

	addr := fmt.Sprintf("%s:%d", c.smtpHost, c.smtpPort)

	if c.smtpPort == 465 {
		err = c.sendEmailTLS(addr, auth, from.Address, to, message)
	} else {
		err = smtp.SendMail(addr, auth, from.Address, to, message)
	}

	if err != nil {
		return "", err
	}

	return fmt.Sprintf("email_%d", time.Now().UnixNano()), nil
}

func (c *EmailChannel) sendEmailTLS(addr string, auth smtp.Auth, from string, to []string, msg []byte) error {
	host, _, _ := splitHostPort(addr)

	tlsConfig := &tls.Config{
		ServerName: host,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return err
	}

	if err = client.Mail(from); err != nil {
		return err
	}

	for _, addr := range to {
		if err = client.Rcpt(addr); err != nil {
			return err
		}
	}

	w, err := client.Data()
	if err != nil {
		return err
	}

	_, err = w.Write(msg)
	if err != nil {
		return err
	}

	err = w.Close()
	if err != nil {
		return err
	}

	return client.Quit()
}

func (c *EmailChannel) buildMessage(from mail.Address, payload *models.EmailPayload) ([]byte, error) {
	buf := bytes.NewBuffer(nil)

	headers := make(map[string]string)
	headers["From"] = from.String()
	headers["To"] = joinAddresses(payload.To)
	if len(payload.Cc) > 0 {
		headers["Cc"] = joinAddresses(payload.Cc)
	}
	headers["Subject"] = mime.QEncoding.Encode("UTF-8", payload.Subject)
	headers["MIME-Version"] = "1.0"
	headers["Date"] = time.Now().Format(time.RFC1123Z)
	headers["Message-ID"] = fmt.Sprintf("<%d.%s@%s>", time.Now().UnixNano(), generateMessageID(), c.smtpHost)

	for k, v := range headers {
		fmt.Fprintf(buf, "%s: %s\r\n", k, v)
	}

	if len(payload.Attachments) > 0 || payload.HTMLBody != "" {
		return c.buildMultipartMessage(buf, payload)
	}

	buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
	buf.WriteString(payload.Body)

	return buf.Bytes(), nil
}

func (c *EmailChannel) buildMultipartMessage(buf *bytes.Buffer, payload *models.EmailPayload) ([]byte, error) {
	mw := multipart.NewWriter(buf)
	boundary := mw.Boundary()

	buf.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=%s\r\n\r\n", boundary))

	alternativeBoundary := "alternative-" + boundary
	fmt.Fprintf(buf, "--%s\r\n", boundary)
	fmt.Fprintf(buf, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", alternativeBoundary)

	if payload.Body != "" {
		fmt.Fprintf(buf, "--%s\r\n", alternativeBoundary)
		buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		buf.WriteString(payload.Body)
		buf.WriteString("\r\n")
	}

	if payload.HTMLBody != "" {
		fmt.Fprintf(buf, "--%s\r\n", alternativeBoundary)
		buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		buf.WriteString(payload.HTMLBody)
		buf.WriteString("\r\n")
	}

	fmt.Fprintf(buf, "--%s--\r\n", alternativeBoundary)

	for _, att := range payload.Attachments {
		fmt.Fprintf(buf, "--%s\r\n", boundary)
		
		h := make(textproto.MIMEHeader)
		h.Set("Content-Type", fmt.Sprintf("%s; name=%q", att.MimeType, att.Filename))
		h.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", att.Filename))
		h.Set("Content-Transfer-Encoding", "base64")
		
		for k, v := range h {
			for _, vv := range v {
				fmt.Fprintf(buf, "%s: %s\r\n", k, vv)
			}
		}
		buf.WriteString("\r\n")

		encoded := base64.StdEncoding.EncodeToString(att.Content)
		for i := 0; i < len(encoded); i += 76 {
			end := i + 76
			if end > len(encoded) {
				end = len(encoded)
			}
			buf.WriteString(encoded[i:end])
			buf.WriteString("\r\n")
		}
	}

	fmt.Fprintf(buf, "--%s--\r\n", boundary)

	return buf.Bytes(), nil
}

func joinAddresses(addrs []string) string {
	result := make([]string, len(addrs))
	for i, addr := range addrs {
		result[i] = addr
	}
	return joinStrings(result, ", ")
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}

func splitHostPort(addr string) (string, string, error) {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i], addr[i+1:], nil
		}
	}
	return "", "", fmt.Errorf("invalid address: %s", addr)
}

func generateMessageID() string {
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

func getMimeType(filename string) string {
	ext := filepath.Ext(filename)
	switch ext {
	case ".txt":
		return "text/plain"
	case ".html":
		return "text/html"
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	default:
		return "application/octet-stream"
	}
}

var _ = io.EOF
