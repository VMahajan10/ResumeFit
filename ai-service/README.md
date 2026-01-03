# ResumeFit Custom AI Service

A custom AI API service with vector database retrieval and embeddings for ResumeFit. No API keys required - runs entirely locally.

## Features

- **Vector Database (ChromaDB)**: Stores and retrieves job descriptions and resume patterns
- **Local Embeddings**: Uses `@xenova/transformers` for local embedding generation
- **RAG (Retrieval Augmented Generation)**: Retrieves relevant context before generating responses
- **No API Keys**: Everything runs locally
- **RESTful API**: Simple HTTP endpoints

## Architecture

```
Extension → Custom AI Service → Vector DB (ChromaDB)
                ↓
         Embedding Model (Local)
                ↓
         LLM (Local/Ollama)
                ↓
         Response with Context
```

## Setup

### 1. Install Dependencies

```bash
cd ai-service
npm install
```

### 2. Start ChromaDB (Vector Database)

**Option A: Docker (Recommended)**
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

**Option B: Local Installation**
```bash
# Follow ChromaDB installation guide
# https://docs.trychroma.com/getting-started
```

### 3. Start the AI Service

**Option A: Run Once (Manual)**
```bash
npm start
```

**Option B: Run Continuously (Recommended)**
```bash
# Install PM2 if not already installed
npm install -g pm2

# Start service with auto-restart
./start-service.sh
# or
npm run pm2:start
```

**Option C: Development with Auto-Reload**
```bash
npm run dev
```

The service will run on `http://localhost:3001`

📖 **See [AUTO_START.md](./AUTO_START.md) for detailed instructions on keeping the service running continuously.**

## API Endpoints

### POST /api/analyze

Analyze resume against job description with RAG.

**Request:**
```json
{
  "resumeText": "...",
  "jobText": "..."
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "score": 85,
    "matched_keywords": [...],
    "missing_keywords": [...],
    "suggested_edits": [...],
    "updated_draft": "..."
  }
}
```

### POST /api/chat

Chat-driven resume editing with context retrieval.

**Request:**
```json
{
  "message": "Make my summary more concise",
  "currentDraft": "...",
  "jobText": "...",
  "chatHistory": [...]
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "assistant_message": "...",
    "proposed_edits": [...],
    "updated_draft": "..." | null
  }
}
```

### POST /api/store

Store knowledge in vector database.

**Request:**
```json
{
  "text": "...",
  "metadata": {
    "type": "job_description",
    "source": "..."
  }
}
```

### GET /health

Health check endpoint.

## Configuration

Create a `.env` file:

```env
PORT=3001
CHROMA_PATH=http://localhost:8000
```

## Integration with Extension

Update the extension to use this service instead of Ollama:

1. Change `OLLAMA_BASE_URL` to `http://localhost:3001`
2. Update API endpoints to match the service
3. No authentication needed!

## Vector Database Benefits

- **Context Retrieval**: Finds similar job descriptions for better analysis
- **Knowledge Base**: Builds a database of job patterns over time
- **Better Suggestions**: Uses historical data to improve recommendations
- **No External APIs**: Everything stays local

## Embedding Model

Uses `Xenova/all-MiniLM-L6-v2`:
- Lightweight (80MB)
- Fast inference
- Good quality embeddings
- Runs entirely locally

## LLM Options

The service can use:
1. **Ollama** (via localhost) - Recommended
2. **Local transformers model** - Slower but fully local
3. **Custom inference engine** - Your choice

## Troubleshooting

### ChromaDB Connection Error

```bash
# Make sure ChromaDB is running
docker ps | grep chroma

# Or start it
docker run -d -p 8000:8000 chromadb/chroma
```

### Embedding Model Loading Slow

First run downloads the model (~80MB). Subsequent runs are faster.

### Port Already in Use

Change PORT in `.env` or kill the process using port 3001.

## Next Steps

- Add more embedding models
- Implement semantic search improvements
- Add batch processing
- Implement caching
- Add analytics

