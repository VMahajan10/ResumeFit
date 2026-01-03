// Detailed Analysis Page Logic

import type {
  AnalysisResult,
  ChatMessage,
  ChatResponse,
  ProposedEdit,
} from '../types';

// Get analysis data from URL parameters or chrome.storage
let analysisData: AnalysisResult | null = null;
let resumeText = '';
let jobText = '';
let jobUrl = '';

// DOM elements
const elements = {
  scoreValue: document.getElementById('scoreValue') as HTMLDivElement,
  scoreDescription: document.getElementById('scoreDescription') as HTMLDivElement,
  matchedKeywords: document.getElementById('matchedKeywords') as HTMLDivElement,
  missingKeywords: document.getElementById('missingKeywords') as HTMLDivElement,
  suggestionsList: document.getElementById('suggestionsList') as HTMLDivElement,
  chatMessages: document.getElementById('chatMessages') as HTMLDivElement,
  chatInput: document.getElementById('chatInput') as HTMLInputElement,
  sendChatBtn: document.getElementById('sendChatBtn') as HTMLButtonElement,
  draftPreview: document.getElementById('draftPreview') as HTMLDivElement,
  downloadDraftBtn: document.getElementById('downloadDraftBtn') as HTMLButtonElement,
  copyDraftBtn: document.getElementById('copyDraftBtn') as HTMLButtonElement,
  closeAnalysisBtn: document.getElementById('closeAnalysisBtn') as HTMLButtonElement,
};

// Chat state
let chatHistory: ChatMessage[] = [];
let currentDraft = '';

/**
 * Load analysis data from storage or URL
 */
async function loadAnalysisData() {
  try {
    // Check if chrome APIs are available
    if (typeof chrome === 'undefined' || !chrome.storage) {
      showError('Chrome extension APIs not available. Please open this page from the extension.');
      return;
    }

    // Try to get from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const analysisId = urlParams.get('id');

    if (analysisId) {
      // Get from chrome.storage using ID
      return new Promise<void>((resolve) => {
        chrome.storage.local.get([`analysis_${analysisId}`], (result) => {
          const stored = result[`analysis_${analysisId}`];
          if (stored) {
            analysisData = stored.analysisResult;
            resumeText = stored.resumeText || '';
            jobText = stored.jobText || '';
            jobUrl = stored.jobUrl || '';
            currentDraft = stored.currentDraft || stored.resumeText || '';
            chatHistory = stored.chatHistory || [];
            displayAnalysis();
          } else {
            showError('Analysis data not found. Please run an analysis first.');
          }
          resolve();
        });
      });
    } else {
      // Fallback: get latest analysis
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['resumeFitState'], (result) => {
          const state = result.resumeFitState;
          if (state) {
            analysisData = state.analysisResult;
            resumeText = state.resumeText || '';
            jobText = state.jobText || '';
            jobUrl = state.jobUrl || '';
            currentDraft = state.currentDraft || state.resumeText || '';
            chatHistory = state.chatHistory || [];
            displayAnalysis();
          } else {
            showError('No analysis data found. Please run an analysis first.');
          }
          resolve();
        });
      });
    }
  } catch (error) {
    console.error('Failed to load analysis data:', error);
    showError('Failed to load analysis data.');
  }
}

/**
 * Display analysis results
 */
function displayAnalysis() {
  if (!analysisData) return;

  // Display score
  elements.scoreValue.textContent = `${analysisData.score}`;
  elements.scoreDescription.textContent = getScoreDescription(analysisData.score);

  // Display matched keywords
  if (analysisData.matched_keywords && analysisData.matched_keywords.length > 0) {
    elements.matchedKeywords.innerHTML = '';
    analysisData.matched_keywords.forEach((keyword) => {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag';
      tag.textContent = keyword;
      elements.matchedKeywords.appendChild(tag);
    });
  } else {
    elements.matchedKeywords.innerHTML = '<p class="empty-state">No matched keywords found</p>';
  }

  // Display missing keywords
  if (analysisData.missing_keywords && analysisData.missing_keywords.length > 0) {
    elements.missingKeywords.innerHTML = '';
    analysisData.missing_keywords.forEach((keyword) => {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag';
      tag.textContent = keyword;
      elements.missingKeywords.appendChild(tag);
    });
  } else {
    elements.missingKeywords.innerHTML = '<p class="empty-state">No missing keywords found</p>';
  }

  // Display suggestions
  if (analysisData.suggested_edits && analysisData.suggested_edits.length > 0) {
    elements.suggestionsList.innerHTML = '';
    analysisData.suggested_edits.forEach((edit, index) => {
      const card = createSuggestionCard(edit, index);
      elements.suggestionsList.appendChild(card);
    });
  } else {
    elements.suggestionsList.innerHTML = '<p class="empty-state">No suggestions available</p>';
  }

  // Display draft
  if (analysisData.updated_draft) {
    currentDraft = analysisData.updated_draft;
    elements.draftPreview.textContent = currentDraft;
  } else if (currentDraft) {
    elements.draftPreview.textContent = currentDraft;
  } else {
    elements.draftPreview.innerHTML = '<p class="empty-state">No resume draft available</p>';
  }
}

