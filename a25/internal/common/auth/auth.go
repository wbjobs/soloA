package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidAPIKey   = errors.New("invalid API key")
	ErrInvalidSignature = errors.New("invalid signature")
	ErrExpiredToken     = errors.New("token expired")
	ErrTenantDisabled   = errors.New("tenant is disabled")
)

type JWTClaims struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type AuthService struct {
	jwtSecret []byte
}

func NewAuthService(secret string) *AuthService {
	return &AuthService{
		jwtSecret: []byte(secret),
	}
}

func (s *AuthService) GenerateToken(tenantID, userID, role string, duration time.Duration) (string, error) {
	claims := JWTClaims{
		TenantID: tenantID,
		UserID:   userID,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *AuthService) ValidateToken(tokenString string) (*JWTClaims, error) {
	claims := &JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, ErrInvalidSignature
	}

	if claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, ErrExpiredToken
	}

	return claims, nil
}

func HashSecret(secret string) string {
	hash := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(hash[:])
}

func VerifySecret(secret, hash string) bool {
	return HashSecret(secret) == hash
}

func GenerateSignature(timestamp, apiKey, apiSecret, body string) string {
	signatureString := fmt.Sprintf("%s%s%s%s", timestamp, apiKey, apiSecret, body)
	hash := sha256.Sum256([]byte(signatureString))
	return hex.EncodeToString(hash[:])
}

func VerifySignature(timestamp, apiKey, apiSecret, body, signature string, maxAgeSeconds int64) bool {
	ts := parseTimestamp(timestamp)
	if ts == 0 || time.Now().Unix()-ts > maxAgeSeconds {
		return false
	}

	expectedSignature := GenerateSignature(timestamp, apiKey, apiSecret, body)
	return expectedSignature == signature
}

func parseTimestamp(timestamp string) int64 {
	var ts int64
	fmt.Sscanf(timestamp, "%d", &ts)
	return ts
}
