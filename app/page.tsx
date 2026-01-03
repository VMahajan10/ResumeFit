'use client';

import { useState, useRef } from 'react';
import { AIResult, AIProvider, Suggestion } from '@/lib/types';
import { requestAI } from '@/lib/aiService';
import { sendChatMessage } from '@/lib/chatService';
import { downloadResumePDF } from '@/lib/pdfGenerator';
import { parseResumeFile } from '@/lib/fileParser';

export default function Home() {
  // State
  const [resumeText, setResumeText] = useState('');
  const [jobText, setJobText] = useState('');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; updatedResume?: string; explanation?: string; suggestions?: Suggestion[] }>>([]);
  const [currentDraftResume, setCurrentDraftResume] = useState('');
  const [aiProvider, setAiProvider] = useState<AIProvider>('extension-bridge');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize draft when resume text changes
  const handleResumeTextChange = (text: string) => {
    setResumeText(text);
    if (!currentDraftResume && text) {
      setCurrentDraftResume(text);
    }
  };

  // Handle file upload and parsing
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsingFile(true);
    setParsingError(null);
    setUploadedFileName(file.name);

    try {
      const extractedText = await parseResumeFile(file);
      
      if (extractedText.trim()) {
        setResumeText(extractedText);
        setCurrentDraftResume(extractedText);
        setParsingError(null);
        setUploadedFileName(file.name);
        
        // Optional: Auto-analyze if job text is already provided
        // Uncomment the following lines if you want automatic analysis after upload
        // if (jobText.trim()) {
        //   setTimeout(() => {
        //     handleRequestAIReview();
        //   }, 500);
        // }
      } else {
        throw new Error('No text could be extracted from the file');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse file';
      setParsingError(errorMessage);
      setUploadedFileName(null);
      console.error('File parsing error:', error);
    } finally {
      setIsParsingFile(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Request AI Review
  const handleRequestAIReview = async () => {
    if (!resumeText.trim() || !jobText.trim()) {
      setAiError('Please provide both resume and job description text');
      return;
    }

    setIsLoading(true);
    setAiError(null);
    setAiResult(null);

    try {
      const result = await requestAI(
        { resumeText, jobText },
        aiProvider
      );
      setAiResult(result);
      setAiError(null);
    } catch (error) {
      console.error('AI request failed:', error);
      
      // Handle specific error types
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'EXTENSION_TIMEOUT') {
        setAiError('Extension not responding. Make sure ResumeFit AI Bridge extension is installed and active.');
      } else if (errorMessage === 'OLLAMA_NOT_RUNNING') {
        setAiError('Cannot connect to Ollama. Please ensure Ollama is running at http://127.0.0.1:11434');
      } else if (errorMessage === 'OLLAMA_MODEL_NOT_FOUND') {
        setAiError('Ollama model not found. Please ensure the model is pulled: ollama pull llama3.1');
      } else if (errorMessage.startsWith('OLLAMA_ERROR:')) {
        setAiError(errorMessage.replace('OLLAMA_ERROR: ', ''));
      } else {
        setAiError('Failed to get AI review. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Apply Changes (all suggestions)
  const handleApplyChanges = () => {
    if (aiResult?.updatedResume) {
      setCurrentDraftResume(aiResult.updatedResume);
      // Mark all suggestions as applied
      const allSuggestionIds = new Set(aiResult.suggestions.map(s => s.id));
      setAppliedSuggestions(prev => new Set([...prev, ...allSuggestionIds]));
    }
  };

  // Apply individual suggestion
  const handleApplySuggestion = (suggestion: Suggestion) => {
    if (!suggestion.before && !suggestion.after) return;

    let updatedDraft = currentDraftResume;

    if (suggestion.before && suggestion.after) {
      // Replace operation
      if (updatedDraft.includes(suggestion.before)) {
        updatedDraft = updatedDraft.replace(suggestion.before, suggestion.after);
      } else {
        // If exact match not found, try to find similar context
        const lines = updatedDraft.split('\n');
        const beforeLines = suggestion.before.split('\n');
        const afterLines = suggestion.after.split('\n');
        
        // Try to find and replace multi-line matches
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(beforeLines[0])) {
            // Found potential match, replace the section
            const matchLength = Math.min(beforeLines.length, lines.length - i);
            lines.splice(i, matchLength, ...afterLines);
            updatedDraft = lines.join('\n');
            break;
          }
        }
      }
    } else if (suggestion.after && !suggestion.before) {
      // Add operation - append to end or find insertion point
      updatedDraft = updatedDraft + '\n' + suggestion.after;
    }

    setCurrentDraftResume(updatedDraft);
    setAppliedSuggestions(prev => new Set([...prev, suggestion.id]));
  };

  // Download PDF
  const handleDownloadPDF = async () => {
    if (!currentDraftResume.trim()) {
      alert('No resume draft to download. Please provide resume text first.');
      return;
    }

    setIsDownloading(true);
    try {
      await downloadResumePDF(currentDraftResume, jobText);
    } catch (error) {
      console.error('PDF download failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Chat send handler
  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    if (!currentDraftResume.trim() || !jobText.trim()) {
      setAiError('Please provide resume and job description before chatting');
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: chatInput,
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);
    setAiError(null);

    try {
      // Build chat history (last 10 messages for context)
      const recentHistory = chatMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const chatRequest = {
        message: chatInput,
        currentDraftResume,
        jobText,
        chatHistory: [...recentHistory, { role: 'user' as const, content: chatInput }],
      };

      const result = await sendChatMessage(chatRequest);

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: result.assistantMessage,
        updatedResume: result.updatedResume,
        explanation: result.explanation,
        suggestions: result.suggestions,
      };

      setChatMessages(prev => [...prev, assistantMessage]);

      // If AI returned updated resume, update suggestions if provided
      if (result.updatedResume && result.suggestions && result.suggestions.length > 0) {
        // Update aiResult with new suggestions if we have an existing result
        if (aiResult) {
          setAiResult({
            ...aiResult,
            suggestions: result.suggestions,
            updatedResume: result.updatedResume,
          });
        }
      }
    } catch (error) {
      console.error('Chat request failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'EXTENSION_TIMEOUT') {
        setAiError('Extension not responding. Make sure ResumeFit AI Bridge extension is installed.');
      } else if (errorMessage === 'OLLAMA_NOT_RUNNING') {
        setAiError('Cannot connect to Ollama. Please ensure Ollama is running.');
      } else {
        setAiError(`Chat error: ${errorMessage.replace('OLLAMA_ERROR: ', '')}`);
      }

      // Add error message to chat
      const errorMessageObj = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `Sorry, I encountered an error: ${errorMessage.replace('OLLAMA_ERROR: ', '')}. Please try again.`,
      };
      setChatMessages(prev => [...prev, errorMessageObj]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Handle "Regenerate draft with my preferences" command
  const handleRegenerateDraft = async () => {
    if (!currentDraftResume.trim() || !jobText.trim()) {
      setAiError('Please provide resume and job description');
      return;
    }

    // Build chat history from all messages
    const chatHistory = chatMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Add explicit regeneration command
    const regenerateCommand = 'Regenerate draft with my preferences based on our conversation. Use the current draft as the base and incorporate all the changes we discussed.';
    
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: regenerateCommand,
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);
    setAiError(null);

    try {
      const chatRequest = {
        message: regenerateCommand,
        currentDraftResume,
        jobText,
        chatHistory: [...chatHistory, { role: 'user' as const, content: regenerateCommand }],
      };

      const result = await sendChatMessage(chatRequest);

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: result.assistantMessage || result.explanation || 'Draft regenerated based on your preferences.',
        updatedResume: result.updatedResume,
        explanation: result.explanation,
        suggestions: result.suggestions,
      };

      setChatMessages(prev => [...prev, assistantMessage]);

      // Update draft if new version provided
      if (result.updatedResume) {
        setCurrentDraftResume(result.updatedResume);
      }

      // Update suggestions if provided
      if (result.suggestions && result.suggestions.length > 0 && aiResult) {
        setAiResult({
          ...aiResult,
          suggestions: result.suggestions,
          updatedResume: result.updatedResume || currentDraftResume,
        });
      }
    } catch (error) {
      console.error('Regenerate draft failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiError(`Failed to regenerate draft: ${errorMessage.replace('OLLAMA_ERROR: ', '')}`);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900">ResumeFit</h1>
          <p className="text-sm text-gray-600 mt-1">AI-Powered Resume Optimization</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: Inputs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Inputs</h2>

            {/* AI Provider Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Provider
              </label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as AIProvider)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="extension-bridge">Extension Bridge (default)</option>
                <option value="localhost-ollama">Localhost Ollama Direct (later)</option>
              </select>
            </div>

            {/* Resume Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resume Text
              </label>
              
              {/* File Upload Section */}
              <div className="mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="resume-upload"
                />
                <label
                  htmlFor="resume-upload"
                  className={`flex items-center justify-center w-full px-4 py-2 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                    isParsingFile
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                >
                  {isParsingFile ? (
                    <span className="text-sm text-blue-600">Parsing file...</span>
                  ) : (
                    <span className="text-sm text-gray-600">
                      📄 Upload PDF or DOCX
                    </span>
                  )}
                </label>
                {uploadedFileName && !isParsingFile && (
                  <p className="text-xs text-green-600 mt-1">✓ {uploadedFileName}</p>
                )}
                {parsingError && (
                  <p className="text-xs text-red-600 mt-1">✗ {parsingError}</p>
                )}
              </div>

              <div className="text-xs text-gray-500 mb-2 text-center">or</div>

              <textarea
                value={resumeText}
                onChange={(e) => handleResumeTextChange(e.target.value)}
                placeholder="Paste your resume text here..."
                className="w-full h-48 p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Job Description Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Description
              </label>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder="Paste job description text here..."
                className="w-full h-48 p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleRequestAIReview}
                disabled={isLoading || !resumeText.trim() || !jobText.trim()}
                className={`w-full px-4 py-3 rounded-md font-medium transition-colors ${
                  isLoading || !resumeText.trim() || !jobText.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoading ? 'Processing...' : 'Request AI Review'}
              </button>
              <button
                onClick={handleApplyChanges}
                disabled={!aiResult?.updatedResume}
                className={`w-full px-4 py-2 rounded-md font-medium transition-colors ${
                  aiResult?.updatedResume
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Apply Changes
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading || !currentDraftResume.trim()}
                className={`w-full px-4 py-2 rounded-md font-medium transition-colors ${
                  isDownloading || !currentDraftResume.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isDownloading ? 'Generating PDF...' : 'Download PDF'}
              </button>
            </div>
          </div>

          {/* MIDDLE COLUMN: Results */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Results</h2>

            {/* Error Display */}
            {aiError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800 mb-1">Error</h3>
                    <p className="text-sm text-red-700 mb-2">{aiError}</p>
                    {aiError.includes('Extension not responding') && (
                      <div className="mt-2 text-xs text-red-600">
                        <p className="font-medium mb-1">To fix:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Install the ResumeFit AI Bridge extension</li>
                          <li>Go to chrome://extensions/</li>
                          <li>Enable Developer mode and load the extension</li>
                        </ol>
                      </div>
                    )}
                    {aiError.includes('Cannot connect to Ollama') && (
                      <div className="mt-2 text-xs text-red-600">
                        <p className="font-medium mb-1">To fix:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Start Ollama: <code className="bg-red-100 px-1 rounded">ollama serve</code></li>
                          <li>Verify it's running at http://127.0.0.1:11434</li>
                        </ol>
                      </div>
                    )}
                    {aiError.includes('model not found') && (
                      <div className="mt-2 text-xs text-red-600">
                        <p className="font-medium mb-1">To fix:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Pull the model: <code className="bg-red-100 px-1 rounded">ollama pull llama3.1</code></li>
                          <li>Or update the model in the extension popup</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {aiResult ? (
              <>
                {/* Compatibility Score */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-sm text-gray-600 mb-1">Compatibility Score</div>
                  <div className="text-4xl font-bold text-gray-900 mb-2">{aiResult.score}/100</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${aiResult.score}%` }}
                    />
                  </div>
                </div>

                {/* Missing Keywords/Gaps */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Missing Keywords</h3>
                  {aiResult.gaps.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {aiResult.gaps.map((gap, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium"
                        >
                          {gap}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic p-3 bg-gray-50 rounded border border-gray-200">
                      No missing keywords identified
                    </div>
                  )}
                </div>

                {/* Suggestions */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Suggestions</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {aiResult.suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                      >
                        <div className="text-sm font-semibold text-gray-900 mb-1">
                          {suggestion.title}
                        </div>
                        <div className="text-xs text-gray-600 mb-2">
                          {suggestion.rationale}
                        </div>
                        {suggestion.before && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                            <div className="text-red-700 line-through mb-1">
                              Before: {suggestion.before}
                            </div>
                          </div>
                        )}
                        {suggestion.after && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <div className="text-green-700">
                              After: {suggestion.after}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => handleApplySuggestion(suggestion)}
                          disabled={appliedSuggestions.has(suggestion.id)}
                          className={`mt-3 w-full px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            appliedSuggestions.has(suggestion.id)
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {appliedSuggestions.has(suggestion.id) ? '✓ Applied' : 'Apply this suggestion'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Draft Preview */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Preview</h3>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {aiResult.updatedResume}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <p>Click "Request AI Review" to see analysis results</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Chat + Draft */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Chat & Draft</h2>

            {/* Chat Panel */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Chat</h3>
              </div>
              <div className="h-48 overflow-y-auto p-3 space-y-2 bg-white">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-8">
                    Start a conversation about your resume
                  </p>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="space-y-2">
                      <div
                        className={`p-2 rounded-lg text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-50 text-blue-900 ml-4'
                            : 'bg-gray-50 text-gray-900 mr-4'
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.role === 'assistant' && msg.explanation && (
                        <div className="text-xs text-gray-600 italic px-2 mr-4">
                          {msg.explanation}
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.updatedResume && (
                        <div className="px-2 mr-4">
                          <button
                            onClick={() => {
                              setCurrentDraftResume(msg.updatedResume!);
                              if (msg.suggestions && msg.suggestions.length > 0 && aiResult) {
                                setAiResult({
                                  ...aiResult,
                                  suggestions: msg.suggestions,
                                  updatedResume: msg.updatedResume!,
                                });
                              }
                            }}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Apply Changes
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 text-gray-900 rounded-lg px-3 py-2 text-sm mr-4">
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50 space-y-2">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    placeholder="Ask about your resume or request changes..."
                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={isChatLoading || !currentDraftResume.trim() || !jobText.trim()}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={isChatLoading || !chatInput.trim() || !currentDraftResume.trim() || !jobText.trim()}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      chatInput.trim() && !isChatLoading && currentDraftResume.trim() && jobText.trim()
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isChatLoading ? '...' : 'Send'}
                  </button>
                </div>
                <button
                  onClick={handleRegenerateDraft}
                  disabled={isChatLoading || !currentDraftResume.trim() || !jobText.trim() || chatMessages.length === 0}
                  className={`w-full px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    !isChatLoading && currentDraftResume.trim() && jobText.trim() && chatMessages.length > 0
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Regenerate draft with my preferences
                </button>
              </div>
            </div>

            {/* Current Draft Resume */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Draft Resume</h3>
              <textarea
                value={currentDraftResume}
                onChange={(e) => setCurrentDraftResume(e.target.value)}
                placeholder="Resume draft will appear here..."
                className="w-full h-48 p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
