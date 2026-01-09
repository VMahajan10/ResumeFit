// Sidebar UI Logic for ResumeFit Sidebar Extension

import type {
  ExtensionState,
  ChatMessage,
  MessagePayload,
  AnalysisResult,
  AnalysisResponse,
  ChatResponse,
  ChatResponseWrapper,
  ProposedEdit,
  DraftVersion,
} from '../types';

// State management
let state: ExtensionState = {
  jobText: '',
  jobUrl: '',
  resumeText: '',
  chatHistory: [],
  currentDraft: '',
  draftVersions: [], // Version history
};

// Track active timeouts to prevent orphaned timeouts
let analysisTimeoutId: number | null = null;
let jobExtractionTimeoutId: number | null = null;
// Track if analysis is in progress to prevent multiple concurrent requests
let isAnalysisInProgress = false;

// Check if extension context is still valid
function isExtensionContextValid(): boolean {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      return false;
    }
    // Try to get URL - this will throw if context is invalidated
    chrome.runtime.getURL('test');
    return true;
  } catch (error) {
    console.warn('[Sidebar] Extension context invalidated:', error);
    return false;
  }
}

// Safe wrapper for chrome.runtime.getURL
function safeGetURL(path: string): string | null {
  try {
    if (!isExtensionContextValid()) {
      return null;
    }
    return chrome.runtime.getURL(path);
  } catch (error) {
    console.error('[Sidebar] Failed to get URL:', error);
    return null;
  }
}

// DOM elements
const elements = {
  useJobPageBtn: document.getElementById('useJobPageBtn') as HTMLButtonElement,
  jobInfo: document.getElementById('jobInfo') as HTMLDivElement,
  jobUrl: document.getElementById('jobUrl') as HTMLDivElement,
  jobPreview: document.getElementById('jobPreview') as HTMLDivElement,
  resumeText: document.getElementById('resumeText') as HTMLTextAreaElement,
  resumeFileInput: document.getElementById('resumeFileInput') as HTMLInputElement,
  fileUploadStatus: document.getElementById('fileUploadStatus') as HTMLDivElement,
  uploadText: document.getElementById('uploadText') as HTMLSpanElement,
  saveResumeBtn: document.getElementById('saveResumeBtn') as HTMLButtonElement,
  runAnalysisBtn: document.getElementById('runAnalysisBtn') as HTMLButtonElement,
  analysisStatus: document.getElementById('analysisStatus') as HTMLDivElement,
  chatMessages: document.getElementById('chatMessages') as HTMLDivElement,
  chatInput: document.getElementById('chatInput') as HTMLInputElement,
  sendChatBtn: document.getElementById('sendChatBtn') as HTMLButtonElement,
  draftResume: document.getElementById('draftResume') as HTMLDivElement,
  // Analysis results elements
  scoreSection: document.getElementById('scoreSection') as HTMLElement,
  compatibilityScore: document.getElementById('compatibilityScore') as HTMLDivElement,
  missingKeywordsSection: document.getElementById('missingKeywordsSection') as HTMLElement,
  missingKeywords: document.getElementById('missingKeywords') as HTMLDivElement,
  suggestedEditsSection: document.getElementById('suggestedEditsSection') as HTMLElement,
  suggestedEdits: document.getElementById('suggestedEdits') as HTMLDivElement,
  // Proposed edits from chat
  proposedEditsSection: document.getElementById('proposedEditsSection') as HTMLElement,
  proposedEditsList: document.getElementById('proposedEditsList') as HTMLDivElement,
  applyChangesBtn: document.getElementById('applyChangesBtn') as HTMLButtonElement,
  keepChattingBtn: document.getElementById('keepChattingBtn') as HTMLButtonElement,
  // Close button
  closeSidebarBtn: document.getElementById('closeSidebarBtn') as HTMLButtonElement,
  // View detailed analysis button
  viewDetailedAnalysisBtn: document.getElementById('viewDetailedAnalysisBtn') as HTMLButtonElement,
};

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
  elements.analysisStatus.style.display = 'block';
  elements.analysisStatus.className = `status-message ${type}`;
  elements.analysisStatus.textContent = message;
  setTimeout(() => {
    elements.analysisStatus.style.display = 'none';
  }, 5000);
}

/**
 * Save state to chrome.storage.local
 */
async function saveState() {
  try {
    const message: MessagePayload = {
      type: 'SAVE_STATE',
      payload: state,
    };
    
    // Send to parent window (content script will forward to background)
    window.parent.postMessage(message, '*');
    
    // Also listen for response
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'SAVE_STATE_RESPONSE') {
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
    });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Load state from chrome.storage.local
 */
