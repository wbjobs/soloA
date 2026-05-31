package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

func (s *AuthService) Register(username, password, email, phone string) (*model.User, error) {
	var existing model.User
	result := infrastructure.DB.Where("username = ?", username).First(&existing)
	if result.Error == nil {
		return nil, errors.New("username already exists")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Username: username,
		Password: string(hashedPassword),
		Email:    email,
		Phone:    phone,
		Role:     model.RoleUser,
		Status:   model.UserStatusActive,
	}

	result = infrastructure.DB.Create(user)
	if result.Error != nil {
		return nil, result.Error
	}

	return user, nil
}

func (s *AuthService) Login(username, password string) (string, *model.User, error) {
	var user model.User
	result := infrastructure.DB.Where("username = ?", username).First(&user)
	if result.Error != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if !user.IsActive() {
		return "", nil, errors.New("user is inactive")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	token, err := s.generateToken(&user)
	if err != nil {
		return "", nil, err
	}

	return token, &user, nil
}

func (s *AuthService) generateToken(user *model.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":   user.ID,
		"username":  user.Username,
		"role":      user.Role,
		"exp":       time.Now().Add(time.Hour * time.Duration(config.AppConfig.JWT.ExpireHours)).Unix(),
		"iat":       time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.AppConfig.JWT.Secret))
}

func (s *AuthService) ValidateToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(config.AppConfig.JWT.Secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func (s *AuthService) GetUserByID(userID uint) (*model.User, error) {
	var user model.User
	result := infrastructure.DB.First(&user, userID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

func GenerateDeviceKey() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func GenerateDeviceSecret() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (s *AuthService) AuthenticateDevice(deviceKey, deviceSecret string) (*model.Device, error) {
	var device model.Device
	result := infrastructure.DB.Where("device_key = ?", deviceKey).First(&device)
	if result.Error != nil {
		logger.Warn("Device auth failed: device not found", logger.String("device_key", deviceKey))
		return nil, errors.New("device not found")
	}

	if device.DeviceSecret != deviceSecret {
		logger.Warn("Device auth failed: invalid secret", logger.String("device_key", deviceKey))
		return nil, errors.New("invalid credentials")
	}

	return &device, nil
}
