package model

import (
	"encoding/json"
	"fmt"
	"time"
)

type DeviceData struct {
	DeviceKey  string                 `json:"device_key"`
	Timestamp  time.Time              `json:"timestamp"`
	Metrics    map[string]interface{} `json:"metrics"`
	Tags       map[string]string      `json:"tags,omitempty"`
	RawData    string                 `json:"raw_data,omitempty"`
}

func (d *DeviceData) ToInfluxDBPoint() (map[string]string, map[string]interface{}, time.Time, error) {
	if d.DeviceKey == "" {
		return nil, nil, time.Time{}, fmt.Errorf("device_key is required")
	}

	tags := make(map[string]string)
	tags["device_key"] = d.DeviceKey

	for k, v := range d.Tags {
		if k != "device_key" {
			tags[k] = v
		}
	}

	fields := make(map[string]interface{})
	for k, v := range d.Metrics {
		fields[k] = v
	}

	if len(fields) == 0 {
		return nil, nil, time.Time{}, fmt.Errorf("no metrics found")
	}

	ts := d.Timestamp
	if ts.IsZero() {
		ts = time.Now()
	}

	return tags, fields, ts, nil
}

func (d *DeviceData) Marshal() ([]byte, error) {
	return json.Marshal(d)
}

func (d *DeviceData) Unmarshal(data []byte) error {
	return json.Unmarshal(data, d)
}

type DataQuery struct {
	DeviceKey   string
	Metric      string
	StartTime   time.Time
	EndTime     time.Time
	Aggregation string
	Interval    string
	Limit       int
}

type DataPoint struct {
	Timestamp time.Time              `json:"timestamp"`
	DeviceKey string                 `json:"device_key"`
	Metrics   map[string]interface{} `json:"metrics"`
}

type ControlCommand struct {
	DeviceKey    string                 `json:"device_key"`
	CommandID    string                 `json:"command_id"`
	CommandType  string                 `json:"command_type"`
	CommandData  map[string]interface{} `json:"command_data"`
	Timestamp    time.Time              `json:"timestamp"`
}

func (c *ControlCommand) Marshal() ([]byte, error) {
	return json.Marshal(c)
}

func (c *ControlCommand) Unmarshal(data []byte) error {
	return json.Unmarshal(data, c)
}

type CommandResponse struct {
	DeviceKey   string                 `json:"device_key"`
	CommandID   string                 `json:"command_id"`
	Status      string                 `json:"status"`
	ResponseData map[string]interface{} `json:"response_data,omitempty"`
	ErrorMsg    string                 `json:"error_msg,omitempty"`
	Timestamp   time.Time              `json:"timestamp"`
}

func (r *CommandResponse) Marshal() ([]byte, error) {
	return json.Marshal(r)
}

func (r *CommandResponse) Unmarshal(data []byte) error {
	return json.Unmarshal(data, r)
}
