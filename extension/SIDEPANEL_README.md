# ResumeFit Chrome Extension - Side Panel Version

A Chrome Extension (Manifest V3) that uses a Side Panel as the main UI for resume optimization and job matching.

## Features

- **Side Panel Interface**: Main UI opens in Chrome's side panel, persisting while browsing
- **Job Detection**: Automatically detects and extracts job descriptions from any webpage
- **Resume Management**: Large textarea for pasting and managing resume text
- **State Persistence**: Saves job text, resume text, and draft resume across sessions
- **Extension-Only MVP**: Works standalone without requiring a website

## Installation

### Step 1: Enable Developer Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)

### Step 2: Load the Extension

1. Click the **Load unpacked** button
2. Navigate to the `extension` folder in this project
3. Select the folder and click **Select Folder** (or **Open** on Mac)

### Step 3: Verify Installation

1. You should see "ResumeFit" appear in your extensions list
2. The extension icon should appear in your Chrome toolbar
3. Click the extension icon to open the side panel

## Usage

### Opening the Side Panel

- **Click the extension icon** in the Chrome toolbar
- The side panel will open on the right side of your browser
- The panel will persist while you browse different pages

### Extracting Job Descriptions

1. Navigate to any job posting page (LinkedIn, Indeed, company career pages, etc.)
2. The side panel will automatically show the page title and URL
3. Click the **"Extract Job Description"** button
4. The extension will extract visible text from the page
5. The job description text is saved in extension state

### Managing Your Resume

1. In the **Resume** section, paste your resume text into the large textarea
2. Your resume text is automatically saved as you type
3. The text persists across browser sessions

### Analyzing Fit (Coming Soon)

- The **"Analyze Fit"** button is currently disabled
- It will be enabled when both job description and resume text are available
- Future updates will add AI-powered analysis functionality

### Placeholder Sections

The following sections are prepared for future features:
- **Compatibility Score**: Will show a match percentage
- **Missing Keywords**: Will list important keywords from the job description
- **Suggested Edits**: Will provide recommendations for improving your resume
- **Chat Panel**: Will enable interactive resume optimization
- **Current Draft Resume**: Will show the optimized resume version
- **Download PDF**: Will allow exporting the optimized resume

## File Structure

```
extension/
├── manifest.json          # Extension manifest (Manifest V3 with side panel)
├── background.js          # Service worker (handles side panel, messaging)
├── content.js            # Content script (extracts job descriptions)
├── sidepanel.html         # Side panel UI
├── sidepanel.js           # Side panel logic and state management
├── icon16.png             # Extension icon (16x16)
├── icon48.png             # Extension icon (48x48)
└── icon128.png            # Extension icon (128x128)
```

## How It Works

### Side Panel API

- Uses Chrome's Side Panel API (Manifest V3)
- Opens automatically when clicking the extension icon
- Persists across page navigations
- No popup required

### Job Extraction

1. Content script runs on all web pages
2. When "Extract Job Description" is clicked, it:
   - Finds job description elements using common selectors
   - Falls back to main content area if specific selectors aren't found
   - Extracts visible text and removes scripts/styles
   - Returns page title, URL, and extracted text

### State Management

- Uses Chrome's `storage.local` API
- Stores:
  - `jobText`: Extracted job description
  - `resumeText`: User's resume text
  - `currentDraftResume`: Optimized resume draft
  - `pageTitle` and `pageUrl`: Current page information
- State persists across browser restarts

## Troubleshooting

### Side Panel Doesn't Open

- Ensure you're using Chrome 114+ (Side Panel API requires Chrome 114+)
- Check that Developer mode is enabled
- Try reloading the extension: `chrome://extensions/` → Click refresh icon
- Check the browser console for errors

### Job Extraction Fails

- Some pages may block content extraction
- Try a different job board or company website
- Check browser console (F12) for error messages
- Ensure you're on a regular webpage (not chrome:// pages)

### State Not Persisting

- Check Chrome storage: `chrome://extensions/` → ResumeFit → Details → Inspect views → Service worker
- Clear storage and try again if needed
- Ensure you're not in incognito mode (extensions may have limited storage)

### Extension Not Working

1. Go to `chrome://extensions/`
2. Find "ResumeFit"
3. Click **Details**
4. Check for any error messages
5. Click **Inspect views: service worker** to see background script logs
6. Reload the extension if needed

## Development

### Making Changes

1. Edit the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the ResumeFit extension
4. The side panel will reload automatically

### Debugging

- **Side Panel**: Right-click in the side panel → Inspect
- **Background Script**: `chrome://extensions/` → ResumeFit → Details → Inspect views → Service worker
- **Content Script**: Right-click on any webpage → Inspect → Console tab

### Testing Job Extraction

1. Navigate to a job posting page
2. Open the side panel
3. Click "Extract Job Description"
4. Check the status message for success/error
5. Verify the job text is saved (refresh page and check if it persists)

## Browser Compatibility

- **Chrome**: 114+ (required for Side Panel API)
- **Edge**: 114+ (Chromium-based)
- **Other Chromium browsers**: May work if they support Side Panel API

## Next Steps

This is an MVP version. Future enhancements will include:
- AI-powered resume analysis
- Compatibility scoring
- Keyword extraction and suggestions
- Interactive chat for resume optimization
- PDF export functionality
- Integration with local AI services (Ollama)

## License

MIT

