package grpcserver

import (
	"context"
	"fmt"
	"net"
	"time"

	"google.golang.org/grpc"

	"task-scheduler/internal/config"
	"task-scheduler/internal/logger"
	pb "task-scheduler/proto/pb"
)

type NodeServer struct {
	pb.UnimplementedNodeServiceServer
	cfg *config.Config
}

func NewNodeServer(cfg *config.Config) *NodeServer {
	return &NodeServer{cfg: cfg}
}

func (s *NodeServer) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	logger.Sugar.Infof("Received heartbeat from node: %s", req.NodeId)
	return &pb.HeartbeatResponse{Success: true, Message: "OK"}, nil
}

func (s *NodeServer) ExecuteTask(ctx context.Context, req *pb.ExecuteTaskRequest) (*pb.ExecuteTaskResponse, error) {
	logger.Sugar.Infof("Received task execution request: task_id=%d, task_name=%s", req.TaskId, req.TaskName)
	
	result := make(chan *pb.ExecuteTaskResponse, 1)
	go func() {
		result <- s.processTask(req)
	}()
	
	select {
	case <-ctx.Done():
		return &pb.ExecuteTaskResponse{Success: false, Message: "context cancelled"}, nil
	case res := <-result:
		return res, nil
	}
}

func (s *NodeServer) processTask(req *pb.ExecuteTaskRequest) *pb.ExecuteTaskResponse {
	return &pb.ExecuteTaskResponse{
		Success: true,
		LogId:   0,
		Message: "Task queued for execution",
	}
}

func (s *NodeServer) GetStatus(ctx context.Context, req *pb.GetStatusRequest) (*pb.GetStatusResponse, error) {
	return &pb.GetStatusResponse{
		NodeId:         s.cfg.Node.ID,
		Status:         "active",
		RunningTasks:   0,
		LastHeartbeat:  time.Now().Unix(),
	}, nil
}

func (s *NodeServer) TriggerTask(ctx context.Context, req *pb.TriggerTaskRequest) (*pb.TriggerTaskResponse, error) {
	logger.Sugar.Infof("Received manual trigger for task: %d", req.TaskId)
	return &pb.TriggerTaskResponse{Success: true, Message: "Task triggered"}, nil
}

func StartGRPCServer(cfg *config.Config) error {
	addr := fmt.Sprintf(":%d", cfg.GRPC.Port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterNodeServiceServer(grpcServer, NewNodeServer(cfg))

	logger.Sugar.Infof("gRPC server starting on %s", addr)
	go func() {
		if err := grpcServer.Serve(lis); err != nil {
			logger.Sugar.Fatalf("gRPC server failed: %v", err)
		}
	}()

	return nil
}
