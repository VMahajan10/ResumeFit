# Chrome Extension Setup Guide

Follow these steps to load the ResumeFit Sidebar extension in Google Chrome.

## Prerequisites

- Google Chrome browser installed
- Node.js and npm installed (for building)

## Step-by-Step Instructions

### Step 1: Install Dependencies

Open a terminal in the `extension-sidebar` folder and run:

```bash
cd extension-sidebar
npm install
```

This will install all required packages (TypeScript, Vite, etc.).

### Step 2: Build the Extension

Build the extension to create the `dist` folder:

```bash
npm run build
```

You should see output like:
```
vite v5.x.x building for production...
✓ built in X.XXs
```

After this completes, you'll have a `dist/` folder with all the compiled files.

### Step 3: Open Chrome Extensions Page

1. Open Google Chrome
2. In the address bar, type: `chrome://extensions/`
3. Press Enter

Alternatively:
- Click the three dots menu (⋮) in the top-right
- Go to **Extensions** → **Manage extensions**

### Step 4: Enable Developer Mode

1. Look for the **Developer mode** toggle in the top-right corner of the extensions page
2. Toggle it **ON** (it should turn blue/highlighted)

### Step 5: Load the Extension

1. Click the **"Load unpacked"** button (appears after enabling Developer mode)
2. A file browser window will open
3. Navigate to the `extension-sidebar` folder
4. **Select the `dist` folder** (NOT the `extension-sidebar` folder itself)
5. Click **"Select Folder"** (or **"Open"** on Mac)

### Step 6: Verify Installation

You should now see:
- ✅ "ResumeFit Sidebar" appears in your extensions list
- ✅ The extension icon appears in your Chrome toolbar (puzzle piece icon area)
- ✅ No error messages in red

### Step 7: Test the Extension

1. Navigate to any website (e.g., `https://www.google.com`)
2. Click the **ResumeFit Sidebar** extension icon in your toolbar
3. The sidebar should appear on the right side of the page
4. Click the icon again to toggle it off

## Troubleshooting

### "Load unpacked" button is grayed out
- Make sure **Developer mode** is enabled (toggle should be ON)

### "Manifest file is missing or unreadable"
- Make sure you selected the `dist` folder, not the `extension-sidebar` folder
- Verify that `dist/manifest.json` exists
- Try rebuilding: `npm run build`

### Extension appears but shows errors
1. Click **"Details"** under the extension
2. Look for error messages in red
3. Click **"Inspect views: service worker"** to see console errors
4. Check the browser console (F12) for errors

### Sidebar doesn't appear when clicking icon
- Check browser console (F12) for JavaScript errors
- Make sure you're on a regular webpage (not `chrome://` pages)
- Try reloading the extension: click the refresh icon (🔄) on the extensions page

### "Failed to load extension" error
- Check that all files are in the `dist` folder:
  - `background.js`
  - `contentScript.js`
  - `sidebar.js`
  - `sidebar.html`
  - `sidebar.css`
  - `manifest.json`
  - `icons/` folder with icon files

## Quick Reference

```bash
# Navigate to extension folder
cd extension-sidebar

# Install dependencies (first time only)
npm install

# Build the extension
npm run build

# For development (auto-rebuild on changes)
npm run dev
```

Then:
1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `dist` folder

## After Making Changes

If you modify the source code:

1. Rebuild: `npm run build`
2. Go to `chrome://extensions/`
3. Click the refresh icon (🔄) on the ResumeFit Sidebar extension
4. Reload the webpage you're testing on

## Uninstalling

To remove the extension:

1. Go to `chrome://extensions/`
2. Find "ResumeFit Sidebar"
3. Click **"Remove"**
4. Confirm removal

## Need Help?

- Check the browser console (F12) for errors
- Check the service worker console: Extensions → ResumeFit Sidebar → Details → Inspect views
- Review the `README.md` for more detailed troubleshooting