async function loadState() {
  try {
    // Check if state was recently cleared (within last 5 seconds)
    // If so, don't load it - start fresh
    if (isExtensionContextValid() && typeof chrome !== 'undefined' && chrome.storage) {
      const result = await new Promise<any>((resolve) => {
        chrome.storage.local.get(['resumeFitStateCleared'], (result) => {
          resolve(result);
        });
      });
      
      if (result.resumeFitStateCleared) {
        const clearedTime = result.resumeFitStateCleared;
        const timeSinceCleared = Date.now() - clearedTime;
        // If cleared within last 5 seconds, don't load state
        if (timeSinceCleared < 5000) {
          console.log('[Sidebar] State was recently cleared, starting fresh');
          // Remove the flag
          chrome.storage.local.remove(['resumeFitStateCleared'], () => {});
          return; // Don't load state
        } else {
          // Remove old flag
          chrome.storage.local.remove(['resumeFitStateCleared'], () => {});
        }
      }
    }
    
    const message: MessagePayload = {
      type: 'LOAD_STATE',
    };
    
    window.parent.postMessage(message, '*');
    
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'LOAD_STATE_RESPONSE') {
          window.removeEventListener('message', handler);
          const response = event.data.payload;
          if (response?.success && response.state) {
            state = { ...state, ...response.state };
            updateUI();
          }
          resolve();
        }
      };
      window.addEventListener('message', handler);
    });
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

/**
 * Extract job text from current page
 */
async function extractJobText() {
  // Clear any existing timeout from previous extraction attempts
  if (jobExtractionTimeoutId !== null) {
    clearTimeout(jobExtractionTimeoutId);
    jobExtractionTimeoutId = null;
  }

  elements.useJobPageBtn.disabled = true;
  showStatus('Extracting job description...', 'info');

  try {
    const message: MessagePayload = {
      type: 'EXTRACT_JOB_TEXT',
    };
    
    window.parent.postMessage(message, '*');
    
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'EXTRACT_JOB_TEXT_RESPONSE') {
          // Clear timeout since we got a response
          if (jobExtractionTimeoutId !== null) {
            clearTimeout(jobExtractionTimeoutId);
            jobExtractionTimeoutId = null;
          }
          
          window.removeEventListener('message', handler);
          const response = event.data.payload;
          
          if (response?.success) {
            state.jobText = response.jobText || '';
            state.jobUrl = response.jobUrl || '';
            
            updateJobInfo();
            saveState();
            showStatus(`Successfully extracted ${state.jobText.length} characters`, 'success');
          } else {
            showStatus(`Error: ${response?.error || 'Failed to extract job description'}`, 'error');
          }
          
          elements.useJobPageBtn.disabled = false;
          resolve();
        }
      };
      window.addEventListener('message', handler);
      
      // Timeout after 10 seconds - store the timeout ID
      jobExtractionTimeoutId = window.setTimeout(() => {
        jobExtractionTimeoutId = null; // Clear the ID
        window.removeEventListener('message', handler);
        elements.useJobPageBtn.disabled = false;
        showStatus('Request timed out', 'error');
        resolve();
      }, 10000);
    });
  } catch (error) {
    // Clear timeout on error
    if (jobExtractionTimeoutId !== null) {
      clearTimeout(jobExtractionTimeoutId);
      jobExtractionTimeoutId = null;
    }
    
    console.error('Job extraction failed:', error);
    showStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    elements.useJobPageBtn.disabled = false;
  }
}

/**
 * Update job info display
 */
function updateJobInfo() {
  if (state.jobUrl) {
    elements.jobUrl.textContent = state.jobUrl;
    elements.jobInfo.style.display = 'block';
    
    // Show preview (first ~800 chars)
    const preview = state.jobText.substring(0, 800);
    const moreText = state.jobText.length > 800 ? '...' : '';
    elements.jobPreview.textContent = preview + moreText;
  } else {
    elements.jobInfo.style.display = 'none';
  }
}

/**
 * Handle file upload
 * 
 * Supports PDF, DOCX, and TXT files.
 * Extracts text and populates the resume textarea.
 */
async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  // Clear any existing analysis timeouts to prevent confusion
  if (analysisTimeoutId !== null) {
    clearTimeout(analysisTimeoutId);
    analysisTimeoutId = null;
  }

  // Show loading status
  elements.fileUploadStatus.style.display = 'block';
  elements.fileUploadStatus.className = 'file-upload-status info';
  elements.fileUploadStatus.textContent = `Processing ${file.name}...`;

  try {
    const text = await parseResumeFile(file);
    
    // Populate textarea with extracted text
    elements.resumeText.value = text;
    state.resumeText = text;
    state.currentDraft = text;

    // Show textarea and save button after successful upload
    elements.resumeText.style.display = 'block';
    elements.saveResumeBtn.style.display = 'block';
    
    // Update upload label to show file was loaded
    elements.uploadText.textContent = `Resume loaded: ${file.name}`;

    // Save state
    await saveState();
    updateDraftResume();

    // Show success
    elements.fileUploadStatus.className = 'file-upload-status success';
    elements.fileUploadStatus.textContent = `Successfully extracted text from ${file.name}`;
    
    // Clear file input (but keep the label showing the file name)
    input.value = '';

    // Hide status after 5 seconds
    setTimeout(() => {
      elements.fileUploadStatus.style.display = 'none';
    }, 5000);
  } catch (error) {
    console.error('File upload error:', error);
    elements.fileUploadStatus.className = 'file-upload-status error';
    elements.fileUploadStatus.textContent = error instanceof Error ? error.message : 'Failed to process file';
    // Reset upload text on error
    elements.uploadText.textContent = 'Upload Resume (PDF, DOCX, or TXT)';
  }
}

