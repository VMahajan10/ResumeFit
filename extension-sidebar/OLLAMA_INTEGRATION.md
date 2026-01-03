# Ollama Integration Guide

This document explains how the ResumeFit Sidebar extension integrates with local Ollama for AI-powered resume analysis.

## Overview

The extension connects to a local Ollama instance running at `http://localhost:11434` to analyze resumes against job descriptions. All processing happens locally - no data is sent to external servers.

## Architecture

```
Sidebar UI (sidebar.ts)
  ↕ postMessage
Content Script (contentScript.ts)
  ↕ chrome.runtime.sendMessage
Background Service Worker (background.ts)
  ↕ fetch API
Local Ollama API (http://localhost:11434)
```

## Flow

1. **User clicks "Run Analysis"** in the sidebar
2. **Sidebar** sends `RUN_ANALYSIS` message via postMessage
3. **Content Script** forwards message to background script
4. **Background Script** calls Ollama API with resume and job text
5. **Ollama** processes the request and returns JSON
6. **Background Script** validates JSON schema
7. **Response** flows back through content script to sidebar
8. **Sidebar** displays results and saves to state

## Configuration

### Ollama Setup

1. **Install Ollama**: https://ollama.ai
2. **Start Ollama**: `ollama serve` (runs on port 11434 by default)
3. **Pull model**: `ollama pull llama3.1`

### Extension Configuration

- **Model**: `llama3.1` (defined in `background.ts` as `MODEL_NAME`)
- **Base URL**: `http://localhost:11434` (defined in `background.ts` as `OLLAMA_BASE_URL`)
- **Permissions**: Added to `manifest.json`:
  ```json
  "host_permissions": [
    "http://localhost:11434/*",
    "http://127.0.0.1:11434/*"
  ]
  ```

## JSON Schema

The extension enforces a strict JSON schema for Ollama responses:

```typescript
{
  "score": number,              // 0-100 compatibility score
  "matched_keywords": string[], // Keywords from job found in resume
  "missing_keywords": string[], // Keywords from job missing in resume
  "suggested_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": string | null,
      "after": string,
      "reason": string
    }
  ],
  "updated_draft": string        // Complete updated resume
}
```

## System Prompt

The extension uses a system prompt that enforces JSON-only output:

```
You are a resume analysis expert. Analyze the resume against the job description and return ONLY valid JSON. No explanations, no markdown, no code blocks, just raw JSON.

Return exactly this JSON structure:
{...schema...}

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.
```

## Error Handling

### Ollama Not Running
- **Error**: Network fetch fails
- **Message**: "Ollama not running. Please install and run Ollama, then run: ollama pull llama3.1"

### Model Not Found
- **Error**: HTTP 404 from Ollama API
- **Message**: "Model 'llama3.1' not found. Run: ollama pull llama3.1"

### Invalid JSON
- **Action**: Retry once with stricter prompt
- **Strict Prompt**: "Return ONLY valid JSON. No explanation."

### Schema Validation Failure
- **Error**: Response doesn't match expected schema
- **Message**: "Invalid response schema: [specific field error]"

## Validation

The `validateAnalysisResult()` function in `background.ts` ensures:
- `score` is a number between 0-100
- `matched_keywords` is an array of strings
- `missing_keywords` is an array of strings
- `suggested_edits` is an array with correct structure
- Each edit has valid `section`, `before`, `after`, and `reason`
- `updated_draft` is a string

## State Persistence

Analysis results are saved to `chrome.storage.local`:
- Stored in `ExtensionState.analysisResult`
- Restored when sidebar reopens
- Used to populate UI without re-running analysis

## UI Updates

When analysis completes successfully:

1. **Compatibility Score**: Large display showing 0-100 score
2. **Missing Keywords**: Tag list of keywords to add
3. **Suggested Edits**: Cards showing:
   - Section badge (summary/experience/skills)
   - Before/After comparison
   - Reason for the edit
4. **Current Draft Resume**: Updated with `updated_draft` from analysis

## Testing

### Test Ollama Connection

1. Ensure Ollama is running: `ollama serve`
2. Verify model is available: `ollama list`
3. Test API manually:
   ```bash
   curl http://localhost:11434/api/chat -d '{
     "model": "llama3.1",
     "messages": [{"role": "user", "content": "test"}],
     "stream": false
   }'
   ```

### Test Extension

1. Load extension in Chrome
2. Extract a job description
3. Paste resume text
4. Click "Run Analysis"
5. Verify results display correctly

## Troubleshooting

### "Ollama not running"
- Check Ollama is running: `ollama serve`
- Verify port 11434 is accessible
- Check firewall settings

### "Model not found"
- Pull the model: `ollama pull llama3.1`
- Verify with: `ollama list`
- Update `MODEL_NAME` in `background.ts` if using different model

### "Invalid JSON" or "Invalid response schema"
- Model may be returning markdown or prose
- Check Ollama logs for full response
- Try a different model (e.g., `llama3.2`, `mistral`)
- Update system prompt if needed

### Analysis takes too long
- Default timeout: 60 seconds
- Consider using a smaller/faster model
- Reduce resume or job description length

## Code Locations

- **Ollama Client**: `src/background.ts` - `runAnalysis()`, `callOllama()`
- **JSON Validation**: `src/background.ts` - `validateAnalysisResult()`
- **UI Display**: `src/sidebar/sidebar.ts` - `displayAnalysisResults()`
- **Types**: `src/types.ts` - `AnalysisResult`, `SuggestedEdit`
- **Message Handling**: `src/contentScript.ts` - Forwards `RUN_ANALYSIS` messages

## Future Enhancements

- Configurable model selection in UI
- Streaming responses for real-time updates
- Multiple model support
- Analysis history
- Export analysis results

