import uuid
import time
from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass, field
from enum import Enum

class OperationType(str, Enum):
    INSERT = "insert"
    DELETE = "delete"
    UPDATE = "update"

@dataclass
class LamportTimestamp:
    counter: int = 0
    node_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    def increment(self) -> 'LamportTimestamp':
        return LamportTimestamp(self.counter + 1, self.node_id)
    
    def __lt__(self, other: 'LamportTimestamp') -> bool:
        if self.counter != other.counter:
            return self.counter < other.counter
        return self.node_id < other.node_id
    
    def __eq__(self, other: 'LamportTimestamp') -> bool:
        return self.counter == other.counter and self.node_id == other.node_id
    
    def to_tuple(self) -> Tuple[int, str]:
        return (self.counter, self.node_id)
    
    @classmethod
    def from_tuple(cls, t: Tuple[int, str]) -> 'LamportTimestamp':
        return cls(counter=t[0], node_id=t[1])

@dataclass
class RGANode:
    id: str
    char: Optional[str]
    timestamp: LamportTimestamp
    is_tombstone: bool = False
    prev_id: Optional[str] = None
    next_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "char": self.char,
            "timestamp": self.timestamp.to_tuple(),
            "is_tombstone": self.is_tombstone,
            "prev_id": self.prev_id,
            "next_id": self.next_id
        }
    
    @classmethod
    def from_dict(cls, d: Dict) -> 'RGANode':
        return cls(
            id=d["id"],
            char=d["char"],
            timestamp=LamportTimestamp.from_tuple(d["timestamp"]),
            is_tombstone=d.get("is_tombstone", False),
            prev_id=d.get("prev_id"),
            next_id=d.get("next_id")
        )

@dataclass
class RGAOperation:
    type: OperationType
    position: int
    char: Optional[str] = None
    author_id: str = ""
    timestamp: int = 0
    node_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "type": self.type.value if isinstance(self.type, OperationType) else self.type,
            "position": self.position,
            "char": self.char,
            "author_id": self.author_id,
            "timestamp": self.timestamp,
            "node_id": self.node_id
        }
    
    @classmethod
    def from_dict(cls, d: Dict) -> 'RGAOperation':
        op_type = d["type"]
        if isinstance(op_type, str):
            op_type = OperationType(op_type)
        return cls(
            type=op_type,
            position=d["position"],
            char=d.get("char"),
            author_id=d.get("author_id", ""),
            timestamp=d.get("timestamp", 0),
            node_id=d.get("node_id")
        )

