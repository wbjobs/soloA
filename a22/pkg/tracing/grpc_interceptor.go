package tracing

import (
	"context"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type metadataCarrier metadata.MD

func (m metadataCarrier) Get(key string) string {
	vals := metadata.MD(m).Get(key)
	if len(vals) == 0 {
		return ""
	}
	return vals[0]
}

func (m metadataCarrier) Set(key string, value string) {
	metadata.MD(m).Set(key, value)
}

func (m metadataCarrier) Keys() []string {
	keys := make([]string, 0, len(metadata.MD(m)))
	for k := range metadata.MD(m) {
		keys = append(keys, k)
	}
	return keys
}

func UnaryServerInterceptor(tracer trace.Tracer) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp interface{}, err error) {
		if tracer == nil {
			return handler(ctx, req)
		}

		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			md = metadata.MD{}
		}

		propagator := otel.GetTextMapPropagator()
		ctx = propagator.Extract(ctx, metadataCarrier(md))

		ctx, span := tracer.Start(ctx, info.FullMethod,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				semconv.RPCSystemKey.String("grpc"),
				semconv.RPCServiceKey.String(info.FullMethod),
				semconv.RPCMethodKey.String(info.FullMethod),
			),
		)
		defer span.End()

		startTime := time.Now()

		resp, err = handler(ctx, req)

		duration := time.Since(startTime)
		span.SetAttributes(attribute.Float64("rpc.duration_ms", float64(duration.Milliseconds())))

		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			if st, ok := status.FromError(err); ok {
				span.SetAttributes(
					semconv.RPCGRPCStatusCodeKey.Int64(int64(st.Code())),
					attribute.String("rpc.grpc.status_message", st.Message()),
				)
			}
		} else {
			span.SetStatus(codes.Ok, "")
			span.SetAttributes(semconv.RPCGRPCStatusCodeKey.Int64(0))
		}

		return resp, err
	}
}

func StreamServerInterceptor(tracer trace.Tracer) grpc.StreamServerInterceptor {
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		if tracer == nil {
			return handler(srv, ss)
		}

		ctx := ss.Context()
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			md = metadata.MD{}
		}

		propagator := otel.GetTextMapPropagator()
		ctx = propagator.Extract(ctx, metadataCarrier(md))

		ctx, span := tracer.Start(ctx, info.FullMethod,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				semconv.RPCSystemKey.String("grpc"),
				semconv.RPCServiceKey.String(info.FullMethod),
			),
		)
		defer span.End()

		wrappedStream := &tracerServerStream{
			ServerStream: ss,
			ctx:          ctx,
		}

		err := handler(srv, wrappedStream)

		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
		} else {
			span.SetStatus(codes.Ok, "")
		}

		return err
	}
}

type tracerServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (w *tracerServerStream) Context() context.Context {
	return w.ctx
}

func UnaryClientInterceptor(tracer trace.Tracer) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		if tracer == nil {
			return invoker(ctx, method, req, reply, cc, opts...)
		}

		ctx, span := tracer.Start(ctx, method,
			trace.WithSpanKind(trace.SpanKindClient),
			trace.WithAttributes(
				semconv.RPCSystemKey.String("grpc"),
				semconv.RPCServiceKey.String(method),
				semconv.RPCMethodKey.String(method),
				semconv.PeerServiceKey.String(cc.Target()),
			),
		)
		defer span.End()

		md, ok := metadata.FromOutgoingContext(ctx)
		if !ok {
			md = metadata.MD{}
		}

		propagator := otel.GetTextMapPropagator()
		propagator.Inject(ctx, metadataCarrier(md))
		ctx = metadata.NewOutgoingContext(ctx, md)

		startTime := time.Now()
		err := invoker(ctx, method, req, reply, cc, opts...)
		duration := time.Since(startTime)

		span.SetAttributes(attribute.Float64("rpc.duration_ms", float64(duration.Milliseconds())))

		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			if st, ok := status.FromError(err); ok {
				span.SetAttributes(semconv.RPCGRPCStatusCodeKey.Int64(int64(st.Code())))
			}
		} else {
			span.SetStatus(codes.Ok, "")
			span.SetAttributes(semconv.RPCGRPCStatusCodeKey.Int64(0))
		}

		return err
	}
}

func StreamClientInterceptor(tracer trace.Tracer) grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		if tracer == nil {
			return streamer(ctx, desc, cc, method, opts...)
		}

		ctx, span := tracer.Start(ctx, method,
			trace.WithSpanKind(trace.SpanKindClient),
			trace.WithAttributes(
				semconv.RPCSystemKey.String("grpc"),
				semconv.RPCServiceKey.String(method),
				semconv.PeerServiceKey.String(cc.Target()),
			),
		)

		md, ok := metadata.FromOutgoingContext(ctx)
		if !ok {
			md = metadata.MD{}
		}

		propagator := otel.GetTextMapPropagator()
		propagator.Inject(ctx, metadataCarrier(md))
		ctx = metadata.NewOutgoingContext(ctx, md)

		clientStream, err := streamer(ctx, desc, cc, method, opts...)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			span.End()
			return nil, err
		}

		span.SetStatus(codes.Ok, "")
		span.End()

		return clientStream, nil
	}
}
