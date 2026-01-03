# Quick Start Guide

## Load the Extension in Chrome

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or: Menu (⋮) → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to and select the `extension` folder
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "ResumeFit Bridge" in your extensions list
   - The extension icon should appear in your Chrome toolbar

## First-Time Setup

1. **Start Ollama**
   ```bash
   ollama serve
   ```

2. **Pull Required Model**
   ```bash
   ollama pull llama3.1
   ```

3. **Test Connection**
   - Click the ResumeFit Bridge extension icon
   - Click "Test Connection" in the popup
   - You should see a green success message

## Using the Extension

### Resume Analysis

1. Open ResumeFit web app (http://localhost:3000)
2. Paste/upload your resume
3. Paste job description
4. Click "Analyze Fit"
5. The extension automatically processes the request with Ollama

### Import Job Description

1. Navigate to any job posting (LinkedIn, Indeed, etc.)
2. Open ResumeFit web app
3. Go to Job Description section
4. Click "Job URL" tab
5. Click "Import from extension"
6. Job text will be automatically extracted and filled in

## Troubleshooting

**Extension not working?**
- Check that it's enabled in `chrome://extensions/`
- Verify the content script is loaded (check browser console)
- Make sure you're on a matching URL (localhost:3000 or resumefit.app)

**Ollama connection failed?**
- Ensure Ollama is running: `ollama serve`
- Test in extension popup
- Check firewall isn't blocking localhost:11434

**Job import not working?**
- Make sure you're on a job posting page
- Some sites may block content extraction
- Check browser console for errors

