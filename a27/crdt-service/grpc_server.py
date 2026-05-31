import grpc
from grpc import aio

from config import settings
from crdt.document_manager import document_manager
from crdt.rga import RGAOperation

try:
    from protos import crdt_pb2
    from protos import crdt_pb2_grpc
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False

if PROTO_AVAILABLE:
    class CRDTGrpcService(crdt_pb2_grpc.CRDTServiceServicer):
        async def ApplyUpdate(self, request, context):
            ops_data = []
            for op in request.operations:
                ops_data.append({
                    "type": op.type,
                    "position": op.position,
                    "char": op.content,
                    "author_id": op.author_id or request.author_id,
                    "timestamp": op.timestamp
                })
            
            result = await document_manager.apply_operations(
                request.document_id,
                ops_data,
                request.author_id
            )
            
            applied_ops = []
            for op in result["applied_operations"]:
                applied_ops.append(crdt_pb2.Operation(
                    type=op["type"],
                    position=op["position"],
                    content=op.get("char"),
                    author_id=op.get("author_id", ""),
                    timestamp=op.get("timestamp", 0)
                ))
            
            return crdt_pb2.ApplyUpdateResponse(
                success=result["success"],
                new_version=result["new_version"],
                message="Operations applied",
                applied_operations=applied_ops
            )
        
        async def GetDocumentState(self, request, context):
            state = await document_manager.get_document_state(
                request.document_id,
                request.version if request.version else None
            )
            
            return crdt_pb2.GetDocumentStateResponse(
                document_id=state["document_id"],
                current_version=state["current_version"],
                content=state["content"],
                timestamp=state["timestamp"]
            )
        
        async def SyncDocument(self, request, context):
            result = await document_manager.sync_document(
                request.document_id,
                request.client_version
            )
            
            batches = []
            for batch_data in result["missing_batches"]:
                ops = [
                    crdt_pb2.Operation(
                        type=op["type"],
                        position=op["position"],
                        content=op.get("char"),
                        author_id=op.get("author_id", ""),
                        timestamp=op.get("timestamp", 0)
                    )
                    for op in batch_data.get("operations", [])
                ]
                batches.append(crdt_pb2.OperationBatch(
                    document_id=batch_data["document_id"],
                    base_version=batch_data["base_version"],
                    operations=ops
                ))
            
            return crdt_pb2.SyncDocumentResponse(
                server_version=result["server_version"],
                missing_batches=batches,
                current_content=result["current_content"]
            )

async def serve_grpc():
    if not PROTO_AVAILABLE:
        print("gRPC proto files not generated, skipping gRPC server")
        return
    
    server = aio.server()
    crdt_pb2_grpc.add_CRDTServiceServicer_to_server(CRDTGrpcService(), server)
    server.add_insecure_port(f"[::]:{settings.grpc_port}")
    print(f"CRDT gRPC server starting on port {settings.grpc_port}")
    await server.start()
    await server.wait_for_termination()
