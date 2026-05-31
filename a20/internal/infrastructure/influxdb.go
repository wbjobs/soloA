package infrastructure

import (
	"context"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"

	"iot-platform/internal/config"
	"iot-platform/pkg/logger"
)

var (
	InfluxClient  influxdb2.Client
	WriteAPI      api.WriteAPI
	QueryAPI      api.QueryAPI
)

func InitInfluxDB(cfg *config.InfluxDBConfig) error {
	InfluxClient = influxdb2.NewClientWithOptions(
		cfg.URL,
		cfg.Token,
		influxdb2.DefaultOptions().SetTimeout(uint(cfg.Timeout*1000)),
	)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.Timeout)*time.Second)
	defer cancel()

	health, err := InfluxClient.Health(ctx)
	if err != nil {
		return err
	}

	if health.Status != "pass" {
		return err
	}

	WriteAPI = InfluxClient.WriteAPI(cfg.Org, cfg.Bucket)
	QueryAPI = InfluxClient.QueryAPI(cfg.Org)

	errorsCh := WriteAPI.Errors()
	go func() {
		for err := range errorsCh {
			logger.Error("InfluxDB write error", logger.ErrorField(err))
		}
	}()

	logger.Info("InfluxDB connected successfully")
	return nil
}

func GetInfluxClient() influxdb2.Client {
	return InfluxClient
}

func GetWriteAPI() api.WriteAPI {
	return WriteAPI
}

func GetQueryAPI() api.QueryAPI {
	return QueryAPI
}

func CloseInfluxDB() {
	if WriteAPI != nil {
		WriteAPI.Flush()
	}
	if InfluxClient != nil {
		InfluxClient.Close()
	}
}