/**
 * Parse resume file (PDF, DOCX, or TXT)
 * 
 * Uses pdfjs-dist for PDF and mammoth for DOCX.
 * Falls back to FileReader for TXT files.
 */
async function parseResumeFile(file: File): Promise<string> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  // Handle TXT files
  if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve(text.trim());
      };
      reader.onerror = () => reject(new Error('Failed to read text file'));
      reader.readAsText(file);
    });
  }

  // Handle PDF files
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    try {
      // Dynamically import pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker source to use chrome-extension:// URL
      // The worker file should be copied to dist/ during build via vite.config.ts
      // Clear any existing worker instance first
      if (typeof globalThis !== 'undefined') {
        (globalThis as any).pdfjsWorker = null;
      }
      
      // Configure worker - must be done before any PDF operations
      let workerConfigured = false;
      try {
        const workerUrl = safeGetURL('pdf.worker.min.js');
        if (workerUrl && typeof workerUrl === 'string' && workerUrl.length > 0) {
          // Validate URL format (should be chrome-extension://...)
          if (workerUrl.startsWith('chrome-extension://') || workerUrl.startsWith('http://') || workerUrl.startsWith('https://')) {
            // Ensure workerSrc is set as a string (PDF.js v5 requirement)
            if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
              // Clear any existing worker
              if ((pdfjsLib.GlobalWorkerOptions as any).workerPort) {
                (pdfjsLib.GlobalWorkerOptions as any).workerPort = null;
              }
              // Set the worker source
              pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
              workerConfigured = true;
              console.log('[Sidebar] PDF worker configured:', workerUrl);
            } else {
              throw new Error('GlobalWorkerOptions not available in PDF.js');
            }
          } else {
            throw new Error(`Invalid worker URL format: ${workerUrl}`);
          }
        } else {
          throw new Error('Cannot get worker URL - extension context invalidated or URL is empty');
        }
      } catch (error) {
        console.warn('[Sidebar] PDF worker setup failed:', error);
        // Fallback: disable worker (runs in main thread - slower but works)
        console.warn('[Sidebar] Using main thread for PDF parsing (slower but functional)');
        if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
          try {
            (pdfjsLib.GlobalWorkerOptions as any).workerSrc = false;
            workerConfigured = true;
          } catch (fallbackError) {
            console.error('[Sidebar] Failed to disable worker:', fallbackError);
          }
        }
      }
      
      // If worker still not configured, try one more time with a direct approach
      if (!workerConfigured && typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
        try {
          const workerUrl = safeGetURL('pdf.worker.min.js');
          if (workerUrl) {
            // Try setting it directly - PDF.js v5 might need this format
            const workerSrcValue = String(workerUrl).trim();
            if (workerSrcValue) {
              // Clear any existing worker port
              delete (pdfjsLib.GlobalWorkerOptions as any).workerPort;
              // Set worker source
              pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcValue;
              console.log('[Sidebar] PDF worker configured (fallback method):', workerSrcValue);
              workerConfigured = true;
            }
          }
        } catch (e) {
          console.warn('[Sidebar] Fallback worker configuration failed:', e);
        }
      }
      
      // Final fallback: disable worker if still not configured
      if (!workerConfigured && typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
        try {
          (pdfjsLib.GlobalWorkerOptions as any).workerSrc = false;
          console.warn('[Sidebar] Using main thread (final fallback - no worker)');
        } catch (e) {
          console.error('[Sidebar] Could not configure worker at all:', e);
        }
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';

      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      return fullText.trim();
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle DOCX files
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType === 'application/msword' ||
    fileName.endsWith('.docx') ||
    fileName.endsWith('.doc')
  ) {
    try {
      // Dynamically import mammoth
      const mammoth = await import('mammoth');

      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });

      return result.value.trim();
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error('Unsupported file type. Please upload a PDF, DOCX, or TXT file.');
}

/**
 * Save resume text
 */
async function saveResumeText() {
  state.resumeText = elements.resumeText.value;
  state.currentDraft = state.resumeText; // Initially, draft mirrors resume
  
  await saveState();
  updateDraftResume();
  showStatus('Resume text saved', 'success');
}

/**
 * Update draft resume display
 */
function updateDraftResume() {
  elements.draftResume.textContent = state.currentDraft || state.resumeText || 'No draft available';
}

/**
 * Handle run analysis - Calls Ollama API via background script
 */
