// ResumeFit AI Bridge - Background Service Worker

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'llama3.1'; // Change this to use a different model

/**
 * Call Ollama API
 */
async function callOllama(prompt) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content || data.response || '';
  } catch (error) {
    console.error('Ollama API call failed:', error);
    throw error;
  }
}

/**
 * Run ResumeFit AI analysis
 */
async function runResumeFitAI({ resumeText, jobText, chatHistory = [] }) {
  const prompt = `You are a resume optimization expert. Analyze the following resume and job description, then provide a STRICT JSON response with EXACTLY this structure (no markdown, no code blocks, just raw JSON):

{
  "score": <number 0-100>,
  "gaps": [<array of missing important keywords/skills as strings>],
  "suggestions": [
    {
      "id": "<unique-id-string>",
      "title": "<short title for the suggestion>",
      "rationale": "<explanation of why this change helps>",
      "before": "<current text to replace, or empty string>",
      "after": "<suggested replacement text>"
    }
  ],
  "updatedResume": "<complete updated resume text incorporating all suggestions>",
  "projectIdeas": [
    {
      "title": "<project title>",
      "why": "<why this project helps>",
      "stack": "<technologies to use>",
      "steps": ["<step 1>", "<step 2>", ...]
    }
  ],
  "chatReply": "<helpful response if chatHistory provided, otherwise empty string>"
}

Resume:
${resumeText}

Job Description:
${jobText}

${chatHistory.length > 0 ? `\nChat History:\n${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n` : ''}

Provide 5-10 targeted suggestions. Focus on:
1. Missing keywords and skills from the job description
2. Quantifiable achievements
3. Relevant experience highlights
4. Summary/objective optimization

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.`;

  try {
    const aiResponse = await callOllama(prompt);

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and ensure all required fields exist
    return {
      score: parsed.score || 0,
      gaps: parsed.gaps || [],
      suggestions: (parsed.suggestions || []).map(s => ({
        id: s.id || `suggestion-${Date.now()}-${Math.random()}`,
        title: s.title || 'Suggestion',
        rationale: s.rationale || '',
        before: s.before || '',
        after: s.after || '',
      })),
      updatedResume: parsed.updatedResume || resumeText,
      projectIdeas: (parsed.projectIdeas || []).map(p => ({
        title: p.title || 'Project',
        why: p.why || '',
        stack: p.stack || '',
        steps: p.steps || [],
      })),
      chatReply: parsed.chatReply || '',
    };
  } catch (error) {
    console.error('ResumeFit AI analysis failed:', error);
    throw error;
  }
}

/**
 * Test Ollama connection
 */
async function testOllamaConnection() {
  try {
    console.log(`Testing Ollama connection at ${OLLAMA_BASE_URL}/api/tags`);
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Ollama response:', data);
    
    const models = data.models || [];
    // Check if model exists (handle both "llama3.1" and "llama3.1:latest" formats)
    const modelExists = models.some(m => {
      const modelName = m.name.split(':')[0]; // Get base name without tag
      const modelNameLower = modelName.toLowerCase();
      const targetModelLower = OLLAMA_MODEL.toLowerCase();
      return modelNameLower === targetModelLower || 
             modelNameLower.startsWith(targetModelLower) ||
             m.name.toLowerCase().includes(targetModelLower);
    });

    const uniqueModels = [...new Set(models.map(m => m.name.split(':')[0]))];

    return {
      success: true,
      connected: true,
      modelExists,
      models: uniqueModels,
      modelName: OLLAMA_MODEL,
    };
  } catch (error) {
    console.error('Ollama connection test failed:', error);
    const errorMessage = error.message || 'Unknown error';
    
    // Provide more helpful error messages
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        success: false,
        connected: false,
        error: `Cannot reach Ollama at ${OLLAMA_BASE_URL}. Make sure Ollama is running: 'ollama serve'`,
      };
    }
    
    return {
      success: false,
      connected: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle chat-based resume regeneration
 */
async function handleChatRegeneration({ message, currentDraftResume, jobText, chatHistory = [] }) {
  const isRegenerateCommand = message.toLowerCase().includes('regenerate') || 
                               message.toLowerCase().includes('update draft') ||
                               message.toLowerCase().includes('apply preferences');

  const prompt = isRegenerateCommand
    ? `You are a resume optimization expert. The user wants to regenerate their resume draft based on our conversation.

Current Draft Resume:
${currentDraftResume}

Job Description:
${jobText}

Chat History (user preferences and requests):
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Provide a STRICT JSON response with EXACTLY this structure (no markdown, no code blocks, just raw JSON):

{
  "assistantMessage": "<brief explanation of what changed and why>",
  "updatedResume": "<complete updated resume text incorporating all discussed changes>",
  "explanation": "<short explanation of the changes made>",
  "suggestions": [
    {
      "id": "<unique-id-string>",
      "title": "<short title for the suggestion>",
      "rationale": "<explanation of why this change helps>",
      "before": "<current text to replace, or empty string>",
      "after": "<suggested replacement text>"
    }
  ]
}

Focus on:
1. Incorporating all user preferences from the chat history
2. Maintaining consistency with the job description
3. Improving clarity and impact based on the conversation
4. Providing updated suggestions for further improvements

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.`
    : `You are a resume optimization assistant. Help the user improve their resume through conversation.

Current Draft Resume:
${currentDraftResume}

Job Description:
${jobText}

Chat History:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

User's current message: ${message}

Provide a STRICT JSON response with EXACTLY this structure (no markdown, no code blocks, just raw JSON):

{
  "assistantMessage": "<your helpful response to the user's question or request>",
  "updatedResume": "<updated resume text if you're making changes, otherwise empty string>",
  "explanation": "<short explanation if you updated the resume, otherwise empty string>",
  "suggestions": [
    {
      "id": "<unique-id-string>",
      "title": "<short title for the suggestion>",
      "rationale": "<explanation of why this change helps>",
      "before": "<current text to replace, or empty string>",
      "after": "<suggested replacement text>"
    }
  ]
}

If the user is asking a question, provide a helpful answer in assistantMessage.
If the user wants changes, provide updatedResume with the changes and explanation.
Always provide relevant suggestions for further improvements.

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.`;

  try {
    const aiResponse = await callOllama(prompt);

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      assistantMessage: parsed.assistantMessage || '',
      updatedResume: parsed.updatedResume || (isRegenerateCommand ? currentDraftResume : ''),
      explanation: parsed.explanation || '',
      suggestions: (parsed.suggestions || []).map(s => ({
        id: s.id || `suggestion-${Date.now()}-${Math.random()}`,
        title: s.title || 'Suggestion',
        rationale: s.rationale || '',
        before: s.before || '',
        after: s.after || '',
      })),
    };
  } catch (error) {
    console.error('Chat regeneration failed:', error);
    throw error;
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle ping to wake up service worker
  if (request.type === 'PING') {
    sendResponse({ success: true, message: 'Service worker is active' });
    return true;
  }

  if (request.type === 'RESUMEFIT_RUN_AI') {
    runResumeFitAI(request.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates we will send a response asynchronously
  }

  if (request.type === 'RESUMEFIT_CHAT') {
    handleChatRegeneration(request.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'RESUMEFIT_TEST_CONNECTION') {
    testOllamaConnection()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'RESUMEFIT_SCAN_JOB') {
    // Forward to content script to extract job text
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;
      
      // First, ensure content script is injected
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).then(() => {
        // Wait a moment for script to initialize
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_JOB_TEXT' }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ 
                success: false, 
                error: `Content script error: ${chrome.runtime.lastError.message}. Make sure you're on a webpage with a job description.`,
                pageTitle: tabs[0].title || '',
                pageUrl: tabs[0].url || ''
              });
              return;
            }
            sendResponse(response || { success: false, error: 'No response from content script' });
          });
        }, 300);
      }).catch((error) => {
        // If injection fails, try direct message (script might already be loaded)
        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_JOB_TEXT' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ 
              success: false, 
              error: `Failed to communicate with page: ${chrome.runtime.lastError.message}. Make sure you're on a webpage (not chrome:// pages).`,
              pageTitle: tabs[0].title || '',
              pageUrl: tabs[0].url || ''
            });
            return;
          }
          sendResponse(response || { success: false, error: 'No response from content script' });
        });
      });
    });
    return true;
  }
  
  // Handle getting current tab info for side panel
  if (request.type === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ 
          success: true, 
          title: tabs[0].title || '',
          url: tabs[0].url || ''
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }
  
  // Handle state storage
  if (request.type === 'SAVE_STATE') {
    chrome.storage.local.set({ resumeFitState: request.payload }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.type === 'LOAD_STATE') {
    chrome.storage.local.get(['resumeFitState'], (result) => {
      sendResponse({ success: true, state: result.resumeFitState || null });
    });
    return true;
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('ResumeFit installed');
    // Enable side panel for all tabs
    chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
  } else if (details.reason === 'update') {
    console.log('ResumeFit updated');
  }
});

// Keep service worker alive by listening to messages
chrome.runtime.onStartup.addListener(() => {
  console.log('ResumeFit service worker started');
});

// Log when service worker is activated
console.log('ResumeFit service worker loaded');
