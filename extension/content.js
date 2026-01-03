// ResumeFit AI Bridge - Content Script

/**
 * Extract job description text from current page
 */
function extractJobText() {
  try {
    // Clone the document to avoid modifying the original
    const clone = document.cloneNode(true);
    
    // Remove script and style elements from clone
    const scripts = clone.querySelectorAll('script, style, noscript, nav, header, footer, aside, .sidebar, .advertisement, .ads');
    scripts.forEach(el => el.remove());

    // Try common job board selectors (ordered by specificity)
    const selectors = [
      // LinkedIn
      '[data-testid*="job"]',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      // Indeed
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      // Generic
      '.job-description',
      '.job-details',
      '#job-description',
      '.description',
      '[class*="jobDescription"]',
      '[id*="jobDescription"]',
      '[class*="job-description"]',
      '[id*="job-description"]',
      // Common content containers
      'article',
      '[role="main"]',
      'main',
      '.content',
      '.main-content',
    ];

    let text = '';
    let element = null;

    // Try selectors on the original document first
    for (const selector of selectors) {
      try {
        element = document.querySelector(selector);
        if (element) {
          text = element.innerText || element.textContent || '';
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

    // Fallback to body text if no specific element found
    if (text.length < 200) {
      const body = document.body;
      if (body) {
        // Try to get main content area
        const mainContent = body.querySelector('main, [role="main"], article, .content') || body;
        text = mainContent.innerText || mainContent.textContent || '';
      }
    }
    
    // Get page title and URL for context
    const pageTitle = document.title || '';
    const pageUrl = window.location.href || '';

    // Clean up the text
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // If still too short, return what we have with a note
    if (text.length < 50) {
      throw new Error('Could not extract sufficient text from page. The page might not contain a job description, or it may be loaded dynamically.');
    }

    return {
      text: text,
      title: pageTitle,
      url: pageUrl
    };
  } catch (error) {
    console.error('Job extraction error:', error);
    throw error;
  }
}

/**
 * Inject script to enable website communication
 */
function injectWebsiteBridge() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // Listen for messages from the website
      window.addEventListener('message', async (event) => {
        if (event.data?.type === 'RESUMEFIT_ANALYZE') {
          const { resumeText, jobText, chatHistory } = event.data.payload || {};
          
          // Send to background script
          chrome.runtime.sendMessage({
            type: 'RESUMEFIT_RUN_AI',
            payload: { resumeText, jobText, chatHistory }
          }, (response) => {
            // Send response back to website
            window.postMessage({
              type: 'RESUMEFIT_ANALYZE_RESULT',
              payload: response.success ? response.result : { error: response.error }
            }, '*');
          });
        }
      });

      // Expose function for direct calls (optional)
      window.resumeFitAI = {
        analyze: async function(resumeText, jobText, chatHistory) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'RESUMEFIT_RUN_AI',
              payload: { resumeText, jobText, chatHistory }
            }, (response) => {
              if (response.success) {
                resolve(response.result);
              } else {
                reject(new Error(response.error));
              }
            });
          });
        }
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// Inject bridge script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectWebsiteBridge);
} else {
  injectWebsiteBridge();
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_JOB_TEXT') {
    // Use setTimeout to allow dynamic content to load
    setTimeout(() => {
      try {
        const result = extractJobText();
        sendResponse({ 
          success: true, 
          jobText: result.text || result,
          pageTitle: result.title || document.title,
          pageUrl: result.url || window.location.href
        });
      } catch (error) {
        console.error('Job extraction failed:', error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to extract job description',
          pageTitle: document.title,
          pageUrl: window.location.href
        });
      }
    }, 500); // Wait 500ms for dynamic content
    
    return true; // Keep channel open for async response
  }
});

// Listen for messages from website (postMessage bridge)
window.addEventListener('message', async (event) => {
  // Security: In production, verify event.origin
  if (event.data?.type === 'RESUMEFIT_ANALYZE') {
    const { resumeText, jobText, chatHistory } = event.data.payload || {};

    if (!resumeText || !jobText) {
      window.postMessage(
        {
          type: 'RESUMEFIT_ANALYZE_RESULT',
          payload: { error: 'Missing resumeText or jobText' },
        },
        '*'
      );
      return;
    }

    try {
      // Send to background script
      chrome.runtime.sendMessage(
        {
          type: 'RESUMEFIT_RUN_AI',
          payload: { resumeText, jobText, chatHistory },
        },
        (response) => {
          if (response && response.success) {
            window.postMessage(
              {
                type: 'RESUMEFIT_ANALYZE_RESULT',
                payload: response.result,
              },
              '*'
            );
          } else {
            window.postMessage(
              {
                type: 'RESUMEFIT_ANALYZE_RESULT',
                payload: {
                  error: response?.error || 'Failed to analyze resume',
                },
              },
              '*'
            );
          }
        }
      );
    } catch (error) {
      window.postMessage(
        {
          type: 'RESUMEFIT_ANALYZE_RESULT',
          payload: { error: error.message },
        },
        '*'
      );
    }
  }

  if (event.data?.type === 'RESUMEFIT_CHAT') {
    const { message, currentDraftResume, jobText, chatHistory } = event.data.payload || {};

    if (!message || !currentDraftResume || !jobText) {
      window.postMessage(
        {
          type: 'RESUMEFIT_CHAT_RESULT',
          payload: { error: 'Missing message, currentDraftResume, or jobText' },
        },
        '*'
      );
      return;
    }

    try {
      // Send to background script
      chrome.runtime.sendMessage(
        {
          type: 'RESUMEFIT_CHAT',
          payload: { message, currentDraftResume, jobText, chatHistory },
        },
        (response) => {
          if (response && response.success) {
            window.postMessage(
              {
                type: 'RESUMEFIT_CHAT_RESULT',
                payload: response.result,
              },
              '*'
            );
          } else {
            window.postMessage(
              {
                type: 'RESUMEFIT_CHAT_RESULT',
                payload: {
                  error: response?.error || 'Failed to process chat message',
                },
              },
              '*'
            );
          }
        }
      );
    } catch (error) {
      window.postMessage(
        {
          type: 'RESUMEFIT_CHAT_RESULT',
          payload: { error: error.message },
        },
        '*'
      );
    }
  }
});

console.log('ResumeFit AI Bridge: Content script loaded');
