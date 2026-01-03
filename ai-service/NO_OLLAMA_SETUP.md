# Running Without Ollama

You can run the AI service **completely without Ollama** - it will use local transformer models instead.

## Setup

### 1. Disable Ollama

Create a `.env` file in the `ai-service` folder:

```env
PORT=3001
CHROMA_PATH=http://localhost:8000
USE_OLLAMA=false
```

### 2. Start the Service

```bash
cd ai-service
npm install
npm start
```

## How It Works Without Ollama

1. **Embeddings**: Uses `@xenova/transformers` - fully local, no API keys
2. **Text Generation**: Uses local transformer model (`Xenova/LaMini-Flan-T5-248M`)
3. **Vector Database**: ChromaDB for RAG (optional but recommended)
4. **Fallback**: Rule-based responses if models aren't available

## Performance

- **Slower**: Local models are slower than Ollama
- **More CPU/Memory**: Uses more resources
- **Fully Local**: No external dependencies
- **No API Keys**: Everything runs on your machine

## Alternative: Use a Different Local LLM

You can replace the local model with:

1. **LM Studio** - Easy GUI for local LLMs
2. **llama.cpp** - Fast C++ inference
3. **Text Generation WebUI** - Web interface for local models
4. **Custom inference server** - Your own setup

Just update the `generateAIResponse` function in `server.js` to call your preferred local LLM API.

## Recommended Setup

For best performance without Ollama:

1. **Use ChromaDB** for vector storage (better context)
2. **Keep embeddings local** (fast, no API keys)
3. **Use a faster local LLM** like:
   - llama.cpp with a quantized model
   - LM Studio with a small model
   - Or keep the transformer model (slower but works)

## Troubleshooting

### "Model download failed"

The first run downloads models (~500MB total). Be patient and ensure you have internet for the initial download.

### "Out of memory"

Local models use more RAM. Try:
- Using a smaller model
- Closing other applications
- Using a quantized model

### "Too slow"

Local inference is slower. Options:
- Use a quantized model
- Use GPU acceleration (if available)
- Use Ollama (faster but requires Ollama setup)

