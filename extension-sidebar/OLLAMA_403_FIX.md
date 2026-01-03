# Fixing Ollama 403 Forbidden Error

## Problem
Getting "403 Forbidden" error when trying to run analysis with Ollama.

## Common Causes

### 1. Ollama Not Running or Wrong Port
**Check if Ollama is running:**
```bash
curl http://localhost:11434/api/tags
```

If this fails, Ollama might not be running or on a different port.

**Solution:**
```bash
ollama serve
```

### 2. Ollama Requires Authentication
Some Ollama configurations require API keys.

**Check if Ollama has authentication enabled:**
```bash
# Check Ollama environment variables
env | grep OLLAMA
```

**Solution:**
- If `OLLAMA_API_KEY` is set, you may need to disable it for local use
- Or configure Ollama to allow localhost without authentication

### 3. CORS Issues
Chrome extensions making requests to localhost can sometimes hit CORS issues.

**Solution:**
- Make sure Ollama is configured to accept requests from localhost
- Try running: `ollama serve --host 0.0.0.0`

### 4. Ollama Version/Configuration
Some Ollama versions or configurations might block certain requests.

**Check Ollama version:**
```bash
ollama --version
```

**Solution:**
- Update Ollama: `ollama update`
- Check Ollama configuration file (usually `~/.ollama/config.json`)

### 5. Firewall or Security Software
Firewall or security software might be blocking the connection.

**Solution:**
- Check firewall settings
- Temporarily disable security software to test

## Quick Tests

### Test 1: Direct API Call
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [{"role": "user", "content": "test"}],
  "stream": false
}'
```

If this works, the issue is with the extension. If it fails with 403, it's an Ollama configuration issue.

### Test 2: Check Ollama Logs
```bash
# In the terminal where Ollama is running, check for errors
# Or check Ollama logs
```

### Test 3: Test with Different Port
If Ollama is running on a different port, update `OLLAMA_BASE_URL` in `src/background.ts`:
```typescript
const OLLAMA_BASE_URL = 'http://localhost:YOUR_PORT';
```

## Solutions

### Solution 1: Restart Ollama
```bash
# Stop Ollama (Ctrl+C if running in terminal)
# Then restart:
ollama serve
```

### Solution 2: Reset Ollama Configuration
```bash
# Remove Ollama config (backup first!)
mv ~/.ollama/config.json ~/.ollama/config.json.backup
# Restart Ollama
ollama serve
```

### Solution 3: Check Extension Permissions
Make sure the extension has the correct permissions in `manifest.json`:
```json
"host_permissions": [
  "http://localhost:11434/*",
  "http://127.0.0.1:11434/*"
]
```

### Solution 4: Use 127.0.0.1 Instead of localhost
Sometimes `localhost` can cause issues. Try updating the URL:
```typescript
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
```

## Debugging Steps

1. **Check browser console**:
   - Open extension service worker console
   - Look for detailed error messages

2. **Check Ollama logs**:
   - Look at the terminal where Ollama is running
   - Check for any error messages

3. **Test with curl**:
   - Use the curl command above to test if Ollama API works directly

4. **Check network tab**:
   - Open browser DevTools → Network tab
   - Try running analysis
   - Check the failed request for details

## Still Not Working?

If none of these solutions work:

1. **Check Ollama documentation** for your specific version
2. **Try a different Ollama model** (might be model-specific issue)
3. **Reinstall Ollama**:
   ```bash
   # Backup your models first!
   # Then reinstall Ollama
   ```

4. **Check if other tools can connect** to Ollama (like Postman or another client)

