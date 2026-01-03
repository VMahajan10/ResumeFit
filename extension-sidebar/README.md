# ResumeFit Sidebar Chrome Extension

A Chrome Extension (Manifest V3) that injects a persistent right-side sidebar UI into any webpage for resume optimization and job matching.

## Features

- **Persistent Sidebar**: Right-side iframe sidebar (380px width) that persists while browsing
- **Job Page Extraction**: Extract job descriptions from any webpage with one click
- **Resume Management**: Large textarea for pasting and saving resume text
- **Chat Interface**: Local chat message storage (AI integration coming soon)
- **Draft Resume Preview**: View current draft resume
- **State Persistence**: All data saved to `chrome.storage.local`

## Project Structure

```
extension-sidebar/
├── src/
│   ├── background.ts          # Service worker
│   ├── contentScript.ts      # Injects sidebar iframe
│   ├── types.ts              # Shared TypeScript types
│   └── sidebar/
│       ├── sidebar.html      # Sidebar UI HTML
│       ├── sidebar.css       # Sidebar styles
│       └── sidebar.ts        # Sidebar logic
├── icons/                    # Extension icons (16x16, 48x48, 128x128)
├── manifest.json             # Extension manifest
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts           # Vite build configuration
└── dist/                     # Built extension (generated)
```

## Prerequisites

- Node.js 18+ and npm
- Chrome browser (or Chromium-based)
- TypeScript knowledge (optional, for development)

## Installation & Build

### Step 1: Install Dependencies

```bash
cd extension-sidebar
npm install
```

### Step 2: Build the Extension

```bash
npm run build
```

This will:
- Compile TypeScript files to JavaScript
- Bundle files using Vite
- Copy static files (HTML, CSS, manifest, icons) to `dist/` folder
- Output files:
  - `dist/background.js`
  - `dist/contentScript.js`
  - `dist/sidebar.js`
  - `dist/sidebar.html`
  - `dist/sidebar.css`
  - `dist/manifest.json`
  - `dist/icons/*`

### Step 3: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist` folder (not the `extension-sidebar` folder)
5. The extension should now appear in your extensions list

### Step 4: Verify Installation

- You should see "ResumeFit Sidebar" in your extensions list
- The extension icon should appear in your Chrome toolbar
- Click the icon to toggle the sidebar on any webpage

## Development

### Watch Mode

For development with auto-rebuild:

```bash
npm run dev
```

This will watch for file changes and rebuild automatically. After rebuilding:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the ResumeFit Sidebar extension
3. Reload the webpage you're testing on

### File Structure Details

- **background.ts**: Service worker that handles:
  - Extension icon click (toggles sidebar)
  - Job text extraction requests
  - State storage/retrieval
  - Message passing between components

- **contentScript.ts**: Injected into every page, handles:
  - Creating and managing sidebar iframe
  - Adjusting page content to make room for sidebar
  - Message passing between sidebar and background

- **sidebar.ts**: Sidebar UI logic:
  - State management
  - UI event handlers
  - Communication with background via postMessage
  - Local storage operations

## Usage

### Opening the Sidebar

1. Navigate to any webpage
2. Click the **ResumeFit Sidebar** extension icon
3. The sidebar will appear on the right side of the page
4. Click the icon again to toggle it off

### Extracting Job Descriptions

1. Navigate to a job posting page (LinkedIn, Indeed, company career pages, etc.)
2. Open the sidebar
3. Click **"Use This Page as Job"** button
4. The extension will:
   - Extract visible text from the page
   - Save the page URL
   - Display a preview (first 800 characters)
   - Store the full text in extension state

### Managing Resume

1. Open the sidebar
2. Paste your resume text into the **Resume** textarea
3. Click **"Save Resume Text"** or it will auto-save after 1 second of inactivity
4. Your resume is saved to `chrome.storage.local`

### Chat (Local Storage)

1. Type a message in the chat input
2. Press Enter or click **Send**
3. Messages are stored locally (no AI yet)
4. Chat history persists across sessions

### Draft Resume

- Initially mirrors your saved resume text
- Will be updated with optimized versions in future updates
- Read-only preview area

### Run Analysis

- Currently shows "Coming next prompt" message
- Will be wired to AI analysis in future updates
- Requires both job text and resume text to be saved

## Data Storage

All data is stored in `chrome.storage.local` under the key `resumeFitState`:

```typescript
{
  jobText: string;        // Extracted job description
  jobUrl: string;         // URL of job page
  resumeText: string;     // User's resume text
  chatHistory: Array<{    // Chat messages
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  currentDraft: string;   // Current draft resume
}
```

## Message Passing Architecture

```
Sidebar (iframe) 
  ↕ postMessage
Content Script 
  ↕ chrome.runtime.sendMessage
Background Service Worker
  ↕ chrome.scripting.executeScript
Page Context (for extraction)
```

## Troubleshooting

### Build Errors

- **"Cannot find module 'vite-plugin-static-copy'"**: Run `npm install` again
- **TypeScript errors**: Check `tsconfig.json` and ensure `@types/chrome` is installed
- **"Cannot find module"**: Ensure all imports use correct paths

### Extension Not Loading

- Make sure you're loading the `dist` folder, not `extension-sidebar`
- Check `chrome://extensions/` for error messages
- Verify `manifest.json` is in the `dist` folder
- Check browser console (F12) for errors

### Sidebar Not Appearing

- Check content script is loaded: `chrome://extensions/` → ResumeFit Sidebar → Details → Inspect views
- Check browser console (F12) for JavaScript errors
- Verify you're not on a `chrome://` or `chrome-extension://` page (sidebar won't inject there)
- Try reloading the extension and refreshing the page

### Job Extraction Not Working

- Some pages may block content extraction
- Check browser console for errors
- Try a different job board
- Verify the page has visible text content

### State Not Persisting

- Check Chrome storage: `chrome://extensions/` → ResumeFit Sidebar → Details → Inspect views → Service worker → Application tab → Storage
- Clear storage and try again if needed
- Ensure you're not in incognito mode

## Debugging

### Content Script

1. Open any webpage
2. Right-click → Inspect
3. Go to Console tab
4. Look for "ResumeFit Sidebar content script loaded"

### Background Script

1. Go to `chrome://extensions/`
2. Find ResumeFit Sidebar
3. Click **Details**
4. Click **Inspect views: service worker**
5. Check Console tab for logs

### Sidebar (iframe)

1. Open sidebar on any page
2. Right-click inside the sidebar
3. Select **Inspect**
4. Check Console tab for logs

## Browser Compatibility

- **Chrome**: 88+ (Manifest V3 support)
- **Edge**: 88+ (Chromium-based)
- **Other Chromium browsers**: May work if they support Manifest V3

## Next Steps

Future enhancements:
- AI-powered resume analysis
- Integration with local Ollama or cloud AI
- PDF export functionality
- File upload for resume
- Enhanced job extraction with better selectors
- Real-time chat with AI assistant

## License

MIT