class RGA:
    def __init__(self, document_id: str):
        self.document_id = document_id
        self.nodes: Dict[str, RGANode] = {}
        self.head: Optional[str] = None
        self.tail: Optional[str] = None
        self.lamport_clock = LamportTimestamp()
        self.operations: List[RGAOperation] = []
        self.version: int = 1
        
        start_node = RGANode(
            id=f"start-{uuid.uuid4()}",
            char=None,
            timestamp=self.lamport_clock,
            is_tombstone=True
        )
        end_node = RGANode(
            id=f"end-{uuid.uuid4()}",
            char=None,
            timestamp=self.lamport_clock.increment(),
            is_tombstone=True,
            prev_id=start_node.id
        )
        start_node.next_id = end_node.id
        
        self.nodes[start_node.id] = start_node
        self.nodes[end_node.id] = end_node
        self.head = start_node.id
        self.tail = end_node.id
    
    def _get_visible_nodes(self) -> List[RGANode]:
        nodes = []
        current = self.head
        while current:
            node = self.nodes.get(current)
            if node and not node.is_tombstone and node.char is not None:
                nodes.append(node)
            current = node.next_id if node else None
        return nodes
    
    def _get_node_at_position(self, pos: int) -> Optional[RGANode]:
        visible = self._get_visible_nodes()
        if pos < 0 or pos >= len(visible):
            return None
        return visible[pos]
    
    def _get_physical_node_before(self, insert_pos: int) -> RGANode:
        if insert_pos == 0:
            return self.nodes[self.head]
        
        visible = self._get_visible_nodes()
        if insert_pos >= len(visible):
            return self.nodes[self.tail]
        
        target_visible = visible[insert_pos - 1]
        return self.nodes[target_visible.id]
    
    def insert(self, position: int, char: str, author_id: str = "") -> RGAOperation:
        self.lamport_clock = self.lamport_clock.increment()
        
        prev_node = self._get_physical_node_before(position)
        
        new_node_id = f"node-{uuid.uuid4()}"
        new_node = RGANode(
            id=new_node_id,
            char=char,
            timestamp=LamportTimestamp(
                self.lamport_clock.counter,
                author_id if author_id else self.lamport_clock.node_id
            ),
            prev_id=prev_node.id,
            next_id=prev_node.next_id
        )
        
        if prev_node.next_id:
            next_node = self.nodes[prev_node.next_id]
            next_node.prev_id = new_node_id
        
        prev_node.next_id = new_node_id
        self.nodes[new_node_id] = new_node
        
        operation = RGAOperation(
            type=OperationType.INSERT,
            position=position,
            char=char,
            author_id=author_id,
            timestamp=int(time.time() * 1000),
            node_id=new_node_id
        )
        
        self.operations.append(operation)
        return operation
    
    def delete(self, position: int, author_id: str = "") -> Optional[RGAOperation]:
        target_node = self._get_node_at_position(position)
        if not target_node:
            return None
        
        if target_node.is_tombstone:
            return None
        
        target_node.is_tombstone = True
        
        operation = RGAOperation(
            type=OperationType.DELETE,
            position=position,
            char=target_node.char,
            author_id=author_id,
            timestamp=int(time.time() * 1000),
            node_id=target_node.id
        )
        
        self.operations.append(operation)
        return operation
    
    def get_text(self) -> str:
        visible = self._get_visible_nodes()
        return "".join(node.char for node in visible if node.char)
    
    def get_length(self) -> int:
        return len(self._get_visible_nodes())
    
    def apply_remote_operation(self, op: RGAOperation):
        if op.type == OperationType.INSERT:
            if op.node_id and op.node_id in self.nodes:
                return
            
            self.lamport_clock = LamportTimestamp(
                max(self.lamport_clock.counter, int(op.timestamp / 1000) if op.timestamp > 1000000 else self.lamport_clock.counter),
                self.lamport_clock.node_id
            )
            self.lamport_clock = self.lamport_clock.increment()
            
            prev_node = self._get_physical_node_before(op.position)
            
            new_node = RGANode(
                id=op.node_id or f"remote-{uuid.uuid4()}",
                char=op.char,
                timestamp=LamportTimestamp(
                    self.lamport_clock.counter,
                    op.author_id if op.author_id else self.lamport_clock.node_id
                ),
                prev_id=prev_node.id,
                next_id=prev_node.next_id
            )
            
            if prev_node.next_id:
                next_node = self.nodes[prev_node.next_id]
                next_node.prev_id = new_node.id
            
            prev_node.next_id = new_node.id
            self.nodes[new_node.id] = new_node
            
        elif op.type == OperationType.DELETE:
            deleted = False
            
            if op.node_id and op.node_id in self.nodes:
                node = self.nodes[op.node_id]
                if not node.is_tombstone:
                    node.is_tombstone = True
                    deleted = True
                else:
                    return
            else:
                target_node = self._get_node_at_position(op.position)
                if target_node and not target_node.is_tombstone:
                    target_node.is_tombstone = True
                    deleted = True
                else:
                    return
            
            if deleted:
                self.operations.append(op)
    
    def get_snapshot(self) -> Dict:
        return {
            "document_id": self.document_id,
            "version": self.version,
            "text": self.get_text(),
            "nodes": {nid: node.to_dict() for nid, node in self.nodes.items()},
            "head": self.head,
            "tail": self.tail,
            "operation_count": len(self.operations)
        }
    
    @classmethod
    def from_snapshot(cls, snapshot: Dict) -> 'RGA':
        rga = cls(snapshot["document_id"])
        
        rga.nodes = {}
        for nid, node_data in snapshot["nodes"].items():
            rga.nodes[nid] = RGANode.from_dict(node_data)
        
        rga.head = snapshot["head"]
        rga.tail = snapshot["tail"]
        rga.version = snapshot["version"]
        
        return rga
