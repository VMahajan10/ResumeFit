// Content Script for ResumeFit Sidebar Extension
// Injects sidebar iframe into the page

import type { MessagePayload } from './types';

// Prevent duplicate script execution
if ((window as any).__resumefit_sidebar_loaded__) {
  console.warn('[ContentScript] ResumeFit sidebar already loaded, skipping duplicate initialization');
  // eslint-disable-next-line no-throw-literal
  throw new Error('ResumeFit sidebar script already loaded');
}
(window as any).__resumefit_sidebar_loaded__ = true;

let sidebarContainer: HTMLDivElement | null = null;
let sidebarIframe: HTMLIFrameElement | null = null;
let isSidebarVisible = false;

const SIDEBAR_WIDTH = 380;

// Check if extension context is still valid
function isExtensionContextValid(): boolean {
  try {
    // Try to access chrome.runtime.id - this will throw if context is invalidated
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      return false;
    }
    // Try to get URL - this will throw if context is invalidated
    chrome.runtime.getURL('test');
    return true;
  } catch (error) {
    console.warn('[ContentScript] Extension context invalidated:', error);
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
    console.error('[ContentScript] Failed to get URL:', error);
    return null;
  }
}

// Initialize sidebar
function initSidebar() {
  // Check if container already exists in DOM
  const existingContainer = document.getElementById('resumefit-sidebar-container') as HTMLDivElement;
  if (existingContainer) {
    sidebarContainer = existingContainer;
    // Re-find iframe if it exists
    sidebarIframe = existingContainer.querySelector('#resumefit-sidebar-iframe') as HTMLIFrameElement;
    
    // Verify iframe is valid and has content
    if (sidebarIframe) {
      const sidebarUrl = safeGetURL('sidebar.html');
      if (sidebarUrl && (!sidebarIframe.src || sidebarIframe.src !== sidebarUrl)) {
        console.log('[ContentScript] Existing container found but iframe src is invalid, reloading...');
        sidebarIframe.src = sidebarUrl;
      } else {
        console.log('[ContentScript] Found existing sidebar container, reusing it');
        return; // Already initialized and valid
      }
    } else {
      console.log('[ContentScript] Existing container found but iframe missing, recreating iframe...');
      // Container exists but iframe is missing, create it
      sidebarIframe = document.createElement('iframe');
      sidebarIframe.id = 'resumefit-sidebar-iframe';
      sidebarIframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      `;
      const sidebarUrl = safeGetURL('sidebar.html');
      if (sidebarUrl) {
        sidebarIframe.src = sidebarUrl;
        sidebarContainer.appendChild(sidebarIframe);
        observeSidebarVisibility();
        return;
      } else {
        console.error('[ContentScript] Cannot get sidebar URL - extension context invalidated');
        return;
      }
    }
  }
  
  if (sidebarContainer) {
    return; // Already initialized
  }

  // Create container for sidebar
  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'resumefit-sidebar-container';
  sidebarContainer.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${SIDEBAR_WIDTH}px;
    height: 100vh;
    z-index: 2147483647;
    display: none;
    visibility: hidden;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
    background: white;
  `;

  // Create iframe
  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = 'resumefit-sidebar-iframe';
  sidebarIframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  `;

  // Get sidebar HTML URL
  const sidebarUrl = safeGetURL('sidebar.html');
  if (!sidebarUrl) {
    console.error('[ContentScript] Cannot get sidebar URL - extension context invalidated. Please refresh the page.');
    return;
  }
  sidebarIframe.src = sidebarUrl;

  sidebarContainer.appendChild(sidebarIframe);
  document.body.appendChild(sidebarContainer);

  // Adjust page content when sidebar is visible
  observeSidebarVisibility();
}

// Toggle sidebar visibility
function toggleSidebar() {
  // Re-find container if it exists but reference is lost
  if (!sidebarContainer) {
    sidebarContainer = document.getElementById('resumefit-sidebar-container') as HTMLDivElement;
  }
  
  // If still not found, initialize it
  if (!sidebarContainer) {
    initSidebar();
  }

  if (!sidebarContainer) return;

  isSidebarVisible = !isSidebarVisible;

  if (isSidebarVisible) {
    // Show sidebar - ensure both display and visibility are set
    sidebarContainer.style.display = 'block';
    sidebarContainer.style.visibility = 'visible';
    
    // Ensure iframe is properly loaded
    if (sidebarIframe) {
      // Check if iframe has a valid src
      const sidebarUrl = safeGetURL('sidebar.html');
      if (sidebarUrl && (!sidebarIframe.src || sidebarIframe.src !== sidebarUrl)) {
        console.log('[ContentScript] Reloading sidebar iframe');
        sidebarIframe.src = sidebarUrl;
      }
    } else {
      // Re-find iframe if reference was lost
      sidebarIframe = sidebarContainer.querySelector('#resumefit-sidebar-iframe') as HTMLIFrameElement;
      if (!sidebarIframe) {
        console.warn('[ContentScript] Sidebar iframe not found, reinitializing...');
        initSidebar();
      }
    }
    
    adjustPageContent(true);
    console.log('[ContentScript] Sidebar shown');
  } else {
    // Hide sidebar
    sidebarContainer.style.display = 'none';
    sidebarContainer.style.visibility = 'hidden';
    adjustPageContent(false);
    console.log('[ContentScript] Sidebar hidden');
  }
}

// Adjust page content to make room for sidebar
function adjustPageContent(sidebarVisible: boolean) {
  const styleId = 'resumefit-sidebar-adjustment';
  let style = document.getElementById(styleId) as HTMLStyleElement;

  if (sidebarVisible) {
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      body {
        margin-right: ${SIDEBAR_WIDTH}px !important;
        transition: margin-right 0.3s ease;
      }
    `;
  } else {
    if (style) {
      style.textContent = `
        body {
          margin-right: 0 !important;
          transition: margin-right 0.3s ease;
        }
      `;
      // Remove style after transition
      setTimeout(() => {
        if (style && style.textContent?.includes('margin-right: 0')) {
          style.remove();
        }
      }, 300);
    }
  }
}

// Observe sidebar visibility for cleanup
function observeSidebarVisibility() {
  if (!sidebarContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target as HTMLElement;
        const isVisible = target.style.display !== 'none';
        if (!isVisible && isSidebarVisible) {
          isSidebarVisible = false;
          adjustPageContent(false);
        }
      }
    });
  });

  observer.observe(sidebarContainer, {
    attributes: true,
    attributeFilter: ['style'],
  });
}

