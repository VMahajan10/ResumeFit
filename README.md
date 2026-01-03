# ResumeFit

A modern, production-ready frontend for AI-powered resume optimization. Built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- **Resume Input**: Paste text or upload PDF/DOCX files
- **Job Description Input**: Paste text or enter job URL
- **Analysis Results**: Compatibility score, missing keywords, and suggested edits
- **Interactive Chat**: Chat interface for resume questions
- **Draft Management**: Edit and manage your resume draft
- **Responsive Design**: Works on desktop and mobile devices
- **Chrome Extension**: Optional browser extension for local AI analysis (see `extension/` folder)

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
ResumeFit/
├── app/
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Main page component
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## Deployment

This project is ready to deploy to Vercel:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Deploy!

Or use the Vercel CLI:
```bash
npm i -g vercel
vercel
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Chrome Extension (Optional)

For local AI analysis using Ollama, install the ResumeFit Bridge Chrome extension:

1. See `extension/README.md` for full installation instructions
2. Quick start: Load the `extension/` folder as an unpacked extension in Chrome
3. The extension connects the web app to local Ollama for AI-powered analysis

## Notes

- File upload supports PDF and DOCX parsing (client-side)
- Chat functionality uses local echo (no backend)
- AI analysis requires the Chrome extension and local Ollama installation