async function handleRunAnalysis() {
  // Prevent multiple concurrent analysis requests
  if (isAnalysisInProgress) {
    showStatus('Analysis already in progress. Please wait for it to complete.', 'info');
    return;
  }

  if (!state.jobText || !state.resumeText) {
    showStatus('Please extract job description and save resume text first', 'error');
    return;
  }

  // Mark analysis as in progress
  isAnalysisInProgress = true;

  // Clear any existing timeout from previous analysis attempts
  if (analysisTimeoutId !== null) {
    clearTimeout(analysisTimeoutId);
    analysisTimeoutId = null;
  }

  // Disable button and show loading state
  elements.runAnalysisBtn.disabled = true;
  elements.runAnalysisBtn.textContent = 'Analyzing...';
  showStatus('Running analysis with Ollama... This may take several minutes. Please wait...', 'info');

  try {
    const message: MessagePayload = {
      type: 'RUN_ANALYSIS',
      payload: {
        resumeText: state.resumeText,
        jobText: state.jobText,
      },
    };

    window.parent.postMessage(message, '*');

    // Wait for response
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'RUN_ANALYSIS_RESPONSE') {
          // Clear timeout since we got a response
          if (analysisTimeoutId !== null) {
            clearTimeout(analysisTimeoutId);
            analysisTimeoutId = null;
          }
          
          window.removeEventListener('message', handler);
          const response = event.data.payload as AnalysisResponse;

          if (response.success && response.result) {
            // Store analysis result
            state.analysisResult = response.result;
            state.currentDraft = response.result.updated_draft;

            // Display results
            displayAnalysisResults(response.result);

            // Save state
            saveState();

            showStatus('Analysis complete!', 'success');
          } else {
            // Show friendly error message
            const errorMsg = response.error || 'Analysis failed';
            
            // Handle 429 (too many requests) specifically
            if (errorMsg.includes('already in progress') || errorMsg.includes('429')) {
              showStatus('Analysis is already running on the server. Please wait for it to complete before trying again.', 'info');
              // Clear our local flag since this request was rejected
              isAnalysisInProgress = false;
            } else {
              // Clear in-progress flag for other errors
              isAnalysisInProgress = false;
              showStatus(errorMsg, 'error');
            }
          }

          // Re-enable button and clear in-progress flag
          isAnalysisInProgress = false;
          elements.runAnalysisBtn.disabled = false;
          elements.runAnalysisBtn.textContent = 'Run Analysis';
          resolve();
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 15 minutes (900 seconds) to match server timeout
      // Server allows up to 15 minutes for analysis
      analysisTimeoutId = window.setTimeout(() => {
        analysisTimeoutId = null; // Clear the ID
        isAnalysisInProgress = false; // Clear in-progress flag
        window.removeEventListener('message', handler);
        elements.runAnalysisBtn.disabled = false;
        elements.runAnalysisBtn.textContent = 'Run Analysis';
        showStatus('Analysis timed out after 15 minutes. The request may be too complex or Ollama may be overloaded.', 'error');
        resolve();
      }, 900000); // 15 minutes (900000ms)
    });
  } catch (error) {
    // Clear timeout and in-progress flag on error
    isAnalysisInProgress = false;
    if (analysisTimeoutId !== null) {
      clearTimeout(analysisTimeoutId);
      analysisTimeoutId = null;
    }
    
    console.error('Analysis failed:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
    elements.runAnalysisBtn.disabled = false;
    elements.runAnalysisBtn.textContent = 'Run Analysis';
  }
}

/**
 * Display analysis results in the UI
 */
