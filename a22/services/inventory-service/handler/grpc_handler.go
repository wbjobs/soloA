package handler

import (
	"context"

	"e-commerce-fulfillment/proto/inventory"
	"e-commerce-fulfillment/services/inventory-service/service"
)

type InventoryHandler struct {
	inventory.UnimplementedInventoryServiceServer
	inventoryService      service.InventoryService
	warehouseRoutingService service.WarehouseRoutingService
}

func NewInventoryHandler(inventoryService service.InventoryService, warehouseRoutingService service.WarehouseRoutingService) *InventoryHandler {
	return &InventoryHandler{
		inventoryService:        inventoryService,
		warehouseRoutingService: warehouseRoutingService,
	}
}

func (h *InventoryHandler) DeductInventory(ctx context.Context, req *inventory.DeductInventoryRequest) (*inventory.DeductInventoryResponse, error) {
	err := h.inventoryService.DeductInventory(ctx, req.SkuCode, req.Quantity, req.OrderId, req.OperationId)
	if err != nil {
		return &inventory.DeductInventoryResponse{
			Success:     false,
			Message:     err.Error(),
			OperationId: req.OperationId,
		}, nil
	}

	return &inventory.DeductInventoryResponse{
		Success:     true,
		Message:     "Inventory deducted successfully",
		OperationId: req.OperationId,
	}, nil
}

func (h *InventoryHandler) RollbackInventory(ctx context.Context, req *inventory.RollbackInventoryRequest) (*inventory.RollbackInventoryResponse, error) {
	err := h.inventoryService.RollbackInventory(ctx, req.OperationId, req.OrderId)
	if err != nil {
		return &inventory.RollbackInventoryResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &inventory.RollbackInventoryResponse{
		Success: true,
		Message: "Inventory rolled back successfully",
	}, nil
}

func (h *InventoryHandler) ConfirmInventory(ctx context.Context, req *inventory.ConfirmInventoryRequest) (*inventory.ConfirmInventoryResponse, error) {
	err := h.inventoryService.ConfirmInventory(ctx, req.OperationId, req.OrderId)
	if err != nil {
		return &inventory.ConfirmInventoryResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &inventory.ConfirmInventoryResponse{
		Success: true,
		Message: "Inventory confirmed successfully",
	}, nil
}

func (h *InventoryHandler) GetInventory(ctx context.Context, req *inventory.GetInventoryRequest) (*inventory.GetInventoryResponse, error) {
	inv, err := h.inventoryService.GetInventory(ctx, req.SkuCode)
	if err != nil {
		return &inventory.GetInventoryResponse{
			Success:           false,
			Message:           err.Error(),
			SkuCode:           req.SkuCode,
			AvailableQuantity: 0,
			FrozenQuantity:    0,
			SoldQuantity:      0,
		}, nil
	}

	return &inventory.GetInventoryResponse{
		Success:           true,
		Message:           "Inventory retrieved successfully",
		SkuCode:           inv.SKUCode,
		AvailableQuantity: inv.AvailableQuantity,
		FrozenQuantity:    inv.FrozenQuantity,
		SoldQuantity:      inv.SoldQuantity,
	}, nil
}

func (h *InventoryHandler) SetInventory(ctx context.Context, req *inventory.SetInventoryRequest) (*inventory.SetInventoryResponse, error) {
	err := h.inventoryService.SetInventory(ctx, req.SkuCode, req.Quantity)
	if err != nil {
		return &inventory.SetInventoryResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &inventory.SetInventoryResponse{
		Success: true,
		Message: "Inventory set successfully",
	}, nil
}

func (h *InventoryHandler) BatchDeductInventory(ctx context.Context, req *inventory.BatchDeductInventoryRequest) (*inventory.BatchDeductInventoryResponse, error) {
	items := make([]service.DeductItem, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, service.DeductItem{
			SKUCode:  item.SkuCode,
			Quantity: item.Quantity,
		})
	}

	operationID, err := h.inventoryService.BatchDeductInventory(ctx, req.OrderId, items)
	if err != nil {
		return &inventory.BatchDeductInventoryResponse{
			Success:     false,
			Message:     err.Error(),
			OperationId: "",
		}, nil
	}

	return &inventory.BatchDeductInventoryResponse{
		Success:     true,
		Message:     "Batch inventory deducted successfully",
		OperationId: operationID,
	}, nil
}

func (h *InventoryHandler) RouteInventory(ctx context.Context, req *inventory.RouteInventoryRequest) (*inventory.RouteInventoryResponse, error) {
	if h.warehouseRoutingService == nil {
		return &inventory.RouteInventoryResponse{
			Success:       false,
			Message:       "warehouse routing service not available",
			RoutingResults: nil,
		}, nil
	}

	results, err := h.warehouseRoutingService.RouteInventory(ctx, req.SkuCode, req.Quantity, req.ShippingAddress)
	if err != nil {
		return &inventory.RouteInventoryResponse{
			Success:       false,
			Message:       err.Error(),
			RoutingResults: nil,
		}, nil
	}

	protoResults := make([]*inventory.RoutingResult, 0, len(results))
	for _, r := range results {
		protoResults = append(protoResults, &inventory.RoutingResult{
			WarehouseId:   r.WarehouseID,
			WarehouseCode: r.WarehouseCode,
			Distance:      r.Distance,
		})
	}

	return &inventory.RouteInventoryResponse{
		Success:        true,
		Message:        "Inventory routed successfully",
		RoutingResults: protoResults,
	}, nil
}

func (h *InventoryHandler) RouteBatchInventory(ctx context.Context, req *inventory.RouteBatchInventoryRequest) (*inventory.RouteBatchInventoryResponse, error) {
	if h.warehouseRoutingService == nil {
		return &inventory.RouteBatchInventoryResponse{
			Success:          false,
			Message:          "warehouse routing service not available",
			SkuRoutingResults: nil,
		}, nil
	}

	items := make([]service.DeductItem, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, service.DeductItem{
			SKUCode:  item.SkuCode,
			Quantity: item.Quantity,
		})
	}

	results, err := h.warehouseRoutingService.RouteBatchInventory(ctx, items, req.ShippingAddress)
	if err != nil {
		return &inventory.RouteBatchInventoryResponse{
			Success:          false,
			Message:          err.Error(),
			SkuRoutingResults: nil,
		}, nil
	}

	protoResults := make([]*inventory.SKURoutingResult, 0, len(results))
	for sku, routing := range results {
		routingProtos := make([]*inventory.RoutingResult, 0, len(routing))
		for _, r := range routing {
			routingProtos = append(routingProtos, &inventory.RoutingResult{
				WarehouseId:   r.WarehouseID,
				WarehouseCode: r.WarehouseCode,
				Distance:      r.Distance,
			})
		}
		protoResults = append(protoResults, &inventory.SKURoutingResult{
			SkuCode:        sku,
			RoutingResults: routingProtos,
		})
	}

	return &inventory.RouteBatchInventoryResponse{
		Success:          true,
		Message:          "Batch inventory routed successfully",
		SkuRoutingResults: protoResults,
	}, nil
}
