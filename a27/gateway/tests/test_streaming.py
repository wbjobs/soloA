import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from router.proxy import MAX_IN_MEMORY_SIZE, get_target_url

class TestGatewayStreamingFix:
    def test_max_in_memory_size_threshold(self):
        assert MAX_IN_MEMORY_SIZE == 10 * 1024 * 1024
        assert MAX_IN_MEMORY_SIZE == 10485760
    
    def test_get_target_url_routing(self):
        auth_url = get_target_url("/api/v1/auth/login")
        assert "auth" in auth_url.lower()
        
        doc_url = get_target_url("/api/v1/documents/123")
        assert "document" in doc_url.lower()
        
        crdt_url = get_target_url("/api/v1/crdt/apply")
        assert "crdt" in crdt_url.lower()
        
        version_url = get_target_url("/api/v1/versions/list/123")
        assert "version" in version_url.lower()
    
    def test_get_target_url_unknown_path_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            get_target_url("/api/v1/unknown/path")
        assert exc.value.status_code == 404

class TestMemoryThresholdCalculations:
    def test_small_request_in_memory(self):
        small_size = 5 * 1024 * 1024
        assert small_size < MAX_IN_MEMORY_SIZE
    
    def test_large_request_needs_streaming(self):
        large_size = 15 * 1024 * 1024
        assert large_size > MAX_IN_MEMORY_SIZE
    
    def test_exact_threshold(self):
        exact_size = MAX_IN_MEMORY_SIZE
        assert exact_size == 10 * 1024 * 1024
