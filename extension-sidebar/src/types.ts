// Shared types for ResumeFit Sidebar Extension

export interface ExtensionState {
  jobText: string;
  jobUrl: string;
  resumeText: string;
  chatHistory: ChatMessage[];
  currentDraft: string;
  analysisResult?: AnalysisResult; // Store analysis results for persistence
  draftVersions?: DraftVersion[]; // Version history
  pendingEdits?: ProposedEdit[]; // Currently proposed edits from chat
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface MessagePayload {
  type: string;
  payload?: any;
}

export interface ExtractJobResponse {
  success: boolean;
  jobText?: string;
  jobUrl?: string;
  error?: string;
}

// Analysis types for Ollama integration
export interface SuggestedEdit {
  section: 'summary' | 'experience' | 'skills';
  before: string | null;
  after: string;
  reason: string;
  // Enhanced fields for detailed job alignment
  job_requirement?: string; // Specific job requirement this addresses
  alignment_impact?: string; // How this change improves alignment (e.g., "High - directly addresses required skill")
  priority?: 'high' | 'medium' | 'low'; // Priority level
  job_keywords_addressed?: string[]; // Specific keywords from job description this addresses
}

export interface AnalysisResult {
  score: number; // 0-100
  matched_keywords: string[];
  missing_keywords: string[];
  suggested_edits: SuggestedEdit[];
  updated_draft: string;
}

export interface AnalysisResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

// Chat-driven editing types
export interface ProposedEdit {
  section: 'summary' | 'experience' | 'skills';
  before: string | null;
  after: string;
  reason: string;
  // Enhanced fields for detailed job alignment
  job_requirement?: string; // Specific job requirement this addresses
  alignment_impact?: string; // How this change improves alignment
  priority?: 'high' | 'medium' | 'low'; // Priority level
  job_keywords_addressed?: string[]; // Specific keywords from job description this addresses
}

export interface ChatResponse {
  assistant_message: string;
  proposed_edits: ProposedEdit[];
  updated_draft: string | null;
}

export interface ChatResponseWrapper {
  success: boolean;
  result?: ChatResponse;
  error?: string;
}

export interface DraftVersion {
  timestamp: number;
  draftText: string;
  source: 'chat' | 'analysis' | 'manual';
}

