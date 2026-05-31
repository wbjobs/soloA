package service

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type ProtocolParser interface {
	Parse(rawData string) (*model.DeviceData, error)
}

type JSONParser struct{}

func NewJSONParser() *JSONParser {
	return &JSONParser{}
}

func (p *JSONParser) Parse(rawData string) (*model.DeviceData, error) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(rawData), &data); err != nil {
		return nil, err
	}

	deviceKey, ok := data["device_key"].(string)
	if !ok {
		return nil, errors.New("device_key is required in JSON data")
	}

	metrics := make(map[string]interface{})
	if metricsData, ok := data["metrics"].(map[string]interface{}); ok {
		for k, v := range metricsData {
			metrics[k] = v
		}
	} else {
		for k, v := range data {
			if k != "device_key" && k != "timestamp" && k != "tags" {
				metrics[k] = v
			}
		}
	}

	tags := make(map[string]string)
	if tagsData, ok := data["tags"].(map[string]interface{}); ok {
		for k, v := range tagsData {
			if strVal, ok := v.(string); ok {
				tags[k] = strVal
			}
		}
	}

	var timestamp time.Time
	if ts, ok := data["timestamp"].(string); ok {
		parsed, err := time.Parse(time.RFC3339, ts)
		if err == nil {
			timestamp = parsed
		} else {
			timestamp = time.Now()
		}
	} else {
		timestamp = time.Now()
	}

	return &model.DeviceData{
		DeviceKey: deviceKey,
		Timestamp: timestamp,
		Metrics:   metrics,
		Tags:      tags,
		RawData:   rawData,
	}, nil
}

type BinaryParser struct{}

func NewBinaryParser() *BinaryParser {
	return &BinaryParser{}
}

func (p *BinaryParser) Parse(rawData string) (*model.DeviceData, error) {
	data, err := hex.DecodeString(strings.TrimSpace(rawData))
	if err != nil {
		return nil, fmt.Errorf("invalid hex string: %w", err)
	}

	if len(data) < 8 {
		return nil, errors.New("data too short")
	}

	deviceKeyBytes := data[0:8]
	deviceKey := hex.EncodeToString(deviceKeyBytes)

	metrics := make(map[string]interface{})
	offset := 8

	if len(data) >= offset+4 {
		temperature := float64(binary.BigEndian.Uint16(data[offset:offset+2])) / 100.0
		metrics["temperature"] = temperature
		offset += 2

		humidity := float64(binary.BigEndian.Uint16(data[offset:offset+2])) / 100.0
		metrics["humidity"] = humidity
		offset += 2
	}

	if len(data) >= offset+4 {
		pressure := float64(binary.BigEndian.Uint32(data[offset:offset+4])) / 1000.0
		metrics["pressure"] = pressure
		offset += 4
	}

	if len(data) >= offset+2 {
		battery := float64(binary.BigEndian.Uint16(data[offset:offset+2])) / 10.0
		metrics["battery"] = battery
	}

	return &model.DeviceData{
		DeviceKey: deviceKey,
		Timestamp: time.Now(),
		Metrics:   metrics,
		Tags:      map[string]string{"protocol": "binary"},
		RawData:   rawData,
	}, nil
}

type CSVParser struct{}

func NewCSVParser() *CSVParser {
	return &CSVParser{}
}

func (p *CSVParser) Parse(rawData string) (*model.DeviceData, error) {
	parts := strings.Split(strings.TrimSpace(rawData), ",")
	if len(parts) < 2 {
		return nil, errors.New("invalid CSV format")
	}

	deviceKey := strings.TrimSpace(parts[0])
	metrics := make(map[string]interface{})

	for i := 1; i < len(parts); i++ {
		kv := strings.SplitN(parts[i], "=", 2)
		if len(kv) == 2 {
			key := strings.TrimSpace(kv[0])
			valueStr := strings.TrimSpace(kv[1])

			var value interface{}
			var floatVal float64
			_, err := fmt.Sscanf(valueStr, "%f", &floatVal)
			if err == nil {
				value = floatVal
			} else {
				value = valueStr
			}
			metrics[key] = value
		}
	}

	if len(metrics) == 0 {
		return nil, errors.New("no metrics found in CSV data")
	}

	return &model.DeviceData{
		DeviceKey: deviceKey,
		Timestamp: time.Now(),
		Metrics:   metrics,
		Tags:      map[string]string{"protocol": "csv"},
		RawData:   rawData,
	}, nil
}

type ProtocolService struct {
	parsers map[string]ProtocolParser
}

func NewProtocolService() *ProtocolService {
	return &ProtocolService{
		parsers: map[string]ProtocolParser{
			"json":   NewJSONParser(),
			"binary": NewBinaryParser(),
			"csv":    NewCSVParser(),
		},
	}
}

func (s *ProtocolService) Parse(rawData string, protocol string) (*model.DeviceData, error) {
	parser, ok := s.parsers[protocol]
	if !ok {
		parser = s.parsers["json"]
	}

	data, err := parser.Parse(rawData)
	if err != nil {
		logger.Warn("Failed to parse data with protocol, trying JSON", 
			logger.String("protocol", protocol), 
			logger.ErrorField(err))

		if protocol != "json" {
			data, err = s.parsers["json"].Parse(rawData)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}

	return data, nil
}

func (s *ProtocolService) AutoParse(rawData string) (*model.DeviceData, error) {
	trimmed := strings.TrimSpace(rawData)

	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return s.parsers["json"].Parse(rawData)
	}

	if strings.Contains(trimmed, ",") && strings.Contains(trimmed, "=") {
		return s.parsers["csv"].Parse(rawData)
	}

	_, err := hex.DecodeString(trimmed)
	if err == nil {
		return s.parsers["binary"].Parse(rawData)
	}

	return s.parsers["json"].Parse(rawData)
}

func (s *ProtocolService) RegisterParser(protocol string, parser ProtocolParser) {
	s.parsers[protocol] = parser
}
