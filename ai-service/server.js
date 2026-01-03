// ResumeFit Custom AI API Service
// Uses vector database for RAG (Retrieval Augmented Generation)

import express from 'express';
import cors from 'cors';
import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const USE_OLLAMA = process.env.USE_OLLAMA !== 'false'; // Set to 'false' to disable Ollama
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize ChromaDB (local vector database)
const chromaClient = new ChromaClient({
  path: process.env.CHROMA_PATH || 'http://localhost:8000'
});

const COLLECTION_NAME = 'resumefit_knowledge';

// Initialize embedding model (local, no API key needed)
let embeddingPipeline = null;
let embeddingModel = null;

/**
 * Initialize embedding model
 * Uses local transformer model - no API key required
 */
async function initializeEmbeddingModel() {
  try {
    console.log('Loading embedding model...');
    // Using a lightweight local embedding model
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2' // Lightweight, fast, local model
    );
    console.log('Embedding model loaded successfully');
  } catch (error) {
    console.error('Failed to load embedding model:', error);
    throw error;
  }
}

/**
 * Generate embeddings for text
 */
async function generateEmbedding(text) {
  if (!embeddingPipeline) {
    await initializeEmbeddingModel();
  }
  
  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });
  
  return Array.from(output.data);
}

let chromaAvailable = false;

/**
 * Initialize or get ChromaDB collection
 */
async function getOrCreateCollection() {
  if (!chromaAvailable) {
    return null; // Return null if ChromaDB not available
  }
  
  try {
    // Try to get existing collection
    const collection = await chromaClient.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { description: 'ResumeFit knowledge base' }
    });
    return collection;
  } catch (error) {
    console.warn('ChromaDB error:', error.message);
    chromaAvailable = false;
    return null; // Gracefully handle ChromaDB unavailability
  }
}

/**
 * Store resume/job data in vector database
 */
async function storeInVectorDB(text, metadata) {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) {
      return false; // ChromaDB not available
    }
    
    const embedding = await generateEmbedding(text);
    
    await collection.add({
      ids: [`doc_${Date.now()}_${Math.random()}`],
      embeddings: [embedding],
      documents: [text],
      metadatas: [metadata],
    });
    
    return true;
  } catch (error) {
    console.error('Error storing in vector DB:', error);
    return false;
  }
}

/**
 * Retrieve similar content from vector database
 */
async function retrieveSimilarContent(queryText, topK = 5) {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) {
      return []; // ChromaDB not available, return empty
    }
    
    const queryEmbedding = await generateEmbedding(queryText);
    
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
    });
    
    return results.documents[0] || [];
  } catch (error) {
    console.error('Error retrieving from vector DB:', error);
    return [];
  }
}

/**
 * Generate AI response for chat (with chat-specific fallback)
 */
async function generateAIResponseForChat(prompt, context = '') {
  // Enhanced prompt with retrieved context
  const enhancedPrompt = context 
    ? `${prompt}\n\nRelevant Context:\n${context}`
    : prompt;
  
  // Option 1: Try Ollama if enabled
  if (USE_OLLAMA) {
    try {
      // Add timeout using AbortController - reduced to 30 seconds for faster fallback
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: 'user', content: enhancedPrompt }],
            stream: false,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          return data.message?.content || data.response || '';
        }
        
        // If Ollama returns error, fall through to alternatives
        console.warn(`Ollama returned ${response.status}, trying alternatives...`);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('Ollama request timed out after 2 minutes, trying alternatives...');
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.warn('Ollama not available, trying alternatives:', error.message);
    }
  }
  
  // Option 2: Use local transformers model
  try {
    return await generateWithLocalLLM(enhancedPrompt);
  } catch (error) {
    console.warn('Local LLM not available, using chat fallback:', error.message);
  }
  
  // Option 3: Chat-specific fallback
  // Extract message from prompt for fallback
  const messageMatch = prompt.match(/User's current message:\s*(.+)/);
  const userMessage = messageMatch ? messageMatch[1] : 'user request';
  const draftMatch = prompt.match(/Current Draft Resume:\s*([\s\S]*?)(?=Job Description:)/);
  const currentDraft = draftMatch ? draftMatch[1].trim() : '';
  
  // Return as JSON string (will be parsed in handleChatMessage)
  const fallbackResponse = generateChatFallbackResponse(userMessage, currentDraft);
  return JSON.stringify(fallbackResponse);
}

