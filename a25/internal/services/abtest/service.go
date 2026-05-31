package abtest

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/message-push-center/internal/common/database"
	"github.com/message-push-center/internal/common/models"
	"github.com/message-push-center/internal/common/utils"
	"gorm.io/gorm"
)

type ABTestService struct {
	db *gorm.DB
}

func NewABTestService() *ABTestService {
	return &ABTestService{
		db: database.GetDB(),
	}
}

type CreateABTestRequest struct {
	TenantID      string
	TestName      string
	Description   string
	SegmentID     string
	UserIDs       []string
	ScheduledAt   *time.Time
	Variants      []VariantConfig
}

type VariantConfig struct {
	VariantName  string
	TemplateCode string
	ChannelType  string
	Weight       int
}

type ABTestWithVariants struct {
	Test     *models.ABTest
	Variants []*models.ABTestVariant
}

type ABTestResult struct {
	TestID         string
	TestName       string
	Status         string
	TotalUsers     int64
	TotalSent      int64
	TotalDelivered int64
	TotalOpened    int64
	TotalConverted int64
	Variants       []VariantResult
	WinningVariant string
}

type VariantResult struct {
	VariantID      string
	VariantName    string
	TemplateCode   string
	ChannelType    string
	Weight         int
	UserCount      int64
	SentCount      int64
	DeliveredCount int64
	OpenedCount    int64
	ClickedCount   int64
	ConvertedCount int64
	FailedCount    int64
	OpenRate       float64
	ClickRate      float64
	ConversionRate float64
}

var (
	ErrABTestNotFound    = errors.New("ab test not found")
	ErrInvalidVariants   = errors.New("invalid variants configuration")
	ErrWeightSumMismatch = errors.New("variants weight must sum to 100")
)

func (s *ABTestService) CreateABTest(ctx context.Context, req *CreateABTestRequest) (*ABTestWithVariants, error) {
	if len(req.Variants) < 2 {
		return nil, ErrInvalidVariants
	}

	var totalWeight int
	for _, v := range req.Variants {
		totalWeight += v.Weight
	}

	if totalWeight != 100 {
		return nil, ErrWeightSumMismatch
	}

	testID := fmt.Sprintf("abt_%s", utils.GenerateShortID(12))

	trafficSplitData, _ := json.Marshal(map[string]interface{}{
		"variants": req.Variants,
	})

	userIDsStr := ""
	if len(req.UserIDs) > 0 {
		data, _ := json.Marshal(req.UserIDs)
		userIDsStr = string(data)
	}

	now := time.Now()
	test := &models.ABTest{
		TenantID:     req.TenantID,
		TestID:       testID,
		TestName:     req.TestName,
		Description:  req.Description,
		SegmentID:    req.SegmentID,
		UserIDs:      userIDsStr,
		Status:       models.ABTestStatusDraft,
		TrafficSplit: string(trafficSplitData),
		ScheduledAt:  req.ScheduledAt,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.db.WithContext(ctx).Create(test).Error; err != nil {
		return nil, err
	}

	variants := make([]*models.ABTestVariant, 0, len(req.Variants))
	for _, v := range req.Variants {
		variant := &models.ABTestVariant{
			TenantID:     req.TenantID,
			TestID:       testID,
			VariantID:    fmt.Sprintf("var_%s", utils.GenerateShortID(8)),
			VariantName:  v.VariantName,
			TemplateCode: v.TemplateCode,
			ChannelType:  v.ChannelType,
			Weight:       v.Weight,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		variants = append(variants, variant)
	}

	if err := s.db.WithContext(ctx).Create(&variants).Error; err != nil {
		return nil, err
	}

	return &ABTestWithVariants{
		Test:     test,
		Variants: variants,
	}, nil
}

func (s *ABTestService) GetABTest(ctx context.Context, testID string) (*ABTestWithVariants, error) {
	var test models.ABTest
	if err := s.db.WithContext(ctx).
		Where("test_id = ?", testID).
		First(&test).Error; err != nil {
		return nil, ErrABTestNotFound
	}

	var variants []*models.ABTestVariant
	if err := s.db.WithContext(ctx).
		Where("test_id = ?", testID).
		Find(&variants).Error; err != nil {
		return nil, err
	}

	return &ABTestWithVariants{
		Test:     &test,
		Variants: variants,
	}, nil
}

func (s *ABTestService) ListABTests(ctx context.Context, tenantID string, status string, page, pageSize int) ([]*models.ABTest, int64, error) {
	var tests []*models.ABTest
	var total int64

	query := s.db.WithContext(ctx).Model(&models.ABTest{}).Where("tenant_id = ?", tenantID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Limit(pageSize).Offset(offset).Find(&tests).Error; err != nil {
		return nil, 0, err
	}

	return tests, total, nil
}

func (s *ABTestService) StartABTest(ctx context.Context, testID string) error {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return err
	}

	if test.Test.Status != models.ABTestStatusDraft && test.Test.Status != models.ABTestStatusPaused {
		return errors.New("cannot start test in current status")
	}

	now := time.Now()
	test.Test.Status = models.ABTestStatusRunning
	test.Test.StartedAt = &now
	test.Test.UpdatedAt = now

	return s.db.WithContext(ctx).Save(test.Test).Error
}

func (s *ABTestService) PauseABTest(ctx context.Context, testID string) error {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return err
	}

	if test.Test.Status != models.ABTestStatusRunning {
		return errors.New("cannot pause test that is not running")
	}

	test.Test.Status = models.ABTestStatusPaused
	test.Test.UpdatedAt = time.Now()

	return s.db.WithContext(ctx).Save(test.Test).Error
}

func (s *ABTestService) CompleteABTest(ctx context.Context, testID string, winningVariantID string) error {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return err
	}

	if test.Test.Status != models.ABTestStatusRunning && test.Test.Status != models.ABTestStatusPaused {
		return errors.New("cannot complete test in current status")
	}

	now := time.Now()
	test.Test.Status = models.ABTestStatusCompleted
	test.Test.CompletedAt = &now
	test.Test.WinningVariant = winningVariantID
	test.Test.UpdatedAt = now

	return s.db.WithContext(ctx).Save(test.Test).Error
}

