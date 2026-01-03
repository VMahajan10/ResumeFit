// Chat Service for ResumeFit

import { ChatRequest, ChatResult } from './types';

/**
 * Send chat message via Extension Bridge
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResult> {
  return new Promise((resolve, reject) => {
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        reject(new Error('EXTENSION_TIMEOUT'));
      }
    }, 10000); // 10 second timeout for chat (longer than analysis)

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'RESUMEFIT_CHAT_RESULT' && !responded) {
        responded = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);

        const result = event.data.payload;

        // Check for errors
        if (result.error) {
          const errorMsg = result.error.toLowerCase();
          if (errorMsg.includes('cannot connect') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) {
            reject(new Error('OLLAMA_NOT_RUNNING'));
          } else {
            reject(new Error(`OLLAMA_ERROR: ${result.error}`));
          }
          return;
        }

        // Map response to ChatResult
        const chatResult: ChatResult = {
          assistantMessage: result.assistantMessage || result.chatReply || '',
          updatedResume: result.updatedResume,
          explanation: result.explanation,
          suggestions: result.suggestions || [],
        };

        resolve(chatResult);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send request to extension
    window.postMessage(
      {
        type: 'RESUMEFIT_CHAT',
        payload: {
          message: request.message,
          currentDraftResume: request.currentDraftResume,
          jobText: request.jobText,
          chatHistory: request.chatHistory,
        },
      },
      '*'
    );
  });
}

