# ResumeFit AI Bridge Chrome Extension

A Chrome extension (Manifest V3) that bridges the ResumeFit web app with local Ollama AI for resume analysis.

## Features

- **AI Analysis**: Connects ResumeFit to local Ollama for resume optimization
- **Job Scraping**: Extracts job descriptions from any webpage
- **Popup UI**: Test Ollama connection and scan job pages directly from the extension
- **Local Processing**: All AI processing happens locally, no data sent to external servers
- **Structured JSON**: Returns analysis with score, gaps, suggestions, updatedResume, projectIdeas, and chatReply

## Installation

See [INSTALL.md](./INSTALL.md) for detailed step-by-step instructions.

### Quick Start

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension` folder
5. Extension is ready to use!

### Prerequisites

- Chrome browser (or Chromium-based browser)
- Ollama installed and running locally at `http://127.0.0.1:11434`
- Ollama model pulled (default: `llama3.1`)

## Configuration

### Change Ollama Model

1. Click the extension icon
2. Enter your preferred model name (e.g., `mistral`, `llama2`)
3. Click "Test Connection" to verify
4. The model preference is saved automatically

### Update Model in Code

Edit `background.js` and change the `OLLAMA_MODEL` constant:

```javascript
const OLLAMA_MODEL = 'mistral'; // or your preferred model
```

## Usage

### Popup Features

- **Test Ollama Connection**: Verifies Ollama is running and the model is available
- **Scan Job Page**: Extracts job description text from the current webpage

### Resume Analysis

1. Open the ResumeFit web app (http://localhost:3000)
2. Paste or upload your resume
3. Paste the job description
4. Click "Request AI Review"
5. The extension will automatically:
   - Receive the analysis request via postMessage
   - Call Ollama API locally through background script
   - Return structured JSON results to the web app

### Job Description Import

1. Navigate to any job posting page (LinkedIn, Indeed, etc.)
2. Click the extension icon
3. Click "Scan Job Page"
4. The extracted text will appear in the popup
5. Copy and paste into ResumeFit, or use the "Import from extension" button in the web app

## API

### runResumeFitAI Function

The extension provides a `runResumeFitAI` function that can be called from the background script:

```javascript
const result = await runResumeFitAI({
  resumeText: "...",
  jobText: "...",
  chatHistory: [] // optional
});

// Returns:
{
  score: 85,
  gaps: ["TypeScript", "React"],
  suggestions: [...],
  updatedResume: "...",
  projectIdeas: [...],
  chatReply: "..."
}
```

### Website Communication

The website sends messages via `window.postMessage`:

```javascript
window.postMessage({
  type: 'RESUMEFIT_ANALYZE',
  payload: { resumeText, jobText, chatHistory }
}, '*');
```

The extension responds with:

```javascript
window.postMessage({
  type: 'RESUMEFIT_ANALYZE_RESULT',
  payload: { score, gaps, suggestions, updatedResume, projectIdeas, chatReply }
}, '*');
```

## Troubleshooting

### "Cannot connect to Ollama"

- Ensure Ollama is running: `ollama serve`
- Verify Ollama is accessible at `http://127.0.0.1:11434`
- Check that no firewall is blocking localhost connections
- Test in extension popup: Click "Test Ollama Connection"

### "Model not found"

- Pull the model: `ollama pull llama3.1`
- List available models: `ollama list`
- Update the model name in the extension popup or `background.js`

### Extension not working on ResumeFit site

- Verify the site URL matches the patterns in `manifest.json`
- Check browser console for errors (F12 → Console)
- Ensure the content script is loaded (Extensions → ResumeFit AI Bridge → Details → Inspect views)

### Job scraping not working

- Some sites may block content extraction
- Try a different job board
- Check browser console for errors
- Use the "Scan Job Page" button in the popup to test

## File Structure

```
extension/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker (Ollama API calls)
├── content.js         # Content script (job extraction, messaging)
├── popup.html         # Extension popup UI
├── popup.js           # Popup script
├── INSTALL.md         # Installation instructions
└── README.md          # This file
```

## Development

### Testing Changes

1. Make your changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the ResumeFit AI Bridge extension
4. Test the changes

### Debugging

- **Content Script**: Right-click on page → Inspect → Console
- **Background Script**: Go to `chrome://extensions/` → ResumeFit AI Bridge → Service worker → Inspect
- **Popup**: Right-click extension icon → Inspect popup

## Security Notes

- The extension only communicates with `http://127.0.0.1:11434` (your local Ollama)
- No data is sent to external servers
- Content script messages are currently accepted from any origin (for development)
- In production, consider adding origin verification in `content.js`

## License

MIT
