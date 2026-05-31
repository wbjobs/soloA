package game

import "math/rand"

func CalculateDamage(attack, defense int) int {
	baseDamage := attack - defense/2
	if baseDamage < 1 {
		baseDamage = 1
	}

	variance := float64(baseDamage) * 0.2
	minDamage := int(float64(baseDamage) - variance)
	maxDamage := int(float64(baseDamage) + variance)

	if minDamage < 1 {
		minDamage = 1
	}
	if maxDamage < minDamage {
		maxDamage = minDamage
	}

	return rand.Intn(maxDamage-minDamage+1) + minDamage
}
