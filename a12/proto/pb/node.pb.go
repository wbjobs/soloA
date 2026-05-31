package pb

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/grpc"
)

type HeartbeatRequest struct {
	NodeId    string `protobuf:"bytes,1,opt,name=node_id,json=nodeId,proto3" json:"node_id,omitempty"`
	Host      string `protobuf:"bytes,2,opt,name=host,proto3" json:"host,omitempty"`
	GrpcPort  int32  `protobuf:"varint,3,opt,name=grpc_port,json=grpcPort,proto3" json:"grpc_port,omitempty"`
	Timestamp int64  `protobuf:"varint,4,opt,name=timestamp,proto3" json:"timestamp,omitempty"`
}

type HeartbeatResponse struct {
	Success bool   `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Message string `protobuf:"bytes,2,opt,name=message,proto3" json:"message,omitempty"`
}

type TaskConfig struct {
	Type         string            `protobuf:"bytes,1,opt,name=type,proto3" json:"type,omitempty"`
	Command      string            `protobuf:"bytes,2,opt,name=command,proto3" json:"command,omitempty"`
	Url          string            `protobuf:"bytes,3,opt,name=url,proto3" json:"url,omitempty"`
	Method       string            `protobuf:"bytes,4,opt,name=method,proto3" json:"method,omitempty"`
	Body         string            `protobuf:"bytes,5,opt,name=body,proto3" json:"body,omitempty"`
	Headers      map[string]string `protobuf:"bytes,6,rep,name=headers,proto3" json:"headers,omitempty" protobuf_key:"bytes,1,opt,name=key" protobuf_val:"bytes,2,opt,name=value"`
	FunctionName string            `protobuf:"bytes,7,opt,name=function_name,json=functionName,proto3" json:"function_name,omitempty"`
	Params       map[string]string `protobuf:"bytes,8,rep,name=params,proto3" json:"params,omitempty" protobuf_key:"bytes,1,opt,name=key" protobuf_val:"bytes,2,opt,name=value"`
	Args         []string          `protobuf:"bytes,9,rep,name=args,proto3" json:"args,omitempty"`
	Env          []string          `protobuf:"bytes,10,rep,name=env,proto3" json:"env,omitempty"`
	WorkDir      string            `protobuf:"bytes,11,opt,name=work_dir,json=workDir,proto3" json:"work_dir,omitempty"`
}

type ExecuteTaskRequest struct {
	TaskId        uint64      `protobuf:"varint,1,opt,name=task_id,json=taskId,proto3" json:"task_id,omitempty"`
	TaskName      string      `protobuf:"bytes,2,opt,name=task_name,json=taskName,proto3" json:"task_name,omitempty"`
	Config        *TaskConfig `protobuf:"bytes,3,opt,name=config,proto3" json:"config,omitempty"`
	Timeout       int32       `protobuf:"varint,4,opt,name=timeout,proto3" json:"timeout,omitempty"`
	RetryCount    int32       `protobuf:"varint,5,opt,name=retry_count,json=retryCount,proto3" json:"retry_count,omitempty"`
	RetryInterval int32       `protobuf:"varint,6,opt,name=retry_interval,json=retryInterval,proto3" json:"retry_interval,omitempty"`
	TriggerType   string      `protobuf:"bytes,7,opt,name=trigger_type,json=triggerType,proto3" json:"trigger_type,omitempty"`
}

type ExecuteTaskResponse struct {
	Success bool   `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	LogId   uint64 `protobuf:"varint,2,opt,name=log_id,json=logId,proto3" json:"log_id,omitempty"`
	Message string `protobuf:"bytes,3,opt,name=message,proto3" json:"message,omitempty"`
}

type GetStatusRequest struct {
	NodeId string `protobuf:"bytes,1,opt,name=node_id,json=nodeId,proto3" json:"node_id,omitempty"`
}

type GetStatusResponse struct {
	NodeId        string `protobuf:"bytes,1,opt,name=node_id,json=nodeId,proto3" json:"node_id,omitempty"`
	Status        string `protobuf:"bytes,2,opt,name=status,proto3" json:"status,omitempty"`
	RunningTasks  int32  `protobuf:"varint,3,opt,name=running_tasks,json=runningTasks,proto3" json:"running_tasks,omitempty"`
	LastHeartbeat int64  `protobuf:"varint,4,opt,name=last_heartbeat,json=lastHeartbeat,proto3" json:"last_heartbeat,omitempty"`
}

type TriggerTaskRequest struct {
	TaskId uint64 `protobuf:"varint,1,opt,name=task_id,json=taskId,proto3" json:"task_id,omitempty"`
}

