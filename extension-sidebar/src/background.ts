// Background Service Worker for ResumeFit Sidebar Extension

import type {
  MessagePayload,
  ExtractJobResponse,
  AnalysisResponse,
  AnalysisResult,
  ChatResponse,
  ChatResponseWrapper,
  ProposedEdit,
} from './types';

// AI Service Configuration
// Option 1: Custom AI Service with Vector DB (Recommended)
const AI_SERVICE_BASE_URL = 'http://localhost:3001';

// Option 2: Direct Ollama (Fallback)
const OLLAMA_BASE_URL = 'http://localhost:11434';
const MODEL_NAME = 'llama3.1';

// Use custom AI service by default
const USE_CUSTOM_AI_SERVICE = true;

// Toggle sidebar when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  // Skip chrome:// and chrome-extension:// pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.log('Cannot inject sidebar on chrome:// pages');
    return;
  }

  try {
    // Check if content script is already injected
    let alreadyLoaded = false;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return !!(window as any).__resumefit_sidebar_loaded__;
        },
      });
      alreadyLoaded = results?.[0]?.result === true;
    } catch (checkError) {
      // Check failed, assume not loaded
      console.log('Could not check if content script is loaded:', checkError);
    }
    
    if (!alreadyLoaded) {
      // Inject content script only if not already loaded
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js'],
        });
        // Wait for script to initialize
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        // Try one more time with a longer delay
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js'],
          });
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (retryError) {
          console.error('Retry injection also failed:', retryError);
          return;
        }
      }
    } else {
      console.log('Content script already loaded, skipping injection');
    }

    // Send message to content script to toggle sidebar
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_SIDEBAR',
      });
    } catch (messageError) {
      console.error('Failed to send toggle message:', messageError);
      // Content script might not be ready, try again after a delay
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_SIDEBAR',
        });
      } catch (retryError) {
        console.error('Retry send message also failed:', retryError);
      }
    }
  } catch (error) {
    console.error('Failed to toggle sidebar:', error);
  }
});

// Clear storage when browser starts (user closes and reopens browser)
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started - clearing ResumeFit storage');
  chrome.storage.local.clear(() => {
    console.log('ResumeFit storage cleared');
  });
});

// Clear storage when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated - clearing ResumeFit storage');
  chrome.storage.local.clear(() => {
    console.log('ResumeFit storage cleared');
  });
});

// Handle messages from content script and sidebar
chrome.runtime.onMessage.addListener(
  (message: MessagePayload, sender, sendResponse) => {
    // Handle job extraction request
    if (message.type === 'EXTRACT_JOB_TEXT') {
      handleExtractJob(sender.tab?.id)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error.message,
          } as ExtractJobResponse)
        );
      return true; // Keep channel open for async response
    }

    // Handle state save
    if (message.type === 'SAVE_STATE') {
      chrome.storage.local.set({ resumeFitState: message.payload }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    // Handle state load
    if (message.type === 'LOAD_STATE') {
      chrome.storage.local.get(['resumeFitState'], (result) => {
        sendResponse({
          success: true,
          state: result.resumeFitState || null,
        });
      });
      return true;
    }

    // Handle state clear
    if (message.type === 'CLEAR_STATE') {
      chrome.storage.local.remove(['resumeFitState'], () => {
        sendResponse({ success: true });
      });
      return true;
    }

    // Handle get current tab URL
    if (message.type === 'GET_TAB_URL') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          sendResponse({
            success: true,
            url: tabs[0].url || '',
            title: tabs[0].title || '',
          });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true;
    }

    // Handle run analysis request
    if (message.type === 'RUN_ANALYSIS') {
      const { resumeText, jobText } = message.payload || {};
      runAnalysis({ resumeText, jobText })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error.message,
          } as AnalysisResponse)
        );
      return true; // Keep channel open for async response
    }

    // Handle chat message request
    if (message.type === 'CHAT_MESSAGE') {
      const { message: userMessage, currentDraft, jobText, chatHistory } = message.payload || {};
      handleChatMessage({
        userMessage,
        currentDraft,
        jobText,
        chatHistory: chatHistory || [],
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error.message,
          } as ChatResponseWrapper)
        );
      return true; // Keep channel open for async response
    }
  }
);

