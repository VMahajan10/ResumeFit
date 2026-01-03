import { ChatRequest, ChatResult } from './aiBridge';

const MESSAGE_TYPE_CHAT = 'RESUMEFIT_CHAT';
const MESSAGE_TYPE_CHAT_RESULT = 'RESUMEFIT_CHAT_RESULT';

/**
 * Send chat message via postMessage bridge
 * Falls back to mock response if no extension response in 1 second
 */
export async function sendChatMessage(
  message: string,
  currentDraftText: string,
  jobText: string
): Promise<ChatResult> {
  return new Promise((resolve) => {
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        console.log('No response from extension, using mock chat response');
        resolve({
          assistantMessage: `I understand you're asking: "${message}". This is a mock response. Please install the ResumeFit Bridge extension for AI-powered assistance.`,
        });
      }
    }, 1000);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === MESSAGE_TYPE_CHAT_RESULT &&
        !responded
      ) {
        responded = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        
        const result = event.data.payload as ChatResult;
        console.log('Received chat response from extension:', result);
        resolve(result);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send request
    const request: ChatRequest = {
      message,
      currentDraftText,
      jobText,
    };

    console.log('Sending chat request via postMessage:', {
      type: MESSAGE_TYPE_CHAT,
      payload: request,
    });

    window.postMessage(
      {
        type: MESSAGE_TYPE_CHAT,
        payload: request,
      },
      '*'
    );
  });
}

