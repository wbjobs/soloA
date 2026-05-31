from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict

from shared.utils import generate_id
from shared.models import (
    Annotation, Notification, AnnotationCreateRequest, AnnotationVoteRequest
)


class AnnotationService:
    def __init__(self):
        self._annotations: Dict[str, Annotation] = {}
        self._notifications: Dict[str, List[Notification]] = defaultdict(list)
        self._document_annotations: Dict[str, List[str]] = defaultdict(list)

    def create_annotation(
        self,
        request: AnnotationCreateRequest
    ) -> Annotation:
        annotation = Annotation(
            id=generate_id(),
            document_id=request.document_id,
            chunk_index=request.chunk_index,
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            highlighted_text=request.highlighted_text,
            user_id=request.user_id,
            user_name=request.user_name,
            content=request.content,
            parent_id=request.parent_id,
            mentions=request.mentions or []
        )

        self._annotations[annotation.id] = annotation
        self._document_annotations[annotation.document_id].append(annotation.id)

        if annotation.mentions:
            for mentioned_username in annotation.mentions:
                self._create_notification(
                    from_user=annotation.user_name,
                    to_username=mentioned_username,
                    annotation=annotation,
                    is_reply=False
                )

        if annotation.parent_id:
            parent = self._annotations.get(annotation.parent_id)
            if parent and parent.user_id != annotation.user_id:
                self._create_notification(
                    from_user=annotation.user_name,
                    to_username=parent.user_name,
                    annotation=annotation,
                    is_reply=True
                )

        return annotation

    def _create_notification(
        self,
        from_user: str,
        to_username: str,
        annotation: Annotation,
        is_reply: bool
    ):
        action = "replied to your annotation" if is_reply else "mentioned you in an annotation"
        message = f"{from_user} {action} about: '{annotation.highlighted_text[:50]}...'"

        notification = Notification(
            id=generate_id(),
            user_id=to_username,
            from_user=from_user,
            annotation_id=annotation.id,
            document_id=annotation.document_id,
            document_title=annotation.document_id,
            highlighted_text=annotation.highlighted_text[:100],
            message=message
        )

        self._notifications[to_username].append(notification)

    def get_document_annotations(
        self,
        document_id: str,
        include_replies: bool = True
    ) -> List[Annotation]:
        annotation_ids = self._document_annotations.get(document_id, [])
        annotations = [self._annotations.get(aid) for aid in annotation_ids]
        annotations = [a for a in annotations if a is not None]

        if not include_replies:
            annotations = [a for a in annotations if not a.parent_id]

        return sorted(
            annotations,
            key=lambda a: a.created_at,
            reverse=True
        )

    def get_annotation_thread(
        self,
        annotation_id: str
    ) -> List[Annotation]:
        annotation = self._annotations.get(annotation_id)
        if not annotation:
            return []

        result = [annotation]

        if annotation.parent_id:
            parent = self._annotations.get(annotation.parent_id)
            if parent:
                result = [parent] + result

        replies = [
            a for a in self._annotations.values()
            if a.parent_id == annotation_id
        ]
        replies_sorted = sorted(replies, key=lambda a: a.created_at)

        return result + replies_sorted

    def get_user_annotations(
        self,
        user_id: str
    ) -> List[Annotation]:
        return sorted(
            [a for a in self._annotations.values() if a.user_id == user_id],
            key=lambda a: a.created_at,
            reverse=True
        )

    def update_annotation(
        self,
        annotation_id: str,
        user_id: str,
        content: str
    ) -> Optional[Annotation]:
        annotation = self._annotations.get(annotation_id)
        if not annotation:
            return None

        if annotation.user_id != user_id:
            return None

        annotation.content = content
        annotation.updated_at = datetime.utcnow()
        return annotation

    def delete_annotation(
        self,
        annotation_id: str,
        user_id: str
    ) -> bool:
        annotation = self._annotations.get(annotation_id)
        if not annotation:
            return False

        if annotation.user_id != user_id:
            return False

        del self._annotations[annotation_id]

        if annotation.document_id in self._document_annotations:
            self._document_annotations[annotation.document_id] = [
                aid for aid in self._document_annotations[annotation.document_id]
                if aid != annotation_id
            ]

        children = [aid for aid, a in self._annotations.items() if a.parent_id == annotation_id]
        for child_id in children:
            del self._annotations[child_id]
            if annotation.document_id in self._document_annotations:
                self._document_annotations[annotation.document_id] = [
                    aid for aid in self._document_annotations[annotation.document_id]
                    if aid != child_id
                ]

        return True

    def resolve_annotation(
        self,
        annotation_id: str,
        user_id: str
    ) -> Optional[Annotation]:
        annotation = self._annotations.get(annotation_id)
        if not annotation:
            return None

        annotation.resolved = True
        return annotation

    def vote_annotation(
        self,
        request: AnnotationVoteRequest
    ) -> Optional[Annotation]:
        annotation = self._annotations.get(request.annotation_id)
        if not annotation:
            return None

        user_id = request.user_id
        direction = request.direction.lower()

        if user_id in annotation.voters:
            if direction == "remove":
                annotation.voters.remove(user_id)
                annotation.votes = max(0, annotation.votes - 1)
        else:
            if direction == "up":
                annotation.voters.append(user_id)
                annotation.votes += 1

        return annotation

    def get_notifications(
        self,
        user_id: str,
        unread_only: bool = True
    ) -> List[Notification]:
        notifications = self._notifications.get(user_id, [])

        if unread_only:
            notifications = [n for n in notifications if not n.read]

        return sorted(notifications, key=lambda n: n.created_at, reverse=True)

    def mark_notification_read(
        self,
        user_id: str,
        notification_id: str
    ) -> bool:
        notifications = self._notifications.get(user_id, [])
        for n in notifications:
            if n.id == notification_id:
                n.read = True
                return True
        return False

    def mark_all_notifications_read(self, user_id: str) -> int:
        count = 0
        for n in self._notifications.get(user_id, []):
            if not n.read:
                n.read = True
                count += 1
        return count

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_annotations": len(self._annotations),
            "annotations_by_document": {
                doc_id: len(aids)
                for doc_id, aids in self._document_annotations.items()
            },
            "users_with_notifications": len(self._notifications)
        }
