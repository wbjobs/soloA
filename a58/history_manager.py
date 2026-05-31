import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from config import get_config


class ConversationTurn:
    def __init__(
        self,
        question: str,
        answer: str,
        sources: List[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
        turn_id: Optional[str] = None,
        suggestion: Optional[Dict[str, Any]] = None,
        context_truncated: bool = False,
    ):
        self.turn_id = turn_id or str(uuid.uuid4())
        self.question = question
        self.answer = answer
        self.sources = sources or []
        self.timestamp = timestamp or datetime.now().isoformat()
        self.suggestion = suggestion
        self.context_truncated = context_truncated

    def to_dict(self) -> Dict[str, Any]:
        return {
            "turn_id": self.turn_id,
            "question": self.question,
            "answer": self.answer,
            "sources": self.sources,
            "timestamp": self.timestamp,
            "suggestion": self.suggestion,
            "context_truncated": self.context_truncated,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ConversationTurn":
        return cls(
            turn_id=data.get("turn_id"),
            question=data.get("question", ""),
            answer=data.get("answer", ""),
            sources=data.get("sources", []),
            timestamp=data.get("timestamp"),
            suggestion=data.get("suggestion"),
            context_truncated=data.get("context_truncated", False),
        )


class Conversation:
    def __init__(
        self,
        conversation_id: Optional[str] = None,
        title: Optional[str] = None,
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
        turns: Optional[List[ConversationTurn]] = None,
    ):
        self.conversation_id = conversation_id or str(uuid.uuid4())
        self.title = title or "新对话"
        self.created_at = created_at or datetime.now().isoformat()
        self.updated_at = updated_at or self.created_at
        self.turns = turns or []

    def add_turn(self, turn: ConversationTurn):
        self.turns.append(turn)
        self.updated_at = datetime.now().isoformat()

        if len(self.turns) == 1:
            self.title = turn.question[:50]
            if len(turn.question) > 50:
                self.title += "..."

    def get_recent_turns(self, count: int) -> List[ConversationTurn]:
        if count <= 0:
            return []
        return self.turns[-count:]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "title": self.title,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "turns": [turn.to_dict() for turn in self.turns],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Conversation":
        turns = [ConversationTurn.from_dict(t) for t in data.get("turns", [])]
        return cls(
            conversation_id=data.get("conversation_id"),
            title=data.get("title"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            turns=turns,
        )


class HistoryManager:
    def __init__(self):
        self.history_dir = get_config("history_dir", "history")
        self.max_history_turns = get_config("max_history_turns", 10)
        self.history_context_ratio = get_config("history_context_ratio", 0.2)

        os.makedirs(self.history_dir, exist_ok=True)

    def _get_conversation_path(self, conversation_id: str) -> str:
        return os.path.join(self.history_dir, f"{conversation_id}.json")

    def save_conversation(self, conversation: Conversation) -> str:
        file_path = self._get_conversation_path(conversation.conversation_id)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(conversation.to_dict(), f, ensure_ascii=False, indent=2)
        return file_path

    def load_conversation(self, conversation_id: str) -> Optional[Conversation]:
        file_path = self._get_conversation_path(conversation_id)
        if not os.path.exists(file_path):
            return None

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Conversation.from_dict(data)

    def delete_conversation(self, conversation_id: str) -> bool:
        file_path = self._get_conversation_path(conversation_id)
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False

    def list_conversations(self) -> List[Dict[str, Any]]:
        conversations = []

        if not os.path.exists(self.history_dir):
            return conversations

        for filename in os.listdir(self.history_dir):
            if filename.endswith(".json"):
                file_path = os.path.join(self.history_dir, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    conversations.append({
                        "conversation_id": data.get("conversation_id"),
                        "title": data.get("title", "无标题"),
                        "created_at": data.get("created_at", ""),
                        "updated_at": data.get("updated_at", ""),
                        "turn_count": len(data.get("turns", [])),
                    })
                except Exception:
                    continue

        conversations.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return conversations

    def create_conversation(self, title: Optional[str] = None) -> Conversation:
        conversation = Conversation(title=title)
        self.save_conversation(conversation)
        return conversation

    def format_history_context(
        self,
        conversation: Conversation,
        max_turns: Optional[int] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        actual_turns = max_turns or self.max_history_turns
        recent_turns = conversation.get_recent_turns(actual_turns)

        if not recent_turns:
            return ""

        history_parts = ["--- 对话历史 ---"]

        current_length = 0
        max_length = (max_tokens or 1000) * 4

        for i, turn in enumerate(recent_turns):
            turn_text = f"\n用户: {turn.question}\n助手: {turn.answer[:500]}"
            if len(turn.answer) > 500:
                turn_text += "..."

            if max_length > 0 and current_length + len(turn_text) > max_length:
                break

            history_parts.append(turn_text)
            current_length += len(turn_text)

        history_parts.append("--- 当前对话 ---")

        return "\n".join(history_parts)

    def add_turn_to_conversation(
        self,
        conversation_id: str,
        question: str,
        answer: str,
        sources: List[Dict[str, Any]] = None,
        suggestion: Optional[Dict[str, Any]] = None,
        context_truncated: bool = False,
    ) -> Optional[Conversation]:
        conversation = self.load_conversation(conversation_id)
        if not conversation:
            return None

        turn = ConversationTurn(
            question=question,
            answer=answer,
            sources=sources,
            suggestion=suggestion,
            context_truncated=context_truncated,
        )
        conversation.add_turn(turn)
        self.save_conversation(conversation)

        return conversation
