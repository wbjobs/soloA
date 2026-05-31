package handler

import (
	"context"

	"e-commerce-fulfillment/proto/order"
	"e-commerce-fulfillment/services/order-service/models"
	"e-commerce-fulfillment/services/order-service/service"
)

type OrderHandler struct {
	order.UnimplementedOrderServiceServer
	orderService service.OrderService
}

func NewOrderHandler(orderService service.OrderService) *OrderHandler {
	return &OrderHandler{
		orderService: orderService,
	}
}

func (h *OrderHandler) CreateOrder(ctx context.Context, req *order.CreateOrderRequest) (*order.CreateOrderResponse, error) {
	items := make([]service.OrderItemReq, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, service.OrderItemReq{
			SKUCode:   item.SkuCode,
			Quantity:  item.Quantity,
			UnitPrice: item.UnitPrice,
		})
	}

	orderModel, err := h.orderService.CreateOrder(ctx, req.UserId, req.ShippingAddress, req.Remark, items)
	if err != nil {
		return &order.CreateOrderResponse{
			Success: false,
			Message: err.Error(),
			OrderId: "",
			Order:   nil,
		}, nil
	}

	return &order.CreateOrderResponse{
		Success: true,
		Message: "Order created successfully",
		OrderId: orderModel.ID,
		Order:   h.convertOrderToProto(orderModel),
	}, nil
}

func (h *OrderHandler) GetOrder(ctx context.Context, req *order.GetOrderRequest) (*order.GetOrderResponse, error) {
	orderModel, err := h.orderService.GetOrder(ctx, req.OrderId, req.UserId)
	if err != nil {
		return &order.GetOrderResponse{
			Success: false,
			Message: err.Error(),
			Order:   nil,
		}, nil
	}

	return &order.GetOrderResponse{
		Success: true,
		Message: "Order retrieved successfully",
		Order:   h.convertOrderToProto(orderModel),
	}, nil
}

func (h *OrderHandler) ListOrders(ctx context.Context, req *order.ListOrdersRequest) (*order.ListOrdersResponse, error) {
	orders, total, err := h.orderService.ListOrders(ctx, req.UserId, req.Status, int(req.Page), int(req.PageSize))
	if err != nil {
		return &order.ListOrdersResponse{
			Success:  false,
			Message:  err.Error(),
			Orders:   nil,
			Total:    0,
		}, nil
	}

	protoOrders := make([]*order.Order, 0, len(orders))
	for _, o := range orders {
		protoOrders = append(protoOrders, h.convertOrderToProto(&o))
	}

	return &order.ListOrdersResponse{
		Success:  true,
		Message:  "Orders listed successfully",
		Orders:   protoOrders,
		Total:    total,
	}, nil
}

func (h *OrderHandler) UpdateOrderStatus(ctx context.Context, req *order.UpdateOrderStatusRequest) (*order.UpdateOrderStatusResponse, error) {
	err := h.orderService.UpdateOrderStatus(ctx, req.OrderId, req.NewStatus)
	if err != nil {
		return &order.UpdateOrderStatusResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &order.UpdateOrderStatusResponse{
		Success: true,
		Message: "Order status updated successfully",
	}, nil
}

func (h *OrderHandler) CancelOrder(ctx context.Context, req *order.CancelOrderRequest) (*order.CancelOrderResponse, error) {
	err := h.orderService.CancelOrder(ctx, req.OrderId, req.UserId, req.Reason)
	if err != nil {
		return &order.CancelOrderResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &order.CancelOrderResponse{
		Success: true,
		Message: "Order cancelled successfully",
	}, nil
}

func (h *OrderHandler) PayOrder(ctx context.Context, req *order.PayOrderRequest) (*order.PayOrderResponse, error) {
	orderID, err := h.orderService.PayOrder(ctx, req.OrderId, req.UserId, req.PaymentMethod)
	if err != nil {
		return &order.PayOrderResponse{
			Success:   false,
			Message:   err.Error(),
			PaymentId: "",
		}, nil
	}

	return &order.PayOrderResponse{
		Success:   true,
		Message:   "Payment processed successfully",
		PaymentId: orderID,
	}, nil
}

func (h *OrderHandler) convertOrderToProto(o *models.Order) *order.Order {
	var paidAt, shippedAt, completedAt int64
	if o.PaidAt != nil {
		paidAt = o.PaidAt.Unix()
	}
	if o.ShippedAt != nil {
		shippedAt = o.ShippedAt.Unix()
	}
	if o.CompletedAt != nil {
		completedAt = o.CompletedAt.Unix()
	}

	items := make([]*order.OrderDetailItem, 0, len(o.Items))
	for _, item := range o.Items {
		items = append(items, &order.OrderDetailItem{
			Id:         item.ID,
			OrderId:    item.OrderID,
			SkuCode:    item.SKUCode,
			Quantity:   item.Quantity,
			UnitPrice:  item.UnitPrice,
			TotalPrice: item.TotalPrice,
		})
	}

	return &order.Order{
		Id:              o.ID,
		UserId:          o.UserID,
		Status:          o.Status,
		TotalAmount:     o.TotalAmount,
		DiscountAmount:  o.DiscountAmount,
		PayAmount:       o.PayAmount,
		ShippingAddress: o.ShippingAddress,
		Remark:          o.Remark,
		CreatedAt:       o.CreatedAt.Unix(),
		UpdatedAt:       o.UpdatedAt.Unix(),
		PaidAt:          paidAt,
		ShippedAt:       shippedAt,
		CompletedAt:     completedAt,
		Items:           items,
	}
}
