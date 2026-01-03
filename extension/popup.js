// ResumeFit AI Bridge Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const modelInput = document.getElementById('model');
  const testButton = document.getElementById('testConnection');
  const scanButton = document.getElementById('scanJob');
  const jobPreview = document.getElementById('jobPreview');
  const jobTextDiv = document.getElementById('jobText');

  // Load saved model preference
  chrome.storage.local.get(['ollamaModel'], (result) => {
    if (result.ollamaModel) {
      modelInput.value = result.ollamaModel;
    }
  });

  // Save model preference
  modelInput.addEventListener('change', () => {
    chrome.storage.local.set({ ollamaModel: modelInput.value });
  });

  // Test Ollama connection
  testButton.addEventListener('click', async () => {
    statusDiv.className = 'status info';
    statusDiv.textContent = 'Testing connection...';
    testButton.disabled = true;

    try {
      // First, ensure the service worker is active
      try {
        await chrome.runtime.sendMessage({ type: 'PING' });
      } catch (e) {
        // Service worker might not be ready, that's okay
      }

      chrome.runtime.sendMessage(
        { type: 'RESUMEFIT_TEST_CONNECTION' },
        (response) => {
          // Check for Chrome extension errors
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            if (errorMsg.includes('Receiving end does not exist') || 
                errorMsg.includes('Could not establish connection')) {
              statusDiv.className = 'status error';
              statusDiv.textContent = '✗ Service worker not ready. Please reload the extension.';
              
              // Add reload instruction
              const reloadHint = document.createElement('div');
              reloadHint.className = 'text-xs text-red-600 mt-2';
              reloadHint.innerHTML = 'Go to chrome://extensions/ → Find "ResumeFit AI Bridge" → Click reload icon';
              statusDiv.parentElement.appendChild(reloadHint);
              setTimeout(() => reloadHint.remove(), 8000);
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = `✗ Extension error: ${errorMsg}`;
            }
            testButton.disabled = false;
            return;
          }

          if (response && response.success) {
            if (response.connected && response.modelExists) {
              statusDiv.className = 'status success';
              statusDiv.textContent = `✓ Connected! Model "${modelInput.value}" is available.`;
            } else if (response.connected) {
              statusDiv.className = 'status error';
              const availableModels = response.models && response.models.length > 0 
                ? response.models.join(', ') 
                : 'none';
              statusDiv.textContent = `✗ Model "${modelInput.value}" not found. Available: ${availableModels}`;
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = '✗ Cannot connect to Ollama';
            }
          } else {
            statusDiv.className = 'status error';
            const errorMsg = response?.error || 'Connection failed';
            statusDiv.textContent = `✗ ${errorMsg}`;
            
            // Add troubleshooting hint
            if (errorMsg.includes('Cannot reach Ollama') || errorMsg.includes('Failed to fetch')) {
              const hint = document.createElement('div');
              hint.className = 'text-xs text-red-600 mt-2';
              hint.textContent = 'Tip: Run "ollama serve" in terminal';
              statusDiv.parentElement.appendChild(hint);
              setTimeout(() => hint.remove(), 5000);
            }
          }
          testButton.disabled = false;
        }
      );
    } catch (error) {
      statusDiv.className = 'status error';
      statusDiv.textContent = `✗ Error: ${error.message}`;
      testButton.disabled = false;
    }
  });

  // Scan job page
  scanButton.addEventListener('click', async () => {
    statusDiv.className = 'status info';
    statusDiv.textContent = 'Scanning job page...';
    scanButton.disabled = true;
    jobPreview.style.display = 'none';

    try {
      chrome.runtime.sendMessage(
        { type: 'RESUMEFIT_SCAN_JOB' },
        (response) => {
          if (response && response.success) {
            statusDiv.className = 'status success';
            statusDiv.textContent = '✓ Job description extracted';
            jobTextDiv.textContent = response.jobText.substring(0, 500) + (response.jobText.length > 500 ? '...' : '');
            jobPreview.style.display = 'block';
          } else {
            statusDiv.className = 'status error';
            statusDiv.textContent = `✗ ${response?.error || 'Failed to extract job description'}`;
          }
          scanButton.disabled = false;
        }
      );
    } catch (error) {
      statusDiv.className = 'status error';
      statusDiv.textContent = `✗ Error: ${error.message}`;
      scanButton.disabled = false;
    }
  });
});
