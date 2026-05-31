import grpc
from grpc import aio

from config import settings
from database import AsyncSessionLocal
from services import DocumentService

try:
    from protos import document_pb2
    from protos import document_pb2_grpc
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False

if PROTO_AVAILABLE:
    class DocumentGrpcService(document_pb2_grpc.DocumentServiceServicer):
        async def CreateDocument(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                document = await service.create_document(request, request.owner_id)
                
                return document_pb2.DocumentResponse(
                    document_id=document.id,
                    title=document.title,
                    owner_id=document.owner_id,
                    content_type=document.content_type,
                    metadata=document.metadata_ or {},
                    created_at=int(document.created_at.timestamp()),
                    updated_at=int(document.updated_at.timestamp()),
                    version=document.current_version
                )
        
        async def GetDocument(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                document = await service.get_document_by_id(request.document_id)
                
                if not document:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    return document_pb2.DocumentResponse()
                
                if not await service.has_permission(document, request.user_id, "read"):
                    context.set_code(grpc.StatusCode.PERMISSION_DENIED)
                    return document_pb2.DocumentResponse()
                
                return document_pb2.DocumentResponse(
                    document_id=document.id,
                    title=document.title,
                    owner_id=document.owner_id,
                    content_type=document.content_type,
                    metadata=document.metadata_ or {},
                    created_at=int(document.created_at.timestamp()),
                    updated_at=int(document.updated_at.timestamp()),
                    version=document.current_version
                )
        
        async def UpdateDocument(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                
                update_data = type('UpdateData', (), {})()
                update_data.title = request.title
                update_data.metadata = dict(request.metadata)
                
                document = await service.update_document(
                    request.document_id,
                    update_data,
                    request.user_id
                )
                
                if not document:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    return document_pb2.DocumentResponse()
                
                return document_pb2.DocumentResponse(
                    document_id=document.id,
                    title=document.title,
                    owner_id=document.owner_id,
                    content_type=document.content_type,
                    metadata=document.metadata_ or {},
                    created_at=int(document.created_at.timestamp()),
                    updated_at=int(document.updated_at.timestamp()),
                    version=document.current_version
                )
        
        async def DeleteDocument(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                success = await service.delete_document(
                    request.document_id,
                    request.user_id
                )
                return document_pb2.DeleteDocumentResponse(success=success)
        
        async def ListDocuments(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                documents, total = await service.list_documents(
                    request.user_id,
                    request.page or 1,
                    request.page_size or 20
                )
                
                doc_responses = []
                for doc in documents:
                    doc_responses.append(document_pb2.DocumentResponse(
                        document_id=doc.id,
                        title=doc.title,
                        owner_id=doc.owner_id,
                        content_type=doc.content_type,
                        metadata=doc.metadata_ or {},
                        created_at=int(doc.created_at.timestamp()),
                        updated_at=int(doc.updated_at.timestamp()),
                        version=doc.current_version
                    ))
                
                return document_pb2.ListDocumentsResponse(
                    documents=doc_responses,
                    total=total,
                    page=request.page or 1,
                    page_size=request.page_size or 20
                )
        
        async def CheckDocumentPermission(self, request, context):
            async with AsyncSessionLocal() as db:
                service = DocumentService(db)
                document = await service.get_document_by_id(request.document_id)
                
                if not document:
                    return document_pb2.CheckPermissionResponse(allowed=False, role="none")
                
                role = await service.get_user_permission(document, request.user_id)
                allowed = await service.has_permission(
                    document,
                    request.user_id,
                    request.action
                )
                
                return document_pb2.CheckPermissionResponse(
                    allowed=allowed,
                    role=role or "none"
                )

async def serve_grpc():
    if not PROTO_AVAILABLE:
        print("gRPC proto files not generated, skipping gRPC server")
        return
    
    server = aio.server()
    document_pb2_grpc.add_DocumentServiceServicer_to_server(DocumentGrpcService(), server)
    server.add_insecure_port(f"[::]:{settings.grpc_port}")
    print(f"Document gRPC server starting on port {settings.grpc_port}")
    await server.start()
    await server.wait_for_termination()
