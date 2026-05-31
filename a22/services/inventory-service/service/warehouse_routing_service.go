package service

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"e-commerce-fulfillment/pkg/logger"
	"e-commerce-fulfillment/services/inventory-service/models"
	"e-commerce-fulfillment/services/inventory-service/repository"
)

type WarehouseRoutingService interface {
	RouteInventory(ctx context.Context, skuCode string, quantity int32, shippingAddress string) ([]*models.RoutingResult, error)
	RouteBatchInventory(ctx context.Context, items []DeductItem, shippingAddress string) (map[string][]*models.RoutingResult, error)
	GetWarehouseByAddress(ctx context.Context, shippingAddress string) (*models.Warehouse, error)
	GetNearbyWarehouses(ctx context.Context, lat, lon float64, radiusKm float64) ([]*models.Warehouse, error)
}

type warehouseRoutingService struct {
	warehouseRepo repository.WarehouseRepository
	invRepo       repository.InventoryRepository
}

func NewWarehouseRoutingService(
	warehouseRepo repository.WarehouseRepository,
	invRepo repository.InventoryRepository,
) WarehouseRoutingService {
	return &warehouseRoutingService{
		warehouseRepo: warehouseRepo,
		invRepo:       invRepo,
	}
}

func (s *warehouseRoutingService) RouteInventory(ctx context.Context, skuCode string, quantity int32, shippingAddress string) ([]*models.RoutingResult, error) {
	if skuCode == "" {
		return nil, fmt.Errorf("sku code is required")
	}
	if quantity <= 0 {
		return nil, fmt.Errorf("quantity must be positive")
	}

	warehouseInventories, err := s.warehouseRepo.GetWarehouseInventoriesBySKU(ctx, skuCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get warehouse inventories: %v", err)
	}

	if len(warehouseInventories) == 0 {
		return nil, fmt.Errorf("no warehouse has inventory for sku: %s", skuCode)
	}

	var targetLat, targetLon float64
	if shippingAddress != "" {
		targetLat, targetLon = s.parseAddressToCoordinates(shippingAddress)
	}

	type warehouseScore struct {
		warehouse *models.Warehouse
		inv       *models.WarehouseInventory
		score     float64
		distance  float64
	}

	scores := make([]warehouseScore, 0, len(warehouseInventories))
	for _, wi := range warehouseInventories {
		if wi.AvailableQuantity < quantity {
			continue
		}

		wh, err := s.warehouseRepo.GetByID(ctx, wi.WarehouseID)
		if err != nil || wh == nil {
			continue
		}
		if !wh.IsActive {
			continue
		}

		distance := 0.0
		if targetLat != 0 || targetLon != 0 {
			distance = models.CalculateDistance(targetLat, targetLon, wh.Latitude, wh.Longitude)
		}

		score := float64(wh.Priority)*1000 - distance

		scores = append(scores, warehouseScore{
			warehouse: wh,
			inv:       wi,
			score:     score,
			distance:  distance,
		})
	}

	if len(scores) == 0 {
		return nil, fmt.Errorf("insufficient inventory for sku: %s, required: %d", skuCode, quantity)
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})

	results := make([]*models.RoutingResult, 0, len(scores))
	for _, s := range scores {
		results = append(results, &models.RoutingResult{
			WarehouseID:   s.warehouse.ID,
			WarehouseCode: s.warehouse.Code,
			Distance:      s.distance,
		})
	}

	logger.GetLogger().Info(fmt.Sprintf("Routed inventory for sku %s: %d warehouses available, best: %s", skuCode, len(results), results[0].WarehouseCode))

	return results, nil
}

func (s *warehouseRoutingService) RouteBatchInventory(ctx context.Context, items []DeductItem, shippingAddress string) (map[string][]*models.RoutingResult, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("items cannot be empty")
	}

	results := make(map[string][]*models.RoutingResult)
	for _, item := range items {
		routing, err := s.RouteInventory(ctx, item.SKUCode, item.Quantity, shippingAddress)
		if err != nil {
			return nil, fmt.Errorf("failed to route inventory for sku %s: %v", item.SKUCode, err)
		}
		results[item.SKUCode] = routing
	}

	return results, nil
}

