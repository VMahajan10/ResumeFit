export interface AnalyzeRequest {
  resumeText: string;
  jobText: string;
}

export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  change: {
    type: 'replace' | 'add' | 'remove';
    target: string;
    content: string;
  };
}

export interface AnalyzeResult {
  score: number;
  gaps: string[];
  suggestions: Suggestion[];
  updatedDraft: string;
}

export interface ChatRequest {
  message: string;
  currentDraftText: string;
  jobText: string;
}

export interface ChatResult {
  assistantMessage: string;
  updatedDraft?: string;
  suggestions?: Suggestion[];
  error?: string;
}

const MESSAGE_TYPE_REQUEST = 'RESUMEFIT_ANALYZE';
const MESSAGE_TYPE_RESPONSE = 'RESUMEFIT_ANALYZE_RESULT';

/**
 * Generate mock analysis data for fallback
 */
function generateMockAnalysis(resumeText: string, jobText: string): AnalyzeResult {
  // Simple keyword extraction from job text
  const jobKeywords = jobText
    .toLowerCase()
    .match(/\b[a-z]{4,}\b/g)
    ?.filter((word, index, arr) => arr.indexOf(word) === index)
    .slice(0, 10) || [];

  // Check which keywords are missing from resume
  const resumeLower = resumeText.toLowerCase();
  const missingKeywords = jobKeywords.filter(
    keyword => !resumeLower.includes(keyword)
  ).slice(0, 5);

  // Generate a compatibility score (mock)
  const score = Math.max(30, 100 - (missingKeywords.length * 10));

  // Generate mock suggestions with new structure
  const suggestions: Suggestion[] = [
    {
      id: '1',
      title: 'Add Professional Summary',
      reason: 'A summary helps recruiters quickly understand your value proposition',
      change: {
        type: 'add',
        target: 'Beginning of resume',
        content: 'Professional Summary: Experienced professional with expertise in relevant skills...',
      },
    },
    {
      id: '2',
      title: 'Enhance Experience Bullet',
      reason: 'Quantifiable achievements are more impactful',
      change: {
        type: 'replace',
        target: 'Worked on various projects',
        content: 'Led cross-functional team of 5 to deliver 3 major projects, resulting in 20% efficiency improvement',
      },
    },
    {
      id: '3',
      title: 'Add Missing Skills',
      reason: `These skills are mentioned in the job description: ${missingKeywords.slice(0, 3).join(', ')}`,
      change: {
        type: 'add',
        target: 'Skills section',
        content: missingKeywords.slice(0, 3).join(', '),
      },
    },
  ].slice(0, Math.min(5, missingKeywords.length + 2));

  // Generate updated draft (for now, just return the original with a note)
  const updatedDraft = resumeText + '\n\n[AI Suggestions Applied - This is mock data]';

  return {
    score,
    gaps: missingKeywords,
    suggestions,
    updatedDraft,
  };
}

/**
 * Request analysis via postMessage bridge
 * Falls back to mock data if no response in 1 second
 */
export async function requestAnalysis(
  resumeText: string,
  jobText: string
): Promise<AnalyzeResult> {
  return new Promise((resolve) => {
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        console.log('No response from extension, using mock data');
        resolve(generateMockAnalysis(resumeText, jobText));
      }
    }, 1000);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      // Security: In production, you might want to verify event.origin
      if (
        event.data?.type === MESSAGE_TYPE_RESPONSE &&
        !responded
      ) {
        responded = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        
        const result = event.data.payload as AnalyzeResult;
        console.log('Received analysis from extension:', result);
        resolve(result);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send request
    const request: AnalyzeRequest = {
      resumeText,
      jobText,
    };

    console.log('Sending analysis request via postMessage:', {
      type: MESSAGE_TYPE_REQUEST,
      payload: request,
    });

    window.postMessage(
      {
        type: MESSAGE_TYPE_REQUEST,
        payload: request,
      },
      '*' // In production, specify exact origin
    );
  });
}

