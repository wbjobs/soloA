import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from search.service import SearchService, DocumentIndex


@pytest.fixture
async def search_service():
    service = SearchService()
    await service.init()
    yield service
    await service.close()


class TestSearchService:
    @pytest.mark.asyncio
    async def test_init_in_memory_mode(self, search_service):
        stats = await search_service.get_stats()
        assert stats["mode"] == "in-memory"
        assert stats["total_docs"] == 0
    
    @pytest.mark.asyncio
    async def test_index_document(self, search_service):
        success = await search_service.index_document(
            document_id="doc1",
            title="Test Document",
            owner_id="user1",
            content="This is a test document content",
            version=1
        )
        
        assert success is True
        
        stats = await search_service.get_stats()
        assert stats["total_docs"] == 1
    
    @pytest.mark.asyncio
    async def test_get_document(self, search_service):
        await search_service.index_document(
            document_id="doc2",
            title="Another Document",
            owner_id="user2",
            content="Some content here",
            version=2
        )
        
        doc = await search_service.get_document("doc2")
        
        assert doc is not None
        assert doc["document_id"] == "doc2"
        assert doc["title"] == "Another Document"
        assert doc["owner_id"] == "user2"
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_document(self, search_service):
        doc = await search_service.get_document("nonexistent")
        assert doc is None
    
    @pytest.mark.asyncio
    async def test_search_basic(self, search_service):
        await search_service.index_document(
            document_id="doc_search_1",
            title="Python Programming",
            owner_id="user1",
            content="Learning Python is fun and useful",
            version=1
        )
        
        await search_service.index_document(
            document_id="doc_search_2",
            title="Java Development",
            owner_id="user1",
            content="Java is another popular language",
            version=1
        )
        
        result = await search_service.search(query="Python")
        
        assert result["total"] == 1
        assert len(result["hits"]) == 1
        assert result["hits"][0]["document_id"] == "doc_search_1"
    
    @pytest.mark.asyncio
    async def test_search_by_owner_filter(self, search_service):
        await search_service.index_document(
            document_id="doc_owner_1",
            title="Doc 1",
            owner_id="alice",
            content="Content about something",
            version=1
        )
        
        await search_service.index_document(
            document_id="doc_owner_2",
            title="Doc 2",
            owner_id="bob",
            content="Content about something else",
            version=1
        )
        
        result_alice = await search_service.search(query="Content", owner_id="alice")
        result_bob = await search_service.search(query="Content", owner_id="bob")
        
        assert result_alice["total"] == 1
        assert result_alice["hits"][0]["owner_id"] == "alice"
        assert result_bob["total"] == 1
        assert result_bob["hits"][0]["owner_id"] == "bob"
    
    @pytest.mark.asyncio
    async def test_search_pagination(self, search_service):
        for i in range(5):
            await search_service.index_document(
                document_id=f"doc_pagination_{i}",
                title=f"Document {i}",
                owner_id="user1",
                content=f"Content {i}",
                version=1
            )
        
        result = await search_service.search(query="Content", limit=2, offset=1)
        
        assert result["total"] == 5
        assert len(result["hits"]) == 2
    
    @pytest.mark.asyncio
    async def test_search_title_weighting(self, search_service):
        await search_service.index_document(
            document_id="doc_weight_1",
            title="Hello World",
            owner_id="user1",
            content="Some random text",
            version=1
        )
        
        await search_service.index_document(
            document_id="doc_weight_2",
            title="Random Title",
            owner_id="user1",
            content="Hello World content",
            version=1
        )
        
        result = await search_service.search(query="Hello")
        
        assert len(result["hits"]) == 2
        assert result["hits"][0]["document_id"] == "doc_weight_1"
    
    @pytest.mark.asyncio
    async def test_delete_document(self, search_service):
        await search_service.index_document(
            document_id="doc_delete",
            title="To Delete",
            owner_id="user1",
            content="Delete me",
            version=1
        )
        
        stats_before = await search_service.get_stats()
        assert stats_before["total_docs"] == 1
        
        success = await search_service.delete_document("doc_delete")
        assert success is True
        
        stats_after = await search_service.get_stats()
        assert stats_after["total_docs"] == 0
        
        doc = await search_service.get_document("doc_delete")
        assert doc is None
    
    @pytest.mark.asyncio
    async def test_bulk_index(self, search_service):
        docs = [
            {
                "document_id": f"bulk_{i}",
                "title": f"Bulk Doc {i}",
                "owner_id": "user1",
                "content": f"Bulk content {i}",
                "version": 1
            }
            for i in range(3)
        ]
        
        indexed = await search_service.bulk_index(docs)
        
        assert indexed == 3
        
        stats = await search_service.get_stats()
        assert stats["total_docs"] == 3
    
    @pytest.mark.asyncio
    async def test_update_document_index(self, search_service):
        await search_service.index_document(
            document_id="doc_update",
            title="Original Title",
            owner_id="user1",
            content="Original content",
            version=1
        )
        
        await search_service.index_document(
            document_id="doc_update",
            title="Updated Title",
            owner_id="user1",
            content="Updated content",
            version=2
        )
        
        doc = await search_service.get_document("doc_update")
        
        assert doc["title"] == "Updated Title"
        assert doc["version"] == 2
        
        stats = await search_service.get_stats()
        assert stats["total_docs"] == 1
    
    @pytest.mark.asyncio
    async def test_search_no_results(self, search_service):
        await search_service.index_document(
            document_id="doc_no_match",
            title="Some Title",
            owner_id="user1",
            content="Some content",
            version=1
        )
        
        result = await search_service.search(query="xyz_nonexistent")
        
        assert result["total"] == 0
        assert len(result["hits"]) == 0
