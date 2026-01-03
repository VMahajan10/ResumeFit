# Custom AI Service with Vector Database

## Overview

You now have a custom AI API service that uses vector database retrieval and embeddings - **no API keys required!**

## Architecture

```
Chrome Extension
    ↓
Custom AI Service (Node.js/Express)
    ↓
ChromaDB (Vector Database) ← Stores job patterns
    ↓
Embedding Model (Local) ← Generates embeddings
    ↓
LLM (Local/Ollama) ← Generates responses with context
```

## Key Features

✅ **Vector Database (ChromaDB)**: Stores and retrieves similar job descriptions  
✅ **Local Embeddings**: Uses `@xenova/transformers` - no API keys  
✅ **RAG (Retrieval Augmented Generation)**: Retrieves relevant context before generating  
✅ **No External APIs**: Everything runs locally  
✅ **Knowledge Base**: Builds database of job patterns over time  

## Quick Start

### 1. Start ChromaDB

```bash
cd ai-service
docker-compose up -d
```

Or:
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### 2. Start AI Service

```bash
cd ai-service
npm install
npm start
```

Service runs on `http://localhost:3001`

### 3. Rebuild Extension

```bash
cd extension-sidebar
npm run build
```

Reload extension in Chrome.

## How It Works

### Resume Analysis Flow

1. User uploads resume and extracts job description
2. Extension sends request to custom AI service
3. Service stores job description in vector DB
4. Service retrieves similar job descriptions for context
5. Service generates embeddings for semantic search
6. Service calls LLM with enhanced context (RAG)
7. Returns structured JSON response

### Chat Flow

1. User sends chat message
2. Service retrieves relevant context from vector DB
3. Service generates response with context
4. Returns assistant message + proposed edits

## Benefits Over Direct Ollama

1. **Better Context**: Uses similar job descriptions for better analysis
2. **Knowledge Base**: Learns from past job descriptions
3. **Semantic Search**: Finds relevant patterns using embeddings
4. **No API Keys**: Everything local
5. **Scalable**: Can add more features (caching, analytics, etc.)

## Configuration

### AI Service Port

Edit `ai-service/.env`:
```env
PORT=3001
CHROMA_PATH=http://localhost:8000
```

### Extension Configuration

Edit `extension-sidebar/src/background.ts`:
```typescript
const USE_CUSTOM_AI_SERVICE = true; // Set to false for direct Ollama
const AI_SERVICE_BASE_URL = 'http://localhost:3001';
```

## Vector Database Options

The service uses **ChromaDB** by default, but you can use:

- **ChromaDB** (current) - Easy setup with Docker
- **Qdrant** - High performance
- **Weaviate** - Feature-rich
- **FAISS** (local) - No server needed
- **Pinecone** - Cloud option (requires API key)

## Embedding Models

Currently uses: `Xenova/all-MiniLM-L6-v2`
- 80MB, fast, good quality
- Runs entirely locally

Alternatives:
- `sentence-transformers/all-mpnet-base-v2` (better quality, slower)
- `Xenova/bge-small-en-v1.5` (better for retrieval)

## LLM Options

The service can use any local LLM:

1. **Ollama** (recommended) - Via localhost
2. **Local transformers** - Fully local but slower
3. **Custom inference** - Your choice

## File Structure

```
ai-service/
├── server.js              # Main API server
├── package.json           # Dependencies
├── docker-compose.yml     # ChromaDB setup
├── .env.example          # Configuration template
├── README.md            # Full documentation
├── QUICKSTART.md        # Quick setup guide
└── INTEGRATION.md       # Extension integration
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/analyze` - Resume analysis
- `POST /api/chat` - Chat-driven editing
- `POST /api/store` - Store knowledge in vector DB

## Troubleshooting

### ChromaDB Not Available

Service will work without ChromaDB, but RAG features will be limited.

To enable:
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### Embedding Model Download

First run downloads the model (~80MB). Be patient!

### Port Conflicts

Change port in `.env`:
```env
PORT=3002
```

Update extension config accordingly.

## Next Steps

- Add more embedding models
- Implement caching
- Add analytics
- Batch processing
- Multi-model support