type TriggerTaskResponse struct {
	Success bool   `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Message string `protobuf:"bytes,2,opt,name=message,proto3" json:"message,omitempty"`
}

func (m *TaskConfig) String() string {
	b, _ := json.Marshal(m)
	return string(b)
}

type NodeServiceClient interface {
	Heartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error)
	ExecuteTask(ctx context.Context, in *ExecuteTaskRequest, opts ...grpc.CallOption) (*ExecuteTaskResponse, error)
	GetStatus(ctx context.Context, in *GetStatusRequest, opts ...grpc.CallOption) (*GetStatusResponse, error)
	TriggerTask(ctx context.Context, in *TriggerTaskRequest, opts ...grpc.CallOption) (*TriggerTaskResponse, error)
}

type nodeServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewNodeServiceClient(cc grpc.ClientConnInterface) NodeServiceClient {
	return &nodeServiceClient{cc}
}

func (c *nodeServiceClient) Heartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error) {
	out := new(HeartbeatResponse)
	err := c.cc.Invoke(ctx, "/node.NodeService/Heartbeat", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *nodeServiceClient) ExecuteTask(ctx context.Context, in *ExecuteTaskRequest, opts ...grpc.CallOption) (*ExecuteTaskResponse, error) {
	out := new(ExecuteTaskResponse)
	err := c.cc.Invoke(ctx, "/node.NodeService/ExecuteTask", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *nodeServiceClient) GetStatus(ctx context.Context, in *GetStatusRequest, opts ...grpc.CallOption) (*GetStatusResponse, error) {
	out := new(GetStatusResponse)
	err := c.cc.Invoke(ctx, "/node.NodeService/GetStatus", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *nodeServiceClient) TriggerTask(ctx context.Context, in *TriggerTaskRequest, opts ...grpc.CallOption) (*TriggerTaskResponse, error) {
	out := new(TriggerTaskResponse)
	err := c.cc.Invoke(ctx, "/node.NodeService/TriggerTask", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

type NodeServiceServer interface {
	Heartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error)
	ExecuteTask(context.Context, *ExecuteTaskRequest) (*ExecuteTaskResponse, error)
	GetStatus(context.Context, *GetStatusRequest) (*GetStatusResponse, error)
	TriggerTask(context.Context, *TriggerTaskRequest) (*TriggerTaskResponse, error)
}

type UnimplementedNodeServiceServer struct{}

func (UnimplementedNodeServiceServer) Heartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error) {
	return nil, fmt.Errorf("method not implemented")
}

func (UnimplementedNodeServiceServer) ExecuteTask(context.Context, *ExecuteTaskRequest) (*ExecuteTaskResponse, error) {
	return nil, fmt.Errorf("method not implemented")
}

func (UnimplementedNodeServiceServer) GetStatus(context.Context, *GetStatusRequest) (*GetStatusResponse, error) {
	return nil, fmt.Errorf("method not implemented")
}

func (UnimplementedNodeServiceServer) TriggerTask(context.Context, *TriggerTaskRequest) (*TriggerTaskResponse, error) {
	return nil, fmt.Errorf("method not implemented")
}

func RegisterNodeServiceServer(s *grpc.Server, srv NodeServiceServer) {
	s.RegisterService(&_NodeService_serviceDesc, srv)
}

func _NodeService_Heartbeat_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(HeartbeatRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(NodeServiceServer).Heartbeat(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/node.NodeService/Heartbeat",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(NodeServiceServer).Heartbeat(ctx, req.(*HeartbeatRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _NodeService_ExecuteTask_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ExecuteTaskRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(NodeServiceServer).ExecuteTask(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/node.NodeService/ExecuteTask",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(NodeServiceServer).ExecuteTask(ctx, req.(*ExecuteTaskRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _NodeService_GetStatus_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GetStatusRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(NodeServiceServer).GetStatus(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/node.NodeService/GetStatus",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(NodeServiceServer).GetStatus(ctx, req.(*GetStatusRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _NodeService_TriggerTask_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(TriggerTaskRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(NodeServiceServer).TriggerTask(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/node.NodeService/TriggerTask",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(NodeServiceServer).TriggerTask(ctx, req.(*TriggerTaskRequest))
	}
	return interceptor(ctx, in, info, handler)
}

var _NodeService_serviceDesc = grpc.ServiceDesc{
	ServiceName: "node.NodeService",
	HandlerType: (*NodeServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "Heartbeat",
			Handler:    _NodeService_Heartbeat_Handler,
		},
		{
			MethodName: "ExecuteTask",
			Handler:    _NodeService_ExecuteTask_Handler,
		},
		{
			MethodName: "GetStatus",
			Handler:    _NodeService_GetStatus_Handler,
		},
		{
			MethodName: "TriggerTask",
			Handler:    _NodeService_TriggerTask_Handler,
		},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "node.proto",
}
