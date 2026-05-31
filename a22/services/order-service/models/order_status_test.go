package models

import "testing"

func TestValidStatusTransitions(t *testing.T) {
	testCases := []struct {
		name      string
		from      int32
		to        int32
		expected  bool
	}{
		{"PendingPayment to Paid", OrderStatusPendingPayment, OrderStatusPaid, true},
		{"PendingPayment to Cancelled", OrderStatusPendingPayment, OrderStatusCancelled, true},
		{"Paid to Shipped", OrderStatusPaid, OrderStatusShipped, true},
		{"Paid to Cancelled", OrderStatusPaid, OrderStatusCancelled, true},
		{"Shipped to Completed", OrderStatusShipped, OrderStatusCompleted, true},
		{"Shipped to Cancelled", OrderStatusShipped, OrderStatusCancelled, true},
		{"PendingPayment to Shipped (invalid)", OrderStatusPendingPayment, OrderStatusShipped, false},
		{"Completed to Cancelled (invalid)", OrderStatusCompleted, OrderStatusCancelled, false},
		{"Cancelled to Paid (invalid)", OrderStatusCancelled, OrderStatusPaid, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := IsValidStatusTransition(tc.from, tc.to)
			if result != tc.expected {
				t.Errorf("IsValidStatusTransition(%d, %d) = %v, expected %v",
					tc.from, tc.to, result, tc.expected)
			}
		})
	}
}

func TestIsValidStatusTransitionEdgeCases(t *testing.T) {
	if !IsValidStatusTransition(OrderStatusUnknown, OrderStatusPendingPayment) {
		t.Error("Should allow transition from Unknown to PendingPayment")
	}

	if IsValidStatusTransition(OrderStatusCompleted, OrderStatusPaid) {
		t.Error("Should not allow transition from Completed to Paid")
	}
}

func TestGetStatusText(t *testing.T) {
	testCases := []struct {
		status int32
		expected string
	}{
		{OrderStatusPendingPayment, "待支付"},
		{OrderStatusPaid, "已支付"},
		{OrderStatusShipped, "已发货"},
		{OrderStatusCompleted, "已完成"},
		{OrderStatusCancelled, "已取消"},
		{999, "未知状态"},
	}

	for _, tc := range testCases {
		result := GetStatusText(tc.status)
		if result != tc.expected {
			t.Errorf("GetStatusText(%d) = %s, expected %s", tc.status, result, tc.expected)
		}
	}
}