/**
 * Generate AI response using local LLM with RAG
 * 
 * Options:
 * 1. Ollama (if enabled and available)
 * 2. Local transformers model (fully local, no external services)
 * 3. Fallback response (rule-based)
 */
async function generateAIResponse(prompt, context = '') {
  // Enhanced prompt with retrieved context
  const enhancedPrompt = context 
    ? `${prompt}\n\nRelevant Context:\n${context}`
    : prompt;
  
  // Option 1: Try Ollama if enabled
  if (USE_OLLAMA) {
    try {
      // Add timeout using AbortController - reduced to 30 seconds for faster fallback
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: 'user', content: enhancedPrompt }],
            stream: false,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          return data.message?.content || data.response || '';
        }
        
        // If Ollama returns error, fall through to alternatives
        console.warn(`Ollama returned ${response.status}, trying alternatives...`);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('Ollama request timed out after 2 minutes, trying alternatives...');
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.warn('Ollama not available, trying alternatives:', error.message);
    }
  }
  
  // Option 2: Use local transformers model (fully local, no Ollama needed)
  // This is slower but works without any external services
  try {
    return await generateWithLocalLLM(enhancedPrompt);
  } catch (error) {
    console.warn('Local LLM not available, using fallback:', error.message);
  }
  
  // Option 3: Fallback to rule-based response
  return generateFallbackResponse(prompt);
}

/**
 * Generate response using local transformers model
 * Fully local - no Ollama or external APIs needed
 */
let textGenerationPipeline = null;

async function generateWithLocalLLM(prompt) {
  try {
    // Lazy load the text generation model
    if (!textGenerationPipeline) {
      console.log('Loading local text generation model...');
      const { pipeline } = await import('@xenova/transformers');
      
      // Use a small, fast model for text generation
      // Note: This is slower than Ollama but fully local
      textGenerationPipeline = await pipeline(
        'text-generation',
        'Xenova/LaMini-Flan-T5-248M', // Small, fast model
        { device: 'cpu' } // Use CPU (can be slow)
      );
      console.log('Local text generation model loaded');
    }
    
    // Generate response
    const output = await textGenerationPipeline(prompt, {
      max_new_tokens: 500,
      temperature: 0.7,
      do_sample: true,
    });
    
    return output[0]?.generated_text || '';
  } catch (error) {
    console.error('Local LLM generation error:', error);
    throw error;
  }
}

/**
 * Chat-specific fallback response generator
 */
function generateChatFallbackResponse(message, currentDraft) {
  const lowerMessage = message.toLowerCase();
  
  // Generate appropriate response based on message content
  let assistantMessage = "I understand you'd like to improve your resume. ";
  let proposedEdits = [];
  let updatedDraft = null;
  
  if (lowerMessage.includes('summary') || lowerMessage.includes('concise') || lowerMessage.includes('shorter')) {
    assistantMessage += "I can help make your summary more concise. Here's a suggestion:";
    proposedEdits = [{
      section: 'summary',
      before: currentDraft.split('\n')[0] || null,
      after: 'Professional with expertise in key technologies and proven track record of delivering results.',
      reason: 'A concise summary is more impactful and easier to scan.'
    }];
  } else if (lowerMessage.includes('skill') || lowerMessage.includes('add')) {
    assistantMessage += "I can help you add relevant skills. Consider highlighting:";
    proposedEdits = [{
      section: 'skills',
      before: null,
      after: 'Add relevant technical skills that match the job description.',
      reason: 'Matching skills increase your resume\'s relevance to the position.'
    }];
  } else if (lowerMessage.includes('experience') || lowerMessage.includes('work')) {
    assistantMessage += "I can help improve your experience section. Consider:";
    proposedEdits = [{
      section: 'experience',
      before: null,
      after: 'Quantify achievements with specific metrics and results.',
      reason: 'Quantified achievements demonstrate impact and value.'
    }];
  } else {
    assistantMessage += "I'm here to help improve your resume. Could you be more specific about what you'd like to change? For example, you could ask to make the summary more concise, add specific skills, or improve the experience section.";
  }
  
  return {
    assistant_message: assistantMessage,
    proposed_edits: proposedEdits,
    updated_draft: updatedDraft,
  };
}