// Extract job text from current tab
async function handleExtractJob(
  tabId?: number
): Promise<ExtractJobResponse> {
  if (!tabId) {
    return {
      success: false,
      error: 'No tab ID provided',
    };
  }

  try {
    // Get current tab URL
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';

    // Skip chrome:// and chrome-extension:// pages
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return {
        success: false,
        error: 'Cannot extract text from chrome:// pages. Please navigate to a regular website.',
      };
    }

    // Inject content script if needed and request extraction
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageText,
    });

    if (results && results[0]?.result) {
      const text = results[0].result as string;
      
      // Check if we got meaningful text
      if (!text || text.trim().length < 50) {
        return {
          success: false,
          error: 'Could not extract sufficient text from page. The page might be empty or still loading.',
          jobUrl: url,
        };
      }

      return {
        success: true,
        jobText: text,
        jobUrl: url,
      };
    }


    return {
      success: false,
      error: 'Failed to extract text from page. The page might not be fully loaded or accessible.',
      jobUrl: url,
    };
  } catch (error) {
    console.error('Job extraction error:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Cannot access')) {
        return {
          success: false,
          error: 'Cannot access this page. It may be a restricted page or the extension needs additional permissions.',
        };
      }
      if (error.message.includes('No tab with id')) {
        return {
          success: false,
          error: 'Tab was closed or is no longer available.',
        };
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// Function to extract text from page (injected into page context)
function extractPageText(): string {
  try {
    // Clone document to avoid modifying original
    const clone = document.cloneNode(true) as Document;

    // Remove unwanted elements
    const unwanted = clone.querySelectorAll(
      'script, style, noscript, nav, header, footer, aside, .sidebar, .advertisement, .ads, .ad, .cookie-banner, .popup, .modal'
    );
    unwanted.forEach((el) => el.remove());

    // Try common job board selectors first
    const jobSelectors = [
      '[data-testid*="job"]',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '.job-description',
      '.job-details',
      '#job-description',
      '[class*="jobDescription"]',
      '[id*="jobDescription"]',
      '[class*="job-description"]',
      '[id*="job-description"]',
    ];

    let text = '';
    let element = null;

    // Try job-specific selectors first
    for (const selector of jobSelectors) {
      try {
        element = document.querySelector(selector);
        if (element) {
          text = element.textContent || (element as HTMLElement).innerText || '';
          // If we found substantial text, use it
          if (text.length > 200) {
            break;
          }
        }
      } catch (e) {
        // Continue to next selector if this one fails
        continue;
      }
    }

    // If no job-specific content found, try to find main content
    if (text.length < 200) {
      const mainContent =
        clone.querySelector('main') ||
        clone.querySelector('[role="main"]') ||
        clone.querySelector('article') ||
        clone.querySelector('.content') ||
        clone.querySelector('.main-content') ||
        clone.body;

      if (mainContent) {
        text = mainContent.textContent || mainContent.innerText || '';
      }
    }

    // Fallback to body if still no text
    if (text.length < 200) {
      const body = document.body as HTMLElement;
      text = body?.textContent || (body as any)?.innerText || '';
    }

    // Clean up text
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Return text or empty string if too short
    if (text.length < 50) {
      return '';
    }

    return text;
  } catch (error) {
    console.error('Text extraction error:', error);
    // Return body text as fallback
    try {
      return (document.body?.textContent || document.body?.innerText || '').trim();
    } catch (e) {
      return '';
    }
  }
}

/**
 * Ollama Client - Run Analysis
 * 
 * This function sends a request to local Ollama API to analyze resume against job description.
 * It enforces strict JSON-only output and validates the response schema.
 * 
 * Flow:
 * 1. Validate inputs (resumeText and jobText must be provided)
 * 2. Construct system prompt that enforces JSON-only output
 * 3. Send POST request to Ollama /api/chat endpoint
 * 4. Extract JSON from response (handles markdown code blocks if present)
 * 5. Validate JSON schema matches expected structure
 * 6. If validation fails, retry once with stricter prompt
 * 7. Return validated result or error
 */
async function runAnalysis({
  resumeText,
  jobText,
}: {
  resumeText: string;
  jobText: string;
}): Promise<AnalysisResponse> {
  // Validate inputs
  if (!resumeText || !jobText) {
    return {
      success: false,
      error: 'Both resume text and job text are required',
    };
  }

  // System prompt that enforces STRICT JSON ONLY output
  const systemPrompt = `You are a resume analysis expert. You MUST provide SPECIFIC, JOB-SPECIFIC suggestions based on the ACTUAL job description and ACTUAL resume content. NO generic advice. Return ONLY valid JSON. No explanations, no markdown, no code blocks, just raw JSON.

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
1. Read the job description LINE BY LINE - identify EVERY specific requirement, skill, technology, tool, qualification, responsibility mentioned
2. Read the resume LINE BY LINE - identify EXACTLY what the candidate has written (quote the exact text)
3. Compare them DIRECTLY - for each job requirement, find if it exists in the resume and HOW it's worded
4. For EVERY suggestion, you MUST:
   a. Quote the EXACT text from the job description (copy it word-for-word)
   b. Quote the EXACT text from the resume that needs changing (or write "null" if adding new content)
   c. Write replacement text that INCORPORATES the exact wording/phrases from the job description
   d. Explain the SPECIFIC connection between the job requirement and the resume change
5. NO generic advice - EVERY suggestion must reference a SPECIFIC requirement from the job description
6. If you cannot find a specific job requirement to address, DO NOT create that suggestion
7. Prioritize suggestions that address REQUIRED qualifications over preferred ones

Return exactly this JSON structure:
{
  "score": <number 0-100>,
  "matched_keywords": [<array of strings>],
  "missing_keywords": [<array of strings>],
  "suggested_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": <string or null - quote the ACTUAL text from the resume that needs changing>,
      "after": <string - SPECIFIC replacement text that addresses a SPECIFIC job requirement>,
      "reason": <string - explain how this SPECIFIC change addresses a SPECIFIC job requirement>,
      "job_requirement": <string - quote the EXACT requirement from the job description this addresses>,
      "alignment_impact": <string - how this SPECIFIC change improves alignment with the SPECIFIC job requirement>,
      "priority": <"high" | "medium" | "low">,
      "job_keywords_addressed": [<array of SPECIFIC keywords/phrases from the job description this addresses>]
    }
  ],
  "updated_draft": <string>
}

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.`;

  // Extract key requirements from job description for better prompting
  const extractJobRequirements = (jobText: string): string => {
    const requirements: string[] = [];
    const lines = jobText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const requirementKeywords = ['required', 'must have', 'qualifications', 'requirements', 'skills', 'experience', 'years', 'degree', 'certification', 'proficient', 'expertise'];
    
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      if (requirementKeywords.some(kw => lowerLine.includes(kw))) {
        const context: string[] = [];
        for (let i = Math.max(0, idx - 1); i <= Math.min(lines.length - 1, idx + 3); i++) {
          context.push(lines[i]);
        }
        requirements.push(context.join(' '));
      }
    });
    
    // Return all requirements or full job text if no specific requirements found
    return requirements.length > 0 ? requirements.join('\n') : jobText;
  };

  const keyRequirements = extractJobRequirements(jobText);
  const resumeSections = resumeText.split('\n').filter(l => l.trim().length > 0).slice(0, 20).join('\n');

  const userPrompt = `=== JOB DESCRIPTION ===
${jobText}

=== KEY REQUIREMENTS EXTRACTED ===
${keyRequirements}

=== RESUME CONTENT ===
${resumeSections}
${resumeText.length > 2000 ? `\n[... ${resumeText.length - 2000} more characters ...]` : ''}

=== ANALYSIS INSTRUCTIONS - FOLLOW THESE STEPS EXACTLY ===

STEP 1: Extract EVERY requirement from the job description (quote exactly):
Go through the job description line by line and extract:
- Every technology/tool mentioned (e.g., "Python", "Django", "PostgreSQL", "AWS")
- Every skill mentioned (e.g., "machine learning", "data analysis", "agile methodology")
- Every qualification (e.g., "Bachelor's degree in Computer Science", "5+ years experience")
- Every responsibility (e.g., "design and implement scalable systems", "collaborate with cross-functional teams")
- Every preferred qualification

Create a numbered list of requirements with exact quotes.

STEP 2: Map resume content to job requirements (quote exactly):
For each requirement from Step 1, check the resume:
- Does the resume mention this requirement? Quote the exact text from the resume.
- If mentioned, how is it worded? Is it clear and prominent?
- If not mentioned, write "NOT FOUND IN RESUME"

STEP 3: Identify SPECIFIC gaps and mismatches:
For each requirement:
- If NOT FOUND: This is a HIGH priority gap - create a suggestion to add it
- If found but vague/weak: This is a MEDIUM priority - create a suggestion to strengthen it
- If found but in wrong section: This is a MEDIUM priority - create a suggestion to move/emphasize it
- If found and well-stated: No suggestion needed

STEP 4: Create SPECIFIC suggestions (minimum 5, maximum 10):
For EACH suggestion, you MUST provide:
1. job_requirement: Copy the EXACT text from the job description (from Step 1)
2. before: Copy the EXACT text from the resume that needs changing (or "null" if adding new)
3. after: Write replacement text that:
   - Incorporates the EXACT keywords/phrases from the job requirement
   - Maintains the resume's existing style and structure
   - Makes the connection to the job requirement obvious
4. reason: Explain HOW this specific change addresses the specific job requirement
5. alignment_impact: Explain how this improves the match score
6. priority: "high" if required qualification, "medium" if preferred, "low" if nice-to-have
7. job_keywords_addressed: List the EXACT keywords/phrases from the job description this addresses

VALIDATION CHECK - Before including a suggestion, ask:
- Can I quote the exact job requirement? (If no, skip this suggestion)
- Can I quote the exact resume text to change? (If no, but it's a missing requirement, use "null")
- Does my "after" text incorporate the exact job requirement wording? (If no, rewrite it)
- Is this suggestion tied to a SPECIFIC job requirement? (If no, skip it)

EXAMPLE - GOOD (follow this format exactly):
Job requirement: "Required: 5+ years of Python development experience, Django framework, PostgreSQL database"
Resume text: "Software Engineer | 3 years | Web development using various technologies"
Suggestion:
{
  "job_requirement": "Required: 5+ years of Python development experience, Django framework, PostgreSQL database",
  "before": "Software Engineer | 3 years | Web development using various technologies",
  "after": "Software Engineer | 5+ years | Python development with Django framework and PostgreSQL database",
  "reason": "The job specifically requires '5+ years of Python development experience, Django framework, PostgreSQL database' but the resume only mentions '3 years' and 'various technologies' without naming Python, Django, or PostgreSQL",
  "alignment_impact": "Explicitly states the required technologies (Python, Django, PostgreSQL) and matches the experience requirement (5+ years), directly addressing three key job requirements",
  "priority": "high",
  "job_keywords_addressed": ["5+ years", "Python", "Django", "PostgreSQL"]
}

EXAMPLE - BAD (DO NOT DO THIS):
{
  "job_requirement": "General software development",
  "before": "Some experience",
  "after": "Add more details",
  "reason": "Make it more specific",
  ...
}
This is REJECTED because:
- job_requirement is too vague (not a real quote from job description)
- before/after don't quote exact text
- reason is generic

Now analyze the job description and resume above. Follow Steps 1-4 exactly. Provide 5-10 SPECIFIC suggestions.`;

  try {
    // Use custom AI service if enabled
    if (USE_CUSTOM_AI_SERVICE) {
      return await callCustomAIServiceAnalyze({ resumeText, jobText });
    }
    
    // Fallback to direct Ollama
    // First attempt with standard prompt
    const result = await callOllama(systemPrompt, userPrompt);
    if (result.success && result.result) {
      return result;
    }

    // If first attempt failed, retry with stricter prompt
    console.log('First attempt failed, retrying with stricter prompt...');
    const strictSystemPrompt = `Return ONLY valid JSON. No explanation.`;
    return await callOllama(strictSystemPrompt, userPrompt);
  } catch (error) {
    console.error('AI analysis error:', error);
    
    // Provide friendly error messages
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (USE_CUSTOM_AI_SERVICE) {
        return {
          success: false,
          error:
            'AI Service not running. Please start the custom AI service: cd ai-service && npm start',
        };
      }
      return {
        success: false,
        error:
          'Ollama not running. Please install and run Ollama, then run: ollama pull llama3.1',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Call Custom AI Service - Analyze endpoint
 * 
 * Calls the custom AI service for resume analysis with vector database retrieval.
 * No API keys required - runs entirely locally.
 */
async function callCustomAIServiceAnalyze(
  payload: { resumeText: string; jobText: string }
): Promise<AnalysisResponse> {
  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'AI Service endpoint not found. Make sure the service is running and up to date.'
        );
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `AI Service error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }

    const data = await response.json();

    if (data.success && data.result) {
      return {
        success: true,
        result: data.result as AnalysisResult,
      };
    }

    throw new Error(data.error || 'Unknown error from AI service');
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error calling AI service');
  }
}

/**
 * Call Custom AI Service - Chat endpoint
 * 
 * Calls the custom AI service for chat-driven editing with vector database retrieval.
 * No API keys required - runs entirely locally.
 */
async function callCustomAIServiceChat(
  payload: {
    message: string;
    currentDraft: string;
    jobText: string;
    chatHistory: Array<{ role: string; content: string }>;
  }
): Promise<ChatResponseWrapper> {
  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'AI Service endpoint not found. Make sure the service is running and up to date.'
        );
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `AI Service error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }

    const data = await response.json();

    if (data.success && data.result) {
      return {
        success: true,
        result: data.result as ChatResponse,
      };
    }

    throw new Error(data.error || 'Unknown error from AI service');
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error calling AI service');
  }
}

