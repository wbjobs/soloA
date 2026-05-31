package executor

import (
	"context"
	"fmt"
)

func init() {
	RegisterGoFunction("example_hello", ExampleHelloFunction)
	RegisterGoFunction("example_ping", ExamplePingFunction)
	RegisterGoFunction("example_echo", ExampleEchoFunction)
}

func ExampleHelloFunction(ctx context.Context, params map[string]string) (interface{}, error) {
	name := params["name"]
	if name == "" {
		name = "World"
	}
	return map[string]interface{}{
		"message": fmt.Sprintf("Hello, %s!", name),
		"timestamp": params["timestamp"],
	}, nil
}

func ExamplePingFunction(ctx context.Context, params map[string]string) (interface{}, error) {
	return map[string]interface{}{
		"message": "pong",
		"status":  "ok",
	}, nil
}

func ExampleEchoFunction(ctx context.Context, params map[string]string) (interface{}, error) {
	return map[string]interface{}{
		"echoed": params,
		"count":  len(params),
	}, nil
}