/**
 * Fallback response generator for analysis (when LLM is not available)
 * Tries to extract specific requirements from the prompt
 */
function generateFallbackResponse(prompt) {
  // Try to extract job requirements from the prompt
  const jobSectionMatch = prompt.match(/=== JOB DESCRIPTION ===\s*([\s\S]*?)(?=== KEY REQUIREMENTS|=== RESUME|$)/i);
  const resumeMatch = prompt.match(/=== RESUME TEXT ===\s*([\s\S]*?)(?=== ANALYSIS|$)/i);
  
  const jobText = jobSectionMatch ? jobSectionMatch[1].trim().replace(/\[\.\.\. truncated \.\.\.\]/g, '') : '';
  const resumeText = resumeMatch ? resumeMatch[1].trim().replace(/\[\.\.\. truncated \.\.\.\]/g, '') : '';
  
  // Expanded tech keywords list
  const techKeywords = [
    'python', 'javascript', 'react', 'node', 'sql', 'aws', 'docker', 'kubernetes', 
    'java', 'typescript', 'angular', 'vue', 'django', 'flask', 'spring', 'postgresql', 
    'mongodb', 'redis', 'mysql', 'postgres', 'git', 'github', 'ci/cd', 'jenkins', 
    'terraform', 'ansible', 'azure', 'gcp', 'linux', 'unix', 'html', 'css', 
    'sass', 'less', 'webpack', 'babel', 'npm', 'yarn', 'graphql', 'rest', 'api',
    'microservices', 'agile', 'scrum', 'jira', 'confluence', 'slack', 'figma',
    'machine learning', 'ml', 'ai', 'data science', 'pandas', 'numpy', 'tensorflow',
    'pytorch', 'scikit-learn', 'r', 'matlab', 'excel', 'tableau', 'power bi'
  ];
  
  // Extract keywords from job description (case-insensitive)
  const jobLower = jobText.toLowerCase();
  const resumeLower = resumeText.toLowerCase();
  
  const foundInJob = techKeywords.filter(kw => jobLower.includes(kw.toLowerCase()));
  const foundInResume = techKeywords.filter(kw => resumeLower.includes(kw.toLowerCase()));
  const missingTech = foundInJob.filter(kw => !foundInResume.includes(kw));
  
  // Extract experience requirements
  const experiencePattern = /(\d+)\+?\s*years?/gi;
  const experienceMatches = [...new Set(jobText.match(experiencePattern) || [])];
  
  // Extract degree requirements
  const degreePattern = /(bachelor|master|phd|ph\.d|degree|certification|certified)/gi;
  const degreeMatches = [...new Set(jobText.match(degreePattern) || [])];
  
  // Generate suggestions based on actual extracted requirements
  const suggested_edits = [];
  
  // Add missing technologies (up to 3 most important)
  missingTech.slice(0, 3).forEach(tech => {
    const techLine = jobText.split('\n').find(line => 
      line.toLowerCase().includes(tech.toLowerCase())
    ) || `Required: ${tech}`;
    
    suggested_edits.push({
      section: 'skills',
      before: null,
      after: `Add ${tech.charAt(0).toUpperCase() + tech.slice(1)} to your skills section`,
      reason: `The job requires ${tech}, but it's not mentioned in your resume`,
      job_requirement: techLine.substring(0, 200),
      alignment_impact: `High - ${tech} is specifically required in the job description`,
      priority: 'high',
      job_keywords_addressed: [tech]
    });
  });
  
  // Add experience requirement if found
  if (experienceMatches.length > 0 && resumeText.length > 0) {
    const expReq = experienceMatches[0];
    const expLine = jobText.split('\n').find(line => line.includes(expReq)) || `Required: ${expReq}`;
    
    suggested_edits.push({
      section: 'experience',
      before: null,
      after: `Ensure your experience section clearly highlights ${expReq} of relevant experience`,
      reason: `The job requires ${expReq} of experience - make sure this is prominently stated`,
      job_requirement: expLine.substring(0, 200),
      alignment_impact: `High - directly addresses the experience requirement`,
      priority: 'high',
      job_keywords_addressed: [expReq]
    });
  }
  
  // Calculate score based on matches
  const matchRatio = foundInResume.length / Math.max(foundInJob.length, 1);
  const score = Math.min(Math.round(50 + (matchRatio * 40)), 90);
  
  // If we have good suggestions, use them; otherwise provide helpful message
  if (suggested_edits.length === 0) {
    suggested_edits.push({
      section: 'summary',
      before: null,
      after: 'Review the job description and ensure your resume highlights all required skills and experience. Consider adding a professional summary that matches key job requirements.',
      reason: 'AI analysis timed out, but you can manually review the job requirements against your resume',
      job_requirement: 'Manual review recommended',
      alignment_impact: 'Review job description for specific requirements',
      priority: 'medium',
      job_keywords_addressed: []
    });
  }
  
  const response = {
    score: score,
    matched_keywords: foundInResume,
    missing_keywords: missingTech,
    suggested_edits: suggested_edits,
    updated_draft: resumeText,
  };
  
  return JSON.stringify(response);
}