func (s *ABTestService) AssignVariant(ctx context.Context, testID, userID string) (*models.ABTestVariant, error) {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return nil, err
	}

	if test.Test.Status != models.ABTestStatusRunning {
		return nil, errors.New("test is not running")
	}

	cacheKey := s.getVariantAssignmentKey(testID, userID)
	var assignedVariantID string

	if s.db != nil {
		var assignment models.ABTestVariant
		err := s.db.WithContext(ctx).
			Model(&models.UserMessageHistory{}).
			Select("variant_id").
			Where("test_id = ? AND user_id = ? AND variant_id IS NOT NULL", testID, userID).
			First(&assignment).Error

		if err == nil && assignment.VariantID != "" {
			for _, v := range test.Variants {
				if v.VariantID == assignment.VariantID {
					return v, nil
				}
			}
		}
	}

	variant := s.selectVariantByWeight(test.Variants)
	assignedVariantID = variant.VariantID

	s.db.WithContext(ctx).Exec(`
		INSERT INTO user_message_history (tenant_id, user_id, message_id, task_id, category, channel_type, sent_at, test_id, variant_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, test.Test.TenantID, userID, "", testID, models.MessageCategoryMarketing, variant.ChannelType, time.Now(), testID, variant.VariantID)

	return variant, nil
}

func (s *ABTestService) selectVariantByWeight(variants []*models.ABTestVariant) *models.ABTestVariant {
	if len(variants) == 0 {
		return nil
	}

	totalWeight := 0
	for _, v := range variants {
		totalWeight += v.Weight
	}

	if totalWeight <= 0 {
		return variants[0]
	}

	randVal, _ := rand.Int(rand.Reader, big.NewInt(int64(totalWeight)))
	current := int(randVal.Int64())

	for _, v := range variants {
		current -= v.Weight
		if current < 0 {
			return v
		}
	}

	return variants[len(variants)-1]
}

func (s *ABTestService) GetABTestResult(ctx context.Context, testID string) (*ABTestResult, error) {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return nil, err
	}

	variantResults := make([]VariantResult, 0, len(test.Variants))
	var totalUsers, totalSent, totalDelivered, totalOpened, totalConverted int64

	for _, v := range test.Variants {
		result := VariantResult{
			VariantID:      v.VariantID,
			VariantName:    v.VariantName,
			TemplateCode:   v.TemplateCode,
			ChannelType:    v.ChannelType,
			Weight:         v.Weight,
			UserCount:      v.UserCount,
			SentCount:      v.SentCount,
			DeliveredCount: v.DeliveredCount,
			OpenedCount:    v.OpenedCount,
			ClickedCount:   v.ClickedCount,
			ConvertedCount: v.ConvertedCount,
			FailedCount:    v.FailedCount,
		}

		if v.SentCount > 0 {
			result.OpenRate = float64(v.OpenedCount) / float64(v.SentCount) * 100
			result.ClickRate = float64(v.ClickedCount) / float64(v.SentCount) * 100
			result.ConversionRate = float64(v.ConvertedCount) / float64(v.SentCount) * 100
		}

		variantResults = append(variantResults, result)

		totalUsers += v.UserCount
		totalSent += v.SentCount
		totalDelivered += v.DeliveredCount
		totalOpened += v.OpenedCount
		totalConverted += v.ConvertedCount
	}

	return &ABTestResult{
		TestID:         testID,
		TestName:       test.Test.TestName,
		Status:         test.Test.Status,
		TotalUsers:     totalUsers,
		TotalSent:      totalSent,
		TotalDelivered: totalDelivered,
		TotalOpened:    totalOpened,
		TotalConverted: totalConverted,
		Variants:       variantResults,
		WinningVariant: test.Test.WinningVariant,
	}, nil
}

func (s *ABTestService) UpdateVariantStats(ctx context.Context, testID, variantID string, status string) error {
	updates := make(map[string]interface{})

	switch status {
	case models.StatusSent:
		updates["sent_count"] = gorm.Expr("sent_count + 1")
	case models.StatusDelivered:
		updates["delivered_count"] = gorm.Expr("delivered_count + 1")
	case models.StatusOpened:
		updates["opened_count"] = gorm.Expr("opened_count + 1")
	case models.StatusFailed:
		updates["failed_count"] = gorm.Expr("failed_count + 1")
	}

	if len(updates) == 0 {
		return nil
	}

	updates["updated_at"] = time.Now()

	return s.db.WithContext(ctx).
		Model(&models.ABTestVariant{}).
		Where("test_id = ? AND variant_id = ?", testID, variantID).
		Updates(updates).Error
}

func (s *ABTestService) RecordClick(ctx context.Context, testID, variantID, messageID, userID string) error {
	return s.db.WithContext(ctx).
		Model(&models.ABTestVariant{}).
		Where("test_id = ? AND variant_id = ?", testID, variantID).
		Updates(map[string]interface{}{
			"clicked_count": gorm.Expr("clicked_count + 1"),
			"updated_at":    time.Now(),
		}).Error
}

func (s *ABTestService) RecordConversion(ctx context.Context, testID, variantID, messageID, userID, eventType string) error {
	return s.db.WithContext(ctx).
		Model(&models.ABTestVariant{}).
		Where("test_id = ? AND variant_id = ?", testID, variantID).
		Updates(map[string]interface{}{
			"converted_count": gorm.Expr("converted_count + 1"),
			"updated_at":      time.Now(),
		}).Error
}

func (s *ABTestService) DetermineWinner(ctx context.Context, testID string) (string, error) {
	result, err := s.GetABTestResult(ctx, testID)
	if err != nil {
		return "", err
	}

	if len(result.Variants) == 0 {
		return "", errors.New("no variants found")
	}

	bestVariant := result.Variants[0]
	bestScore := bestVariant.ConversionRate

	for i := 1; i < len(result.Variants); i++ {
		if result.Variants[i].ConversionRate > bestScore {
			bestVariant = result.Variants[i]
			bestScore = result.Variants[i].ConversionRate
		}
	}

	return bestVariant.VariantID, nil
}

func (s *ABTestService) getVariantAssignmentKey(testID, userID string) string {
	return fmt.Sprintf("mpc:abtest:assign:%s:%s", testID, userID)
}

func (s *ABTestService) DeleteABTest(ctx context.Context, testID string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("test_id = ?", testID).Delete(&models.ABTestVariant{}).Error; err != nil {
			return err
		}
		if err := tx.Where("test_id = ?", testID).Delete(&models.ABTest{}).Error; err != nil {
			return err
		}
		return nil
	})
}

func (s *ABTestService) AddUsersToTest(ctx context.Context, testID string, userIDs []string) error {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return err
	}

	var existingUsers []string
	if test.Test.UserIDs != "" {
		json.Unmarshal([]byte(test.Test.UserIDs), &existingUsers)
	}

	existingMap := make(map[string]bool)
	for _, u := range existingUsers {
		existingMap[u] = true
	}

	for _, u := range userIDs {
		if !existingMap[u] {
			existingUsers = append(existingUsers, u)
		}
	}

	userIDsData, _ := json.Marshal(existingUsers)
	test.Test.UserIDs = string(userIDsData)
	test.Test.UpdatedAt = time.Now()

	return s.db.WithContext(ctx).Save(test.Test).Error
}

func (s *ABTestService) GetTestUsers(ctx context.Context, testID string) ([]string, error) {
	test, err := s.GetABTest(ctx, testID)
	if err != nil {
		return nil, err
	}

	if test.Test.UserIDs == "" {
		return []string{}, nil
	}

	var userIDs []string
	json.Unmarshal([]byte(test.Test.UserIDs), &userIDs)
	return userIDs, nil
}