func (s *warehouseRoutingService) GetWarehouseByAddress(ctx context.Context, shippingAddress string) (*models.Warehouse, error) {
	if shippingAddress == "" {
		return nil, fmt.Errorf("shipping address is required")
	}

	parsedCity, parsedProvince := s.parseAddress(shippingAddress)

	if parsedCity != "" {
		warehouses, err := s.warehouseRepo.GetByCity(ctx, parsedCity)
		if err == nil && len(warehouses) > 0 {
			return warehouses[0], nil
		}
	}

	if parsedProvince != "" {
		warehouses, err := s.warehouseRepo.GetByProvince(ctx, parsedProvince)
		if err == nil && len(warehouses) > 0 {
			return warehouses[0], nil
		}
	}

	warehouses, err := s.warehouseRepo.GetAllActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get warehouses: %v", err)
	}

	if len(warehouses) == 0 {
		return nil, fmt.Errorf("no active warehouses found")
	}

	sort.Slice(warehouses, func(i, j int) bool {
		return warehouses[i].Priority > warehouses[j].Priority
	})

	return warehouses[0], nil
}

func (s *warehouseRoutingService) GetNearbyWarehouses(ctx context.Context, lat, lon float64, radiusKm float64) ([]*models.Warehouse, error) {
	warehouses, err := s.warehouseRepo.GetAllActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get warehouses: %v", err)
	}

	type warehouseWithDistance struct {
		warehouse *models.Warehouse
		distance  float64
	}

	nearby := make([]warehouseWithDistance, 0)
	for _, wh := range warehouses {
		distance := models.CalculateDistance(lat, lon, wh.Latitude, wh.Longitude)
		if distance <= radiusKm {
			nearby = append(nearby, warehouseWithDistance{
				warehouse: wh,
				distance:  distance,
			})
		}
	}

	sort.Slice(nearby, func(i, j int) bool {
		if nearby[i].warehouse.Priority != nearby[j].warehouse.Priority {
			return nearby[i].warehouse.Priority > nearby[j].warehouse.Priority
		}
		return nearby[i].distance < nearby[j].distance
	})

	result := make([]*models.Warehouse, 0, len(nearby))
	for _, n := range nearby {
		result = append(result, n.warehouse)
	}

	return result, nil
}

func (s *warehouseRoutingService) parseAddress(address string) (city, province string) {
	address = strings.ToLower(address)

	cityKeywords := []string{"市", "city"}
	provinceKeywords := []string{"省", "province", "自治区", "特别行政区"}

	for _, keyword := range provinceKeywords {
		if idx := strings.Index(address, keyword); idx > 0 {
			province = strings.TrimSpace(address[:idx+len(keyword)])
			break
		}
	}

	for _, keyword := range cityKeywords {
		if idx := strings.Index(address, keyword); idx > 0 {
			city = strings.TrimSpace(address[:idx+len(keyword)])
			break
		}
	}

	return city, province
}

func (s *warehouseRoutingService) parseAddressToCoordinates(address string) (lat, lon float64) {
	addressLower := strings.ToLower(address)

	coordinateMap := map[string][2]float64{
		"北京":    {39.9042, 116.4074},
		"beijing": {39.9042, 116.4074},
		"上海":    {31.2304, 121.4737},
		"shanghai": {31.2304, 121.4737},
		"广州":    {23.1291, 113.2644},
		"guangzhou": {23.1291, 113.2644},
		"深圳":    {22.5431, 114.0579},
		"shenzhen": {22.5431, 114.0579},
		"成都":    {30.5728, 104.0668},
		"chengdu": {30.5728, 104.0668},
		"杭州":    {30.2741, 120.1551},
		"hangzhou": {30.2741, 120.1551},
		"武汉":    {30.5928, 114.3055},
		"wuhan":   {30.5928, 114.3055},
		"西安":    {34.3416, 108.9398},
		"xian":    {34.3416, 108.9398},
		"南京":    {32.0603, 118.7969},
		"nanjing": {32.0603, 118.7969},
		"重庆":    {29.4316, 106.9123},
		"chongqing": {29.4316, 106.9123},
		"天津":    {39.1422, 117.1767},
		"tianjin": {39.1422, 117.1767},
	}

	for key, coords := range coordinateMap {
		if strings.Contains(addressLower, key) {
			return coords[0], coords[1]
		}
	}

	return 0, 0
}
