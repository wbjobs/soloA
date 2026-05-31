from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field

class Document(BaseModel):
    id: Optional[str] = None
    title: str
    authors: List[str] = []
    abstract: Optional[str] = None
    keywords: List[str] = []
    year: Optional[int] = None
    conference: Optional[str] = None
    citations: int = 0
    content: str
    file_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DocumentChunk(BaseModel):
    id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: Dict[str, Any] = {}
    embedding: Optional[List[float]] = None

class Entity(BaseModel):
    id: str
    name: str
    type: str

class Relation(BaseModel):
    source_id: str
    target_id: str
    relation_type: str
    metadata: Dict[str, Any] = {}

class KnowledgeGraphData(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

class Message(BaseModel):
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    citations: List[Dict[str, Any]] = []

class Conversation(BaseModel):
    id: Optional[str] = None
    messages: List[Message] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SearchQuery(BaseModel):
    query: str
    top_k: Optional[int] = None
    filters: Dict[str, Any] = {}

class SearchResult(BaseModel):
    chunk: DocumentChunk
    score: float
    document: Optional[Document] = None

class Answer(BaseModel):
    content: str
    citations: List[Dict[str, Any]] = []
    graph_hops: List[Dict[str, Any]] = []
    source_documents: List[SearchResult] = []

class FilterOptions(BaseModel):
    years: List[int] = []
    conferences: List[str] = []
    authors: List[str] = []
    keywords: List[str] = []
    min_citations: Optional[int] = None

class User(BaseModel):
    id: str
    username: str
    display_name: str
    avatar: Optional[str] = None

class Annotation(BaseModel):
    id: Optional[str] = None
    document_id: str
    chunk_index: int
    start_offset: int
    end_offset: int
    highlighted_text: str
    user_id: str
    user_name: str
    content: str
    parent_id: Optional[str] = None
    mentions: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    resolved: bool = False
    votes: int = 0
    voters: List[str] = []

class Notification(BaseModel):
    id: Optional[str] = None
    user_id: str
    from_user: str
    annotation_id: str
    document_id: str
    document_title: str
    highlighted_text: str
    message: str
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MissingLink(BaseModel):
    source_name: str
    source_type: str
    target_name: str
    target_type: str
    missing_relation: str
    confidence: float
    evidence: List[str]

class ResearchHypothesis(BaseModel):
    id: Optional[str] = None
    statement: str
    confidence: float
    based_on: List[str]
    experiments: List[str]
    related_work: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HypothesisResponse(BaseModel):
    missing_links: List[MissingLink]
    hypotheses: List[ResearchHypothesis]
    summary: str

class TopicCluster(BaseModel):
    topic_name: str
    keywords: List[str]
    paper_count: int
    papers: List[Dict[str, Any]]
    dominant_authors: List[str]
    trend_data: Dict[int, int]

class LiteratureReview(BaseModel):
    id: Optional[str] = None
    query: str
    title: str
    summary: str
    clusters: List[TopicCluster]
    research_trends: List[Dict[str, Any]]
    future_directions: List[str]
    citations: List[Dict[str, Any]]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TrendDataPoint(BaseModel):
    year: int
    count: int
    keywords: List[str]

class AnnotationCreateRequest(BaseModel):
    document_id: str
    chunk_index: int
    start_offset: int
    end_offset: int
    highlighted_text: str
    user_id: str
    user_name: str
    content: str
    parent_id: Optional[str] = None
    mentions: List[str] = []

class AnnotationVoteRequest(BaseModel):
    annotation_id: str
    user_id: str
    direction: str

class ReviewRequest(BaseModel):
    query: str
    top_k: int = 20
    generate_trends: bool = True