function displayAnalysisResults(result: AnalysisResult) {
  // Display compatibility score
  elements.compatibilityScore.textContent = `${result.score}`;
  elements.scoreSection.style.display = 'block';

  // Display missing keywords
  if (result.missing_keywords.length > 0) {
    elements.missingKeywords.innerHTML = '';
    result.missing_keywords.forEach((keyword) => {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag';
      tag.textContent = keyword;
      elements.missingKeywords.appendChild(tag);
    });
    elements.missingKeywordsSection.style.display = 'block';
  } else {
    elements.missingKeywordsSection.style.display = 'none';
  }

  // Display suggested edits
  if (result.suggested_edits.length > 0) {
    elements.suggestedEdits.innerHTML = '';
    result.suggested_edits.forEach((edit, index) => {
      const card = document.createElement('div');
      card.className = 'edit-card';
      
      // Add priority class for styling
      if (edit.priority) {
        card.classList.add(`priority-${edit.priority}`);
      }

      const header = document.createElement('div');
      header.className = 'edit-card-header';
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';

      const headerLeft = document.createElement('div');
      headerLeft.style.display = 'flex';
      headerLeft.style.gap = '8px';
      headerLeft.style.alignItems = 'center';

      const sectionBadge = document.createElement('span');
      sectionBadge.className = 'edit-section-badge';
      sectionBadge.textContent = edit.section;
      headerLeft.appendChild(sectionBadge);

      // Priority badge
      if (edit.priority) {
        const priorityBadge = document.createElement('span');
        priorityBadge.className = `priority-badge priority-${edit.priority}`;
        priorityBadge.textContent = edit.priority.toUpperCase();
        priorityBadge.style.fontSize = '10px';
        priorityBadge.style.padding = '2px 8px';
        headerLeft.appendChild(priorityBadge);
      }

      header.appendChild(headerLeft);

      // Job requirement this addresses
      if (edit.job_requirement) {
        const jobReq = document.createElement('div');
        jobReq.className = 'edit-job-requirement';
        jobReq.style.marginBottom = '8px';
        jobReq.style.padding = '8px';
        jobReq.style.background = '#eff6ff';
        jobReq.style.borderLeft = '3px solid #3b82f6';
        jobReq.style.borderRadius = '4px';
        jobReq.style.fontSize = '12px';
        jobReq.innerHTML = `<strong>📋 Job Requirement:</strong> ${edit.job_requirement}`;
        card.appendChild(jobReq);
      }

      // Alignment impact
      if (edit.alignment_impact) {
        const impact = document.createElement('div');
        impact.className = 'edit-alignment-impact';
        impact.style.marginBottom = '8px';
        impact.style.padding = '8px';
        impact.style.background = '#f0fdf4';
        impact.style.borderLeft = '3px solid #22c55e';
        impact.style.borderRadius = '4px';
        impact.style.fontSize = '12px';
        impact.innerHTML = `<strong>🎯 Impact:</strong> ${edit.alignment_impact}`;
        card.appendChild(impact);
      }

      // Job keywords addressed
      if (edit.job_keywords_addressed && edit.job_keywords_addressed.length > 0) {
        const keywords = document.createElement('div');
        keywords.className = 'edit-keywords';
        keywords.style.marginBottom = '8px';
        keywords.style.fontSize = '12px';
        keywords.innerHTML = `<strong>🔑 Keywords:</strong> `;
        const keywordsContainer = document.createElement('div');
        keywordsContainer.style.display = 'flex';
        keywordsContainer.style.flexWrap = 'wrap';
        keywordsContainer.style.gap = '4px';
        keywordsContainer.style.marginTop = '4px';
        edit.job_keywords_addressed.forEach((keyword) => {
          const keywordTag = document.createElement('span');
          keywordTag.style.display = 'inline-block';
          keywordTag.style.padding = '2px 8px';
          keywordTag.style.background = '#e0e7ff';
          keywordTag.style.color = '#3730a3';
          keywordTag.style.borderRadius = '10px';
          keywordTag.style.fontSize = '10px';
          keywordTag.textContent = keyword;
          keywordsContainer.appendChild(keywordTag);
        });
        keywords.appendChild(keywordsContainer);
        card.appendChild(keywords);
      }

      const beforeAfter = document.createElement('div');
      beforeAfter.className = 'edit-before-after';

      if (edit.before) {
        const before = document.createElement('div');
        before.className = 'edit-before';
        before.textContent = `Before: ${edit.before}`;
        beforeAfter.appendChild(before);
      }

      const after = document.createElement('div');
      after.className = 'edit-after';
      after.textContent = `After: ${edit.after}`;
      beforeAfter.appendChild(after);

      const reason = document.createElement('div');
      reason.className = 'edit-reason';
      reason.textContent = edit.reason;

      card.appendChild(header);
      card.appendChild(beforeAfter);
      card.appendChild(reason);

      elements.suggestedEdits.appendChild(card);
    });
    elements.suggestedEditsSection.style.display = 'block';
  } else {
    elements.suggestedEditsSection.style.display = 'none';
  }

  // Update draft resume
  updateDraftResume();
}

/**
 * Add chat message
 */
function addChatMessage(message: ChatMessage) {
  state.chatHistory.push(message);
  renderChatMessages();
  saveState();
}

/**
 * Render chat messages
 */
