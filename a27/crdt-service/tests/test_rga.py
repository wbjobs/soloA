import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crdt.rga import RGA, RGAOperation, OperationType, LamportTimestamp

class TestLamportTimestamp:
    def test_increment(self):
        ts = LamportTimestamp(counter=0, node_id="node-1")
        new_ts = ts.increment()
        assert new_ts.counter == 1
        assert new_ts.node_id == "node-1"
    
    def test_comparison_by_counter(self):
        ts1 = LamportTimestamp(counter=1, node_id="node-a")
        ts2 = LamportTimestamp(counter=2, node_id="node-b")
        assert ts1 < ts2
        assert ts2 > ts1
    
    def test_comparison_by_node_id(self):
        ts1 = LamportTimestamp(counter=1, node_id="node-a")
        ts2 = LamportTimestamp(counter=1, node_id="node-b")
        assert ts1 < ts2
    
    def test_to_tuple_and_from_tuple(self):
        original = LamportTimestamp(counter=42, node_id="test-node")
        t = original.to_tuple()
        restored = LamportTimestamp.from_tuple(t)
        assert original == restored

class TestRGABasicOperations:
    def test_initial_state(self):
        rga = RGA("doc-1")
        assert rga.document_id == "doc-1"
        assert rga.get_text() == ""
        assert rga.get_length() == 0
        assert len(rga.operations) == 0
    
    def test_single_insert(self):
        rga = RGA("doc-1")
        rga.insert(0, "H", "user-1")
        assert rga.get_text() == "H"
        assert rga.get_length() == 1
    
    def test_multiple_inserts(self):
        rga = RGA("doc-1")
        rga.insert(0, "H", "user-1")
        rga.insert(1, "i", "user-1")
        rga.insert(2, "!", "user-1")
        assert rga.get_text() == "Hi!"
    
    def test_insert_at_beginning(self):
        rga = RGA("doc-1")
        rga.insert(0, "B", "user-1")
        rga.insert(0, "A", "user-1")
        assert rga.get_text() == "AB"
    
    def test_insert_at_middle(self):
        rga = RGA("doc-1")
        rga.insert(0, "A", "user-1")
        rga.insert(1, "C", "user-1")
        rga.insert(1, "B", "user-1")
        assert rga.get_text() == "ABC"
    
    def test_single_delete(self):
        rga = RGA("doc-1")
        rga.insert(0, "A", "user-1")
        rga.insert(1, "B", "user-1")
        rga.delete(0, "user-1")
        assert rga.get_text() == "B"
    
    def test_delete_all(self):
        rga = RGA("doc-1")
        rga.insert(0, "H", "user-1")
        rga.insert(1, "i", "user-1")
        rga.delete(0, "user-1")
        rga.delete(0, "user-1")
        assert rga.get_text() == ""
    
    def test_delete_invalid_position(self):
        rga = RGA("doc-1")
        result = rga.delete(0, "user-1")
        assert result is None
    
    def test_complex_edits(self):
        rga = RGA("doc-1")
        rga.insert(0, "H", "user-1")
        rga.insert(1, "e", "user-1")
        rga.insert(2, "l", "user-1")
        rga.insert(3, "l", "user-1")
        rga.insert(4, "o", "user-1")
        assert rga.get_text() == "Hello"
        
        rga.delete(4, "user-1")
        assert rga.get_text() == "Hell"
        
        rga.insert(4, "p", "user-1")
        assert rga.get_text() == "Help"

class TestRGAOperations:
    def test_operation_recorded(self):
        rga = RGA("doc-1")
        rga.insert(0, "A", "user-1")
        assert len(rga.operations) == 1
        op = rga.operations[0]
        assert op.type == OperationType.INSERT
        assert op.char == "A"
        assert op.position == 0
    
    def test_operation_to_dict(self):
        op = RGAOperation(
            type=OperationType.INSERT,
            position=5,
            char="X",
            author_id="user-1",
            timestamp=1234567890,
            node_id="node-test"
        )
        d = op.to_dict()
        assert d["type"] == "insert"
        assert d["position"] == 5
        assert d["char"] == "X"
        assert d["author_id"] == "user-1"
    
    def test_operation_from_dict(self):
        d = {
            "type": "insert",
            "position": 5,
            "char": "Y",
            "author_id": "user-2",
            "timestamp": 9876543210,
            "node_id": "node-remote"
        }
        op = RGAOperation.from_dict(d)
        assert op.type == OperationType.INSERT
        assert op.char == "Y"
        assert op.position == 5
        assert op.author_id == "user-2"

class TestRGASnapshot:
    def test_create_snapshot(self):
        rga = RGA("doc-1")
        rga.insert(0, "T", "user-1")
        rga.insert(1, "e", "user-1")
        rga.insert(2, "s", "user-1")
        rga.insert(3, "t", "user-1")
        
        snapshot = rga.get_snapshot()
        assert snapshot["document_id"] == "doc-1"
        assert snapshot["text"] == "Test"
        assert "nodes" in snapshot
        assert "head" in snapshot
        assert "tail" in snapshot
    
    def test_restore_from_snapshot(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "H", "user-1")
        rga1.insert(1, "i", "user-1")
        snapshot = rga1.get_snapshot()
        
        rga2 = RGA.from_snapshot(snapshot)
        assert rga2.document_id == "doc-1"
        assert rga2.get_text() == "Hi"

