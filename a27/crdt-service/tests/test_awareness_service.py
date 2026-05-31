import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from awareness.service import (
    AwarenessService,
    CursorPosition,
    AwarenessEvent,
    PresenceStatus,
    awareness_service
)


@pytest.fixture
async def service():
    svc = AwarenessService()
    await svc.init()
    yield svc
    await svc.close()


class TestAwarenessService:
    @pytest.mark.asyncio
    async def test_init(self, service):
        assert service._initialized is True
    
    @pytest.mark.asyncio
    async def test_join_document(self, service):
        result = await service.join_document(
            document_id="doc1",
            user_id="user1",
            username="Alice",
            initial_position=0
        )
        
        assert result["joined"] is True
        assert "current_users" in result
        
        awareness = await service.get_document_awareness("doc1")
        assert awareness["document_id"] == "doc1"
        assert len(awareness["users"]) == 1
        assert awareness["users"][0]["user_id"] == "user1"
        assert awareness["users"][0]["status"] == "online"
        assert awareness["users"][0]["position"] == 0
    
    @pytest.mark.asyncio
    async def test_leave_document(self, service):
        await service.join_document(
            document_id="doc2",
            user_id="user1",
            username="Alice"
        )
        
        before = await service.get_document_awareness("doc2")
        assert len(before["users"]) == 1
        
        await service.leave_document(document_id="doc2", user_id="user1", username="Alice")
        
        after = await service.get_document_awareness("doc2")
        assert len(after["users"]) == 0
    
    @pytest.mark.asyncio
    async def test_update_cursor(self, service):
        await service.join_document(
            document_id="doc3",
            user_id="user1",
            username="Alice",
            initial_position=0
        )
        
        cursor = await service.update_cursor(
            document_id="doc3",
            user_id="user1",
            username="Alice",
            position=100
        )
        
        assert cursor.position == 100
        assert cursor.user_id == "user1"
        
        awareness = await service.get_document_awareness("doc3")
        assert awareness["users"][0]["position"] == 100
    
    @pytest.mark.asyncio
    async def test_update_cursor_with_selection(self, service):
        cursor = await service.update_cursor(
            document_id="doc_selection",
            user_id="user1",
            username="Alice",
            position=150,
            selection_start=100,
            selection_end=200
        )
        
        assert cursor.position == 150
        assert cursor.selection_start == 100
        assert cursor.selection_end == 200
        
        awareness = await service.get_document_awareness("doc_selection")
        user = awareness["users"][0]
        assert user["selection_start"] == 100
        assert user["selection_end"] == 200
    
    @pytest.mark.asyncio
    async def test_set_presence(self, service):
        await service.join_document(
            document_id="doc4",
            user_id="user1",
            username="Alice"
        )
        
        await service.set_presence(
            document_id="doc4",
            user_id="user1",
            username="Alice",
            status=PresenceStatus.AWAY
        )
        
        awareness = await service.get_document_awareness("doc4")
        assert awareness["users"][0]["status"] == "away"
    
    @pytest.mark.asyncio
    async def test_set_presence_offline(self, service):
        await service.join_document(
            document_id="doc_offline",
            user_id="user1",
            username="Alice"
        )
        
        before = await service.get_document_awareness("doc_offline")
        assert len(before["users"]) == 1
        
        await service.set_presence(
            document_id="doc_offline",
            user_id="user1",
            username="Alice",
            status=PresenceStatus.OFFLINE
        )
        
        after = await service.get_document_awareness("doc_offline")
        assert len(after["users"]) == 0
    
    @pytest.mark.asyncio
    async def test_multiple_users_in_document(self, service):
        await service.join_document("doc5", "user1", "Alice")
        await service.join_document("doc5", "user2", "Bob")
        await service.join_document("doc5", "user3", "Charlie")
        
        awareness = await service.get_document_awareness("doc5")
        assert len(awareness["users"]) == 3
        user_ids = [u["user_id"] for u in awareness["users"]]
        assert "user1" in user_ids
        assert "user2" in user_ids
        assert "user3" in user_ids
    
    @pytest.mark.asyncio
    async def test_get_document_awareness_not_exist(self, service):
        awareness = await service.get_document_awareness("nonexistent")
        assert awareness["document_id"] == "nonexistent"
        assert len(awareness["users"]) == 0
    
    @pytest.mark.asyncio
    async def test_user_color(self, service):
        await service.join_document(
            document_id="doc_color",
            user_id="user1",
            username="Alice",
            color="#FF5733"
        )
        
        awareness = await service.get_document_awareness("doc_color")
        assert awareness["users"][0]["color"] == "#FF5733"


class TestCursorPosition:
    def test_cursor_position_basic(self):
        cursor = CursorPosition(
            document_id="doc",
            user_id="user1",
            username="Alice",
            position=0
        )
        assert cursor.document_id == "doc"
        assert cursor.user_id == "user1"
        assert cursor.position == 0
        assert cursor.selection_start is None
        assert cursor.selection_end is None
    
    def test_cursor_position_with_selection(self):
        cursor = CursorPosition(
            document_id="doc",
            user_id="user1",
            username="Alice",
            position=150,
            selection_start=100,
            selection_end=200
        )
        
        assert cursor.selection_start == 100
        assert cursor.selection_end == 200
    
    def test_cursor_position_to_dict(self):
        cursor = CursorPosition(
            document_id="doc1",
            user_id="user2",
            username="Bob",
            position=100,
            color="#00FF00"
        )
        d = cursor.to_dict()
        
        assert d["document_id"] == "doc1"
        assert d["user_id"] == "user2"
        assert d["username"] == "Bob"
        assert d["position"] == 100
        assert d["color"] == "#00FF00"
        assert "selection_start" in d
        assert "selection_end" in d
        assert "status" in d
        assert "timestamp" in d


class TestPresenceStatus:
    def test_presence_status_values(self):
        assert PresenceStatus.ONLINE.value == "online"
        assert PresenceStatus.AWAY.value == "away"
        assert PresenceStatus.OFFLINE.value == "offline"


class TestAwarenessEvent:
    def test_awareness_event_to_dict(self):
        event = AwarenessEvent(
            event_type="cursor_update",
            document_id="doc1",
            user_id="user1",
            username="Alice",
            payload={"position": 100},
            timestamp=1234567890.0
        )
        
        d = event.to_dict()
        
        assert d["event_type"] == "cursor_update"
        assert d["document_id"] == "doc1"
        assert d["user_id"] == "user1"
        assert d["username"] == "Alice"
        assert d["payload"] == {"position": 100}
        assert d["timestamp"] == 1234567890.0
