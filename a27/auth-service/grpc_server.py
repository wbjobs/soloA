import asyncio
import grpc
from grpc import aio
from typing import Optional

from config import settings
from database import AsyncSessionLocal
from services import AuthService

try:
    from protos import auth_pb2
    from protos import auth_pb2_grpc
    PROTO_AVAILABLE = True
except ImportError:
    PROTO_AVAILABLE = False

if PROTO_AVAILABLE:
    class AuthGrpcService(auth_pb2_grpc.AuthServiceServicer):
        async def Login(self, request, context):
            async with AsyncSessionLocal() as db:
                service = AuthService(db)
                user = await service.authenticate_user(request)
                
                if not user:
                    context.set_code(grpc.StatusCode.UNAUTHENTICATED)
                    context.set_details("Invalid credentials")
                    return auth_pb2.LoginResponse()
                
                token = await service.generate_token(user)
                roles = await service.get_user_roles(user)
                
                return auth_pb2.LoginResponse(
                    access_token=token,
                    token_type="bearer",
                    user=auth_pb2.UserInfo(
                        user_id=user.id,
                        username=user.username,
                        email=user.email,
                        roles=roles
                    )
                )
        
        async def Register(self, request, context):
            async with AsyncSessionLocal() as db:
                service = AuthService(db)
                try:
                    user = await service.create_user(request)
                    roles = await service.get_user_roles(user)
                    
                    return auth_pb2.RegisterResponse(
                        success=True,
                        message="User registered successfully",
                        user=auth_pb2.UserInfo(
                            user_id=user.id,
                            username=user.username,
                            email=user.email,
                            roles=roles
                        )
                    )
                except ValueError as e:
                    return auth_pb2.RegisterResponse(
                        success=False,
                        message=str(e)
                    )
        
        async def ValidateToken(self, request, context):
            async with AsyncSessionLocal() as db:
                service = AuthService(db)
                user = await service.validate_token(request.token)
                
                if not user:
                    return auth_pb2.ValidateTokenResponse(valid=False)
                
                roles = await service.get_user_roles(user)
                return auth_pb2.ValidateTokenResponse(
                    valid=True,
                    user=auth_pb2.UserInfo(
                        user_id=user.id,
                        username=user.username,
                        email=user.email,
                        roles=roles
                    )
                )
        
        async def CheckPermission(self, request, context):
            async with AsyncSessionLocal() as db:
                service = AuthService(db)
                allowed = await service.check_permission(
                    request.user_id,
                    request.resource,
                    request.action
                )
                return auth_pb2.CheckPermissionResponse(allowed=allowed)

async def serve_grpc():
    if not PROTO_AVAILABLE:
        print("gRPC proto files not generated, skipping gRPC server")
        return
    
    server = aio.server()
    auth_pb2_grpc.add_AuthServiceServicer_to_server(AuthGrpcService(), server)
    server.add_insecure_port(f"[::]:{settings.grpc_port}")
    print(f"gRPC server starting on port {settings.grpc_port}")
    await server.start()
    await server.wait_for_termination()