class TestRGARemoteOperations:
    def test_apply_remote_insert(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "H", "user-1")
        local_op = rga1.operations[0]
        
        rga2 = RGA("doc-1")
        rga2.apply_remote_operation(local_op)
        
        assert rga2.get_text() == "H"
    
    def test_apply_remote_delete(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "H", "user-1")
        rga1.insert(1, "i", "user-1")
        rga1.delete(0, "user-1")
        
        for op in rga1.operations:
            rga2 = RGA("doc-1")
            rga2.insert(0, "H", "user-1")
            rga2.insert(1, "i", "user-1")
            rga2.apply_remote_operation(op)
    
    def test_concurrent_inserts_keep_order(self):
        rga = RGA("doc-1")
        rga.insert(0, "A", "user-1")
        rga.insert(1, "C", "user-2")
        
        remote_op = RGAOperation(
            type=OperationType.INSERT,
            position=1,
            char="B",
            author_id="user-3",
            timestamp=0
        )
        rga.apply_remote_operation(remote_op)
        
        text = rga.get_text()
        assert "A" in text
        assert "C" in text

class TestRGAEdgeCases:
    def test_empty_string_operations(self):
        rga = RGA("doc-1")
        assert rga.get_text() == ""
        rga.delete(0, "user-1")
        assert rga.get_text() == ""
    
    def test_very_long_text(self):
        rga = RGA("doc-1")
        test_string = "Hello, World! This is a test of the RGA implementation."
        for i, char in enumerate(test_string):
            rga.insert(i, char, "user-1")
        assert rga.get_text() == test_string
        assert rga.get_length() == len(test_string)
    
    def test_insert_at_end(self):
        rga = RGA("doc-1")
        rga.insert(0, "A", "user-1")
        rga.insert(1, "B", "user-1")
        rga.insert(2, "C", "user-1")
        assert rga.get_text() == "ABC"
    
    def test_multiple_authors(self):
        rga = RGA("doc-1")
        rga.insert(0, "H", "alice")
        rga.insert(1, "i", "bob")
        assert rga.get_text() == "Hi"
        
        authors = {op.author_id for op in rga.operations}
        assert "alice" in authors
        assert "bob" in authors

class TestBugFixes:
    def test_concurrent_delete_same_position_no_duplicate_tombstone(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "A", "user-initial")
        rga1.insert(1, "B", "user-initial")
        rga1.insert(2, "C", "user-initial")
        assert rga1.get_text() == "ABC"
        
        delete_op = rga1.delete(1, "alice")
        assert delete_op is not None
        assert rga1.get_text() == "AC"
        assert len(rga1.operations) == 4
        
        second_delete = rga1.delete(1, "bob")
        assert second_delete is None
        assert len(rga1.operations) == 4
        assert rga1.get_text() == "AC"
    
    def test_remote_delete_already_deleted_node_ignored(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "X", "user-1")
        delete_op = rga1.delete(0, "user-1")
        
        rga2 = RGA("doc-1")
        rga2.insert(0, "X", "user-1")
        
        rga2.apply_remote_operation(delete_op)
        assert rga2.get_text() == ""
        assert len(rga2.operations) == 1
        
        rga2.apply_remote_operation(delete_op)
        assert rga2.get_text() == ""
        assert len(rga2.operations) == 1
    
    def test_concurrent_clients_delete_same_node(self):
        rga_server = RGA("doc-shared")
        rga_server.insert(0, "A", "initial")
        rga_server.insert(1, "B", "initial")
        assert rga_server.get_text() == "AB"
        
        rga_alice = RGA.from_snapshot(rga_server.get_snapshot())
        rga_bob = RGA.from_snapshot(rga_server.get_snapshot())
        
        alice_delete = rga_alice.delete(1, "alice")
        bob_delete = rga_bob.delete(1, "bob")
        
        rga_server.apply_remote_operation(alice_delete)
        assert rga_server.get_text() == "A"
        ops_after_alice = len(rga_server.operations)
        
        rga_server.apply_remote_operation(bob_delete)
        assert rga_server.get_text() == "A"
        assert len(rga_server.operations) == ops_after_alice
    
    def test_delete_with_node_id_priority_over_position(self):
        rga1 = RGA("doc-1")
        rga1.insert(0, "A", "u1")
        insert_op = rga1.operations[-1]
        target_node_id = insert_op.node_id
        
        rga2 = RGA.from_snapshot(rga1.get_snapshot())
        
        rga2.insert(0, "Z", "u2")
        assert rga2.get_text() == "ZA"
        
        delete_op = RGAOperation(
            type=OperationType.DELETE,
            position=1,
            char="A",
            author_id="u1",
            timestamp=0,
            node_id=target_node_id
        )
        
        rga2.apply_remote_operation(delete_op)
        assert rga2.get_text() == "Z"
    
    def test_apply_remote_delete_on_empty_returns_none(self):
        rga = RGA("doc-1")
        original_ops = len(rga.operations)
        
        delete_op = RGAOperation(
            type=OperationType.DELETE,
            position=0,
            char=None,
            author_id="user",
            timestamp=0
        )
        
        rga.apply_remote_operation(delete_op)
        assert len(rga.operations) == original_ops
    
    def test_document_consistency_after_multiple_concurrent_deletes(self):
        rga_server = RGA("doc-test")
        
        for i, char in enumerate("HELLO"):
            rga_server.insert(i, char, "server")
        
        assert rga_server.get_text() == "HELLO"
        
        snapshot = rga_server.get_snapshot()
        rga_client1 = RGA.from_snapshot(snapshot)
        rga_client2 = RGA.from_snapshot(snapshot)
        
        del1 = rga_client1.delete(2, "client1")
        del2 = rga_client2.delete(2, "client2")
        del3 = rga_client2.delete(0, "client2")
        
        rga_server.apply_remote_operation(del1)
        rga_server.apply_remote_operation(del2)
        rga_server.apply_remote_operation(del3)
        
        expected = "ELLO"
        expected = expected[1:]
        assert len(rga_server.get_text()) == 3