/**
 * Analyze resume with RAG
 */
async function analyzeResume(resumeText, jobText) {
  // Store job description in vector DB for future reference
  await storeInVectorDB(jobText, {
    type: 'job_description',
    timestamp: new Date().toISOString(),
  });
  
  // Retrieve similar job descriptions for context
  const similarJobs = await retrieveSimilarContent(jobText, 3);
  const context = similarJobs.join('\n\n---\n\n');
  
  // Generate analysis prompt
  const systemPrompt = `You are a resume analysis expert. You MUST provide SPECIFIC, JOB-SPECIFIC suggestions based on the ACTUAL job description and ACTUAL resume content. NO generic advice. Return ONLY valid JSON. No explanations, no markdown, no code blocks, just raw JSON.

CRITICAL REQUIREMENTS:
1. Read the job description CAREFULLY - identify specific requirements, skills, technologies, qualifications, responsibilities
2. Read the resume CAREFULLY - identify what the candidate actually has
3. Compare them DIRECTLY - find specific gaps and mismatches
4. Provide suggestions that DIRECTLY address specific job requirements from the job description
5. Quote or reference SPECIFIC parts of the job description in your suggestions
6. Reference SPECIFIC parts of the resume that need to change
7. NO generic advice like "add a summary" or "quantify achievements" unless it directly addresses a specific job requirement

Return exactly this JSON structure:
{
  "score": <number 0-100>,
  "matched_keywords": [<array of strings>],
  "missing_keywords": [<array of strings>],
  "suggested_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": <string or null - quote the ACTUAL text from the resume that needs changing>,
      "after": <string - SPECIFIC replacement text that addresses a SPECIFIC job requirement>,
      "reason": <string - explain how this SPECIFIC change addresses a SPECIFIC job requirement>,
      "job_requirement": <string - quote the EXACT requirement from the job description this addresses>,
      "alignment_impact": <string - how this SPECIFIC change improves alignment with the SPECIFIC job requirement>,
      "priority": <"high" | "medium" | "low">,
      "job_keywords_addressed": [<array of SPECIFIC keywords/phrases from the job description this addresses>]
    }
  ],
  "updated_draft": <string>
}

CRITICAL: Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no explanation text.`;

  // Extract key requirements from job description for better prompting
  const extractJobRequirements = (jobText) => {
    const requirements = [];
    const lines = jobText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Look for common requirement patterns
    const requirementKeywords = ['required', 'must have', 'qualifications', 'requirements', 'skills', 'experience', 'years', 'degree', 'certification'];
    
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      if (requirementKeywords.some(kw => lowerLine.includes(kw))) {
        // Get context around requirement lines
        const context = [];
        for (let i = Math.max(0, idx - 1); i <= Math.min(lines.length - 1, idx + 3); i++) {
          context.push(lines[i]);
        }
        requirements.push(context.join(' '));
      }
    });
    
    return requirements.length > 0 ? requirements.join('\n') : jobText.substring(0, 1000);
  };

  const keyRequirements = extractJobRequirements(jobText);
  const resumeSections = resumeText.split('\n').filter(l => l.trim().length > 0).slice(0, 20).join('\n');

  // Analyze resume structure
  const analyzeResumeStructure = (resumeText) => {
    const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const structure = {
      hasSummary: false,
      summaryText: '',
      experienceEntries: [],
      skillsSection: '',
      educationSection: '',
      projectsSection: '',
    };
    
    let currentSection = '';
    let currentEntry = '';
    
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      
      // Detect sections
      if (lowerLine.includes('summary') || lowerLine.includes('objective') || lowerLine.includes('profile')) {
        currentSection = 'summary';
        structure.hasSummary = true;
        structure.summaryText = line;
      } else if (lowerLine.includes('experience') || lowerLine.includes('work history') || lowerLine.includes('employment')) {
        currentSection = 'experience';
      } else if (lowerLine.includes('skill')) {
        currentSection = 'skills';
      } else if (lowerLine.includes('education') || lowerLine.includes('degree') || lowerLine.includes('university')) {
        currentSection = 'education';
      } else if (lowerLine.includes('project')) {
        currentSection = 'projects';
      }
      
      // Collect content by section
      if (currentSection === 'summary' && idx < 10) {
        structure.summaryText += ' ' + line;
      } else if (currentSection === 'experience') {
        if (line.match(/^\d{4}|\w+\s+\d{4}|present|current/i)) {
          if (currentEntry) structure.experienceEntries.push(currentEntry.trim());
          currentEntry = line;
        } else if (currentEntry) {
          currentEntry += ' ' + line;
        }
      } else if (currentSection === 'skills') {
        structure.skillsSection += ' ' + line;
      } else if (currentSection === 'education') {
        structure.educationSection += ' ' + line;
      } else if (currentSection === 'projects') {
        structure.projectsSection += ' ' + line;
      }
    });
    
    if (currentEntry) structure.experienceEntries.push(currentEntry.trim());
    
    return structure;
  };

  const resumeStructure = analyzeResumeStructure(resumeText);
  
  // Truncate inputs to prevent timeout - keep essential info but limit length
  const MAX_JOB_TEXT = 2000; // Limit job description to 2000 chars
  const MAX_RESUME_TEXT = 3000; // Limit resume to 3000 chars
  const MAX_KEY_REQUIREMENTS = 1000; // Limit key requirements
  
  const truncatedJobText = jobText.length > MAX_JOB_TEXT 
    ? jobText.substring(0, MAX_JOB_TEXT) + '\n[... truncated ...]'
    : jobText;
  const truncatedResumeText = resumeText.length > MAX_RESUME_TEXT
    ? resumeText.substring(0, MAX_RESUME_TEXT) + '\n[... truncated ...]'
    : resumeText;
  const truncatedKeyRequirements = keyRequirements.length > MAX_KEY_REQUIREMENTS
    ? keyRequirements.substring(0, MAX_KEY_REQUIREMENTS) + '\n[... truncated ...]'
    : keyRequirements;

  const userPrompt = `=== JOB DESCRIPTION ===
${truncatedJobText}

=== KEY REQUIREMENTS ===
${truncatedKeyRequirements}

=== RESUME STRUCTURE ===
Summary: ${resumeStructure.hasSummary ? 'EXISTS' : 'MISSING'}
${resumeStructure.hasSummary ? `Current: "${resumeStructure.summaryText.substring(0, 150)}"` : ''}
Experience: ${resumeStructure.experienceEntries.length} entries
Skills: ${resumeStructure.skillsSection ? 'EXISTS' : 'MISSING'}
${resumeStructure.skillsSection ? `Current: "${resumeStructure.skillsSection.substring(0, 150)}"` : ''}

=== RESUME TEXT ===
${truncatedResumeText}

=== ANALYSIS TASK ===

Analyze the job description and resume. Provide SPECIFIC suggestions that directly address job requirements.

For each suggestion:
- section: "summary" | "experience" | "skills"
- before: exact text from resume (or null if adding)
- after: improved text incorporating job requirements
- reason: how this addresses a specific job requirement
- job_requirement: quote the exact requirement from job description
- alignment_impact: impact on matching job requirements
- priority: "high" | "medium" | "low"
- job_keywords_addressed: [keywords from job description]

CRITICAL: Return ONLY valid JSON. No markdown, no explanations. Provide 5-8 specific suggestions.`;

  const response = await generateAIResponse(userPrompt, context);
  
  // Extract JSON from response
  let jsonText = response.trim();
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }
  
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error('Invalid JSON response from AI');
  }
}

