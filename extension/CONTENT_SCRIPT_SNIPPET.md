# Minimal Content Script Snippet for Extension Bridge

This is the minimal content script code needed to bridge messages between the ResumeFit website and the extension's background script.

## Full Implementation

The complete content script is in `content.js`. Here's the minimal snippet for the messaging bridge:

```javascript
// Minimal Content Script Bridge
(function() {
  // Listen for messages from the website
  window.addEventListener('message', async (event) => {
    // Security: In production, verify event.origin matches your website
    if (event.data?.type === 'RESUMEFIT_ANALYZE') {
      const { resumeText, jobText, chatHistory } = event.data.payload || {};
      
      if (!resumeText || !jobText) {
        window.postMessage({
          type: 'RESUMEFIT_ANALYZE_RESULT',
          payload: { error: 'Missing resumeText or jobText' }
        }, '*');
        return;
      }

      // Send to background script
      chrome.runtime.sendMessage({
        type: 'RESUMEFIT_RUN_AI',
        payload: { resumeText, jobText, chatHistory }
      }, (response) => {
        // Send response back to website
        window.postMessage({
          type: 'RESUMEFIT_ANALYZE_RESULT',
          payload: response?.success ? response.result : { error: response?.error || 'Unknown error' }
        }, '*');
      });
    }
  });
})();
```

## How It Works

1. **Website sends request**: `window.postMessage({ type: 'RESUMEFIT_ANALYZE', payload: {...} })`
2. **Content script receives**: Listens for `RESUMEFIT_ANALYZE` messages
3. **Forwards to background**: Uses `chrome.runtime.sendMessage` to send to background script
4. **Background processes**: Calls Ollama API via `runResumeFitAI()`
5. **Response flows back**: Background → Content Script → Website via `window.postMessage`

## Security Note

In production, add origin verification:

```javascript
const ALLOWED_ORIGINS = ['http://localhost:3000', 'https://resumefit.app'];

if (!ALLOWED_ORIGINS.includes(event.origin)) {
  return; // Ignore messages from untrusted origins
}
```

## Integration

This snippet should be injected into pages where ResumeFit runs. The full `content.js` includes:
- Job description extraction
- Multiple message handlers
- Error handling
- Extension detection

See `content.js` for the complete implementation.