function renderChatMessages() {
  elements.chatMessages.innerHTML = '';
  
  if (state.chatHistory.length === 0) {
    elements.chatMessages.innerHTML = '<div style="color: #6b7280; text-align: center; padding: 20px;">No messages yet. Start a conversation!</div>';
    return;
  }
  
  state.chatHistory.forEach((msg) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${msg.role}`;
    
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    header.textContent = msg.role === 'user' ? 'You' : 'Assistant';
    
    const content = document.createElement('div');
    content.className = 'chat-message-content';
    content.textContent = msg.content;
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    elements.chatMessages.appendChild(messageDiv);
  });
  
  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Send chat message - Calls Ollama for iterative resume editing
 * 
 * Flow:
 * 1. User sends message
 * 2. Message sent to Ollama with current draft and chat history
 * 3. Ollama returns assistant message, proposed edits, and optional updated draft
 * 4. Display assistant message in chat
 * 5. If edits proposed, show them as cards with Apply/Keep Chatting buttons
 * 6. User can apply changes or continue chatting
 */
async function sendChatMessage() {
  const input = elements.chatInput.value.trim();
  if (!input) return;

  // Validate we have required data
  if (!state.currentDraft || !state.jobText) {
    showStatus(
      'Please extract job description and have a resume draft before chatting',
      'error'
    );
    return;
  }

  // Clear input and disable send button
  elements.chatInput.value = '';
  elements.sendChatBtn.disabled = true;
  elements.sendChatBtn.textContent = 'Sending...';

  // Create user message
  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    role: 'user',
    content: input,
    timestamp: Date.now(),
  };

  addChatMessage(userMessage);

  try {
    // Prepare chat history for Ollama (just role and content)
    const chatHistoryForOllama = state.chatHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const message: MessagePayload = {
      type: 'CHAT_MESSAGE',
      payload: {
        message: input,
        currentDraft: state.currentDraft,
        jobText: state.jobText,
        chatHistory: chatHistoryForOllama,
      },
    };

    window.parent.postMessage(message, '*');

    // Wait for response
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'CHAT_MESSAGE_RESPONSE') {
          window.removeEventListener('message', handler);
          const response = event.data.payload as ChatResponseWrapper;

          // Re-enable send button
          elements.sendChatBtn.disabled = false;
          elements.sendChatBtn.textContent = 'Send';

          if (response.success && response.result) {
            handleChatResponse(response.result);
          } else {
            // Show error in chat
            const errorMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random()}`,
              role: 'assistant',
              content:
                response.error ||
                'Ollama not running. Please install and run Ollama, then run: ollama pull llama3.1',
              timestamp: Date.now(),
            };
            addChatMessage(errorMessage);
          }

          resolve();
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 60 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        elements.sendChatBtn.disabled = false;
        elements.sendChatBtn.textContent = 'Send';
        const timeoutMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: 'Request timed out. Please try again.',
          timestamp: Date.now(),
        };
        addChatMessage(timeoutMessage);
        resolve();
      }, 60000);
    });
  } catch (error) {
    console.error('Chat failed:', error);
    elements.sendChatBtn.disabled = false;
    elements.sendChatBtn.textContent = 'Send';
    const errorMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'assistant',
      content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
    };
    addChatMessage(errorMessage);
  }
}

/**
 * Handle chat response from Ollama
 * 
 * Displays assistant message and proposed edits (if any).
 * Does NOT auto-apply changes - user must click "Apply These Changes".
 */
function handleChatResponse(response: ChatResponse) {
  // Add assistant message to chat
  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    role: 'assistant',
    content: response.assistant_message,
    timestamp: Date.now(),
  };
  addChatMessage(assistantMessage);

  // If there are proposed edits, display them
  if (response.proposed_edits && response.proposed_edits.length > 0) {
    state.pendingEdits = response.proposed_edits;
    displayProposedEdits(response.proposed_edits, response.updated_draft);
  } else {
    // No edits proposed, hide the section
    elements.proposedEditsSection.style.display = 'none';
    state.pendingEdits = undefined;
  }
}

/**
 * Display proposed edits as cards
 * 
 * Shows section, before/after diff, and reason.
 * Provides Apply and Keep Chatting buttons.
 */
function displayProposedEdits(
  edits: ProposedEdit[],
  updatedDraft: string | null
) {
  elements.proposedEditsList.innerHTML = '';

  edits.forEach((edit) => {
    const card = document.createElement('div');
    card.className = 'edit-card';

    const header = document.createElement('div');
    header.className = 'edit-card-header';

    const sectionBadge = document.createElement('span');
    sectionBadge.className = 'edit-section-badge';
    sectionBadge.textContent = edit.section;

    header.appendChild(sectionBadge);

    const beforeAfter = document.createElement('div');
    beforeAfter.className = 'edit-before-after';

    if (edit.before) {
      const before = document.createElement('div');
      before.className = 'edit-before';
      before.textContent = `Before: ${edit.before}`;
      beforeAfter.appendChild(before);
    }

    const after = document.createElement('div');
    after.className = 'edit-after';
    after.textContent = `After: ${edit.after}`;
    beforeAfter.appendChild(after);

    const reason = document.createElement('div');
    reason.className = 'edit-reason';
    reason.textContent = edit.reason;

    card.appendChild(header);
    card.appendChild(beforeAfter);
    card.appendChild(reason);

    elements.proposedEditsList.appendChild(card);
  });

  // Store updated draft for applying later
  if (updatedDraft) {
    // Store in a temporary property for applying
    (elements.proposedEditsSection as any).pendingUpdatedDraft = updatedDraft;
  }

  // Show the section
  elements.proposedEditsSection.style.display = 'block';
}

/**
 * Apply proposed changes
 * 
 * Replaces currentDraft with updated_draft and saves a version snapshot.
 * Updates the draft preview and persists to storage.
 */
async function applyProposedChanges() {
  const pendingDraft = (elements.proposedEditsSection as any)
    .pendingUpdatedDraft as string | null;

  if (!pendingDraft) {
    showStatus('No changes to apply', 'error');
    return;
  }

  // Save current draft as a version
  await saveDraftVersion(state.currentDraft, 'chat');

  // Update current draft
  state.currentDraft = pendingDraft;

  // Clear pending edits
  state.pendingEdits = undefined;
  (elements.proposedEditsSection as any).pendingUpdatedDraft = null;

  // Hide proposed edits section
  elements.proposedEditsSection.style.display = 'none';

  // Update draft preview
  updateDraftResume();

  // Save state
  await saveState();

  showStatus('Changes applied successfully!', 'success');
}

