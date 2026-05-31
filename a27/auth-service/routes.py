from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    TokenResponse,
    PermissionCheck,
    PermissionResponse
)
from services import AuthService

router = APIRouter(prefix="", tags=["auth"])

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "auth-service"}

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    try:
        user = await service.create_user(user_data)
        roles = await service.get_user_roles(user)
        return UserResponse(
            user_id=user.id,
            username=user.username,
            email=user.email,
            roles=roles,
            created_at=user.created_at
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    user = await service.authenticate_user(login_data)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    token = await service.generate_token(user)
    roles = await service.get_user_roles(user)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user.id,
            username=user.username,
            email=user.email,
            roles=roles,
            created_at=user.created_at
        )
    )

@router.post("/validate", response_model=UserResponse)
async def validate_token(token: str, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    user = await service.validate_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    roles = await service.get_user_roles(user)
    return UserResponse(
        user_id=user.id,
        username=user.username,
        email=user.email,
        roles=roles,
        created_at=user.created_at
    )

@router.post("/check-permission", response_model=PermissionResponse)
async def check_permission(check: PermissionCheck, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    allowed = await service.check_permission(
        check.user_id,
        check.resource,
        check.action
    )
    return PermissionResponse(allowed=allowed)