/**
 * Call Ollama API (Fallback)
 * 
 * Sends a POST request to Ollama's /api/chat endpoint with the system and user prompts.
 * Extracts and validates the JSON response.
 */
async function callOllama(
  systemPrompt: string,
  userPrompt: string
): Promise<AnalysisResponse> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        stream: false,
      }),
    });

    // Handle HTTP errors
    if (!response.ok) {
      if (response.status === 403) {
        // 403 Forbidden - could be authentication or CORS issue
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Ollama returned 403 Forbidden. This might be due to:\n` +
          `1. Ollama requires authentication (check OLLAMA_API_KEY environment variable)\n` +
          `2. CORS restrictions (check Ollama configuration)\n` +
          `3. Ollama server configuration issue\n\n` +
          `Try: ollama serve --host 0.0.0.0\n` +
          `Or check Ollama logs for more details.`
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Model "${MODEL_NAME}" not found. Run: ollama pull ${MODEL_NAME}`
        );
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }

    const data = await response.json();

    // Extract message content
    const content = data.message?.content || data.response || '';
    if (!content) {
      throw new Error('No content in Ollama response');
    }

    // Extract JSON from response (handles markdown code blocks)
    let jsonText = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const directMatch = jsonText.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonText = directMatch[0];
      }
    }

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`Invalid JSON in response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // Validate JSON schema
    const validationError = validateAnalysisResult(parsed);
    if (validationError) {
      throw new Error(`Invalid response schema: ${validationError}`);
    }

    // Return validated result
    return {
      success: true,
      result: parsed as AnalysisResult,
    };
  } catch (error) {
    // Re-throw with context
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error calling Ollama');
  }
}

/**
 * Validate Analysis Result Schema
 * 
 * Ensures the parsed JSON matches the expected structure exactly.
 * Returns error message if validation fails, null if valid.
 */
function validateAnalysisResult(data: any): string | null {
  // Check score
  if (typeof data.score !== 'number' || data.score < 0 || data.score > 100) {
    return 'score must be a number between 0 and 100';
  }

  // Check matched_keywords
  if (!Array.isArray(data.matched_keywords)) {
    return 'matched_keywords must be an array';
  }
  if (!data.matched_keywords.every((kw: any) => typeof kw === 'string')) {
    return 'matched_keywords must be an array of strings';
  }

  // Check missing_keywords
  if (!Array.isArray(data.missing_keywords)) {
    return 'missing_keywords must be an array';
  }
  if (!data.missing_keywords.every((kw: any) => typeof kw === 'string')) {
    return 'missing_keywords must be an array of strings';
  }

  // Check suggested_edits
  if (!Array.isArray(data.suggested_edits)) {
    return 'suggested_edits must be an array';
  }
  for (const edit of data.suggested_edits) {
    if (!['summary', 'experience', 'skills'].includes(edit.section)) {
      return `suggested_edits[].section must be one of: summary, experience, skills`;
    }
    if (edit.before !== null && typeof edit.before !== 'string') {
      return 'suggested_edits[].before must be a string or null';
    }
    if (typeof edit.after !== 'string') {
      return 'suggested_edits[].after must be a string';
    }
    if (typeof edit.reason !== 'string') {
      return 'suggested_edits[].reason must be a string';
    }
    // Optional enhanced fields
    if (edit.job_requirement !== undefined && typeof edit.job_requirement !== 'string') {
      return 'suggested_edits[].job_requirement must be a string if provided';
    }
    if (edit.alignment_impact !== undefined && typeof edit.alignment_impact !== 'string') {
      return 'suggested_edits[].alignment_impact must be a string if provided';
    }
    if (edit.priority !== undefined && !['high', 'medium', 'low'].includes(edit.priority)) {
      return 'suggested_edits[].priority must be one of: high, medium, low';
    }
    if (edit.job_keywords_addressed !== undefined && !Array.isArray(edit.job_keywords_addressed)) {
      return 'suggested_edits[].job_keywords_addressed must be an array if provided';
    }
  }

  // Check updated_draft
  if (typeof data.updated_draft !== 'string') {
    return 'updated_draft must be a string';
  }

  return null; // Valid
}

/**
 * Chat-Driven Resume Editing Handler
 * 
 * This function handles chat messages for iterative resume editing.
 * It enforces incremental changes only - no full resume rewrites.
 * 
 * Flow:
 * 1. User sends chat message with current draft and chat history
 * 2. System prompt enforces incremental changes only
 * 3. Ollama returns JSON with assistant message, proposed edits, and optional updated draft
 * 4. User can apply changes or keep chatting
 * 
 * Rules:
 * - NO full resume rewrites
 * - Only propose incremental changes
 * - Changes must be grounded in existing resume content
 * - updated_draft may be null if only asking clarifying questions
 */
async function handleChatMessage({
  userMessage,
  currentDraft,
  jobText,
  chatHistory,
}: {
  userMessage: string;
  currentDraft: string;
  jobText: string;
  chatHistory: Array<{ role: string; content: string }>;
}): Promise<ChatResponseWrapper> {
  // Validate inputs
  if (!userMessage || !currentDraft || !jobText) {
    return {
      success: false,
      error: 'Message, current draft, and job text are required',
    };
  }

  // System prompt that enforces incremental changes only
  const systemPrompt = `You are a resume editing assistant. Help users iteratively improve their resume through conversation.

