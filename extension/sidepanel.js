// ResumeFit Side Panel - Main UI Logic

// State management
let state = {
  jobText: '',
  resumeText: '',
  currentDraftResume: '',
  pageTitle: '',
  pageUrl: '',
  compatibilityScore: null,
  missingKeywords: [],
  suggestedEdits: []
};

// DOM elements
const elements = {
  jobTitle: document.getElementById('jobTitle'),
  jobUrl: document.getElementById('jobUrl'),
  extractJobBtn: document.getElementById('extractJobBtn'),
  jobStatus: document.getElementById('jobStatus'),
  resumeText: document.getElementById('resumeText'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  compatibilityScore: document.getElementById('compatibilityScore'),
  missingKeywords: document.getElementById('missingKeywords'),
  suggestedEdits: document.getElementById('suggestedEdits'),
  chatPanel: document.getElementById('chatPanel'),
  draftResume: document.getElementById('draftResume'),
  downloadPdfBtn: document.getElementById('downloadPdfBtn')
};

/**
 * Show status message
 */
function showStatus(element, message, type = 'info') {
  element.style.display = 'block';
  element.className = `status-message ${type}`;
  element.textContent = message;
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

/**
 * Load current tab information
 */
async function loadCurrentTabInfo() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });
    if (response.success) {
      state.pageTitle = response.title;
      state.pageUrl = response.url;
      elements.jobTitle.textContent = response.title || 'No title available';
      elements.jobUrl.textContent = response.url || 'No URL available';
    }
  } catch (error) {
    console.error('Failed to load tab info:', error);
    elements.jobTitle.textContent = 'Unable to load page info';
    elements.jobUrl.textContent = '';
  }
}

/**
 * Extract job description from current page
 */
async function extractJobDescription() {
  elements.extractJobBtn.disabled = true;
  showStatus(elements.jobStatus, 'Extracting job description...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'RESUMEFIT_SCAN_JOB' });
    
    if (response.success) {
      state.jobText = response.jobText || '';
      state.pageTitle = response.pageTitle || state.pageTitle;
      state.pageUrl = response.pageUrl || state.pageUrl;
      
      // Update UI
      elements.jobTitle.textContent = state.pageTitle || 'Job Description Extracted';
      elements.jobUrl.textContent = state.pageUrl || '';
      
      showStatus(elements.jobStatus, `Successfully extracted ${state.jobText.length} characters`, 'success');
      
      // Save state
      await saveState();
      
      // Enable analyze button if resume is also filled
      updateAnalyzeButton();
    } else {
      showStatus(elements.jobStatus, `Error: ${response.error}`, 'error');
      // Still update page info if available
      if (response.pageTitle) {
        state.pageTitle = response.pageTitle;
        elements.jobTitle.textContent = response.pageTitle;
      }
      if (response.pageUrl) {
        state.pageUrl = response.pageUrl;
        elements.jobUrl.textContent = response.pageUrl;
      }
    }
  } catch (error) {
    console.error('Job extraction failed:', error);
    showStatus(elements.jobStatus, `Error: ${error.message}`, 'error');
  } finally {
    elements.extractJobBtn.disabled = false;
  }
}

/**
 * Update analyze button state
 */
function updateAnalyzeButton() {
  elements.analyzeBtn.disabled = !(state.jobText && state.resumeText);
}

/**
 * Save state to storage
 */
async function saveState() {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_STATE',
      payload: state
    });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Load state from storage
 */
async function loadState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'LOAD_STATE' });
    if (response.success && response.state) {
      state = { ...state, ...response.state };
      
      // Restore UI
      if (state.resumeText) {
        elements.resumeText.value = state.resumeText;
      }
      if (state.pageTitle) {
        elements.jobTitle.textContent = state.pageTitle;
      }
      if (state.pageUrl) {
        elements.jobUrl.textContent = state.pageUrl;
      }
      if (state.currentDraftResume) {
        elements.draftResume.textContent = state.currentDraftResume;
      }
      
      updateAnalyzeButton();
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

/**
 * Handle analyze button click (placeholder for now)
 */
function handleAnalyze() {
  if (!state.jobText || !state.resumeText) {
    showStatus(elements.jobStatus, 'Please extract job description and paste your resume', 'error');
    return;
  }
  
  // This will be implemented in future steps
  showStatus(elements.jobStatus, 'Analysis feature coming soon...', 'info');
}

/**
 * Handle download PDF button click (placeholder for now)
 */
function handleDownloadPdf() {
  if (!state.currentDraftResume) {
    showStatus(elements.jobStatus, 'No draft resume available to download', 'error');
    return;
  }
  
  // This will be implemented in future steps
  showStatus(elements.jobStatus, 'PDF download feature coming soon...', 'info');
}

/**
 * Initialize the side panel
 */
async function init() {
  // Load saved state
  await loadState();
  
  // Load current tab info
  await loadCurrentTabInfo();
  
  // Set up event listeners
  elements.extractJobBtn.addEventListener('click', extractJobDescription);
  elements.analyzeBtn.addEventListener('click', handleAnalyze);
  elements.downloadPdfBtn.addEventListener('click', handleDownloadPdf);
  
  // Save resume text on input
  elements.resumeText.addEventListener('input', (e) => {
    state.resumeText = e.target.value;
    saveState();
    updateAnalyzeButton();
  });
  
  // Update analyze button on resume text change
  elements.resumeText.addEventListener('input', updateAnalyzeButton);
  
  console.log('ResumeFit side panel initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

