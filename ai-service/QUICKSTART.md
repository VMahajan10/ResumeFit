# Quick Start Guide

## Setup in 3 Steps

### 1. Start ChromaDB (Vector Database)

**Option A: Docker (Easiest)**
```bash
docker-compose up -d
```

**Option B: Docker Run**
```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma
```

**Option C: Local Installation**
```bash
# Follow ChromaDB docs: https://docs.trychroma.com/getting-started
```

### 2. Install and Start AI Service

```bash
cd ai-service
npm install
npm start
```

Service runs on `http://localhost:3001`

### 3. Rebuild Extension

```bash
cd ../extension-sidebar
npm run build
```

Then reload the extension in Chrome.

## Verify It's Working

1. **Check AI Service**:
   ```bash
   curl http://localhost:3001/health
   ```
   Should return: `{"status":"ok","service":"ResumeFit AI Service"}`

2. **Check ChromaDB**:
   ```bash
   curl http://localhost:8000/api/v1/heartbeat
   ```
   Should return: `{"nanosecond heartbeat":"..."}`

3. **Test in Extension**:
   - Upload a resume
   - Extract a job description
   - Click "Run Analysis"
   - Should work without Ollama!

## What's Different?

- ✅ No Ollama needed (though it can still use Ollama internally)
- ✅ Vector database for better context
- ✅ No API keys required
- ✅ Local embeddings
- ✅ RAG (Retrieval Augmented Generation)

## Switching Back to Ollama

In `extension-sidebar/src/background.ts`:
```typescript
const USE_CUSTOM_AI_SERVICE = false; // Use Ollama directly
```

Then rebuild and reload.