/**
 * Handle chat message with RAG
 */
async function handleChatMessage(message, currentDraft, jobText, chatHistory) {
  try {
    // Retrieve relevant context from vector DB (with error handling)
    let context = [];
    try {
      const queryText = `${message} ${jobText}`;
      context = await retrieveSimilarContent(queryText, 3);
      if (!Array.isArray(context)) {
        context = [];
      }
    } catch (error) {
      console.warn('Error retrieving context from vector DB:', error.message);
      context = [];
    }
    
    const systemPrompt = `You are a resume editing assistant. Help users iteratively improve their resume through conversation.

CRITICAL RULES:
1. NO full resume rewrites - only propose incremental changes
2. Changes must be grounded in the existing resume content
3. Propose specific, focused edits (1-3 changes per message)
4. If you need clarification, ask questions and set updated_draft to null
5. Return ONLY valid JSON - no markdown, no code blocks, no explanations

Return exactly this JSON structure:
{
  "assistant_message": "<your response to the user>",
  "proposed_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": "<current text to replace, or null>",
      "after": "<proposed replacement text>",
      "reason": "<why this change helps>"
    }
  ],
  "updated_draft": "<updated resume with ONLY the proposed edits applied, or null if just asking questions>"
}`;

    const userPrompt = `Current Draft Resume:
${currentDraft}

Job Description:
${jobText}

${context.length > 0 ? `Relevant Context:\n${context.join('\n\n---\n\n')}\n` : ''}

Previous Conversation:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

User's current message: ${message}`;

    // Generate response with chat-specific fallback
    let response;
    try {
      const contextText = Array.isArray(context) ? context.join('\n\n') : '';
      response = await generateAIResponseForChat(userPrompt, contextText);
    } catch (error) {
      console.error('Error generating AI response:', error);
      // Fall back to chat fallback response
      return generateChatFallbackResponse(message, currentDraft);
    }
    
    if (!response || typeof response !== 'string') {
      console.warn('Invalid response from AI, using fallback');
      return generateChatFallbackResponse(message, currentDraft);
    }
    
    // Extract JSON
    let jsonText = response.trim();
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    try {
      const parsed = JSON.parse(jsonText);
      // Validate chat response structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Response is not an object');
      }
      if (!parsed.assistant_message || typeof parsed.assistant_message !== 'string') {
        throw new Error('Missing or invalid assistant_message');
      }
      // Ensure proposed_edits is an array
      if (!parsed.proposed_edits) {
        parsed.proposed_edits = [];
      }
      if (!Array.isArray(parsed.proposed_edits)) {
        parsed.proposed_edits = [];
      }
      // Ensure updated_draft is string or null
      if (parsed.updated_draft !== null && typeof parsed.updated_draft !== 'string') {
        parsed.updated_draft = null;
      }
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse chat response:', parseError);
      console.error('Response was:', response.substring(0, 500));
      // Return a valid chat fallback
      return generateChatFallbackResponse(message, currentDraft);
    }
  } catch (error) {
    console.error('Error in handleChatMessage:', error);
    // Return a valid chat fallback on any error
    return generateChatFallbackResponse(message, currentDraft);
  }
}

