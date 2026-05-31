package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	"e-commerce-fulfillment/pkg/utils"
	"e-commerce-fulfillment/services/user-service/models"
	"e-commerce-fulfillment/services/user-service/repository"
)

type UserService interface {
	Register(ctx context.Context, username, email, password string) (int64, error)
	Login(ctx context.Context, email, password string) (string, *models.User, error)
	GetUser(ctx context.Context, userID int64) (*models.User, error)
	ValidateToken(ctx context.Context, token string) (int64, string, error)
}

type userService struct {
	repo repository.UserRepository
}

func NewUserService(repo repository.UserRepository) UserService {
	return &userService{repo: repo}
}

func (s *userService) Register(ctx context.Context, username, email, password string) (int64, error) {
	existingUser, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return 0, fmt.Errorf("failed to check existing user: %v", err)
	}
	if existingUser != nil {
		return 0, errors.New("email already exists")
	}

	existingUser, err = s.repo.GetByUsername(ctx, username)
	if err != nil {
		return 0, fmt.Errorf("failed to check existing user: %v", err)
	}
	if existingUser != nil {
		return 0, errors.New("username already exists")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("failed to hash password: %v", err)
	}

	user := &models.User{
		Username:  username,
		Email:     email,
		Password:  string(hashedPassword),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.repo.Create(ctx, user); err != nil {
		return 0, err
	}

	return user.ID, nil
}

func (s *userService) Login(ctx context.Context, email, password string) (string, *models.User, error) {
	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return "", nil, err
	}
	if user == nil {
		return "", nil, errors.New("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", nil, errors.New("invalid password")
	}

	token, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %v", err)
	}

	return token, user, nil
}

func (s *userService) GetUser(ctx context.Context, userID int64) (*models.User, error) {
	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (s *userService) ValidateToken(ctx context.Context, token string) (int64, string, error) {
	claims, err := utils.ParseToken(token)
	if err != nil {
		return 0, "", err
	}
	return claims.UserID, claims.Email, nil
}