/**
 * Keep chatting (dismiss proposed edits)
 * 
 * Hides the proposed edits section so user can continue conversation.
 */
function keepChatting() {
  elements.proposedEditsSection.style.display = 'none';
  state.pendingEdits = undefined;
  (elements.proposedEditsSection as any).pendingUpdatedDraft = null;
}

/**
 * Save draft version to history
 * 
 * Creates a version snapshot with timestamp and source.
 * Stores in chrome.storage.local for version history.
 */
async function saveDraftVersion(draftText: string, source: 'chat' | 'analysis' | 'manual') {
  if (!state.draftVersions) {
    state.draftVersions = [];
  }

  const version: DraftVersion = {
    timestamp: Date.now(),
    draftText: draftText,
    source: source,
  };

  state.draftVersions.push(version);

  // Keep only last 50 versions to avoid storage bloat
  if (state.draftVersions.length > 50) {
    state.draftVersions = state.draftVersions.slice(-50);
  }

  await saveState();
}

/**
 * Update UI from state
 */
function updateUI() {
  // Update resume text
  if (state.resumeText) {
    elements.resumeText.value = state.resumeText;
    // Show textarea and save button if resume text exists
    elements.resumeText.style.display = 'block';
    elements.saveResumeBtn.style.display = 'block';
    elements.uploadText.textContent = 'Resume loaded (click to upload different file)';
  } else {
    // Hide textarea and save button if no resume text
    elements.resumeText.style.display = 'none';
    elements.saveResumeBtn.style.display = 'none';
    elements.uploadText.textContent = 'Upload Resume (PDF, DOCX, or TXT)';
  }
  
  // Update job info
  updateJobInfo();
  
  // Update draft resume
  updateDraftResume();
  
  // Update chat
  renderChatMessages();
  
  // Restore analysis results if available
  if (state.analysisResult) {
    displayAnalysisResults(state.analysisResult);
  }

  // Initialize draftVersions if not present
  if (!state.draftVersions) {
    state.draftVersions = [];
  }
}

/**
 * Clear state from storage
 */
async function clearState() {
  try {
    // Reset local state
    state = {
      jobText: '',
      jobUrl: '',
      resumeText: '',
      chatHistory: [],
      currentDraft: '',
      draftVersions: [],
    };
    
    // Reset UI to empty state
    elements.resumeText.value = '';
    elements.resumeText.style.display = 'none';
    elements.saveResumeBtn.style.display = 'none';
    elements.uploadText.textContent = 'Upload Resume (PDF, DOCX, or TXT)';
    elements.jobInfo.style.display = 'none';
    elements.draftResume.textContent = 'No draft available';
    elements.chatMessages.innerHTML = '<div style="color: #6b7280; text-align: center; padding: 20px;">No messages yet. Start a conversation!</div>';
    elements.chatInput.value = '';
    
    // Hide analysis results
    elements.scoreSection.style.display = 'none';
    elements.missingKeywordsSection.style.display = 'none';
    elements.suggestedEditsSection.style.display = 'none';
    elements.proposedEditsSection.style.display = 'none';
    
    // Clear analysis result
    state.analysisResult = undefined;
    state.pendingEdits = undefined;
    
    // Clear from chrome.storage.local - wait for it to complete
    const message: MessagePayload = {
      type: 'CLEAR_STATE',
    };
    
    window.parent.postMessage(message, '*');
    
    // Also try direct chrome.storage if available - wait for completion
    if (isExtensionContextValid() && typeof chrome !== 'undefined' && chrome.storage) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(['resumeFitState'], () => {
          console.log('[Sidebar] State cleared from storage');
          resolve();
        });
      });
      
      // Set a flag to indicate state was cleared (so we don't reload it on next open)
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ resumeFitStateCleared: Date.now() }, () => {
          resolve();
        });
      });
    }
    
    console.log('[Sidebar] State and UI cleared');
  } catch (error) {
    console.error('Failed to clear state:', error);
  }
}

/**
 * Close sidebar
 */