// Handle messages from background script and sidebar
try {
  chrome.runtime.onMessage.addListener(
    (message: MessagePayload, sender, sendResponse) => {
      // Check if context is still valid
      if (!isExtensionContextValid()) {
        console.warn('[ContentScript] Extension context invalidated - cannot process message');
        sendResponse({ success: false, error: 'Extension context invalidated' });
        return false;
      }
      
      console.log('[ContentScript] Received message from background:', message.type);
      
      if (message.type === 'TOGGLE_SIDEBAR') {
        console.log('[ContentScript] Handling TOGGLE_SIDEBAR');
        toggleSidebar();
        sendResponse({ success: true });
        return true;
      }
      
      if (message.type === 'CLOSE_SIDEBAR') {
        console.log('[ContentScript] Handling CLOSE_SIDEBAR from background');
        const closed = handleCloseSidebar();
        sendResponse({ success: closed });
        return true;
      }

      // Forward messages to sidebar iframe
      if (message.type === 'FORWARD_TO_SIDEBAR') {
        if (sidebarIframe?.contentWindow) {
          sidebarIframe.contentWindow.postMessage(message.payload, '*');
        }
        sendResponse({ success: true });
        return true;
      }
      
      return false;
    }
  );
} catch (error) {
  console.error('[ContentScript] Failed to set up message listener:', error);
}