// API Routes

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ResumeFit AI Service' });
});

/**
 * Analyze resume endpoint
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { resumeText, jobText } = req.body;
    
    if (!resumeText || !jobText) {
      return res.status(400).json({
        success: false,
        error: 'Both resumeText and jobText are required',
      });
    }
    
    const result = await analyzeResume(resumeText, jobText);
    
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed',
    });
  }
});

/**
 * Chat endpoint
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, currentDraft, jobText, chatHistory } = req.body;
    
    if (!message || !currentDraft || !jobText) {
      return res.status(400).json({
        success: false,
        error: 'message, currentDraft, and jobText are required',
      });
    }
    
    console.log('Chat request received:', { 
      messageLength: message.length, 
      draftLength: currentDraft.length, 
      jobTextLength: jobText.length,
      chatHistoryLength: (chatHistory || []).length 
    });
    
    const result = await handleChatMessage(message, currentDraft, jobText, chatHistory || []);
    
    // Ensure result has the correct structure
    if (!result || typeof result !== 'object') {
      console.error('Invalid result from handleChatMessage:', result);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from chat handler',
      });
    }
    
    if (!result.assistant_message) {
      console.error('Missing assistant_message in result:', result);
      return res.status(500).json({
        success: false,
        error: 'Missing assistant_message in response',
      });
    }
    
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Chat failed',
    });
  }
});

/**
 * Store knowledge in vector DB
 */
