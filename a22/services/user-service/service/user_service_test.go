package service

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestHashPassword(t *testing.T) {
	password := "testPassword123"

	hashed, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hashPassword failed: %v", err)
	}

	if hashed == password {
		t.Fatal("Hashed password should not equal plain text password")
	}

	err = bcrypt.CompareHashAndPassword([]byte(hashed), []byte(password))
	if err != nil {
		t.Errorf("Password verification failed: %v", err)
	}

	err = bcrypt.CompareHashAndPassword([]byte(hashed), []byte("wrongPassword"))
	if err == nil {
		t.Error("Should fail for wrong password")
	}
}

func TestCheckPassword(t *testing.T) {
	password := "testPassword123"

	hashed, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hashPassword failed: %v", err)
	}

	if !checkPassword(password, hashed) {
		t.Error("checkPassword should return true for correct password")
	}

	if checkPassword("wrongPassword", hashed) {
		t.Error("checkPassword should return false for wrong password")
	}
}
