import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas import UserCreate, UserLogin
from services import AuthService
from security import hash_password, verify_password, create_access_token, decode_token
from models import User, Role

@pytest.fixture
def mock_db():
    db = AsyncMock()
    return db

@pytest.fixture
def test_user():
    user = User(
        id="test-user-id-123",
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("testpass123"),
        is_active="Y",
        created_at=datetime.utcnow()
    )
    return user

@pytest.fixture
def auth_service(mock_db):
    return AuthService(mock_db)

class TestSecurity:
    def test_hash_password(self):
        password = "testpassword123"
        hashed = hash_password(password)
        assert hashed != password
        assert verify_password(password, hashed)
    
    def test_verify_password_wrong(self):
        hashed = hash_password("correctpassword")
        assert not verify_password("wrongpassword", hashed)
    
    def test_create_and_decode_token(self):
        token = create_access_token(
            subject="user123",
            username="testuser",
            email="test@example.com",
            roles=["user"]
        )
        payload = decode_token(token)
        assert payload["sub"] == "user123"
        assert payload["username"] == "testuser"
        assert payload["roles"] == ["user"]
    
    def test_decode_invalid_token(self):
        payload = decode_token("invalid.token.here")
        assert payload == {}

class TestAuthService:
    @pytest.mark.asyncio
    async def test_get_user_by_id(self, auth_service, mock_db, test_user):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_user
        mock_db.execute.return_value = mock_result
        
        user = await auth_service.get_user_by_id("test-user-id-123")
        
        assert user is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
    
    @pytest.mark.asyncio
    async def test_get_user_by_id_not_found(self, auth_service, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        user = await auth_service.get_user_by_id("nonexistent")
        
        assert user is None
    
    @pytest.mark.asyncio
    async def test_authenticate_user_success(self, auth_service, mock_db, test_user):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_user
        mock_db.execute.return_value = mock_result
        
        login_data = UserLogin(username="testuser", password="testpass123")
        user = await auth_service.authenticate_user(login_data)
        
        assert user is not None
        assert user.username == "testuser"
    
    @pytest.mark.asyncio
    async def test_authenticate_user_wrong_password(self, auth_service, mock_db, test_user):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_user
        mock_db.execute.return_value = mock_result
        
        login_data = UserLogin(username="testuser", password="wrongpassword")
        user = await auth_service.authenticate_user(login_data)
        
        assert user is None
    
    @pytest.mark.asyncio
    async def test_authenticate_user_inactive(self, auth_service, mock_db):
        inactive_user = User(
            id="inactive-id",
            username="inactive",
            email="inactive@test.com",
            password_hash=hash_password("test123"),
            is_active="N"
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = inactive_user
        mock_db.execute.return_value = mock_result
        
        login_data = UserLogin(username="inactive", password="test123")
        user = await auth_service.authenticate_user(login_data)
        
        assert user is None
    
    @pytest.mark.asyncio
    async def test_generate_token(self, auth_service, test_user):
        test_user.roles = []
        token = await auth_service.generate_token(test_user)
        assert isinstance(token, str)
        assert len(token) > 0
        
        payload = decode_token(token)
        assert payload["sub"] == test_user.id
        assert payload["username"] == test_user.username
    
    @pytest.mark.asyncio
    async def test_check_permission_admin(self, auth_service, mock_db, test_user):
        admin_role = Role(name="admin", id="admin-role-id")
        test_user.roles = [admin_role]
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_user
        mock_db.execute.return_value = mock_result
        
        allowed = await auth_service.check_permission(
            "test-user-id-123",
            "documents",
            "delete"
        )
        
        assert allowed is True