app.post('/api/store', async (req, res) => {
  try {
    const { text, metadata } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'text is required',
      });
    }
    
    const stored = await storeInVectorDB(text, metadata || {});
    
    res.json({
      success: stored,
      message: stored ? 'Stored successfully' : 'Failed to store',
    });
  } catch (error) {
    console.error('Store error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Storage failed',
    });
  }
});

// Initialize and start server
async function startServer() {
  try {
    // Initialize embedding model
    await initializeEmbeddingModel();
    
    // Test vector DB connection
    try {
      // Test ChromaDB connection
      await chromaClient.heartbeat();
      chromaAvailable = true;
      await getOrCreateCollection();
      console.log('✅ Vector database (ChromaDB) connected');
    } catch (error) {
      chromaAvailable = false;
      console.warn('⚠️  Vector database (ChromaDB) not available:', error.message);
      console.warn('   Service will continue but RAG features will be limited');
      console.warn('   To enable: docker run -d -p 8000:8000 chromadb/chroma');
    }
    
    // Display configuration
    console.log('\n📋 Configuration:');
    console.log(`   Ollama: ${USE_OLLAMA ? '✅ Enabled' : '❌ Disabled (using local models only)'}`);
    if (USE_OLLAMA) {
      console.log(`   Ollama URL: ${OLLAMA_URL}`);
      console.log(`   Ollama Model: ${OLLAMA_MODEL}`);
    }
    console.log(`   Vector DB: ${chromaAvailable ? '✅ Connected' : '❌ Not available'}`);
    console.log(`   Embeddings: ✅ Local (Xenova/all-MiniLM-L6-v2)\n`);
    
    app.listen(PORT, () => {
      console.log(`🚀 ResumeFit AI Service running on http://localhost:${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

