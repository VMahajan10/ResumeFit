# Troubleshooting ResumeFit AI Bridge Extension

## "Connection failed" Error

If you see "✗ Connection failed" when testing the Ollama connection, try these steps:

### 1. Verify Ollama is Running

Open a terminal and check:

```bash
# Check if Ollama is running
ps aux | grep ollama

# Test Ollama API directly
curl http://127.0.0.1:11434/api/tags
```

If Ollama is not running, start it:

```bash
ollama serve
```

Or if installed via Homebrew:

```bash
brew services start ollama
```

### 2. Check Model is Available

```bash
# List available models
ollama list

# If llama3.1 is not listed, pull it
ollama pull llama3.1
```

### 3. Reload the Extension

After making changes or if connection fails:

1. Go to `chrome://extensions/`
2. Find "ResumeFit AI Bridge"
3. Click the **refresh/reload icon** (circular arrow)
4. Try testing the connection again

### 4. Check Extension Console

1. Go to `chrome://extensions/`
2. Find "ResumeFit AI Bridge"
3. Click **"Service worker"** or **"Inspect views: background page"**
4. Check the console for error messages
5. Look for any CORS or network errors

### 5. Verify Host Permissions

The extension needs permission to access `http://127.0.0.1:11434/*`. 

1. Go to `chrome://extensions/`
2. Find "ResumeFit AI Bridge"
3. Click **"Details"**
4. Scroll to **"Site access"** or **"Host permissions"**
5. Ensure `http://127.0.0.1:11434/*` is listed

### 6. Test with Different URL

If `127.0.0.1` doesn't work, try `localhost`:

1. Edit `extension/background.js`
2. Change `OLLAMA_BASE_URL` from `http://127.0.0.1:11434` to `http://localhost:11434`
3. Reload the extension

### 7. Check Firewall/Security Software

Some security software or firewalls may block localhost connections. Temporarily disable to test.

### 8. Manual Test

Test the connection manually in the browser console:

1. Open the extension popup
2. Right-click → Inspect
3. In the console, run:

```javascript
fetch('http://127.0.0.1:11434/api/tags')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

If this works but the extension doesn't, there's a permission issue.

## Common Error Messages

### "Cannot reach Ollama at http://127.0.0.1:11434"
- **Solution**: Start Ollama with `ollama serve`

### "Model 'llama3.1' not found"
- **Solution**: Pull the model with `ollama pull llama3.1`

### "Extension error: Could not establish connection"
- **Solution**: Reload the extension

### "Failed to fetch" or "NetworkError"
- **Solution**: Check if Ollama is running and accessible

## Still Having Issues?

1. Check the browser console for errors
2. Check the extension service worker console
3. Verify Ollama is accessible: `curl http://127.0.0.1:11434/api/tags`
4. Try restarting Chrome completely
5. Make sure you're using the latest version of the extension