async function closeSidebar() {
  console.log('[Sidebar] closeSidebar called');
  
  // Clear state when closing - wait for it to complete
  await clearState();
  
  const message: MessagePayload = {
    type: 'CLOSE_SIDEBAR',
  };
  
  // Try multiple methods to ensure message is sent
  let messageSent = false;
  
  try {
    // Method 1: Post message to parent window (primary method)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
      console.log('[Sidebar] Sent CLOSE_SIDEBAR message to parent via postMessage');
      messageSent = true;
    }
    
    // Method 2: Also try window.top
    if (window.top && window.top !== window && window.top !== window.parent) {
      window.top.postMessage(message, '*');
      console.log('[Sidebar] Sent CLOSE_SIDEBAR message to top window');
      messageSent = true;
    }
    
    // Method 3: Try sending via chrome.runtime (if available and valid)
    try {
      if (isExtensionContextValid() && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            if (errorMsg.includes('Extension context invalidated')) {
              console.warn('[Sidebar] Extension context invalidated - cannot send message');
            } else {
              console.log('[Sidebar] Chrome runtime message failed:', chrome.runtime.lastError);
            }
          } else {
            console.log('[Sidebar] Sent CLOSE_SIDEBAR via chrome.runtime');
            messageSent = true;
          }
        });
      }
    } catch (e) {
      console.log('[Sidebar] Chrome runtime not available:', e);
    }
    
    // Method 4: Try direct access if in same origin (fallback)
    try {
      if (window.parent && window.parent.document) {
        const containers = window.parent.document.querySelectorAll('#resumefit-sidebar-container');
        if (containers.length > 0) {
          containers.forEach((container) => {
            (container as HTMLElement).style.display = 'none';
            (container as HTMLElement).style.visibility = 'hidden';
          });
          console.log('[Sidebar] Directly hid sidebar containers');
          messageSent = true;
        }
      }
    } catch (e) {
      // Cross-origin, can't access directly
      console.log('[Sidebar] Cannot access parent document directly (cross-origin)');
    }
    
    if (!messageSent) {
      console.error('[Sidebar] Failed to send close message through any method');
    }
  } catch (error) {
    console.error('[Sidebar] Error closing sidebar:', error);
  }
}

/**
 * Open detailed analysis page
 */
function openDetailedAnalysis() {
  if (!state.analysisResult) {
    showStatus('Please run an analysis first', 'error');
    return;
  }

  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      showStatus('Extension context invalidated. Please refresh the page and reload the extension.', 'error');
      return;
    }

    // Generate unique ID for this analysis
    const analysisId = Date.now().toString();

    // Store analysis data with ID
    chrome.storage.local.set(
      {
        [`analysis_${analysisId}`]: {
          analysisResult: state.analysisResult,
          resumeText: state.resumeText,
          jobText: state.jobText,
          jobUrl: state.jobUrl,
          currentDraft: state.currentDraft || state.resumeText,
          chatHistory: state.chatHistory || [],
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          if (errorMsg.includes('Extension context invalidated')) {
            showStatus('Extension context invalidated. Please refresh the page.', 'error');
          } else {
            console.error('Failed to store analysis:', chrome.runtime.lastError);
            showStatus('Failed to open detailed analysis', 'error');
          }
          return;
        }

        // Open analysis page in new tab
        const analysisUrl = safeGetURL(`analysis.html?id=${analysisId}`);
        if (analysisUrl) {
          chrome.tabs.create({ url: analysisUrl });
        } else {
          showStatus('Failed to open detailed analysis - extension context invalidated', 'error');
        }
      }
    );
  } catch (error) {
    console.error('Failed to open detailed analysis:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('invalidated')) {
      showStatus('Extension context invalidated. Please refresh the page and reload the extension.', 'error');
    } else {
      showStatus('Failed to open detailed analysis', 'error');
    }
  }
}

/**
 * Initialize sidebar
 */
async function init() {
  // Load saved state
  await loadState();
  
  // Set up event listeners
  elements.useJobPageBtn.addEventListener('click', extractJobText);
  elements.saveResumeBtn.addEventListener('click', saveResumeText);
  elements.runAnalysisBtn.addEventListener('click', handleRunAnalysis);
  elements.sendChatBtn.addEventListener('click', sendChatMessage);
  elements.applyChangesBtn.addEventListener('click', applyProposedChanges);
  elements.keepChattingBtn.addEventListener('click', keepChatting);
  elements.resumeFileInput.addEventListener('change', handleFileUpload);
  
  // Add close button listener if button exists
  if (elements.closeSidebarBtn) {
    // Remove any existing listeners first
    const newBtn = elements.closeSidebarBtn.cloneNode(true) as HTMLButtonElement;
    elements.closeSidebarBtn.parentNode?.replaceChild(newBtn, elements.closeSidebarBtn);
    elements.closeSidebarBtn = newBtn;
    
    // Add click listener
    elements.closeSidebarBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Close button clicked');
      closeSidebar();
    });
    
    console.log('Close sidebar button listener attached');
  } else {
    console.warn('Close sidebar button not found');
    // Try to find it again after a short delay
    setTimeout(() => {
      const btn = document.getElementById('closeSidebarBtn');
      if (btn) {
        btn.addEventListener('click', closeSidebar);
        console.log('Close sidebar button found and listener attached (delayed)');
      }
    }, 100);
  }
  
  // Add view detailed analysis button listener if button exists
  if (elements.viewDetailedAnalysisBtn) {
    elements.viewDetailedAnalysisBtn.addEventListener('click', openDetailedAnalysis);
  }
  
  // Send on Enter key in chat input
  elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
  
  // Auto-save resume text on input (debounced)
  let saveTimeout: number | null = null;
  elements.resumeText.addEventListener('input', () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = window.setTimeout(() => {
      state.resumeText = elements.resumeText.value;
      state.currentDraft = state.resumeText; // Update draft when resume changes
      saveState();
      updateDraftResume();
    }, 1000);
  });
  
  console.log('ResumeFit Sidebar initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

