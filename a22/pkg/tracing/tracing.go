package tracing

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"google.golang.org/grpc/credentials/insecure"

	"e-commerce-fulfillment/pkg/logger"
)

type TracingConfig struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	Endpoint       string
	Protocol       string
	Enabled        bool
}

type TracerManager struct {
	tracerProvider *trace.TracerProvider
	exporter       trace.SpanExporter
	config         TracingConfig
}

func DefaultConfig(serviceName string) TracingConfig {
	return TracingConfig{
		ServiceName:    serviceName,
		ServiceVersion: "1.0.0",
		Environment:    "development",
		Endpoint:       "localhost:4317",
		Protocol:       "grpc",
		Enabled:        true,
	}
}

func NewTracerManager(config TracingConfig) (*TracerManager, error) {
	if !config.Enabled {
		return &TracerManager{config: config}, nil
	}

	ctx := context.Background()

	var exporter *otlptrace.Exporter
	var err error

	if config.Protocol == "http" {
		exporter, err = otlptracehttp.New(ctx,
			otlptracehttp.WithEndpoint(config.Endpoint),
			otlptracehttp.WithInsecure(),
		)
	} else {
		exporter, err = otlptracegrpc.New(ctx,
			otlptracegrpc.WithEndpoint(config.Endpoint),
			otlptracegrpc.WithDialOption(
				grpc.WithTransportCredentials(insecure.NewCredentials()),
			),
		)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(config.ServiceName),
			semconv.ServiceVersionKey.String(config.ServiceVersion),
			attribute.String("environment", config.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	tracerProvider := trace.NewTracerProvider(
		trace.WithBatcher(exporter,
			trace.WithBatchTimeout(5*time.Second),
			trace.WithMaxExportBatchSize(512),
		),
		trace.WithResource(res),
		trace.WithSampler(trace.AlwaysSample()),
	)

	otel.SetTracerProvider(tracerProvider)
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	logger.GetLogger().Info(fmt.Sprintf("Tracing initialized for service: %s, endpoint: %s", config.ServiceName, config.Endpoint))

	return &TracerManager{
		tracerProvider: tracerProvider,
		exporter:       exporter,
		config:         config,
	}, nil
}

func (m *TracerManager) Shutdown(ctx context.Context) error {
	if m.tracerProvider == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := m.tracerProvider.Shutdown(ctx); err != nil {
		log.Printf("Warning: failed to shutdown tracer provider: %v", err)
	}
	return nil
}

func (m *TracerManager) IsEnabled() bool {
	return m.config.Enabled
}

func GetTracer(name string) otel.Tracer {
	return otel.Tracer(name)
}

func StartSpan(ctx context.Context, tracerName, spanName string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	tracer := GetTracer(tracerName)
	ctx, span := tracer.Start(ctx, spanName)
	if len(attrs) > 0 {
		span.SetAttributes(attrs...)
	}
	return ctx, span
}

func RecordError(ctx context.Context, span trace.Span, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetAttributes(attribute.String("error.message", err.Error()))
	}
}

func SetSpanAttributes(ctx context.Context, span trace.Span, attrs ...attribute.KeyValue) {
	if len(attrs) > 0 {
		span.SetAttributes(attrs...)
	}
}

func ExtractTraceID(ctx context.Context) string {
	spanCtx := otel.SpanContextFromContext(ctx)
	if spanCtx.IsValid() {
		return spanCtx.TraceID().String()
	}
	return ""
}

func ExtractSpanID(ctx context.Context) string {
	spanCtx := otel.SpanContextFromContext(ctx)
	if spanCtx.IsValid() {
		return spanCtx.SpanID().String()
	}
	return ""
}
