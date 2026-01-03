# Extension Integration Guide

## How to Switch from Ollama to Custom AI Service

### Step 1: Start the Custom AI Service

```bash
cd ai-service
npm install
npm start
```

The service will run on `http://localhost:3001`

### Step 2: Start ChromaDB (Vector Database)

```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### Step 3: Update Extension Configuration

The extension is already configured to use the custom AI service by default.

In `src/background.ts`:
```typescript
const USE_CUSTOM_AI_SERVICE = true; // Set to false to use Ollama directly
```

### Step 4: Rebuild Extension

```bash
cd extension-sidebar
npm run build
```

### Step 5: Reload Extension in Chrome

1. Go to `chrome://extensions/`
2. Find "ResumeFit Sidebar"
3. Click refresh icon (🔄)

## API Compatibility

The custom AI service provides the same API structure as Ollama, so the extension works seamlessly:

- `/api/analyze` - Resume analysis
- `/api/chat` - Chat-driven editing

## Benefits of Custom AI Service

1. **Vector Database**: Retrieves similar job descriptions for better context
2. **No API Keys**: Everything runs locally
3. **Knowledge Base**: Builds a database of job patterns over time
4. **Better Suggestions**: Uses historical data to improve recommendations
5. **RAG**: Retrieval Augmented Generation for more accurate responses

## Switching Back to Ollama

If you want to use Ollama directly:

1. Set `USE_CUSTOM_AI_SERVICE = false` in `background.ts`
2. Rebuild extension
3. Reload in Chrome

## Troubleshooting

### "AI Service not running"

Make sure the service is started:
```bash
cd ai-service
npm start
```

### "ChromaDB connection error"

Start ChromaDB:
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### Port conflicts

Change the port in `ai-service/.env`:
```env
PORT=3002
```

Then update `AI_SERVICE_BASE_URL` in `extension-sidebar/src/background.ts`

