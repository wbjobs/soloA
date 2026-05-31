package game

import (
	"math/rand"
	"time"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

func generateRandomItem(itemType ItemType, rarity ItemRarity, level int) Item {
	itemNames := map[ItemType][]string{
		ItemTypeWeapon: {"Sword", "Axe", "Mace", "Dagger", "Spear"},
		ItemTypeArmor:  {"Leather Armor", "Chainmail", "Plate Armor", "Robe"},
		ItemTypeHelmet: {"Iron Helmet", "Steel Helmet", "Crown", "Hood"},
		ItemTypeBoots:  {"Leather Boots", "Iron Boots", "Winged Boots", "Sandals"},
	}

	names := itemNames[itemType]
	name := names[rand.Intn(len(names))] + " of " + getRaritySuffix(rarity)

	stats := ItemStats{}
	multiplier := getRarityMultiplier(rarity)

	switch itemType {
	case ItemTypeWeapon:
		stats.AttackBonus = int((5 + float64(level)*3) * multiplier)
	case ItemTypeArmor:
		stats.DefenseBonus = int((4 + float64(level)*2) * multiplier)
		stats.HealthBonus = int((10 + float64(level)*5) * multiplier)
	case ItemTypeHelmet:
		stats.DefenseBonus = int((2 + float64(level)*1) * multiplier)
		stats.HealthBonus = int((5 + float64(level)*3) * multiplier)
	case ItemTypeBoots:
		stats.SpeedBonus = int((2 + float64(level)*1) * multiplier)
		stats.DefenseBonus = int((1 + float64(level)*0.5) * multiplier)
	}

	return Item{
		ID:     "item_" + generateUUID(),
		Name:   name,
		Type:   itemType,
		Rarity: rarity,
		Stats:  stats,
	}
}

func getRaritySuffix(rarity ItemRarity) string {
	switch rarity {
	case RarityCommon:
		suffixes := []string{"Strength", "Vitality", "Protection"}
		return suffixes[rand.Intn(len(suffixes))]
	case RarityUncommon:
		suffixes := []string{"Power", "Endurance", "Fortune"}
		return suffixes[rand.Intn(len(suffixes))]
	case RarityRare:
		suffixes := []string{"Might", "Titan", "Hero"}
		return suffixes[rand.Intn(len(suffixes))]
	case RarityEpic:
		suffixes := []string{"Legend", "Destiny", "Eternity"}
		return suffixes[rand.Intn(len(suffixes))]
	case RarityLegendary:
		suffixes := []string{"Godslayer", "Immortal", "Ascension"}
		return suffixes[rand.Intn(len(suffixes))]
	default:
		return "the Unknown"
	}
}

func getRarityMultiplier(rarity ItemRarity) float64 {
	switch rarity {
	case RarityCommon:
		return 1.0
	case RarityUncommon:
		return 1.5
	case RarityRare:
		return 2.0
	case RarityEpic:
		return 3.0
	case RarityLegendary:
		return 5.0
	default:
		return 1.0
	}
}