// Function to handle closing the sidebar
function handleCloseSidebar() {
  console.log('[ContentScript] handleCloseSidebar called');
  
  // Find sidebar container (might have been recreated)
  if (!sidebarContainer) {
    sidebarContainer = document.getElementById('resumefit-sidebar-container') as HTMLDivElement;
  }
  
  if (sidebarContainer) {
    isSidebarVisible = false;
    sidebarContainer.style.display = 'none';
    sidebarContainer.style.visibility = 'hidden';
    adjustPageContent(false);
    console.log('[ContentScript] Sidebar closed successfully');
    return true;
  } else {
    console.warn('[ContentScript] Sidebar container not found, trying to find it');
    // Try to find and hide any sidebar containers
    const containers = document.querySelectorAll('#resumefit-sidebar-container');
    if (containers.length > 0) {
      containers.forEach((container) => {
        (container as HTMLElement).style.display = 'none';
        (container as HTMLElement).style.visibility = 'hidden';
      });
      adjustPageContent(false);
      console.log(`[ContentScript] Found and closed ${containers.length} sidebar container(s)`);
      return true;
    } else {
      console.error('[ContentScript] No sidebar containers found to close');
      return false;
    }
  }
}

// Listen for messages from sidebar iframe
window.addEventListener('message', (event) => {
  // Always accept CLOSE_SIDEBAR messages for reliability (doesn't need chrome.runtime)
  if (event.data?.type === 'CLOSE_SIDEBAR') {
    console.log('[ContentScript] Received CLOSE_SIDEBAR message from:', event.origin);
    handleCloseSidebar();
    return;
  }
  
  // Check extension context validity before using chrome.runtime
  if (!isExtensionContextValid()) {
    console.warn('[ContentScript] Extension context invalidated - cannot process message. Please refresh the page.');
    // Try to send error message back to sidebar
    if (sidebarIframe?.contentWindow && event.data?.type) {
      sidebarIframe.contentWindow.postMessage(
        {
          type: `${event.data.type}_RESPONSE`,
          payload: {
            success: false,
            error: 'Extension context invalidated. Please refresh the page and reload the extension.',
          },
        },
        '*'
      );
    }
    return;
  }
  
  // Security: In production, verify event.origin
  // Accept messages from extension origin or same origin
  const extensionOrigin = safeGetURL('')?.slice(0, -1) || '';
  const isValidOrigin = event.origin === extensionOrigin || 
                        event.origin === window.location.origin ||
                        event.origin.startsWith('chrome-extension://');
  
  if (!isValidOrigin) {
    return; // Ignore messages from other origins
  }

  if (event.data?.type) {
    const message = event.data as MessagePayload;

    // Forward to background script
    if (
      message.type === 'EXTRACT_JOB_TEXT' ||
      message.type === 'SAVE_STATE' ||
      message.type === 'LOAD_STATE' ||
      message.type === 'GET_TAB_URL' ||
      message.type === 'RUN_ANALYSIS' ||
      message.type === 'CHAT_MESSAGE'
    ) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Check for errors
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
            console.error('[ContentScript] Runtime error:', errorMsg);
            // Send error back to sidebar
            if (sidebarIframe?.contentWindow) {
              sidebarIframe.contentWindow.postMessage(
                {
                  type: `${message.type}_RESPONSE`,
                  payload: {
                    success: false,
                    error: errorMsg.includes('Extension context invalidated')
                      ? 'Extension context invalidated. Please refresh the page.'
                      : errorMsg,
                  },
                },
                '*'
              );
            }
            return;
          }
          
          // Send response back to sidebar
          if (sidebarIframe?.contentWindow) {
            sidebarIframe.contentWindow.postMessage(
              {
                type: `${message.type}_RESPONSE`,
                payload: response,
              },
              '*'
            );
          }
        });
      } catch (error) {
        console.error('[ContentScript] Error sending message:', error);
        // Send error back to sidebar
        if (sidebarIframe?.contentWindow) {
          sidebarIframe.contentWindow.postMessage(
            {
              type: `${message.type}_RESPONSE`,
              payload: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            },
            '*'
          );
        }
      }
    }
  }
});

// Initialize sidebar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}

console.log('ResumeFit Sidebar content script loaded');

