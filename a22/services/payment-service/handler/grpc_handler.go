package handler

import (
	"context"

	"e-commerce-fulfillment/proto/payment"
	"e-commerce-fulfillment/services/payment-service/service"
)

type PaymentHandler struct {
	payment.UnimplementedPaymentServiceServer
	paymentService service.PaymentService
}

func NewPaymentHandler(paymentService service.PaymentService) *PaymentHandler {
	return &PaymentHandler{
		paymentService: paymentService,
	}
}

func (h *PaymentHandler) CreatePayment(ctx context.Context, req *payment.CreatePaymentRequest) (*payment.CreatePaymentResponse, error) {
	paymentID, status, err := h.paymentService.CreatePayment(ctx, req.OrderId, req.UserId, req.Amount, req.PaymentMethod)
	if err != nil {
		return &payment.CreatePaymentResponse{
			Success:   false,
			Message:   err.Error(),
			PaymentId: "",
			Status:    0,
		}, nil
	}

	return &payment.CreatePaymentResponse{
		Success:   true,
		Message:   "Payment created successfully",
		PaymentId: paymentID,
		Status:    status,
	}, nil
}

func (h *PaymentHandler) GetPayment(ctx context.Context, req *payment.GetPaymentRequest) (*payment.GetPaymentResponse, error) {
	paymentModel, err := h.paymentService.GetPayment(ctx, req.PaymentId, req.OrderId)
	if err != nil {
		return &payment.GetPaymentResponse{
			Success: false,
			Message: err.Error(),
			Payment: nil,
		}, nil
	}

	var paidAt int64
	if paymentModel.PaidAt != nil {
		paidAt = paymentModel.PaidAt.Unix()
	}

	return &payment.GetPaymentResponse{
		Success: true,
		Message: "Payment retrieved successfully",
		Payment: &payment.Payment{
			Id:            paymentModel.ID,
			OrderId:       paymentModel.OrderID,
			UserId:        paymentModel.UserID,
			Amount:        paymentModel.Amount,
			Status:        paymentModel.Status,
			PaymentMethod: paymentModel.PaymentMethod,
			TransactionId: paymentModel.TransactionID,
			CreatedAt:     paymentModel.CreatedAt.Unix(),
			PaidAt:        paidAt,
		},
	}, nil
}

func (h *PaymentHandler) RefundPayment(ctx context.Context, req *payment.RefundPaymentRequest) (*payment.RefundPaymentResponse, error) {
	err := h.paymentService.RefundPayment(ctx, req.PaymentId, req.OrderId, req.Amount, req.Reason)
	if err != nil {
		return &payment.RefundPaymentResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &payment.RefundPaymentResponse{
		Success: true,
		Message: "Refund processed successfully",
	}, nil
}
