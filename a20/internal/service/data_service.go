package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"

	"iot-platform/internal/config"
	"iot-platform/internal/infrastructure"
	"iot-platform/internal/model"
	"iot-platform/pkg/logger"
)

type DataService struct {
	writeAPI api.WriteAPI
	queryAPI api.QueryAPI
}

func NewDataService() *DataService {
	return &DataService{
		writeAPI: infrastructure.GetWriteAPI(),
		queryAPI: infrastructure.GetQueryAPI(),
	}
}

func (s *DataService) WriteData(data *model.DeviceData) error {
	tags, fields, ts, err := data.ToInfluxDBPoint()
	if err != nil {
		return err
	}

	point := influxdb2.NewPoint("device_data", tags, fields, ts)
	s.writeAPI.WritePoint(point)

	logger.Debug("Data queued for write to InfluxDB", 
		logger.String("device_key", data.DeviceKey),
		logger.Int("metrics_count", len(data.Metrics)))

	return nil
}

func (s *DataService) WriteDataSync(data *model.DeviceData) error {
	tags, fields, ts, err := data.ToInfluxDBPoint()
	if err != nil {
		return err
	}

	point := influxdb2.NewPoint("device_data", tags, fields, ts)
	s.writeAPI.WritePoint(point)
	s.writeAPI.Flush()

	return nil
}

func (s *DataService) QueryData(query *model.DataQuery) ([]*model.DataPoint, error) {
	fluxQuery := s.buildQuery(query)

	logger.Debug("Executing InfluxDB query", logger.String("query", fluxQuery))

	result, err := s.queryAPI.Query(context.Background(), fluxQuery)
	if err != nil {
		return nil, err
	}

	pointsMap := make(map[time.Time]*model.DataPoint)

	for result.Next() {
		record := result.Record()
		ts := record.Time()

		point, exists := pointsMap[ts]
		if !exists {
			point = &model.DataPoint{
				Timestamp: ts,
				DeviceKey: query.DeviceKey,
				Metrics:   make(map[string]interface{}),
			}
			if dk, ok := record.ValueByKey("device_key").(string); ok {
				point.DeviceKey = dk
			}
			pointsMap[ts] = point
		}

		field := record.Field()
		value := record.Value()
		point.Metrics[field] = value
	}

	if result.Err() != nil {
		return nil, result.Err()
	}

	points := make([]*model.DataPoint, 0, len(pointsMap))
	for _, p := range pointsMap {
		points = append(points, p)
	}

	return points, nil
}

func (s *DataService) buildQuery(query *model.DataQuery) string {
	cfg := config.AppConfig.InfluxDB

	var fluxQuery strings.Builder

	fluxQuery.WriteString(fmt.Sprintf(`from(bucket: "%s")`, cfg.Bucket))

	if !query.StartTime.IsZero() {
		fluxQuery.WriteString(fmt.Sprintf(` |> range(start: %s)`, formatTime(query.StartTime)))
	} else {
		fluxQuery.WriteString(` |> range(start: -1h)`)
	}

	if !query.EndTime.IsZero() {
		fluxQuery.WriteString(fmt.Sprintf(`, stop: %s`, formatTime(query.EndTime)))
	}

	fluxQuery.WriteString(` |> filter(fn: (r) => r._measurement == "device_data")`)

	if query.DeviceKey != "" {
		fluxQuery.WriteString(fmt.Sprintf(` |> filter(fn: (r) => r.device_key == "%s")`, query.DeviceKey))
	}

	if query.Metric != "" {
		fluxQuery.WriteString(fmt.Sprintf(` |> filter(fn: (r) => r._field == "%s")`, query.Metric))
	}

	if query.Aggregation != "" && query.Interval != "" {
		fluxQuery.WriteString(fmt.Sprintf(` |> aggregateWindow(every: %s, fn: %s, createEmpty: false)`, 
			query.Interval, query.Aggregation))
	}

	if query.Limit > 0 {
		fluxQuery.WriteString(fmt.Sprintf(` |> limit(n: %d)`, query.Limit))
	}

	fluxQuery.WriteString(` |> yield(name: "result")`)

	return fluxQuery.String()
}

func formatTime(t time.Time) string {
	return t.Format(time.RFC3339)
}

func (s *DataService) GetLatestData(deviceKey string) (*model.DataPoint, error) {
	query := &model.DataQuery{
		DeviceKey: deviceKey,
		Limit:     1,
	}

	points, err := s.QueryData(query)
	if err != nil {
		return nil, err
	}

	if len(points) == 0 {
		return nil, fmt.Errorf("no data found for device: %s", deviceKey)
	}

	return points[0], nil
}

func (s *DataService) GetAggregatedData(deviceKey, metric, aggregation, interval string, startTime, endTime time.Time) ([]*model.DataPoint, error) {
	query := &model.DataQuery{
		DeviceKey:   deviceKey,
		Metric:      metric,
		Aggregation: aggregation,
		Interval:    interval,
		StartTime:   startTime,
		EndTime:     endTime,
	}

	return s.QueryData(query)
}

func (s *DataService) QueryRaw(query string) (*api.QueryTableResult, error) {
	return s.queryAPI.Query(context.Background(), query)
}

func (s *DataService) Flush() {
	if s.writeAPI != nil {
		s.writeAPI.Flush()
	}
}
