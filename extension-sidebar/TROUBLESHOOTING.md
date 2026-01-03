# Troubleshooting Guide

## Common Issues and Solutions

### "Could not establish connection. Receiving end does not exist"

**Problem**: Error when clicking the extension icon to toggle sidebar.

**Causes**:
1. Content script hasn't loaded yet
2. Page doesn't allow content scripts (chrome:// pages)
3. Extension needs to be reloaded

**Solutions**:

1. **Reload the extension**:
   - Go to `chrome://extensions/`
   - Find "ResumeFit Sidebar"
   - Click the refresh icon (🔄)

2. **Reload the webpage**:
   - Refresh the page you're trying to use the extension on
   - Then click the extension icon again

3. **Check the page type**:
   - The extension doesn't work on `chrome://` pages
   - Make sure you're on a regular website (http:// or https://)

4. **Check browser console**:
   - Right-click on the page → Inspect → Console tab
   - Look for errors from the content script
   - Should see: "ResumeFit Sidebar content script loaded"

5. **Rebuild the extension**:
   ```bash
   cd extension-sidebar
   npm run build
   ```
   Then reload the extension in Chrome

### Sidebar Doesn't Appear

**Problem**: Clicking extension icon doesn't show sidebar.

**Solutions**:

1. **Check content script is loaded**:
   - Right-click page → Inspect → Console
   - Look for "ResumeFit Sidebar content script loaded"

2. **Check for JavaScript errors**:
   - Open browser console (F12)
   - Look for red error messages

3. **Try a different website**:
   - Some sites may block content scripts
   - Try on a simple site like google.com

4. **Check extension permissions**:
   - Go to `chrome://extensions/`
   - Find ResumeFit Sidebar
   - Click "Details"
   - Ensure "Allow access to file URLs" is enabled if needed

### File Upload Not Working

**Problem**: Can't upload resume files.

**Solutions**:

1. **Install dependencies**:
   ```bash
   cd extension-sidebar
   npm install
   npm run build
   ```

2. **Check file type**:
   - Only PDF, DOCX, and TXT files are supported
   - Make sure file extension is correct

3. **Check browser console**:
   - Look for errors when uploading
   - PDF.js worker needs internet connection (loads from CDN)

### Ollama Connection Errors

**Problem**: "Ollama not running" error.

**Solutions**:

1. **Start Ollama**:
   ```bash
   ollama serve
   ```

2. **Pull the model**:
   ```bash
   ollama pull llama3.1
   ```

3. **Verify Ollama is running**:
   ```bash
   curl http://localhost:11434/api/tags
   ```

4. **Check firewall**:
   - Ensure localhost:11434 is accessible
   - Check firewall settings

### Extension Not Loading

**Problem**: Extension shows errors in chrome://extensions/

**Solutions**:

1. **Check manifest.json**:
   - Ensure it's in the `dist/` folder
   - Verify all required files are present

2. **Check file paths**:
   - All paths in manifest.json should be correct
   - Files should exist in `dist/` folder

3. **Rebuild**:
   ```bash
   cd extension-sidebar
   npm run build
   ```
   Then reload extension

### State Not Persisting

**Problem**: Data lost when closing/reopening sidebar.

**Solutions**:

1. **Check Chrome storage**:
   - Go to `chrome://extensions/`
   - ResumeFit Sidebar → Details
   - Inspect views → Service worker
   - Application tab → Storage → Local Storage

2. **Clear and retry**:
   - Clear extension storage if corrupted
   - Reload extension

### Build Errors

**Problem**: `npm run build` fails.

**Solutions**:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Check Node.js version**:
   - Requires Node.js 18+
   - Check: `node --version`

3. **Clear node_modules**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Debugging Tips

### Check Background Script Logs

1. Go to `chrome://extensions/`
2. Find ResumeFit Sidebar
3. Click "Details"
4. Click "Inspect views: service worker"
5. Check Console tab for logs

### Check Content Script Logs

1. Right-click on any webpage
2. Select "Inspect"
3. Go to Console tab
4. Look for extension logs

### Check Sidebar Logs

1. Open sidebar on a page
2. Right-click inside the sidebar
3. Select "Inspect"
4. Check Console tab

## Still Having Issues?

1. **Check all files are built**:
   - `dist/background.js`
   - `dist/contentScript.js`
   - `dist/sidebar.js`
   - `dist/sidebar.html`
   - `dist/sidebar.css`
   - `dist/manifest.json`

2. **Verify permissions**:
   - Check manifest.json has all required permissions
   - Ensure host_permissions include needed URLs

3. **Test on a fresh page**:
   - Open a new tab
   - Navigate to a simple site (like google.com)
   - Try the extension

4. **Reinstall extension**:
   - Remove extension from Chrome
   - Rebuild: `npm run build`
   - Load unpacked from `dist/` folder again