CRITICAL RULES:
1. NO full resume rewrites - only propose incremental changes
2. Changes must be grounded in the existing resume content
3. Propose specific, focused edits (1-3 changes per message)
4. If you need clarification, ask questions and set updated_draft to null
5. Return ONLY valid JSON - no markdown, no code blocks, no explanations

Return exactly this JSON structure:
{
  "assistant_message": "<your response to the user>",
  "proposed_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": "<current text to replace, or null>",
      "after": "<proposed replacement text>",
      "reason": "<why this change helps>"
    }
  ],
  "updated_draft": "<updated resume with ONLY the proposed edits applied, or null if just asking questions>"
}

If you're only asking clarifying questions, set updated_draft to null.
If proposing changes, updated_draft must reflect ONLY those specific edits, not a full rewrite.`;

  // Build conversation context
  const conversationContext = chatHistory
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  const userPrompt = `Current Draft Resume:
${currentDraft}

Job Description:
${jobText}

${conversationContext ? `Previous Conversation:\n${conversationContext}\n` : ''}
User's current message: ${userMessage}

Provide your response as JSON with:
- A helpful assistant_message
- Proposed incremental edits (1-3 specific changes)
- Updated draft with ONLY those edits applied (or null if just asking questions)`;

  try {
    // Use custom AI service if enabled
    if (USE_CUSTOM_AI_SERVICE) {
      return await callCustomAIServiceChat({
        message: userMessage,
        currentDraft,
        jobText,
        chatHistory,
      });
    }
    
    // Fallback to direct Ollama
    // First attempt with standard prompt
    const result = await callOllamaChat(systemPrompt, userPrompt);
    if (result.success && result.result) {
      return result;
    }

    // If first attempt failed, retry with stricter prompt
    console.log('Chat response failed, retrying with stricter prompt...');
    const strictSystemPrompt = `Return ONLY valid JSON. No explanation. No markdown. Just JSON.`;
    return await callOllamaChat(strictSystemPrompt, userPrompt);
  } catch (error) {
    console.error('Chat message error:', error);

    // Provide friendly error messages
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (USE_CUSTOM_AI_SERVICE) {
        return {
          success: false,
          error:
            'AI Service not running. Please start the custom AI service: cd ai-service && npm start',
        };
      }
      return {
        success: false,
        error:
          'Ollama not running. Please install and run Ollama, then run: ollama pull llama3.1',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Call Ollama API for Chat
 * 
 * Similar to callOllama but specifically for chat responses.
 * Extracts and validates the chat response JSON schema.
 */
async function callOllamaChat(
  systemPrompt: string,
  userPrompt: string
): Promise<ChatResponseWrapper> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        stream: false,
      }),
    });

    // Handle HTTP errors
    if (!response.ok) {
      if (response.status === 403) {
        // 403 Forbidden - could be authentication or CORS issue
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Ollama returned 403 Forbidden. This might be due to:\n` +
          `1. Ollama requires authentication (check OLLAMA_API_KEY environment variable)\n` +
          `2. CORS restrictions (check Ollama configuration)\n` +
          `3. Ollama server configuration issue\n\n` +
          `Try: ollama serve --host 0.0.0.0\n` +
          `Or check Ollama logs for more details.`
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Model "${MODEL_NAME}" not found. Run: ollama pull ${MODEL_NAME}`
        );
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }

    const data = await response.json();

    // Extract message content
    const content = data.message?.content || data.response || '';
    if (!content) {
      throw new Error('No content in Ollama response');
    }

    // Extract JSON from response (handles markdown code blocks)
    let jsonText = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const directMatch = jsonText.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonText = directMatch[0];
      }
    }

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(
        `Invalid JSON in response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
      );
    }

    // Validate JSON schema
    const validationError = validateChatResponse(parsed);
    if (validationError) {
      throw new Error(`Invalid response schema: ${validationError}`);
    }

    // Return validated result
    return {
      success: true,
      result: parsed as ChatResponse,
    };
  } catch (error) {
    // Re-throw with context
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error calling Ollama');
  }
}

