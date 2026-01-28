# Web Scraping + RAG Integration

## Overview

The ResumeFit AI service now includes a comprehensive web scraping endpoint that works seamlessly with the RAG (Retrieval Augmented Generation) system to extract **all** job requisition data from websites, including JavaScript-rendered content.

## How It Works

### 1. Web Scraping Endpoint (`/api/scrape-job`)

The server-side web scraper uses **Puppeteer** to:
- Handle JavaScript-rendered content (React, Vue, Angular, etc.)
- Automatically expand "Show More" buttons and hidden sections
- Scroll to load lazy-loaded content
- Extract structured data (JSON-LD) when available
- Use multiple extraction strategies for maximum coverage

**Features:**
- ✅ Handles dynamic content that client-side extraction misses
- ✅ Expands collapsible sections automatically
- ✅ Extracts structured metadata (JSON-LD job postings)
- ✅ Falls back to multiple extraction strategies
- ✅ Returns full page text if specific selectors fail

### 2. Extension Integration

The extension automatically:
1. **First tries server-side scraping** (if AI service is running)
   - Sends URL to `/api/scrape-job` endpoint
   - Gets comprehensive job text with all JavaScript-rendered content
   
2. **Falls back to client-side extraction** (if server unavailable)
   - Uses DOM selectors to extract visible text
   - Works for static pages or when server is down

### 3. RAG Integration Flow

```
Web Scraping → Job Text → Vector Store → RAG Retrieval → AI Analysis
```

1. **Scraped job text** is received by the extension
2. **Stored in vector store** via `storeJobChunks(sessionId, jobText, jobId)`
   - Text is chunked intelligently by section (requirements, skills, responsibilities, etc.)
   - Each chunk is embedded using OpenAI's `text-embedding-3-small`
   - Stored in session-specific in-memory vector store

3. **RAG retrieval** during analysis:
   - For each resume section, queries the vector store for relevant job requirements
   - Uses semantic similarity (cosine similarity on embeddings)
   - Retrieves top 10 most relevant job requirements per resume section
   - Combines all retrieved context for comprehensive analysis

4. **AI analysis** uses:
   - Full scraped job text (no limits)
   - RAG-retrieved relevant sections (semantic matches)
   - Full resume text (no limits)
   - RAG-retrieved relevant resume sections

## Benefits

### Complete Data Extraction
- **Before**: Client-side extraction missed JavaScript-rendered content, hidden sections, lazy-loaded content
- **After**: Server-side scraping captures everything, including content behind "Show More" buttons

### Better RAG Performance
- **More complete job data** → Better embeddings → Better semantic matches
- **All technical requirements** are captured, not just visible text
- **Structured data** (JSON-LD) provides additional context

### Optimal Resume Suggestions
- **Comprehensive job requirements** ensure no important skills/technologies are missed
- **Semantic matching** finds relevant experiences even if wording differs
- **Full context** allows AI to make more accurate alignment suggestions

## API Endpoint

### POST `/api/scrape-job`

**Request:**
```json
{
  "url": "https://example.com/job-posting"
}
```

**Response:**
```json
{
  "success": true,
  "jobText": "Full extracted job description text...",
  "pageTitle": "Job Title - Company",
  "pageUrl": "https://example.com/job-posting",
  "extractedLength": 15234,
  "durationSeconds": 8
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "details": "Stack trace (in development)"
}
```

## Usage

### Automatic (Recommended)

The extension automatically uses server-side scraping when:
- AI service is running (`http://localhost:3001`)
- URL is a valid http/https URL
- Page is not a chrome:// or chrome-extension:// page

### Manual Testing

```bash
curl -X POST http://localhost:3001/api/scrape-job \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/job-posting"}'
```

## Configuration

No additional configuration needed! The web scraping endpoint:
- Uses Puppeteer with optimized settings
- Automatically handles timeouts and errors
- Falls back gracefully if scraping fails

## Troubleshooting

### Puppeteer Installation
If you see errors about Puppeteer:
```bash
cd ai-service
npm install puppeteer
```

### Browser Launch Issues
Puppeteer runs in headless mode with sandbox disabled for compatibility. If you encounter issues:
- Ensure Node.js version is 18+ 
- Check system dependencies (varies by OS)

### Scraping Timeout
The scraping endpoint has a 30-second timeout. For very slow pages:
- Check network connectivity
- Verify the URL is accessible
- Consider increasing timeout in `server.js` if needed

## Performance

- **Typical scraping time**: 5-15 seconds
- **Memory usage**: ~100-200MB per scraping session
- **Concurrent requests**: Handled sequentially (one browser instance at a time)

## Security

- Only http/https URLs are allowed
- Browser runs in sandboxed mode
- No persistent cookies or storage
- Each request uses a fresh browser instance
