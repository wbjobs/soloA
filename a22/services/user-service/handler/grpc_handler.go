package handler

import (
	"context"

	"e-commerce-fulfillment/proto/user"
	"e-commerce-fulfillment/services/user-service/service"
)

type UserHandler struct {
	user.UnimplementedUserServiceServer
	userService service.UserService
}

func NewUserHandler(userService service.UserService) *UserHandler {
	return &UserHandler{
		userService: userService,
	}
}

func (h *UserHandler) Register(ctx context.Context, req *user.RegisterRequest) (*user.RegisterResponse, error) {
	userID, err := h.userService.Register(ctx, req.Username, req.Email, req.Password)
	if err != nil {
		return &user.RegisterResponse{
			Success: false,
			Message: err.Error(),
			UserId:  0,
		}, nil
	}

	return &user.RegisterResponse{
		Success: true,
		Message: "User registered successfully",
		UserId:  userID,
	}, nil
}

func (h *UserHandler) Login(ctx context.Context, req *user.LoginRequest) (*user.LoginResponse, error) {
	token, userModel, err := h.userService.Login(ctx, req.Email, req.Password)
	if err != nil {
		return &user.LoginResponse{
			Success: false,
			Message: err.Error(),
			Token:   "",
			User:    nil,
		}, nil
	}

	return &user.LoginResponse{
		Success: true,
		Message: "Login successful",
		Token:   token,
		User: &user.UserInfo{
			Id:        userModel.ID,
			Username:  userModel.Username,
			Email:     userModel.Email,
			CreatedAt: userModel.CreatedAt.Unix(),
			UpdatedAt: userModel.UpdatedAt.Unix(),
		},
	}, nil
}

func (h *UserHandler) GetUser(ctx context.Context, req *user.GetUserRequest) (*user.GetUserResponse, error) {
	if req.Token != "" {
		userID, _, err := h.userService.ValidateToken(ctx, req.Token)
		if err != nil {
			return &user.GetUserResponse{
				Success: false,
				Message: "Invalid token",
				User:    nil,
			}, nil
		}
		if userID != req.UserId {
			return &user.GetUserResponse{
				Success: false,
				Message: "Unauthorized",
				User:    nil,
			}, nil
		}
	}

	userModel, err := h.userService.GetUser(ctx, req.UserId)
	if err != nil {
		return &user.GetUserResponse{
			Success: false,
			Message: err.Error(),
			User:    nil,
		}, nil
	}

	return &user.GetUserResponse{
		Success: true,
		Message: "User retrieved successfully",
		User: &user.UserInfo{
			Id:        userModel.ID,
			Username:  userModel.Username,
			Email:     userModel.Email,
			CreatedAt: userModel.CreatedAt.Unix(),
			UpdatedAt: userModel.UpdatedAt.Unix(),
		},
	}, nil
}

func (h *UserHandler) ValidateToken(ctx context.Context, req *user.ValidateTokenRequest) (*user.ValidateTokenResponse, error) {
	userID, email, err := h.userService.ValidateToken(ctx, req.Token)
	if err != nil {
		return &user.ValidateTokenResponse{
			Valid:   false,
			UserId:  0,
			Email:   "",
			Message: err.Error(),
		}, nil
	}

	return &user.ValidateTokenResponse{
		Valid:   true,
		UserId:  userID,
		Email:   email,
		Message: "Token is valid",
	}, nil
}