/**
 * Validate Chat Response Schema
 * 
 * Ensures the parsed JSON matches the expected chat response structure.
 * Returns error message if validation fails, null if valid.
 */
function validateChatResponse(data: any): string | null {
  // Check assistant_message
  if (typeof data.assistant_message !== 'string') {
    return 'assistant_message must be a string';
  }

  // Check proposed_edits
  if (!Array.isArray(data.proposed_edits)) {
    return 'proposed_edits must be an array';
  }
  for (const edit of data.proposed_edits) {
    if (!['summary', 'experience', 'skills'].includes(edit.section)) {
      return `proposed_edits[].section must be one of: summary, experience, skills`;
    }
    if (edit.before !== null && typeof edit.before !== 'string') {
      return 'proposed_edits[].before must be a string or null';
    }
    if (typeof edit.after !== 'string') {
      return 'proposed_edits[].after must be a string';
    }
    if (typeof edit.reason !== 'string') {
      return 'proposed_edits[].reason must be a string';
    }
  }

  // Check updated_draft (can be null or string)
  if (data.updated_draft !== null && typeof data.updated_draft !== 'string') {
    return 'updated_draft must be a string or null';
  }

  return null; // Valid
}

// Extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('ResumeFit Sidebar installed');
  } else if (details.reason === 'update') {
    console.log('ResumeFit Sidebar updated');
  }
});

console.log('ResumeFit Sidebar background service worker loaded');

