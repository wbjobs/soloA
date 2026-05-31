package utils

import (
	"testing"
	"time"
)

func TestGenerateToken(t *testing.T) {
	userID := int64(123)
	email := "test@example.com"

	token, err := GenerateToken(userID, email)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if token == "" {
		t.Fatal("Generated token is empty")
	}
}

func TestParseToken(t *testing.T) {
	userID := int64(123)
	email := "test@example.com"

	tokenStr, err := GenerateToken(userID, email)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := ParseToken(tokenStr)
	if err != nil {
		t.Fatalf("ParseToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("Expected UserID %d, got %d", userID, claims.UserID)
	}

	if claims.Email != email {
		t.Errorf("Expected Email %s, got %s", email, claims.Email)
	}
}

func TestParseInvalidToken(t *testing.T) {
	invalidToken := "invalid.token.here"

	_, err := ParseToken(invalidToken)
	if err == nil {
		t.Fatal("Expected error for invalid token, got nil")
	}
}

func TestParseExpiredToken(t *testing.T) {
	userID := int64(123)
	email := "test@example.com"

	tokenStr, err := GenerateToken(userID, email)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	originalExpiration := tokenExpiration
	tokenExpiration = -1 * time.Hour

	expiredToken, err := GenerateToken(userID, email)
	if err != nil {
		tokenExpiration = originalExpiration
		t.Fatalf("GenerateToken failed: %v", err)
	}
	tokenExpiration = originalExpiration

	_, err = ParseToken(expiredToken)
	if err == nil {
		t.Fatal("Expected error for expired token, got nil")
	}

	_, err = ParseToken(tokenStr)
	if err != nil {
		t.Fatalf("ParseToken failed for valid token: %v", err)
	}
}
