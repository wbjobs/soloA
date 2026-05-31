import grpc
from grpc import aio

from config import settings
from database import AsyncSessionLocal
from services import VersionService

try:
    from protos import version_pb2
    from protos import version_pb2_grpc
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False

if PROTO_AVAILABLE:
    class VersionGrpcService(version_pb2_grpc.VersionServiceServicer):
        async def SaveSnapshot(self, request, context):
            async with AsyncSessionLocal() as db:
                service = VersionService(db)
                
                snapshot = await service.save_snapshot(
                    document_id=request.document_id,
                    version=request.version,
                    content=request.content,
                    operation_ids=list(request.operation_ids),
                    metadata=dict(request.metadata)
                )
                
                return version_pb2.SaveSnapshotResponse(
                    success=True,
                    snapshot_id=snapshot.id,
                    message="Snapshot saved"
                )
        
        async def GetSnapshot(self, request, context):
            async with AsyncSessionLocal() as db:
                service = VersionService(db)
                
                result = await service.get_snapshot(
                    request.document_id,
                    request.version
                )
                
                if not result:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    return version_pb2.GetSnapshotResponse()
                
                snapshot, content = result
                
                return version_pb2.GetSnapshotResponse(
                    snapshot_id=snapshot.id,
                    document_id=snapshot.document_id,
                    version=snapshot.version,
                    content=content,
                    created_at=int(snapshot.created_at.timestamp()),
                    metadata=snapshot.metadata_ or {}
                )
        
        async def ListVersions(self, request, context):
            async with AsyncSessionLocal() as db:
                service = VersionService(db)
                
                snapshots, total = await service.list_versions(
                    request.document_id,
                    request.page or 1,
                    request.page_size or 20
                )
                
                version_infos = []
                for snap in snapshots:
                    version_infos.append(version_pb2.VersionInfo(
                        snapshot_id=snap.id,
                        version=snap.version,
                        created_at=int(snap.created_at.timestamp()),
                        operation_count=snap.operation_count,
                        author_ids=snap.author_ids or ""
                    ))
                
                return version_pb2.ListVersionsResponse(
                    versions=version_infos,
                    total=total,
                    page=request.page or 1,
                    page_size=request.page_size or 20
                )
        
        async def RevertToVersion(self, request, context):
            async with AsyncSessionLocal() as db:
                service = VersionService(db)
                
                result = await service.revert_to_version(
                    request.document_id,
                    request.target_version,
                    request.user_id
                )
                
                if not result:
                    return version_pb2.RevertToVersionResponse(
                        success=False,
                        message="Version not found"
                    )
                
                new_version, _ = result
                
                return version_pb2.RevertToVersionResponse(
                    success=True,
                    new_version=new_version,
                    message=f"Reverted to version {request.target_version}"
                )
        
        async def DeleteVersions(self, request, context):
            async with AsyncSessionLocal() as db:
                service = VersionService(db)
                
                deleted_count = await service.delete_versions(
                    request.document_id,
                    list(request.versions)
                )
                
                return version_pb2.DeleteVersionsResponse(
                    success=True,
                    deleted_count=deleted_count
                )

async def serve_grpc():
    if not PROTO_AVAILABLE:
        print("gRPC proto files not generated, skipping gRPC server")
        return
    
    server = aio.server()
    version_pb2_grpc.add_VersionServiceServicer_to_server(VersionGrpcService(), server)
    server.add_insecure_port(f"[::]:{settings.grpc_port}")
    print(f"Version gRPC server starting on port {settings.grpc_port}")
    await server.start()
    await server.wait_for_termination()
