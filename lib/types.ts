// Strict TypeScript types for ResumeFit

export interface Suggestion {
  id: string;
  title: string;
  rationale: string;
  before: string;
  after: string;
}

export interface ProjectIdea {
  title: string;
  why: string;
  stack: string;
  steps: string[];
}

export interface AIResult {
  score: number; // 0-100
  gaps: string[];
  suggestions: Suggestion[];
  updatedResume: string;
  projectIdeas: ProjectIdea[];
}

export interface AIRequest {
  resumeText: string;
  jobText: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatRequest {
  message: string;
  currentDraftResume: string;
  jobText: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatResult {
  assistantMessage: string;
  updatedResume?: string;
  explanation?: string;
  suggestions?: Suggestion[];
}

export type AIProvider = 'extension-bridge' | 'localhost-ollama';

