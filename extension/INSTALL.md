# ResumeFit AI Bridge - Installation Instructions

## Load Unpacked Extension in Chrome

### Step 1: Open Chrome Extensions Page

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
   - Or: Click the three-dot menu (⋮) → Extensions → Manage Extensions

### Step 2: Enable Developer Mode

1. Look for the "Developer mode" toggle in the top-right corner
2. Toggle it **ON** (it will turn blue)

### Step 3: Load the Extension

1. Click the **"Load unpacked"** button (appears after enabling Developer mode)
2. Navigate to the `extension` folder in this project:
   ```
   /Users/mahajans/ResumeFit/extension
   ```
3. Select the folder and click **"Select"** (or "Open" on some systems)

### Step 4: Verify Installation

- You should see "ResumeFit AI Bridge" in your extensions list
- The extension icon should appear in your Chrome toolbar
- Click the icon to open the popup and test the connection

## First-Time Setup

### 1. Start Ollama

Make sure Ollama is running on your machine:

```bash
ollama serve
```

Or if installed via Homebrew:

```bash
brew services start ollama
```

### 2. Pull Required Model

```bash
ollama pull llama3.1
```

Or use a different model and update the `OLLAMA_MODEL` constant in `background.js`.

### 3. Test Connection

1. Click the ResumeFit AI Bridge extension icon
2. Click "Test Ollama Connection"
3. You should see a green success message if everything is working

## Troubleshooting

**Extension not appearing?**
- Make sure you selected the `extension` folder (not the parent ResumeFit folder)
- Check that Developer mode is enabled
- Refresh the extensions page

**"Cannot connect to Ollama" error?**
- Ensure Ollama is running: `ollama serve`
- Verify Ollama is accessible: Open `http://127.0.0.1:11434/api/tags` in your browser
- Check firewall settings

**"Model not found" error?**
- Pull the model: `ollama pull llama3.1`
- List available models: `ollama list`
- Update the model name in the extension popup or `background.js`

**Extension not working on ResumeFit website?**
- Make sure you're on `http://localhost:3000` or the production domain
- Check browser console for errors (F12 → Console)
- Verify the content script is loaded (Extensions → ResumeFit AI Bridge → Details → Inspect views)

## Updating the Extension

After making changes to extension files:

1. Go to `chrome://extensions/`
2. Find "ResumeFit AI Bridge"
3. Click the refresh/reload icon (circular arrow)
4. The extension will reload with your changes

## Permissions Explained

- **activeTab**: Allows the extension to access the current tab when you interact with it
- **scripting**: Allows injection of content scripts
- **storage**: Saves your model preference
- **host_permissions**: Allows API calls to your local Ollama server

These permissions are requested when you first install the extension.