/**
 * Get score description
 */
function getScoreDescription(score: number): string {
  if (score >= 90) {
    return 'Excellent match! Your resume aligns very well with this job description.';
  } else if (score >= 75) {
    return 'Good match! Your resume has strong alignment with the job requirements.';
  } else if (score >= 60) {
    return 'Moderate match. Consider making some improvements to better align with the job.';
  } else if (score >= 40) {
    return 'Below average match. Significant improvements needed to align with job requirements.';
  } else {
    return 'Poor match. Major revisions recommended to align with job requirements.';
  }
}

/**
 * Create suggestion card
 */
function createSuggestionCard(edit: ProposedEdit, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'suggestion-card';

  // Add priority class for styling
  if (edit.priority) {
    card.classList.add(`priority-${edit.priority}`);
  }

  const header = document.createElement('div');
  header.className = 'suggestion-header';

  const title = document.createElement('div');
  title.className = 'suggestion-title';
  title.textContent = `Suggestion ${index + 1}`;

  const headerRight = document.createElement('div');
  headerRight.style.display = 'flex';
  headerRight.style.gap = '8px';
  headerRight.style.alignItems = 'center';

  // Priority badge
  if (edit.priority) {
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `priority-badge priority-${edit.priority}`;
    priorityBadge.textContent = edit.priority.toUpperCase();
    headerRight.appendChild(priorityBadge);
  }

  const section = document.createElement('span');
  section.className = 'suggestion-section';
  section.textContent = edit.section;

  headerRight.appendChild(section);
  header.appendChild(title);
  header.appendChild(headerRight);

  const content = document.createElement('div');
  content.className = 'suggestion-content';

  // Job requirement this addresses
  if (edit.job_requirement) {
    const jobReqDiv = document.createElement('div');
    jobReqDiv.className = 'job-requirement';
    jobReqDiv.innerHTML = `<strong>📋 Job Requirement:</strong> ${edit.job_requirement}`;
    content.appendChild(jobReqDiv);
  }

  // Alignment impact
  if (edit.alignment_impact) {
    const impactDiv = document.createElement('div');
    impactDiv.className = 'alignment-impact';
    impactDiv.innerHTML = `<strong>🎯 Alignment Impact:</strong> ${edit.alignment_impact}`;
    content.appendChild(impactDiv);
  }

  // Job keywords addressed
  if (edit.job_keywords_addressed && edit.job_keywords_addressed.length > 0) {
    const keywordsDiv = document.createElement('div');
    keywordsDiv.className = 'job-keywords';
    keywordsDiv.innerHTML = `<strong>🔑 Keywords Addressed:</strong> `;
    const keywordsContainer = document.createElement('div');
    keywordsContainer.style.display = 'flex';
    keywordsContainer.style.flexWrap = 'wrap';
    keywordsContainer.style.gap = '6px';
    keywordsContainer.style.marginTop = '8px';
    edit.job_keywords_addressed.forEach((keyword) => {
      const keywordTag = document.createElement('span');
      keywordTag.className = 'keyword-tag-small';
      keywordTag.textContent = keyword;
      keywordsContainer.appendChild(keywordTag);
    });
    keywordsDiv.appendChild(keywordsContainer);
    content.appendChild(keywordsDiv);
  }

  if (edit.before) {
    const beforeDiv = document.createElement('div');
    beforeDiv.className = 'suggestion-before';
    const beforeLabel = document.createElement('div');
    beforeLabel.className = 'suggestion-label';
    beforeLabel.textContent = 'Current:';
    const beforeText = document.createElement('div');
    beforeText.className = 'suggestion-text';
    beforeText.textContent = edit.before;
    beforeDiv.appendChild(beforeLabel);
    beforeDiv.appendChild(beforeText);
    content.appendChild(beforeDiv);
  }

  const afterDiv = document.createElement('div');
  afterDiv.className = 'suggestion-after';
  const afterLabel = document.createElement('div');
  afterLabel.className = 'suggestion-label';
  afterLabel.textContent = 'Suggested:';
  const afterText = document.createElement('div');
  afterText.className = 'suggestion-text';
  afterText.textContent = edit.after;
  afterDiv.appendChild(afterLabel);
  afterDiv.appendChild(afterText);
  content.appendChild(afterDiv);

  if (edit.reason) {
    const reason = document.createElement('div');
    reason.className = 'suggestion-reason';
    reason.textContent = `💡 ${edit.reason}`;
    content.appendChild(reason);
  }

  card.appendChild(header);
  card.appendChild(content);

  return card;
}

