# PDF Worker Fix

## Problem
PDF.js tries to load the worker from a CDN, which Chrome extensions block due to Content Security Policy.

## Solution
The worker file is now copied locally and loaded from the extension.

## Setup Steps

1. **Install dependencies** (if not already done):
   ```bash
   cd extension-sidebar
   npm install
   ```

2. **Verify PDF.js worker file exists**:
   ```bash
   ls node_modules/pdfjs-dist/build/pdf.worker*
   ```
   
   You should see files like:
   - `pdf.worker.min.js` or
   - `pdf.worker.min.mjs`

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Verify worker file is copied**:
   ```bash
   ls dist/pdf.worker.min.js
   ```
   
   This file should exist in the `dist/` folder.

5. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Find "ResumeFit Sidebar"
   - Click the refresh icon (🔄)

## If Worker File is Missing

If the worker file doesn't exist after build:

1. **Check if pdfjs-dist is installed**:
   ```bash
   npm list pdfjs-dist
   ```

2. **Reinstall if needed**:
   ```bash
   npm install pdfjs-dist@^3.11.174
   ```

3. **Check the actual worker file name**:
   ```bash
   find node_modules/pdfjs-dist -name "*worker*.js" -o -name "*worker*.mjs"
   ```

4. **Update vite.config.ts** if the file name is different:
   - Look for the actual worker file name
   - Update the `src` path in vite.config.ts to match

## Alternative: Disable Worker (Not Recommended)

If you can't get the worker file to work, you can disable it (slower but works):

In `src/sidebar/sidebar.ts`, change:
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
```

To:
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = false; // Disable worker (runs in main thread)
```

This will work but be slower for large PDFs.

## Verification

After setup, test PDF upload:
1. Open the extension sidebar
2. Click "Upload Resume"
3. Select a PDF file
4. It should process without the worker error

