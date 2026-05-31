from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import User, Role, Permission
from security import hash_password, verify_password, create_access_token, decode_token
from schemas import UserCreate, UserLogin

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_user_by_username(self, username: str) -> Optional[User]:
        stmt = select(User).options(selectinload(User.roles)).where(User.username == username)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).options(selectinload(User.roles)).where(User.email == email)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def create_user(self, user_data: UserCreate) -> User:
        if await self.get_user_by_username(user_data.username):
            raise ValueError("Username already exists")
        if await self.get_user_by_email(user_data.email):
            raise ValueError("Email already exists")
        
        user = User(
            username=user_data.username,
            email=user_data.email,
            password_hash=hash_password(user_data.password)
        )
        
        user_role = await self.get_or_create_role("user")
        if user_role:
            user.roles = [user_role]
        
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def authenticate_user(self, login_data: UserLogin) -> Optional[User]:
        user = await self.get_user_by_username(login_data.username)
        if not user:
            return None
        if user.is_active != "Y":
            return None
        if not verify_password(login_data.password, user.password_hash):
            return None
        return user
    
    async def generate_token(self, user: User) -> str:
        roles = [role.name for role in user.roles]
        return create_access_token(
            subject=user.id,
            username=user.username,
            email=user.email,
            roles=roles
        )
    
    async def validate_token(self, token: str) -> Optional[User]:
        payload = decode_token(token)
        if not payload:
            return None
        
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        return await self.get_user_by_id(user_id)
    
    async def get_or_create_role(self, role_name: str) -> Optional[Role]:
        stmt = select(Role).where(Role.name == role_name)
        result = await self.db.execute(stmt)
        role = result.scalar_one_or_none()
        
        if not role:
            role = Role(name=role_name, description=f"Default {role_name} role")
            self.db.add(role)
            await self.db.commit()
            await self.db.refresh(role)
        
        return role
    
    async def check_permission(self, user_id: str, resource: str, action: str) -> bool:
        stmt = (
            select(User)
            .options(
                selectinload(User.roles).selectinload(Role.permissions)
            )
            .where(User.id == user_id)
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return False
        
        for role in user.roles:
            if role.name == "admin":
                return True
        
        for role in user.roles:
            for permission in role.permissions:
                if permission.resource == resource and permission.action == action:
                    return True
        
        return False
    
    async def get_user_roles(self, user: User) -> List[str]:
        return [role.name for role in user.roles]