/**
 * Send chat message
 */
async function sendChatMessage() {
  const message = elements.chatInput.value.trim();
  if (!message) return;

  // Add user message to chat
  addChatMessage('user', message);
  elements.chatInput.value = '';

  // Disable input while processing
  elements.sendChatBtn.disabled = true;
  elements.chatInput.disabled = true;

  try {
    // Send to background script
    const response = await new Promise<any>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'CHAT_MESSAGE',
          payload: {
            message,
            currentDraft,
            jobText,
            chatHistory,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response.success && response.result) {
      const chatResponse = response.result as ChatResponse;

      // Add assistant message
      addChatMessage('assistant', chatResponse.assistant_message);

      // Update chat history
      chatHistory.push({ id: Date.now().toString(), role: 'user', content: message, timestamp: Date.now() });
      chatHistory.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: chatResponse.assistant_message,
        timestamp: Date.now(),
      });

      // Update draft if provided
      if (chatResponse.updated_draft) {
        currentDraft = chatResponse.updated_draft;
        elements.draftPreview.textContent = currentDraft;
      }

      // Show proposed edits if any
      if (chatResponse.proposed_edits && chatResponse.proposed_edits.length > 0) {
        displayProposedEdits(chatResponse.proposed_edits);
      }
    } else {
      addChatMessage('assistant', `Error: ${response.error || 'Failed to get response'}`);
    }
  } catch (error) {
    console.error('Chat error:', error);
    addChatMessage('assistant', 'Sorry, I encountered an error. Please try again.');
  } finally {
    elements.sendChatBtn.disabled = false;
    elements.chatInput.disabled = false;
    elements.chatInput.focus();
  }
}

/**
 * Add message to chat
 */
function addChatMessage(role: 'user' | 'assistant', content: string) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = `<strong>${role === 'user' ? 'You' : 'Assistant'}:</strong> ${content}`;

  messageDiv.appendChild(contentDiv);
  elements.chatMessages.appendChild(messageDiv);

  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Display proposed edits from chat
 */
function displayProposedEdits(edits: ProposedEdit[]) {
  // Add a message showing the edits
  const editsText = edits.map((e, i) => `${i + 1}. ${e.section}: ${e.after}`).join('\n');
  addChatMessage('assistant', `I've proposed ${edits.length} edit(s):\n\n${editsText}`);
}

/**
 * Download draft
 */
function downloadDraft() {
  if (!currentDraft) {
    alert('No draft available to download');
    return;
  }

  const blob = new Blob([currentDraft], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resume-draft.txt';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy draft to clipboard
 */
async function copyDraft() {
  if (!currentDraft) {
    alert('No draft available to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(currentDraft);
    alert('Resume draft copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('Failed to copy to clipboard');
  }
}

/**
 * Close analysis page
 */
function closeAnalysis() {
  window.close();
}

/**
 * Show error message
 */
function showError(message: string) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'padding: 20px; background: #fee2e2; color: #991b1b; border-radius: 8px; margin: 20px;';
  errorDiv.textContent = message;
  document.body.insertBefore(errorDiv, document.body.firstChild);
}

/**
 * Initialize
 */
async function init() {
  // Load analysis data
  await loadAnalysisData();

  // Set up event listeners
  elements.sendChatBtn.addEventListener('click', sendChatMessage);
  elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
  elements.downloadDraftBtn.addEventListener('click', downloadDraft);
  elements.copyDraftBtn.addEventListener('click', copyDraft);
  elements.closeAnalysisBtn.addEventListener('click', closeAnalysis);

  console.log('Analysis page initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

