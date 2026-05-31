# Academic RAG & Knowledge Graph System

An intelligent question-answering system for academic research, combining **RAG (Retrieval-Augmented Generation)** with **Knowledge Graphs**.

## Features

### Core Capabilities

1. **Document Upload & Parsing**
   - PDF text extraction
   - Metadata extraction (title, authors, keywords, year, conference)
   - Table parsing (with pdfplumber)
   - Auto-chunking for vector search

2. **Vector Retrieval (RAG)**
   - Milvus vector database integration
   - OpenAI / Sentence-Transformers embeddings
   - Semantic search across papers
   - Configurable chunk size and overlap

3. **Knowledge Graph**
   - Neo4j graph database
   - Entity types: Paper, Author, Keyword, Conference, Year
   - Relations: WROTE, HAS_KEYWORD, PRESENTED_AT, PUBLISHED_IN
   - 3D interactive visualization (3d-force-graph)
   - Node dragging and relation filtering
   - Auto-generated Cypher queries from natural language

4. **Conversational Q&A**
   - Multi-turn dialogue with context retention
   - Citation highlighting with source verification
   - Combined RAG + graph reasoning
   - LLM gateway with fallback (OpenAI → Claude → Local)

5. **Paper Search**
   - Full-text semantic search
   - Filters by year, conference, citations
   - Ranking by relevance score

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                       │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Chat Panel │  │ 3D Graph   │  │ Search & Upload UI   │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI API Gateway                        │
│  /api/documents/upload  |  /api/ask  |  /api/graph         │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Document Parser│  │ Embedding Svc  │  │ Graph Builder  │
│ (pypdf/plumber)│  │ (Milvus +     │  │ (Neo4j + LLM)  │
│                │  │  Sentence-    │  │                │
│                │  │  Transformers)│  │                │
└────────────────┘  └────────────────┘  └────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                   ┌────────────────────────┐
                   │   Reasoning Engine     │
                   │  (RAG + Graph Query)   │
                   └────────────────────────┘
                              │
                              ▼
                   ┌────────────────────────┐
                   │      LLM Gateway       │
                   │ OpenAI → Claude → Local│
                   └────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local dev)
- Node.js 20+ (for frontend)
- OpenAI API Key (or Claude, or local Ollama)

### Option 1: Docker (Recommended)

1. Clone the repository
2. Configure environment:
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. Start all services:
   ```bash
   docker-compose up -d
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - Neo4j Browser: http://localhost:7474 (neo4j/password)
   - Milvus: localhost:19530

### Option 2: Local Development

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your settings

# Make sure Milvus and Neo4j are running (see docker-compose)

# Run
cd api
python main.py
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

## API Endpoints

### Documents
- `POST /api/documents/upload` - Upload and parse PDF
- `POST /api/search` - Vector search across papers
- `GET /api/filters` - Get available filter options

### Q&A
- `POST /api/ask` - Ask a question (with context)
- `GET /api/conversations/{id}` - Get conversation history
- `DELETE /api/conversations/{id}` - Delete conversation

### Knowledge Graph
- `GET /api/graph` - Get graph data (nodes & edges)
- `POST /api/graph/cypher` - Execute Cypher query

### Health
- `GET /health` - Service health check

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `OPENAI_MODEL` | Model for generation | gpt-3.5-turbo |
| `EMBEDDING_MODEL` | Model for embeddings | text-embedding-3-small |
| `MILVUS_HOST` | Milvus server | localhost |
| `NEO4J_URI` | Neo4j connection | bolt://localhost:7687 |
| `CHUNK_SIZE` | Document chunk size | 1000 |
| `TOP_K` | Results per query | 5 |

See `backend/.env.example` for full list.

## Usage Workflow

1. **Upload Papers**: Go to Upload tab, drag & drop PDF files
2. **Explore Graph**: Switch to Knowledge Graph tab to see entities and relations
3. **Ask Questions**: Use Chat tab for conversational Q&A with citations
4. **Search Papers**: Use Search tab for detailed paper filtering

## Knowledge Graph Schema

**Node Types:**
- `Paper` - Research papers
- `Author` - Paper authors
- `Keyword` - Research topics
- `Conference` - Venues
- `Year` - Publication years

**Relationships:**
- `WROTE` / `WRITTEN_BY` - Author ↔ Paper
- `HAS_KEYWORD` / `USED_IN` - Paper ↔ Keyword
- `PRESENTED_AT` - Paper → Conference
- `PUBLISHED_IN` - Paper → Year

## Tech Stack

**Backend:**
- FastAPI
- LangChain-ready architecture
- pypdf + pdfplumber (document parsing)
- pymilvus (vector DB)
- neo4j driver (graph DB)
- openai / anthropic SDKs

**Frontend:**
- React 18 + TypeScript
- Material-UI
- 3d-force-graph (3D visualization)
- Three.js
- Axios

**Infrastructure:**
- Docker + Docker Compose
- Milvus (vector database)
- Neo4j (graph database)
- MinIO (Milvus object storage)
- etcd (Milvus metadata)

## Advanced Features

### LLM Gateway Fallback Chain

The system automatically tries LLM providers in order:
1. OpenAI (if API key configured)
2. Claude (if API key configured)
3. Local (Ollama-compatible API at localhost:11434)

### Graph-Enhanced Reasoning

Questions containing these keywords trigger graph queries:
- "who wrote", "author", "co-author"
- "citation", "cited by"
- "conference", "proceedings", "published"
- "keyword", "topics", "concepts"

The system generates Cypher queries from natural language and executes them against Neo4j.

## License

MIT License
