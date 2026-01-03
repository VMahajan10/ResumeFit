# Quick Start Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Build the Extension

```bash
npm run build
```

This creates the `dist/` folder with all necessary files.

## 3. Load in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `dist` folder
5. Done! Click the extension icon to toggle the sidebar

## File Tree After Build

```
dist/
├── background.js
├── contentScript.js
├── sidebar.js
├── sidebar.html
├── sidebar.css
├── manifest.json
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development

For auto-rebuild during development:

```bash
npm run dev
```

Then reload the extension in Chrome after each change.

