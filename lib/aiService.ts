// AI Service Abstraction Layer

import { AIRequest, AIResult, AIProvider } from './types';

/**
 * Request AI analysis via Extension Bridge
 */
async function requestAIExtensionBridge(payload: AIRequest): Promise<AIResult> {
  return new Promise((resolve, reject) => {
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        reject(new Error('EXTENSION_TIMEOUT'));
      }
    }, 3000); // 3 second timeout

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      // Security: In production, verify event.origin
      if (event.data?.type === 'RESUMEFIT_ANALYZE_RESULT' && !responded) {
        responded = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);

        const result = event.data.payload;

        // Check for errors
        if (result.error) {
          const errorMsg = result.error.toLowerCase();
          if (errorMsg.includes('cannot connect') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) {
            reject(new Error('OLLAMA_NOT_RUNNING'));
          } else if (errorMsg.includes('model not found') || errorMsg.includes('404')) {
            reject(new Error('OLLAMA_MODEL_NOT_FOUND'));
          } else {
            reject(new Error(`OLLAMA_ERROR: ${result.error}`));
          }
          return;
        }

        // Validate and map response to AIResult
        const aiResult: AIResult = {
          score: result.score || 0,
          gaps: result.gaps || [],
          suggestions: (result.suggestions || []).map((s: any) => ({
            id: s.id || `suggestion-${Date.now()}-${Math.random()}`,
            title: s.title || 'Suggestion',
            rationale: s.rationale || s.reason || '',
            before: s.before || s.current || '',
            after: s.after || s.suggested || s.content || '',
          })),
          updatedResume: result.updatedResume || payload.resumeText,
          projectIdeas: result.projectIdeas || [],
        };

        resolve(aiResult);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send request to extension
    window.postMessage(
      {
        type: 'RESUMEFIT_ANALYZE',
        payload: {
          resumeText: payload.resumeText,
          jobText: payload.jobText,
          chatHistory: [], // Can be extended later
        },
      },
      '*' // In production, specify exact origin
    );

    // Check if extension is installed (give it a moment to respond)
    setTimeout(() => {
      if (!responded) {
        // Extension might not be installed - check if we can detect it
        // For now, we'll let the timeout handle it
      }
    }, 100);
  });
}

/**
 * Generate mock data for fallback
 */
function generateMockResult(payload: AIRequest): AIResult {
  return {
    score: Math.floor(Math.random() * 40) + 60,
    gaps: ['TypeScript', 'React Hooks', 'API Design', 'Testing'],
    suggestions: [
      {
        id: '1',
        title: 'Add Professional Summary',
        rationale: 'A strong summary helps recruiters quickly understand your value proposition',
        before: '',
        after: 'Experienced software engineer with 5+ years building scalable web applications...',
      },
    ],
    updatedResume: payload.resumeText,
    projectIdeas: [],
  };
}

/**
 * Request AI analysis - abstraction layer
 */
export async function requestAI(
  payload: AIRequest,
  provider: AIProvider = 'extension-bridge'
): Promise<AIResult> {
  if (provider === 'extension-bridge') {
    try {
      return await requestAIExtensionBridge(payload);
    } catch (error) {
      // Re-throw with specific error types for UI handling
      throw error;
    }
  } else if (provider === 'localhost-ollama') {
    // TODO: Implement direct localhost Ollama connection
    throw new Error('Localhost Ollama provider not yet implemented');
  } else {
    // Fallback to mock
    return new Promise((resolve) => {
      setTimeout(() => resolve(generateMockResult(payload)), 500);
    });
  }
}

