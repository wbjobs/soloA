package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestVectorClock_Increment(t *testing.T) {
	vc := NewVectorClock()
	vc.Increment("order-service")
	assert.Equal(t, int64(1), vc.Get("order-service"))

	vc.Increment("order-service")
	assert.Equal(t, int64(2), vc.Get("order-service"))
}

func TestVectorClock_Set(t *testing.T) {
	vc := NewVectorClock()
	vc.Set("payment-service", 5)
	assert.Equal(t, int64(5), vc.Get("payment-service"))
}

func TestVectorClock_Merge(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("order-service", 3)
	vc1.Set("payment-service", 2)

	vc2 := NewVectorClock()
	vc2.Set("order-service", 2)
	vc2.Set("payment-service", 4)
	vc2.Set("inventory-service", 1)

	vc1.Merge(vc2)

	assert.Equal(t, int64(3), vc1.Get("order-service"))
	assert.Equal(t, int64(4), vc1.Get("payment-service"))
	assert.Equal(t, int64(1), vc1.Get("inventory-service"))
}

func TestVectorClock_Compare_HappensBefore(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("A", 1)
	vc1.Set("B", 2)

	vc2 := NewVectorClock()
	vc2.Set("A", 2)
	vc2.Set("B", 3)

	assert.True(t, vc1.HappensBefore(vc2))
	assert.False(t, vc2.HappensBefore(vc1))
	assert.False(t, vc1.Concurrent(vc2))
}

func TestVectorClock_Compare_HappensAfter(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("A", 3)
	vc1.Set("B", 2)

	vc2 := NewVectorClock()
	vc2.Set("A", 2)
	vc2.Set("B", 2)

	assert.True(t, vc1.HappensAfter(vc2))
	assert.False(t, vc2.HappensAfter(vc1))
}

func TestVectorClock_Compare_Concurrent(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("A", 1)
	vc1.Set("B", 3)

	vc2 := NewVectorClock()
	vc2.Set("A", 2)
	vc2.Set("B", 2)

	assert.True(t, vc1.Concurrent(vc2))
	assert.True(t, vc2.Concurrent(vc1))
	assert.False(t, vc1.HappensBefore(vc2))
	assert.False(t, vc2.HappensBefore(vc1))
}

func TestVectorClock_Copy(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("A", 1)
	vc1.Set("B", 2)

	vc2 := vc1.Copy()
	vc2.Set("A", 5)

	assert.Equal(t, int64(1), vc1.Get("A"))
	assert.Equal(t, int64(5), vc2.Get("A"))
}

func TestVectorClock_Empty(t *testing.T) {
	vc1 := NewVectorClock()
	vc2 := NewVectorClock()

	assert.True(t, vc1.Concurrent(vc2))
	assert.False(t, vc1.HappensBefore(vc2))
	assert.False(t, vc1.HappensAfter(vc2))
}

func TestVectorClock_PartialOverlap(t *testing.T) {
	vc1 := NewVectorClock()
	vc1.Set("A", 1)

	vc2 := NewVectorClock()
	vc2.Set("A", 2)
	vc2.Set("B", 1)

	assert.True(t, vc1.HappensBefore(vc2))
	assert.False(t, vc1.Concurrent(vc2))
}
