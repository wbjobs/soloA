import os
import sys
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import settings
from shared.utils import generate_id, ensure_directory
from shared.models import (
    Document, SearchQuery, SearchResult, Answer, Message,
    KnowledgeGraphData, FilterOptions,
    AnnotationCreateRequest, AnnotationVoteRequest,
    ReviewRequest
)
from services.document_parser import DocumentParserService
from services.embedding_service import EmbeddingService
from services.graph_service import GraphService
from services.llm_gateway import LLMGateway
from services.reasoning_service import ReasoningService
from services.hypothesis_service import HypothesisService
from services.review_service import ReviewService
from services.annotation_service import AnnotationService


class UploadResponse(BaseModel):
    document_id: str
    title: str
    authors: List[str]
    abstract: Optional[str]
    keywords: List[str]
    chunk_count: int


class AskRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    top_k: int = 5
    use_graph: bool = True


class CypherRequest(BaseModel):
    query: str


app = FastAPI(
    title="Academic RAG & Knowledge Graph System",
    description="Intelligent Q&A system combining RAG with Knowledge Graph",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_directory(settings.UPLOAD_DIR)

document_parser = DocumentParserService()
embedding_service = EmbeddingService()
graph_service = GraphService()
llm_gateway = LLMGateway()
reasoning_service = ReasoningService(
    embedding_service=embedding_service,
    graph_service=graph_service,
    llm_gateway=llm_gateway
)
hypothesis_service = HypothesisService(
    graph_service=graph_service,
    llm_gateway=llm_gateway
)
review_service = ReviewService(
    embedding_service=embedding_service,
    graph_service=graph_service,
    llm_gateway=llm_gateway
)
annotation_service = AnnotationService()

conversations: Dict[str, List[Message]] = {}


@app.get("/")
async def root():
    return {"message": "Academic RAG & Knowledge Graph System", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/api/documents/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()

    try:
        parsed = document_parser.parse_file(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")

    doc_id = generate_id()
    document = Document(
        id=doc_id,
        title=parsed.title,
        authors=parsed.authors,
        abstract=parsed.abstract,
        keywords=parsed.keywords,
        year=parsed.year,
        conference=parsed.conference,
        citations=parsed.citations,
        content=parsed.content
    )

    try:
        chunks = embedding_service.index_document(document)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to index document: {str(e)}")

    try:
        graph_service.index_document(document)
    except Exception as e:
        print(f"Warning: Graph indexing failed: {e}")

    return UploadResponse(
        document_id=doc_id,
        title=parsed.title,
        authors=parsed.authors,
        abstract=parsed.abstract,
        keywords=parsed.keywords,
        chunk_count=len(chunks)
    )


@app.post("/api/search")
async def search(search_query: SearchQuery):
    try:
        results = reasoning_service.search_papers(search_query)
        return {
            "query": search_query.query,
            "count": len(results),
            "results": [
                {
                    "chunk": r.chunk.model_dump(),
                    "score": r.score
                }
                for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.post("/api/ask")
async def ask(request: AskRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if request.conversation_id and request.conversation_id in conversations:
        conversation_history = conversations[request.conversation_id]
    else:
        conversation_history = []
        if not request.conversation_id:
            request.conversation_id = generate_id()

    user_message = Message(role="user", content=request.query)
    conversation_history.append(user_message)

    search_query = SearchQuery(
        query=request.query,
        top_k=request.top_k,
        filters={}
    )

    try:
        answer = reasoning_service.answer_question(
            search_query,
            conversation_history=conversation_history
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {str(e)}")

    assistant_message = Message(
        role="assistant",
        content=answer.content,
        citations=answer.citations
    )
    conversation_history.append(assistant_message)
    conversations[request.conversation_id] = conversation_history

    return {
        "conversation_id": request.conversation_id,
        "answer": answer.model_dump()
    }


@app.get("/api/graph")
async def get_graph(entity: Optional[str] = None, limit: int = 100):
    try:
        graph_data = reasoning_service.get_graph_data(entity_name=entity, limit=limit)
        return graph_data.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve graph: {str(e)}")


@app.post("/api/graph/cypher")
async def run_cypher(request: CypherRequest):
    try:
        results = reasoning_service.execute_cypher(request.query)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cypher query failed: {str(e)}")


@app.get("/api/filters")
async def get_filter_options():
    mock_filters = FilterOptions(
        years=[2024, 2023, 2022, 2021, 2020],
        conferences=["NeurIPS", "ICML", "CVPR", "ACL", "EMNLP"],
        authors=[],
        keywords=[],
        min_citations=None
    )
    return mock_filters.model_dump()


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    if conversation_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "conversation_id": conversation_id,
        "messages": [m.model_dump() for m in conversations[conversation_id]]
    }


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    if conversation_id in conversations:
        del conversations[conversation_id]
    return {"status": "deleted"}


@app.get("/api/hypotheses")
async def generate_hypotheses(focus: Optional[str] = None):
    try:
        response = hypothesis_service.generate_research_hypotheses(focus_entity=focus)
        return response.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate hypotheses: {str(e)}")


@app.post("/api/review")
async def generate_review(request: ReviewRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        review = review_service.generate_review(request)
        return review.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate review: {str(e)}")


@app.get("/api/trends")
async def get_trends(query: str = "", top_k: int = 50):
    try:
        data = review_service.generate_trend_visualization_data(query, top_k)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get trends: {str(e)}")


@app.post("/api/annotations")
async def create_annotation(request: AnnotationCreateRequest):
    try:
        annotation = annotation_service.create_annotation(request)
        return annotation.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create annotation: {str(e)}")


@app.get("/api/annotations/document/{document_id}")
async def get_document_annotations(document_id: str, include_replies: bool = True):
    try:
        annotations = annotation_service.get_document_annotations(document_id, include_replies)
        return {"count": len(annotations), "annotations": [a.model_dump() for a in annotations]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get annotations: {str(e)}")


@app.get("/api/annotations/thread/{annotation_id}")
async def get_annotation_thread(annotation_id: str):
    try:
        thread = annotation_service.get_annotation_thread(annotation_id)
        return {"count": len(thread), "thread": [a.model_dump() for a in thread]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get thread: {str(e)}")


@app.get("/api/annotations/user/{user_id}")
async def get_user_annotations(user_id: str):
    try:
        annotations = annotation_service.get_user_annotations(user_id)
        return {"count": len(annotations), "annotations": [a.model_dump() for a in annotations]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user annotations: {str(e)}")


@app.put("/api/annotations/{annotation_id}")
async def update_annotation(annotation_id: str, request: dict):
    user_id = request.get("user_id", "")
    content = request.get("content", "")
    if not user_id or not content:
        raise HTTPException(status_code=400, detail="user_id and content are required")

    try:
        annotation = annotation_service.update_annotation(annotation_id, user_id, content)
        if annotation:
            return annotation.model_dump()
        raise HTTPException(status_code=404, detail="Annotation not found or not authorized")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update annotation: {str(e)}")


@app.delete("/api/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str, user_id: str):
    try:
        success = annotation_service.delete_annotation(annotation_id, user_id)
        if success:
            return {"status": "deleted"}
        raise HTTPException(status_code=404, detail="Annotation not found or not authorized")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete annotation: {str(e)}")


@app.post("/api/annotations/{annotation_id}/resolve")
async def resolve_annotation(annotation_id: str, user_id: str):
    try:
        annotation = annotation_service.resolve_annotation(annotation_id, user_id)
        if annotation:
            return annotation.model_dump()
        raise HTTPException(status_code=404, detail="Annotation not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resolve annotation: {str(e)}")


@app.post("/api/annotations/vote")
async def vote_annotation(request: AnnotationVoteRequest):
    try:
        annotation = annotation_service.vote_annotation(request)
        if annotation:
            return annotation.model_dump()
        raise HTTPException(status_code=404, detail="Annotation not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to vote: {str(e)}")


@app.get("/api/notifications/{user_id}")
async def get_notifications(user_id: str, unread_only: bool = True):
    try:
        notifications = annotation_service.get_notifications(user_id, unread_only)
        return {
            "count": len(notifications),
            "notifications": [n.model_dump() for n in notifications]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notifications: {str(e)}")


@app.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(user_id: str, notification_id: str):
    try:
        success = annotation_service.mark_notification_read(user_id, notification_id)
        if success:
            return {"status": "marked_read"}
        raise HTTPException(status_code=404, detail="Notification not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark notification: {str(e)}")


@app.post("/api/notifications/mark-all-read")
async def mark_all_notifications_read(user_id: str):
    try:
        count = annotation_service.mark_all_notifications_read(user_id)
        return {"marked_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark notifications: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
