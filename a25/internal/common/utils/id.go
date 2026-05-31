package utils

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"
)

func GenerateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func GenerateMessageID() string {
	return fmt.Sprintf("msg_%d_%s", time.Now().UnixNano(), GenerateShortID(8))
}

func GenerateTaskID() string {
	return fmt.Sprintf("task_%d_%s", time.Now().UnixNano(), GenerateShortID(8))
}

func GenerateShortID(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

func GenerateAPIKey() string {
	return fmt.Sprintf("pk_%s", GenerateShortID(32))
}

func GenerateAPISecret() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func ToJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func FromJSON(data string, v interface{}) error {
	return json.Unmarshal([]byte(data), v)
}

func StringToInt64(s string) int64 {
	i, _ := strconv.ParseInt(s, 10, 64)
	return i
}

func Int64ToString(i int64) string {
	return strconv.FormatInt(i, 10)
}

func SliceContains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func StringSliceToMap(slice []string) map[string]bool {
	m := make(map[string]bool)
	for _, s := range slice {
		m[s] = true
	}
	return m
}

func MapToSlice(m map[string]bool) []string {
	slice := make([]string, 0, len(m))
	for k := range m {
		slice = append(slice, k)
	}
	return slice
}

func TrimStrings(slice []string) []string {
	result := make([]string, 0, len(slice))
	for _, s := range slice {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func GetOrDefault(val, defaultValue string) string {
	if val == "" {
		return defaultValue
	}
	return val
}
