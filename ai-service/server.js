// ResumeFit Custom AI API Service
// Uses vector database for RAG (Retrieval Augmented Generation)

import express from 'express';
import cors from 'cors';
import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const USE_OLLAMA = process.env.USE_OLLAMA !== 'false'; // Set to 'false' to disable Ollama
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

// OpenAI Configuration
const USE_OPENAI = process.env.USE_OPENAI === 'true'; // Set to 'true' to use OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Use gpt-4o-mini for cost efficiency, or gpt-4o for better quality

// AI Provider Selection: OpenAI takes precedence if API key is set
const USE_OPENAI_BY_DEFAULT = OPENAI_API_KEY && OPENAI_API_KEY.length > 0;
const ACTIVE_AI_PROVIDER = USE_OPENAI || USE_OPENAI_BY_DEFAULT ? 'openai' : 'ollama';

// Ollama health and retry configuration
let ollamaHealthy = false;
const OLLAMA_MAX_RETRIES = 5;
const OLLAMA_RETRY_DELAY = 2000; // 2 seconds between retries
const OLLAMA_ANALYSIS_TIMEOUT = 180000; // 3 minutes for analysis (reduced to prevent hanging)
const OLLAMA_CHAT_TIMEOUT = 120000; // 2 minutes for chat

// OpenAI timeout configuration (faster than Ollama)
const OPENAI_ANALYSIS_TIMEOUT = 120000; // 2 minutes for analysis
const OPENAI_CHAT_TIMEOUT = 60000; // 1 minute for chat

// Initialize OpenAI client if API key is provided
let openaiClient = null;
if (OPENAI_API_KEY && OPENAI_API_KEY.length > 0) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log('✅ OpenAI client initialized');
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI client:', error.message);
  }
}

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
let chromaReconnectAttempts = 0;
const MAX_CHROMA_RECONNECT_ATTEMPTS = 3;

/**
 * Check ChromaDB health and reconnect if needed
 */
async function checkChromaHealth() {
  try {
    const heartbeatPromise = chromaClient.heartbeat();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    await Promise.race([heartbeatPromise, timeoutPromise]);
    
    if (!chromaAvailable) {
      console.log('✅ ChromaDB reconnected!');
      chromaAvailable = true;
      chromaReconnectAttempts = 0;
      // Ensure collection exists
      await getOrCreateCollection();
    }
    return true;
  } catch (error) {
    if (chromaAvailable) {
      console.warn(`⚠️  ChromaDB connection lost: ${error.message}`);
      chromaAvailable = false;
    }
    return false;
  }
}

/**
 * Initialize or get ChromaDB collection with automatic reconnection
 */
async function getOrCreateCollection() {
  // If not available, try to reconnect
  if (!chromaAvailable) {
    const reconnected = await checkChromaHealth();
    if (!reconnected) {
      return null; // Still not available
    }
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
    
    // Try to reconnect once
    if (chromaReconnectAttempts < MAX_CHROMA_RECONNECT_ATTEMPTS) {
      chromaReconnectAttempts++;
      console.log(`🔄 Attempting to reconnect to ChromaDB (attempt ${chromaReconnectAttempts}/${MAX_CHROMA_RECONNECT_ATTEMPTS})...`);
      const reconnected = await checkChromaHealth();
      if (reconnected) {
        // Retry getting collection
        try {
          return await chromaClient.getOrCreateCollection({
            name: COLLECTION_NAME,
            metadata: { description: 'ResumeFit knowledge base' }
          });
        } catch (retryError) {
          console.warn('ChromaDB retry failed:', retryError.message);
        }
      }
    }
    
    return null; // Gracefully handle ChromaDB unavailability
  }
}

/**
 * Store resume/job data in vector database with automatic reconnection
 */
async function storeInVectorDB(text, metadata) {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) {
      // Try one more time to reconnect
      const reconnected = await checkChromaHealth();
      if (reconnected) {
        const retryCollection = await getOrCreateCollection();
        if (!retryCollection) {
          return false;
        }
        // Continue with retryCollection
        const embedding = await generateEmbedding(text);
        await retryCollection.add({
          ids: [`doc_${Date.now()}_${Math.random()}`],
          embeddings: [embedding],
          documents: [text],
          metadatas: [metadata],
        });
        return true;
      }
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
    console.error('Error storing in vector DB:', error.message);
    // Try to reconnect on error
    chromaAvailable = false;
    const reconnected = await checkChromaHealth();
    if (reconnected) {
      console.log('🔄 ChromaDB reconnected, but storage failed. Will retry on next operation.');
    }
    return false;
  }
}

/**
 * Retrieve similar content from vector database with timeout and auto-reconnect
 */
async function retrieveSimilarContent(queryText, topK = 5, timeoutMs = 5000) {
  try {
    let collection = await getOrCreateCollection();
    if (!collection) {
      // Try to reconnect once
      const reconnected = await checkChromaHealth();
      if (reconnected) {
        collection = await getOrCreateCollection();
        if (!collection) {
          return []; // Still not available
        }
      } else {
      return []; // ChromaDB not available, return empty
      }
    }
    
    // Add timeout to embedding generation
    const embeddingPromise = generateEmbedding(queryText);
    const embeddingTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Embedding generation timeout')), timeoutMs)
    );
    
    const queryEmbedding = await Promise.race([embeddingPromise, embeddingTimeout]);
    
    // Add timeout to query
    const queryPromise = collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
    });
    const queryTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    );
    
    const results = await Promise.race([queryPromise, queryTimeout]);
    
    return results.documents[0] || [];
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.warn(`RAG retrieval timeout for query (${queryText.substring(0, 50)}...):`, error.message);
    } else {
    console.error('Error retrieving from vector DB:', error);
    }
    return [];
  }
}

/**
 * Chunk text into meaningful sections for better RAG retrieval
 */
function chunkText(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  const sentences = text.split(/[.!?]\s+/).filter(s => s.trim().length > 20);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Overlap: keep last part of current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 10));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text]; // Fallback to full text if chunking fails
}

/**
 * Chunk resume into sections (summary, experience, skills, etc.)
 */
function chunkResume(resumeText) {
  const sections = {
    summary: [],
    experience: [],
    skills: [],
    education: [],
    projects: [],
    other: []
  };
  
  const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let currentSection = 'other';
  
  lines.forEach((line, idx) => {
    const lowerLine = line.toLowerCase();
    
    // Detect section headers
    if (lowerLine.includes('summary') || lowerLine.includes('objective') || lowerLine.includes('profile')) {
      currentSection = 'summary';
    } else if (lowerLine.includes('experience') || lowerLine.includes('work history') || lowerLine.includes('employment')) {
      currentSection = 'experience';
    } else if (lowerLine.includes('skill')) {
      currentSection = 'skills';
    } else if (lowerLine.includes('education') || lowerLine.includes('degree') || lowerLine.includes('university')) {
      currentSection = 'education';
    } else if (lowerLine.includes('project')) {
      currentSection = 'projects';
    }
    
    // Add to appropriate section
    if (currentSection !== 'other' || idx < 10) { // First 10 lines might be summary even without header
      sections[currentSection].push(line);
    }
  });
  
  // Convert sections to chunks
  const chunks = [];
  Object.entries(sections).forEach(([sectionName, sectionLines]) => {
    if (sectionLines.length > 0) {
      const sectionText = sectionLines.join(' ');
      const sectionChunks = chunkText(sectionText, 400, 50);
      sectionChunks.forEach((chunk, idx) => {
        chunks.push({
          text: chunk,
          section: sectionName,
          metadata: { type: 'resume_section', section: sectionName, index: idx }
        });
      });
    }
  });
  
  return chunks;
}

/**
 * Chunk job description into requirement sections
 */
function chunkJobDescription(jobText) {
  const lines = jobText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const requirementSections = {
    requirements: [],
    qualifications: [],
    skills: [],
    responsibilities: [],
    preferred: [],
    other: []
  };
  
  let currentSection = 'other';
  
  lines.forEach((line, idx) => {
    const lowerLine = line.toLowerCase();
    
    // Detect requirement sections
    if (lowerLine.includes('required') || lowerLine.includes('must have') || lowerLine.includes('requirements')) {
      currentSection = 'requirements';
    } else if (lowerLine.includes('qualification')) {
      currentSection = 'qualifications';
    } else if (lowerLine.includes('skill')) {
      currentSection = 'skills';
    } else if (lowerLine.includes('responsibilit') || lowerLine.includes('duties') || lowerLine.includes('what you')) {
      currentSection = 'responsibilities';
    } else if (lowerLine.includes('preferred') || lowerLine.includes('nice to have') || lowerLine.includes('bonus')) {
      currentSection = 'preferred';
    }
    
    // Get context around requirement lines (current + next 2 lines)
    if (currentSection !== 'other' || lowerLine.match(/\d+\+?\s*years?/) || lowerLine.length > 30) {
      const context = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 3)).join(' ');
      if (context.length > 30 && context.length < 500) {
        requirementSections[currentSection].push(context);
      }
    }
  });
  
  // Convert to chunks
  const chunks = [];
  Object.entries(requirementSections).forEach(([sectionName, sectionTexts]) => {
    sectionTexts.forEach((text, idx) => {
      chunks.push({
        text: text,
        section: sectionName,
        metadata: { type: 'job_requirement', section: sectionName, index: idx }
      });
    });
  });
  
  return chunks.length > 0 ? chunks : [{ text: jobText, section: 'other', metadata: { type: 'job_description' } }];
}

/**
 * Store resume chunks in vector DB
 */
async function storeResumeChunks(resumeText, resumeId) {
  const chunks = chunkResume(resumeText);
  const stored = [];
  
  for (const chunk of chunks) {
    const success = await storeInVectorDB(chunk.text, {
      ...chunk.metadata,
      resumeId: resumeId,
      timestamp: new Date().toISOString(),
    });
    if (success) stored.push(chunk);
  }
  
  return stored;
}

/**
 * Store job description chunks in vector DB
 */
async function storeJobChunks(jobText, jobId) {
  const chunks = chunkJobDescription(jobText);
  const stored = [];
  
  for (const chunk of chunks) {
    const success = await storeInVectorDB(chunk.text, {
      ...chunk.metadata,
      jobId: jobId,
      timestamp: new Date().toISOString(),
    });
    if (success) stored.push(chunk);
  }
  
  return stored;
}

/**
 * Retrieve relevant resume sections for a job requirement using RAG
 */
async function retrieveRelevantResumeSections(jobRequirement, topK = 5, timeoutMs = 3000) {
  try {
    const queryText = `resume section matching job requirement: ${jobRequirement}`;
    const results = await retrieveSimilarContent(queryText, topK, timeoutMs);
    return results || [];
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.warn(`RAG timeout for resume sections (requirement: ${jobRequirement.substring(0, 50)}...)`);
    } else {
    console.error('Error retrieving relevant resume sections:', error);
    }
    return [];
  }
}

/**
 * Retrieve relevant job requirements for a resume section using RAG
 */
async function retrieveRelevantJobRequirements(resumeSection, topK = 5, timeoutMs = 3000) {
  try {
    const queryText = `job requirement matching resume: ${resumeSection}`;
    const results = await retrieveSimilarContent(queryText, topK, timeoutMs);
    return results || [];
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.warn(`RAG timeout for job requirements (section: ${resumeSection.substring(0, 50)}...)`);
    } else {
    console.error('Error retrieving relevant job requirements:', error);
    }
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
  
  // Primary: OpenAI (if API key is set)
  if (ACTIVE_AI_PROVIDER === 'openai' && openaiClient) {
    try {
      console.log(`   🤖 Using OpenAI (${OPENAI_MODEL}) for chat...`);
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful resume editing assistant. Always respond with valid JSON when requested.'
        },
        {
          role: 'user',
          content: enhancedPrompt
        }
      ];
      return await callOpenAI(messages, OPENAI_CHAT_TIMEOUT);
    } catch (error) {
      console.error('❌ OpenAI failed for chat:', error.message);
      // Fall back to Ollama if available
  if (USE_OLLAMA) {
        console.log('   🔄 Falling back to Ollama for chat...');
        try {
          return await callOllamaWithRetry(enhancedPrompt, OLLAMA_CHAT_TIMEOUT);
        } catch (ollamaError) {
          console.warn('   Ollama also failed, using fallback...');
        }
      }
    }
  }
  
  // Fallback: Ollama (if OpenAI is not configured)
  if (USE_OLLAMA) {
    try {
      console.log(`   🤖 Using Ollama (${OLLAMA_MODEL}) for chat...`);
      return await callOllamaWithRetry(enhancedPrompt, OLLAMA_CHAT_TIMEOUT);
    } catch (error) {
      console.error('❌ Ollama failed for chat after all retries:', error.message);
      console.warn('   Attempting fallback for chat...');
    }
  }
  
  // Fallback: Local transformers model
  try {
    return await generateWithLocalLLM(enhancedPrompt);
  } catch (error) {
    console.warn('Local LLM not available, trying fallback:', error.message);
  }
  
  // Last resort: Chat-specific fallback
  const messageMatch = prompt.match(/User's current message:\s*(.+)/);
  const userMessage = messageMatch ? messageMatch[1] : 'user request';
  const draftMatch = prompt.match(/Current Draft Resume:\s*([\s\S]*?)(?=Job Description:)/);
  const currentDraft = draftMatch ? draftMatch[1].trim() : '';
  
  const fallbackResponse = generateChatFallbackResponse(userMessage, currentDraft);
  return JSON.stringify(fallbackResponse);
}

/**
 * Call Ollama with retry logic and exponential backoff
 */
async function callOllamaWithRetry(prompt, timeoutMs, retries = OLLAMA_MAX_RETRIES) {
  const promptLength = prompt.length;
  console.log(`📤 Calling Ollama (prompt: ${promptLength} chars, timeout: ${Math.round(timeoutMs / 1000)}s)`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const attemptStartTime = Date.now();
    try {
      // Re-check health if previous attempt failed
      if (attempt > 1 && !ollamaHealthy) {
        console.log(`🔄 Re-checking Ollama health (attempt ${attempt}/${retries})...`);
        await checkOllamaHealth(10); // Quick health check
      }
      
      console.log(`🔄 Ollama attempt ${attempt}/${retries}...`);
      const controller = new AbortController();
      
      // Set timeout to abort the request
      const timeoutId = setTimeout(() => {
        console.warn(`⏱️  Ollama request timeout approaching (${Math.round(timeoutMs / 1000)}s), aborting...`);
        controller.abort();
      }, timeoutMs);
      
      try {
        const fetchStartTime = Date.now();
        
        // No separate connection timeout - let the main timeout handle everything
        // Ollama may need time to load the model or process large prompts
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            options: {
              num_predict: 4000, // Limit response length to prevent very long generations
              temperature: 0.3, // Lower temperature for more focused responses
            }
          }),
          signal: controller.signal,
        });
        
        const fetchDuration = Math.round((Date.now() - fetchStartTime) / 1000);
        console.log(`      📥 Response received from Ollama (${fetchDuration}s)`);
        
        clearTimeout(timeoutId);
        
        // Check if response was aborted
        if (controller.signal.aborted) {
          throw new Error('Request was aborted due to timeout');
        }
        
        if (response.ok) {
          const parseStartTime = Date.now();
          console.log(`      📄 Parsing response JSON...`);
          const data = await response.json();
          const parseDuration = Math.round((Date.now() - parseStartTime) / 1000);
          
          const content = data.message?.content || data.response || '';
          if (content && content.trim().length > 0) {
            const totalDuration = Math.round((Date.now() - attemptStartTime) / 1000);
            console.log(`      ✅ Ollama success!`);
            console.log(`         - Total time: ${totalDuration}s`);
            console.log(`         - Response length: ${content.length} characters`);
            console.log(`         - Parse time: ${parseDuration}s`);
            ollamaHealthy = true; // Mark as healthy on success
            return content;
          } else {
            throw new Error('Empty response from Ollama');
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Ollama returned ${response.status}: ${errorText}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          const timeoutSeconds = Math.round(timeoutMs / 1000);
          const actualDuration = Math.round((Date.now() - attemptStartTime) / 1000);
          console.error(`      ❌ Request timed out after ${actualDuration}s (limit: ${timeoutSeconds}s)`);
          throw new Error(`Request timed out after ${actualDuration} seconds (limit: ${timeoutSeconds}s)`);
        }
        console.error(`      ❌ Fetch error: ${fetchError.message}`);
        throw fetchError;
      }
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const delay = OLLAMA_RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
      const attemptDuration = Math.round((Date.now() - attemptStartTime) / 1000);
      
      if (isLastAttempt) {
        ollamaHealthy = false;
        console.error(`      ❌ Ollama failed after ${retries} attempts`);
        console.error(`         - Last attempt duration: ${attemptDuration}s`);
        console.error(`         - Error: ${error.message}`);
        throw new Error(`Ollama failed after ${retries} attempts: ${error.message}`);
      }
      
      console.warn(`      ⚠️  Attempt ${attempt}/${retries} failed (${attemptDuration}s): ${error.message}`);
      console.log(`      ⏳ Retrying in ${Math.round(delay / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages, timeoutMs = OPENAI_ANALYSIS_TIMEOUT) {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    
    try {
      const response = await openaiClient.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages,
        temperature: 0.3, // Lower temperature for more focused responses
        max_tokens: 16000, // Increased to handle comprehensive analysis with full context
        response_format: { type: "json_object" }, // Request JSON response
      }, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const content = response.choices[0]?.message?.content || '';
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }
      
      return content;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`OpenAI request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
      }
      throw fetchError;
    }
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI API error: ${error.message} (status: ${error.status})`);
    }
    throw error;
  }
}

/**
 * Generate AI response using OpenAI or Ollama with RAG
 * 
 * Primary: OpenAI (if API key is set) or Ollama
 * Fallback: Only if both are unavailable
 */
async function generateAIResponse(prompt, context = '', timeoutMs = null) {
  // Enhanced prompt with retrieved context
  const enhancedPrompt = context 
    ? `${prompt}\n\nRelevant Context:\n${context}`
    : prompt;
  
  // Determine timeout based on provider
  const analysisTimeout = timeoutMs || (ACTIVE_AI_PROVIDER === 'openai' ? OPENAI_ANALYSIS_TIMEOUT : OLLAMA_ANALYSIS_TIMEOUT);
  
  // Primary: OpenAI (if API key is set)
  if (ACTIVE_AI_PROVIDER === 'openai' && openaiClient) {
    try {
      console.log(`   🤖 Using OpenAI (${OPENAI_MODEL})...`);
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Always respond with valid JSON when requested.'
        },
        {
          role: 'user',
          content: enhancedPrompt
        }
      ];
      return await callOpenAI(messages, analysisTimeout);
    } catch (error) {
      console.error('❌ OpenAI failed:', error.message);
      // Fall back to Ollama if available
  if (USE_OLLAMA) {
        console.log('   🔄 Falling back to Ollama...');
        try {
          return await callOllamaWithRetry(enhancedPrompt, analysisTimeout);
        } catch (ollamaError) {
          throw new Error(`Both OpenAI and Ollama failed. OpenAI: ${error.message}, Ollama: ${ollamaError.message}`);
        }
      }
      throw new Error(`OpenAI failed: ${error.message}`);
    }
  }
  
  // Fallback: Ollama (if OpenAI is not configured)
  if (USE_OLLAMA) {
    try {
      console.log(`   🤖 Using Ollama (${OLLAMA_MODEL})...`);
      return await callOllamaWithRetry(enhancedPrompt, analysisTimeout);
    } catch (error) {
      console.error('❌ Ollama failed after all retries:', error.message);
      throw new Error(`Ollama is required but unavailable: ${error.message}`);
    }
  }
  
  // Final fallback: Local transformers model
  console.warn('⚠️  No AI provider available, using local fallback (not recommended)');
  try {
    return await generateWithLocalLLM(enhancedPrompt);
  } catch (error) {
    console.warn('Local LLM not available, using rule-based fallback:', error.message);
  }
  
  // Last resort: Rule-based response
  return await generateFallbackResponse(prompt);
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
    
    // Generate response (allow more tokens for better chat responses)
    const output = await textGenerationPipeline(prompt, {
      max_new_tokens: 800, // Increased for better chat responses
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
async function generateFallbackResponse(prompt) {
  // Try to extract job requirements from the prompt
  const jobSectionMatch = prompt.match(/=== JOB DESCRIPTION ===\s*([\s\S]*?)(?=== KEY REQUIREMENTS|=== RESUME|$)/i);
  const resumeMatch = prompt.match(/=== RESUME TEXT ===\s*([\s\S]*?)(?=== ANALYSIS|$)/i);
  
  const jobText = jobSectionMatch ? jobSectionMatch[1].trim().replace(/\[\.\.\. truncated \.\.\.\]/g, '') : '';
  const resumeText = resumeMatch ? resumeMatch[1].trim().replace(/\[\.\.\. truncated \.\.\.\]/g, '') : '';
  
  // Use RAG to get relevant sections instead of simple keyword matching
  let relevantJobRequirements = [];
  let relevantResumeSections = [];
  
  try {
    // Store chunks for this fallback analysis
    const sessionId = `fallback_${Date.now()}`;
    await storeResumeChunks(resumeText, `${sessionId}_resume`);
    await storeJobChunks(jobText, `${sessionId}_job`);
    
    // Extract meaningful requirements from job (not just single words)
    const jobLines = jobText.split('\n').filter(l => l.trim().length > 30);
    const meaningfulRequirements = jobLines
      .filter(line => {
        const lower = line.toLowerCase();
        return (lower.includes('required') || lower.includes('must') || 
                lower.includes('qualification') || lower.includes('experience') ||
                lower.match(/\d+\+?\s*years?/) || lower.length > 50);
      })
      .slice(0, 10);
    
    // For each meaningful requirement, use RAG to find relevant resume sections
    for (const req of meaningfulRequirements) {
      const relevant = await retrieveRelevantResumeSections(req, 2);
      if (relevant.length > 0) {
        relevantJobRequirements.push({
          requirement: req,
          relevantResumeSections: relevant
        });
      }
    }
    
    // Also find resume sections and match to job requirements
    const resumeLines = resumeText.split('\n').filter(l => l.trim().length > 20);
    const keyResumeSections = resumeLines
      .filter(line => {
        const lower = line.toLowerCase();
        return (lower.includes('experience') || lower.includes('skill') || 
                lower.includes('summary') || lower.includes('project') ||
                lower.length > 40);
      })
      .slice(0, 10);
    
    for (const resumeSection of keyResumeSections) {
      const relevant = await retrieveRelevantJobRequirements(resumeSection, 2);
      if (relevant.length > 0) {
        relevantResumeSections.push({
          resumeSection: resumeSection,
          relevantJobRequirements: relevant
        });
      }
    }
  } catch (error) {
    console.warn('RAG retrieval failed in fallback, using keyword matching:', error.message);
  }
  
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
  
  // Generate suggestions based on RAG results first, then fall back to keyword matching
  const suggested_edits = [];
  
  // Use RAG results to create specific suggestions
  if (relevantJobRequirements.length > 0) {
    relevantJobRequirements.slice(0, 5).forEach((ragResult, idx) => {
      const req = ragResult.requirement;
      const relevantResumeSections = ragResult.relevantResumeSections;
      
      // Extract key terms from requirement (only meaningful words, not single characters)
      const reqWords = req.split(/\s+/).filter(w => w.length > 3 && !['the', 'and', 'with', 'that', 'this'].includes(w.toLowerCase()));
      const keyTerms = reqWords.slice(0, 5);
      
      // Check if these terms are actually in the resume sections
      const resumeTextLower = relevantResumeSections.join(' ').toLowerCase();
      const missingTerms = keyTerms.filter(term => !resumeTextLower.includes(term.toLowerCase()));
      
      if (missingTerms.length > 0 || idx < 2) {
        // Determine section
        let section = 'skills';
        const reqLower = req.toLowerCase();
        if (reqLower.includes('experience') || reqLower.includes('years')) {
          section = 'experience';
        } else if (reqLower.includes('skill') || reqLower.includes('proficient') || reqLower.includes('expert')) {
          section = 'skills';
        } else {
          section = 'summary';
        }
        
        // Find the relevant resume section text
        let beforeText = null;
        if (relevantResumeSections.length > 0) {
          beforeText = relevantResumeSections[0].substring(0, 200);
        }
        
        suggested_edits.push({
          section: section,
          before: beforeText,
          after: `Update to explicitly address: "${req.substring(0, 200)}${req.length > 200 ? '...' : ''}" - Specifically mention: ${keyTerms.slice(0, 3).join(', ')}`,
          reason: `The job description requires: "${req.substring(0, 250)}" - Your resume should explicitly address this requirement`,
          job_requirement: req.substring(0, 300),
          alignment_impact: `High - directly addresses a specific requirement from the job description`,
          priority: 'high',
          job_keywords_addressed: keyTerms.slice(0, 5)
        });
      }
    });
  }
  
  // Fall back to keyword matching only if RAG didn't provide enough suggestions
  if (suggested_edits.length < 3) {
    // Add missing technologies (up to 3 most important) with specific quotes
    // Only use tech keywords that are actually meaningful (length > 3)
    const meaningfulTech = missingTech.filter(tech => tech.length > 3);
    meaningfulTech.slice(0, 3).forEach(tech => {
      // Find the exact line in job description that mentions this tech
      const jobLines = jobText.split('\n');
    const techLine = jobLines.find(line => 
      line.toLowerCase().includes(tech.toLowerCase())
    );
    
    // Get context around the tech mention (the line + next line for full requirement)
    let jobRequirement = techLine || `Required: ${tech}`;
    const techLineIndex = jobLines.findIndex(line => 
      line.toLowerCase().includes(tech.toLowerCase())
    );
    if (techLineIndex >= 0 && techLineIndex < jobLines.length - 1) {
      jobRequirement = jobLines[techLineIndex] + ' ' + jobLines[techLineIndex + 1];
    }
    
    // Find current skills section in resume
    const resumeLines = resumeText.split('\n');
    const skillsIndex = resumeLines.findIndex(line => 
      line.toLowerCase().includes('skill')
    );
    let beforeText = null;
    if (skillsIndex >= 0 && skillsIndex < resumeLines.length) {
      beforeText = resumeLines[skillsIndex];
      if (skillsIndex < resumeLines.length - 1) {
        beforeText += ' ' + resumeLines[skillsIndex + 1];
      }
      if (beforeText.length > 150) beforeText = beforeText.substring(0, 150) + '...';
    }
    
    // Capitalize tech name properly
    const techName = tech.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    suggested_edits.push({
      section: 'skills',
      before: beforeText,
      after: `Add ${techName} to your skills section. The job description specifically requires: "${jobRequirement.substring(0, 200)}${jobRequirement.length > 200 ? '...' : ''}"`,
      reason: `The job description states: "${jobRequirement.substring(0, 250)}" - Your resume does not mention ${techName}, which is required for this position`,
      job_requirement: jobRequirement.substring(0, 300),
      alignment_impact: `High - ${techName} is specifically required in the job description. Adding it will directly address this requirement`,
      priority: 'high',
      job_keywords_addressed: [tech, techName]
    });
    });
  }
  
  // Add experience requirement if found with specific quotes
  if (experienceMatches.length > 0 && resumeText.length > 0) {
    const expReq = experienceMatches[0];
    const jobLines = jobText.split('\n');
    const expLineIndex = jobLines.findIndex(line => line.includes(expReq));
    let expLine = expLineIndex >= 0 ? jobLines[expLineIndex] : `Required: ${expReq}`;
    
    // Get context around experience requirement
    if (expLineIndex >= 0 && expLineIndex < jobLines.length - 2) {
      expLine = jobLines.slice(expLineIndex, expLineIndex + 2).join(' ');
    }
    
    // Find experience section in resume
    const resumeLines = resumeText.split('\n');
    const expSectionIndex = resumeLines.findIndex(line => 
      line.toLowerCase().includes('experience') || 
      line.toLowerCase().includes('work history') ||
      line.toLowerCase().includes('employment')
    );
    
    let beforeText = null;
    if (expSectionIndex >= 0 && expSectionIndex < resumeLines.length - 1) {
      // Get first experience entry
      beforeText = resumeLines[expSectionIndex];
      for (let i = expSectionIndex + 1; i < Math.min(expSectionIndex + 3, resumeLines.length); i++) {
        beforeText += ' ' + resumeLines[i];
      }
      if (beforeText.length > 200) beforeText = beforeText.substring(0, 200) + '...';
    }
    
    suggested_edits.push({
      section: 'experience',
      before: beforeText,
      after: `Modify your experience section to explicitly state "${expReq}" of relevant experience. The job description requires: "${expLine.substring(0, 200)}${expLine.length > 200 ? '...' : ''}"`,
      reason: `The job description specifically requires ${expReq} of experience: "${expLine.substring(0, 250)}" - Your resume should prominently state that you meet this requirement`,
      job_requirement: expLine.substring(0, 300),
      alignment_impact: `High - directly addresses the experience requirement from the job description. Making this explicit will improve your match score`,
      priority: 'high',
      job_keywords_addressed: [expReq, 'experience']
    });
  }
  
  // Calculate score based on matches
  const matchRatio = foundInResume.length / Math.max(foundInJob.length, 1);
  const score = Math.min(Math.round(50 + (matchRatio * 40)), 90);
  
  // If we have good suggestions, use them; otherwise extract more specific requirements
  if (suggested_edits.length === 0) {
    // Try to extract more specific requirements from job description
    const jobLines = jobText.split('\n').filter(l => l.trim().length > 10);
    const resumeLines = resumeText.split('\n').filter(l => l.trim().length > 5);
    
    // Look for specific requirement patterns
    const requirementPatterns = [
      /required.*?(\d+)\+?\s*years?/i,
      /must have.*?([a-z\s]+)/i,
      /qualifications.*?:/i,
      /skills.*?:/i,
      /experience.*?:/i
    ];
    
    // Find specific requirements in job description
    const specificRequirements = [];
    jobLines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      // Look for requirement keywords
      if (lowerLine.includes('required') || lowerLine.includes('must') || 
          lowerLine.includes('qualification') || lowerLine.includes('experience') ||
          lowerLine.includes('skill') || lowerLine.match(/\d+\+?\s*years?/)) {
        // Get context (current line + next 2 lines)
        const context = jobLines.slice(idx, idx + 3).join(' ').trim();
        if (context.length > 20 && context.length < 300) {
          specificRequirements.push(context);
        }
      }
    });
    
    // Check if these requirements are in resume
    specificRequirements.slice(0, 3).forEach((req, idx) => {
      const reqLower = req.toLowerCase();
      // Extract key terms from requirement
      const keyTerms = reqLower.match(/\b([a-z]{4,})\b/g) || [];
      const importantTerms = keyTerms.filter(term => 
        term.length > 4 && 
        !['required', 'must', 'have', 'qualification', 'experience', 'years', 'with', 'the', 'this', 'that'].includes(term)
      ).slice(0, 3);
      
      // Check if these terms appear in resume
      const resumeLower = resumeText.toLowerCase();
      const missingTerms = importantTerms.filter(term => !resumeLower.includes(term));
      
      if (missingTerms.length > 0 || idx === 0) {
        // Find the exact line in resume that might need updating
        let beforeText = null;
        let section = 'skills';
        
        // Try to find relevant section in resume
        if (reqLower.includes('experience') || reqLower.includes('years')) {
          section = 'experience';
          // Find experience section
          const expIndex = resumeLines.findIndex(l => 
            l.toLowerCase().includes('experience') || l.toLowerCase().includes('work')
          );
          if (expIndex >= 0 && expIndex < resumeLines.length - 1) {
            beforeText = resumeLines[expIndex] + ' ' + resumeLines[expIndex + 1];
            if (beforeText.length > 150) beforeText = beforeText.substring(0, 150) + '...';
          }
        } else if (reqLower.includes('skill')) {
          section = 'skills';
          const skillIndex = resumeLines.findIndex(l => l.toLowerCase().includes('skill'));
          if (skillIndex >= 0) {
            beforeText = resumeLines[skillIndex];
            if (beforeText.length > 100) beforeText = beforeText.substring(0, 100) + '...';
          }
        } else {
          // Check summary section
          const summaryIndex = resumeLines.findIndex(l => 
            l.toLowerCase().includes('summary') || l.toLowerCase().includes('objective')
          );
          if (summaryIndex >= 0 && summaryIndex < resumeLines.length - 1) {
            section = 'summary';
            beforeText = resumeLines[summaryIndex] + ' ' + resumeLines[summaryIndex + 1];
            if (beforeText.length > 150) beforeText = beforeText.substring(0, 150) + '...';
          }
        }
        
        // Create specific suggestion
        const missingText = missingTerms.length > 0 
          ? `Missing: ${missingTerms.join(', ')}`
          : 'Requirement not clearly addressed';
        
        suggested_edits.push({
          section: section,
          before: beforeText,
          after: `Incorporate the following requirement: "${req.substring(0, 150)}${req.length > 150 ? '...' : ''}" - Specifically mention: ${importantTerms.slice(0, 3).join(', ')}`,
          reason: `The job description states: "${req.substring(0, 200)}" - This requirement needs to be explicitly addressed in your ${section} section`,
          job_requirement: req.substring(0, 300),
          alignment_impact: `${missingText}. Adding this will directly address a specific job requirement`,
          priority: missingTerms.length > 0 ? 'high' : 'medium',
          job_keywords_addressed: importantTerms.slice(0, 5)
        });
      }
    });
    
    // If still no suggestions, at least provide one based on the most prominent job requirement
    if (suggested_edits.length === 0 && jobText.length > 50) {
      // Find the first substantial requirement line
      const firstReq = jobLines.find(line => 
        line.length > 30 && 
        (line.toLowerCase().includes('required') || 
         line.toLowerCase().includes('must') ||
         line.toLowerCase().includes('qualification') ||
         line.match(/\d+\+?\s*years?/))
      );
      
      if (firstReq) {
        // Extract key terms
        const keyTerms = firstReq.match(/\b([A-Z][a-z]+|\d+\+?\s*years?|[A-Z]{2,})\b/g) || [];
        const importantTerms = keyTerms.slice(0, 5).join(', ');
        
        suggested_edits.push({
          section: 'summary',
          before: resumeLines[0] || null,
          after: `Add a professional summary that specifically mentions: ${importantTerms} - directly addressing the job requirement: "${firstReq.substring(0, 150)}${firstReq.length > 150 ? '...' : ''}"`,
          reason: `The job description requires: "${firstReq.substring(0, 200)}" - Your resume should explicitly state how you meet this requirement`,
          job_requirement: firstReq.substring(0, 300),
          alignment_impact: 'High - directly addresses a specific requirement from the job description',
          priority: 'high',
          job_keywords_addressed: keyTerms.slice(0, 5)
        });
      }
    }
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
  const analysisStartTime = Date.now();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 STARTING RESUME ANALYSIS`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📝 Resume length: ${resumeText.length} characters`);
  console.log(`📋 Job description length: ${jobText.length} characters`);
  console.log(`⏰ Start time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Dynamic approach: No hardcoded limits - use intelligent extraction and RAG
  // The full job text is always stored in RAG, and we intelligently extract what's needed for the prompt
  
  // Generate unique IDs for this analysis session
  const sessionId = `session_${Date.now()}`;
  const resumeId = `${sessionId}_resume`;
  const jobId = `${sessionId}_job`;
  console.log(`🆔 Session ID: ${sessionId}\n`);
  
  // Store resume and job chunks in vector DB for RAG (with timeout to prevent blocking)
  console.log(`${'-'.repeat(80)}`);
  console.log(`💾 STEP 1: Storing chunks in vector DB...`);
  console.log(`${'-'.repeat(80)}`);
  const storeStartTime = Date.now();
  
  // Run storage operations in parallel with timeout
  const storagePromise = Promise.all([
    storeResumeChunks(resumeText, resumeId),
    storeJobChunks(jobText, jobId)
  ]);
  
  const storageTimeout = new Promise((resolve) => {
    setTimeout(() => {
      console.warn('⚠️  Vector DB storage taking too long, continuing without it...');
      resolve([[], []]);
    }, 10000); // 10 second timeout for storage
  });
  
  const [resumeChunks, jobChunks] = await Promise.race([storagePromise, storageTimeout]);
  const storeDuration = Math.round((Date.now() - storeStartTime) / 1000);
  console.log(`✅ Chunks stored in ${storeDuration}s`);
  console.log(`   - Resume chunks: ${resumeChunks.length}`);
  console.log(`   - Job chunks: ${jobChunks.length}`);
  console.log(`${'-'.repeat(80)}\n`);
  
  // Use RAG to retrieve relevant sections
  // For each major job requirement, find relevant resume sections
  const relevantContexts = [];
  
  /**
   * Intelligently extract and prioritize job sections
   * Returns structured sections with priority (no size limits)
   */
  const extractJobSections = (jobText) => {
    const lines = jobText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const sections = {
      requirements: [],      // Required qualifications
      qualifications: [],    // Education/degree requirements
      skills: [],           // Technical skills
      responsibilities: [], // Job duties
      preferred: [],        // Nice-to-have
      other: []             // Everything else
    };
    
    let currentSection = 'other';
    let currentSectionLines = [];
    
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      
      // Detect section headers
      if (lowerLine.includes('required') || lowerLine.includes('must have') || 
          lowerLine.includes('requirements') || lowerLine.includes('minimum')) {
        if (currentSectionLines.length > 0) {
          sections[currentSection].push(currentSectionLines.join('\n'));
        }
        currentSection = 'requirements';
        currentSectionLines = [line];
      } else if (lowerLine.includes('qualification') || lowerLine.includes('education') || 
                 lowerLine.includes('degree') || lowerLine.includes('bachelor') || 
                 lowerLine.includes('master')) {
        if (currentSectionLines.length > 0) {
          sections[currentSection].push(currentSectionLines.join('\n'));
        }
        currentSection = 'qualifications';
        currentSectionLines = [line];
      } else if (lowerLine.includes('skill') || lowerLine.includes('technology') || 
                 lowerLine.includes('proficient') || lowerLine.includes('expert')) {
        if (currentSectionLines.length > 0 && currentSection !== 'skills') {
          sections[currentSection].push(currentSectionLines.join('\n'));
        }
        if (currentSection !== 'skills') {
          currentSection = 'skills';
          currentSectionLines = [line];
        } else {
          currentSectionLines.push(line);
        }
      } else if (lowerLine.includes('responsibilit') || lowerLine.includes('duties') || 
                 lowerLine.includes('what you') || lowerLine.includes('you will')) {
        if (currentSectionLines.length > 0) {
          sections[currentSection].push(currentSectionLines.join('\n'));
        }
        currentSection = 'responsibilities';
        currentSectionLines = [line];
      } else if (lowerLine.includes('preferred') || lowerLine.includes('nice to have') || 
                 lowerLine.includes('bonus') || lowerLine.includes('plus')) {
        if (currentSectionLines.length > 0) {
          sections[currentSection].push(currentSectionLines.join('\n'));
        }
        currentSection = 'preferred';
        currentSectionLines = [line];
      } else {
        currentSectionLines.push(line);
      }
    });
    
    // Add remaining lines
    if (currentSectionLines.length > 0) {
      sections[currentSection].push(currentSectionLines.join('\n'));
    }
    
    return sections;
  };
  
  // Extract all job sections (no size limits)
  const jobSections = extractJobSections(jobText);
  
  // Build prioritized job text: requirements first, then qualifications, skills, etc.
  const prioritizedJobText = [
    ...(jobSections.requirements.length > 0 ? [`=== REQUIRED QUALIFICATIONS ===\n${jobSections.requirements.join('\n\n')}`] : []),
    ...(jobSections.qualifications.length > 0 ? [`=== EDUCATION/QUALIFICATIONS ===\n${jobSections.qualifications.join('\n\n')}`] : []),
    ...(jobSections.skills.length > 0 ? [`=== SKILLS & TECHNOLOGIES ===\n${jobSections.skills.join('\n\n')}`] : []),
    ...(jobSections.responsibilities.length > 0 ? [`=== RESPONSIBILITIES ===\n${jobSections.responsibilities.join('\n\n')}`] : []),
    ...(jobSections.preferred.length > 0 ? [`=== PREFERRED (Nice to Have) ===\n${jobSections.preferred.join('\n\n')}`] : []),
    ...(jobSections.other.length > 0 ? [`=== ADDITIONAL INFORMATION ===\n${jobSections.other.join('\n\n')}`] : [])
  ].join('\n\n');
  
  // Use RAG to retrieve relevant sections with optimizations:
  // 1. Reduce number of calls (process fewer, more important sections)
  // 2. Add timeouts to prevent hanging
  // 3. Use parallel processing where possible
  
  console.log(`${'-'.repeat(80)}`);
  console.log(`🔍 STEP 2: Starting RAG retrieval...`);
  console.log(`${'-'.repeat(80)}`);
  const ragStartTime = Date.now();
  
  // Retrieve based on resume content - prioritize most important sections
  const resumeSectionKeywords = ['experience', 'skill', 'summary', 'education', 'project', 'work'];
  const keyResumeSections = resumeText.split('\n')
    .filter(l => l.trim().length > 20)
    .filter(line => resumeSectionKeywords.some(kw => line.toLowerCase().includes(kw)))
    .slice(0, 30); // Increased to process more sections for comprehensive analysis
  
  // Process resume sections in parallel with timeout
  const resumeSectionPromises = keyResumeSections.map(async (resumeSection) => {
    try {
      const relevantJobRequirements = await Promise.race([
        retrieveRelevantJobRequirements(resumeSection, 10), // Increased to get more comprehensive matches
        new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 5000))
      ]);
    if (relevantJobRequirements.length > 0) {
        return {
        resumeSection: resumeSection,
          relevantJobRequirements: relevantJobRequirements.join('\n\n---\n\n')
        };
      }
      return null;
    } catch (error) {
      console.warn(`RAG timeout for resume section: ${resumeSection.substring(0, 50)}...`);
      return null;
    }
  });
  
  const resumeResults = await Promise.all(resumeSectionPromises);
  resumeResults.forEach(result => {
    if (result) relevantContexts.push(result);
  });
  
  // Extract key requirement lines - prioritize most important
  const jobRequirementKeywords = [
    'required', 'must have', 'qualifications', 'skills', 'experience', 
    'years', 'degree', 'certification', 'proficient', 'expert', 'minimum'
  ];
  
  const jobLines = jobText.split('\n').filter(l => l.trim().length > 20);
  const keyJobRequirements = jobLines
    .filter(line => jobRequirementKeywords.some(kw => line.toLowerCase().includes(kw)))
    .slice(0, 50); // Increased to process more requirements for comprehensive analysis
  
  // Process job requirements in parallel with timeout
  const jobRequirementPromises = keyJobRequirements.map(async (requirement) => {
    try {
      const relevantResumeSections = await Promise.race([
        retrieveRelevantResumeSections(requirement, 10), // Increased to get more comprehensive matches
        new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 5000))
      ]);
      if (relevantResumeSections.length > 0) {
        return {
          jobRequirement: requirement,
          relevantResumeSections: relevantResumeSections.join('\n\n---\n\n')
        };
      }
      return null;
    } catch (error) {
      console.warn(`RAG timeout for job requirement: ${requirement.substring(0, 50)}...`);
      return null;
    }
  });
  
  const jobResults = await Promise.all(jobRequirementPromises);
  jobResults.forEach(result => {
    if (result) relevantContexts.push(result);
  });
  
  const ragDuration = Math.round((Date.now() - ragStartTime) / 1000);
  console.log(`✅ RAG retrieval completed in ${ragDuration}s`);
  console.log(`   - Total matches found: ${relevantContexts.length}`);
  console.log(`   - Resume sections processed: ${keyResumeSections.length}`);
  console.log(`   - Job requirements processed: ${keyJobRequirements.length}`);
  console.log(`${'-'.repeat(80)}\n`);
  
  // Build context string from RAG results (include ALL relevant sections, no truncation)
  const ragContext = relevantContexts.length > 0
    ? relevantContexts.map(ctx => {
        if (ctx.jobRequirement) {
          return `Job Requirement: "${ctx.jobRequirement}"\nRelevant Resume Sections:\n${ctx.relevantResumeSections}`;
        } else {
          return `Resume Section: "${ctx.resumeSection}"\nRelevant Job Requirements:\n${ctx.relevantJobRequirements}`;
        }
      }).join('\n\n---\n\n')
    : '';
  
  // Note: We include ALL RAG results - they're already filtered for relevance
  // The full job text is always available in the prioritized format above
  
  // Generate analysis prompt
  const systemPrompt = `You are a resume analysis expert. You MUST provide SPECIFIC, JOB-SPECIFIC suggestions based on the ACTUAL job description and ACTUAL resume content. NO generic advice. Return ONLY valid JSON. No explanations, no markdown, no code blocks, just raw JSON.

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
1. Read the job description LINE BY LINE - identify EVERY specific requirement, skill, technology, tool, qualification, responsibility mentioned
2. Read the resume LINE BY LINE - identify EXACTLY what the candidate has written (quote the exact text)
3. Compare them DIRECTLY - for each job requirement, find if it exists in the resume and HOW it's worded
4. For EVERY suggestion, you MUST:
   a. Quote the EXACT text from the job description (copy it word-for-word)
   b. Quote the EXACT text from the resume that needs changing (or write "null" if adding new content)
   c. Write replacement text that INCORPORATES the exact wording/phrases from the job description
   d. Explain the SPECIFIC connection between the job requirement and the resume change
5. NO generic advice - EVERY suggestion must reference a SPECIFIC requirement from the job description
6. If you cannot find a specific job requirement to address, DO NOT create that suggestion
7. Prioritize suggestions that address REQUIRED qualifications over preferred ones

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

  // Extract key requirements summary (for quick reference, but full text is in prioritizedJobText)
  const extractKeyRequirementsSummary = (jobSections) => {
    // Combine all requirement-related sections
    const allRequirements = [
      ...jobSections.requirements,
      ...jobSections.qualifications,
      ...jobSections.skills
    ];
    return allRequirements.join('\n\n');
  };

  const keyRequirementsSummary = extractKeyRequirementsSummary(jobSections);
  const resumeSections = resumeText.split('\n').filter(l => l.trim().length > 0).slice(0, 20).join('\n');

  // Enhanced resume structure analysis with detailed work experience and project parsing
  const analyzeResumeStructure = (resumeText) => {
    const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const structure = {
      hasSummary: false,
      summaryText: '',
      experienceEntries: [],
      detailedExperiences: [], // Enhanced: detailed work experience objects
      skillsSection: '',
      educationSection: '',
      projectsSection: '',
      detailedProjects: [], // Enhanced: detailed project objects
    };
    
    let currentSection = '';
    let currentEntry = '';
    let currentExperience = null;
    let currentProject = null;
    
    // Common tech keywords for extraction
    const techKeywords = [
      'python', 'javascript', 'java', 'typescript', 'react', 'node', 'angular', 'vue',
      'django', 'flask', 'spring', 'express', 'sql', 'postgresql', 'mongodb', 'mysql',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'github', 'ci/cd',
      'machine learning', 'ml', 'ai', 'data science', 'tensorflow', 'pytorch'
    ];
    
    // Extract technologies from text
    const extractTechnologies = (text) => {
      const lower = text.toLowerCase();
      return techKeywords.filter(tech => lower.includes(tech.toLowerCase()));
    };
    
    lines.forEach((line, idx) => {
      const lowerLine = line.toLowerCase();
      
      // Detect sections
      if (lowerLine.includes('summary') || lowerLine.includes('objective') || lowerLine.includes('profile')) {
        currentSection = 'summary';
        structure.hasSummary = true;
        structure.summaryText = line;
        if (currentExperience) {
          structure.detailedExperiences.push(currentExperience);
          currentExperience = null;
        }
        if (currentProject) {
          structure.detailedProjects.push(currentProject);
          currentProject = null;
        }
      } else if (lowerLine.includes('experience') || lowerLine.includes('work history') || lowerLine.includes('employment')) {
        currentSection = 'experience';
        if (currentExperience) {
          structure.detailedExperiences.push(currentExperience);
        }
        currentExperience = { title: '', company: '', dates: '', description: '', technologies: [] };
      } else if (lowerLine.includes('skill')) {
        currentSection = 'skills';
        if (currentExperience) {
          structure.detailedExperiences.push(currentExperience);
          currentExperience = null;
        }
        if (currentProject) {
          structure.detailedProjects.push(currentProject);
          currentProject = null;
        }
      } else if (lowerLine.includes('education') || lowerLine.includes('degree') || lowerLine.includes('university')) {
        currentSection = 'education';
        if (currentExperience) {
          structure.detailedExperiences.push(currentExperience);
          currentExperience = null;
        }
        if (currentProject) {
          structure.detailedProjects.push(currentProject);
          currentProject = null;
        }
      } else if (lowerLine.includes('project')) {
        currentSection = 'projects';
        if (currentExperience) {
          structure.detailedExperiences.push(currentExperience);
          currentExperience = null;
        }
        if (currentProject) {
          structure.detailedProjects.push(currentProject);
        }
        currentProject = { name: '', description: '', technologies: [] };
      }
      
      // Collect content by section with enhanced parsing
      if (currentSection === 'summary' && idx < 10) {
        structure.summaryText += ' ' + line;
      } else if (currentSection === 'experience') {
        // Enhanced: Parse work experience entries in detail
        if (line.match(/^\d{4}|\w+\s+\d{4}|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i)) {
          if (currentEntry) {
            structure.experienceEntries.push(currentEntry.trim());
            if (currentExperience) {
              currentExperience.description = currentEntry.trim();
              currentExperience.technologies = extractTechnologies(currentEntry);
            }
          }
          currentEntry = line;
          
          // Try to extract job title and company from the line
          if (currentExperience) {
            // Common patterns: "Software Engineer | Company Name | 2020-2024"
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 2) {
              currentExperience.title = parts[0];
              currentExperience.company = parts[1];
              if (parts.length >= 3) {
                currentExperience.dates = parts[2];
              }
            } else {
              // Try other patterns
              const dateMatch = line.match(/(\d{4}|\w+\s+\d{4}|present|current)/i);
              if (dateMatch) {
                currentExperience.dates = dateMatch[0];
                const beforeDate = line.substring(0, dateMatch.index).trim();
                const titleCompany = beforeDate.split(/[|•\-]/).map(p => p.trim()).filter(p => p);
                if (titleCompany.length >= 1) currentExperience.title = titleCompany[0];
                if (titleCompany.length >= 2) currentExperience.company = titleCompany[1];
              }
            }
          }
        } else if (currentEntry) {
          currentEntry += ' ' + line;
          if (currentExperience) {
            currentExperience.description += ' ' + line;
            const techs = extractTechnologies(line);
            techs.forEach(tech => {
              if (!currentExperience.technologies.includes(tech)) {
                currentExperience.technologies.push(tech);
              }
            });
          }
        }
      } else if (currentSection === 'skills') {
        structure.skillsSection += ' ' + line;
      } else if (currentSection === 'education') {
        structure.educationSection += ' ' + line;
      } else if (currentSection === 'projects') {
        structure.projectsSection += ' ' + line;
        // Enhanced: Parse project details
        if (currentProject) {
          if (!currentProject.name && line.length < 100 && !line.match(/^\d{4}/)) {
            // Likely project name
            currentProject.name = line;
          } else {
            currentProject.description += (currentProject.description ? ' ' : '') + line;
            const techs = extractTechnologies(line);
            techs.forEach(tech => {
              if (!currentProject.technologies.includes(tech)) {
                currentProject.technologies.push(tech);
              }
            });
          }
        }
      }
    });
    
    if (currentEntry) {
      structure.experienceEntries.push(currentEntry.trim());
    }
    if (currentExperience) {
      structure.detailedExperiences.push(currentExperience);
    }
    if (currentProject) {
      structure.detailedProjects.push(currentProject);
    }
    
    return structure;
  };

  const resumeStructure = analyzeResumeStructure(resumeText);
  
  // NO CHARACTER LIMITS - Process full job description and resume
  // All text is available via RAG and full context
  const MAX_EXPERIENCE_DESC = 500; // Increased for better context
  const MAX_PROJECT_DESC = 500; // Increased for better context
  
  // Use prioritized job text (all sections, intelligently organized)
  // NO TRUNCATION - Full job text is always included
  const fullJobTextForPrompt = prioritizedJobText || jobText; // Fallback to full text if extraction fails
  
  // NO TRUNCATION - Full resume text is always included
  const fullResumeText = resumeText;

  const userPrompt = `You are a technical resume–job alignment evaluator specializing in extracting and matching technical requirements.

Your task is to analyze a JOB_DESCRIPTION and a RESUME and produce precise, evidence-based feedback with a STRONG FOCUS ON TECHNICAL ASPECTS.

TECHNICAL FOCUS PRIORITY:
1. Extract ALL technical requirements (programming languages, frameworks, tools, platforms, methodologies)
2. Identify technical gaps where the resume lacks specific technologies mentioned in the job
3. Suggest technical improvements that incorporate exact technical terminology from the job description
4. Prioritize technical skills, certifications, and tools that will make the resume stand out
5. Use RAG context to find semantic matches even when technical terms are worded differently

=== FULL JOB DESCRIPTION (Complete Text - No Limits) ===
${fullJobTextForPrompt}

NOTE: This is the COMPLETE job description with ALL technical requirements, qualifications, and details. Use RAG context below for semantic matching.

=== KEY TECHNICAL REQUIREMENTS SUMMARY ===
${keyRequirementsSummary || 'See full job description above for all technical requirements'}

NOTE: Focus on extracting technical aspects: programming languages, frameworks, tools, platforms, databases, cloud services, methodologies, certifications, and specific technical skills.

=== RESUME STRUCTURE ===
Summary: ${resumeStructure.hasSummary ? 'EXISTS' : 'MISSING'}
${resumeStructure.hasSummary ? `Current: "${resumeStructure.summaryText.substring(0, 150)}"` : ''}

Work Experience: ${resumeStructure.experienceEntries.length} entries
${resumeStructure.detailedExperiences && resumeStructure.detailedExperiences.length > 0 ? `\nDETAILED WORK EXPERIENCES (showing max 5 most recent):\n${resumeStructure.detailedExperiences.slice(0, 5).map((exp, idx) => 
  `${idx + 1}. ${exp.title || 'Title N/A'} at ${exp.company || 'Company N/A'} (${exp.dates || 'Dates N/A'})\n   Technologies: ${exp.technologies && exp.technologies.length > 0 ? exp.technologies.slice(0, 5).join(', ') : 'None identified'}${exp.technologies && exp.technologies.length > 5 ? '...' : ''}\n   Description: "${(exp.description || '').substring(0, MAX_EXPERIENCE_DESC)}${(exp.description || '').length > MAX_EXPERIENCE_DESC ? '...' : ''}"`
).join('\n\n')}` : ''}

Projects: ${resumeStructure.detailedProjects && resumeStructure.detailedProjects.length > 0 ? resumeStructure.detailedProjects.length : 0} projects identified
${resumeStructure.detailedProjects && resumeStructure.detailedProjects.length > 0 ? `\nDETAILED PROJECTS (showing max 3 most relevant):\n${resumeStructure.detailedProjects.slice(0, 3).map((proj, idx) => 
  `${idx + 1}. ${proj.name || 'Project N/A'}\n   Technologies: ${proj.technologies && proj.technologies.length > 0 ? proj.technologies.slice(0, 5).join(', ') : 'None identified'}${proj.technologies && proj.technologies.length > 5 ? '...' : ''}\n   Description: "${(proj.description || '').substring(0, MAX_PROJECT_DESC)}${(proj.description || '').length > MAX_PROJECT_DESC ? '...' : ''}"`
).join('\n\n')}` : ''}

Skills: ${resumeStructure.skillsSection ? 'EXISTS' : 'MISSING'}
${resumeStructure.skillsSection ? `Current: "${resumeStructure.skillsSection.substring(0, 150)}"` : ''}

=== FULL RESUME TEXT (Complete Text - No Limits) ===
${fullResumeText}

=== RAG-ENHANCED CONTEXT (Semantic Matches - Technical Focus) ===
${ragContext || 'No specific matches found via RAG. Analyze the full job description above.'}

NOTE: The RAG context above shows semantic matches between job requirements and resume sections.
This uses vector similarity to find ALL relevant technical aspects, even if wording differs.
The full job description and resume are available above for comprehensive analysis.

=== NON-NEGOTIABLE RULES ===

1. Treat JOB_DESCRIPTION as raw scraped text that may contain UI noise.
   - Ignore and NEVER treat as skills or requirements any UI or boilerplate terms such as:
     "Apply now", "opens in a new window", "About", "Less", "More", "Show more", navigation labels, or buttons.
   - If you detect UI noise, list it in the "Ignored Noise" section.

2. You may ONLY recommend a skill, keyword, or experience if:
   - It appears explicitly in the JOB_DESCRIPTION (quote it exactly, ≤20 words), AND
   - It is a real professional skill, technology, research area, or domain concept, AND
   - It is missing or weakly represented in the RESUME.

3. Every recommendation MUST be justified with evidence:
   - Quote the exact phrase from the JOB_DESCRIPTION (≤20 words).
   - Quote the relevant portion of the RESUME or explicitly state "no evidence found."

4. If the JOB_DESCRIPTION is vague, repetitive, or noisy, say so explicitly and limit recommendations accordingly.

5. Do NOT give generic advice (e.g., "tailor your resume", "highlight impact").

6. Do NOT infer requirements that are not stated in the JOB_DESCRIPTION.

=== ANALYSIS STEPS ===

STEP 1: Filter UI noise from job description
- Identify and list all UI/boilerplate terms (e.g., "Apply now", "opens in a new window", "Less", "More", navigation elements)
- These will be IGNORED in all analysis

STEP 2: Extract ALL technical requirements from job description (quote exactly, no word limit)
- Extract ALL technologies, skills, qualifications, responsibilities, frameworks, tools, methodologies that are:
  - Explicitly stated in the job description (even if mentioned once)
  - Real professional skills/technologies (not UI elements)
  - Technical in nature (programming languages, frameworks, tools, platforms, certifications, methodologies)
  - Not in the ignored noise list
- Pay special attention to:
  - Programming languages and versions (e.g., "Python 3.8+", "Java 11", "TypeScript")
  - Frameworks and libraries (e.g., "React", "Django", "Spring Boot", "TensorFlow")
  - Cloud platforms and services (e.g., "AWS", "Azure", "GCP", "Kubernetes", "Docker")
  - Databases and data technologies (e.g., "PostgreSQL", "MongoDB", "Redis", "Kafka")
  - Tools and methodologies (e.g., "CI/CD", "Agile", "Scrum", "Git", "Jenkins")
  - Certifications and qualifications (e.g., "AWS Certified", "PMP", "CISSP")
- Create a comprehensive numbered list with exact quotes (no truncation)

STEP 3: Map resume content to job requirements (quote exactly)
For each requirement from Step 2, check:
- Is it mentioned in work experience? Quote the EXACT work experience entry and line
- Is it mentioned in projects? Quote the EXACT project description
- Is it mentioned in skills section? Quote the EXACT text
- If not mentioned, write "NOT FOUND IN RESUME"

STEP 4: Identify alignment gaps (evidence-based only)
For each requirement:
- If NOT FOUND in resume: This is a gap (only if it's a real requirement from Step 2)
- If found but vague/weak: This is a gap (only if you can quote evidence)
- If found and well-stated: No gap

STEP 5: Create comprehensive suggestions (minimum 5, maximum 15, only if evidence supports)
- Focus on TECHNICAL aspects that will make the resume stand out
- Prioritize missing technical skills, tools, frameworks, and methodologies
- Ensure suggestions incorporate exact technical terminology from the job description
For EACH suggestion, you MUST provide:
1. section: "experience" | "projects" | "skills" | "summary"
2. job_requirement: Copy the EXACT text from the job description (no word limit - include full technical requirement)
3. before: Copy the EXACT text from the resume that needs changing (or "null" if adding new)
4. after: Write replacement text that:
   - Incorporates the EXACT keywords/phrases from the job requirement
   - Uses similar phrasing/wording from the job description
   - Maintains the resume's existing style
   - For work experience: Shows how to reformat existing experience to match job requirements
5. reason: Explain HOW this specific change addresses the specific job requirement, with evidence quotes
6. alignment_impact: Explain how this improves alignment with evidence
7. priority: "high" if required qualification, "medium" if preferred, "low" if nice-to-have
8. job_keywords_addressed: List ALL relevant technical keywords/phrases from the job description (no limit - be comprehensive)

QUALITY BAR:
- If you cannot find at least 3 meaningful gaps supported by evidence, explain why instead of inventing feedback
- Do NOT create suggestions without evidence quotes
- Do NOT recommend skills/technologies that are not explicitly in the job description

VALIDATION CHECK - Before including a suggestion, ask:
- Can I quote the exact job requirement? (If no, skip this suggestion)
- Can I quote the exact resume text to change? (If no, but it's a missing requirement, use "null")
- Does my "after" text incorporate the exact job requirement wording? (If no, rewrite it)
- Is this suggestion tied to a SPECIFIC job requirement? (If no, skip it)

EXAMPLE - GOOD (follow this format exactly):
Job requirement: "Required: 5+ years of Python development experience, Django framework, PostgreSQL database, experience designing and implementing scalable web applications"
Resume work experience: "Software Engineer | Tech Corp | 2020-2023
- Developed web applications using various technologies
- Built REST APIs and managed databases
- Worked on improving application performance"

Suggestion:
{
  "section": "experience",
  "job_requirement": "Required: 5+ years of Python development experience, Django framework, PostgreSQL database, experience designing and implementing scalable web applications",
  "before": "Software Engineer | Tech Corp | 2020-2023\n- Developed web applications using various technologies\n- Built REST APIs and managed databases\n- Worked on improving application performance",
  "after": "Software Engineer | Tech Corp | 2020-2023 (5+ years)\n- Designed and implemented scalable web applications using Python and Django framework\n- Built REST APIs with Django REST framework and managed PostgreSQL databases\n- Optimized application performance and database queries for scalability",
  "reason": "The job requires '5+ years of Python development experience, Django framework, PostgreSQL database, experience designing and implementing scalable web applications'. The resume mentions relevant work but doesn't specify Python, Django, PostgreSQL, or use the job's exact phrasing 'designed and implemented scalable web applications'. Reformatting the work experience to include these specific technologies and job description wording directly addresses the requirement.",
  "alignment_impact": "Explicitly states the required technologies (Python, Django, PostgreSQL) using job description wording, matches the experience requirement (5+ years), and uses the exact phrase 'designed and implemented scalable web applications' from the job description, directly addressing all key job requirements",
  "priority": "high",
  "job_keywords_addressed": ["5+ years", "Python", "Django", "PostgreSQL", "designed and implemented scalable web applications"]
}

EXAMPLE - BAD (DO NOT DO THIS):
{
  "section": "summary",
  "job_requirement": "General software development",
  "before": "Some experience",
  "after": "Add more details",
  "reason": "Make it more specific",
  ...
}
This is REJECTED because:
- job_requirement is too vague (not a real quote from job description)
- before/after don't quote exact text
- reason is generic

=== OUTPUT FORMAT (REQUIRED JSON STRUCTURE) ===

You MUST return a JSON object with this EXACT structure:

{
  "top_alignment_gaps": [
    {
      "job_requirement": "Exact quote from job description (full technical requirement, no word limit)",
      "evidence_from_job": "Full quote showing where this requirement appears",
      "evidence_from_resume": "Quote from resume or 'NOT FOUND IN RESUME'",
      "gap_type": "missing" | "weak" | "vague",
      "priority": "high" | "medium" | "low"
    }
  ],
  "resume_edits": [
    {
      "section": "experience" | "projects" | "skills" | "summary",
      "job_requirement": "Exact quote from job description (full technical requirement, no word limit)",
      "before": "Exact text from resume to change (or null if adding new)",
      "after": "Replacement text incorporating job requirement wording",
      "reason": "Explanation with evidence quotes",
      "alignment_impact": "How this improves alignment",
      "priority": "high" | "medium" | "low",
      "job_keywords_addressed": ["keyword1", "keyword2", ...]
    }
  ],
  "skills_section": {
    "current": "Current skills section text",
    "suggested": "Suggested skills section with job keywords",
    "added_keywords": ["keyword1", "keyword2", ...]
  },
  "ignored_noise": ["UI element 1", "UI element 2", ...]
}

CRITICAL: 
- Return ONLY valid JSON matching the OUTPUT FORMAT above
- No markdown, no code blocks, no explanations outside JSON
- The "resume_edits" array is REQUIRED (minimum 5, maximum 15 - focus on technical improvements)
- Follow all NON-NEGOTIABLE RULES strictly
- Ignore UI noise (list in ignored_noise)
- Only recommend skills/requirements explicitly in job description
- Provide evidence quotes for every recommendation
- Minimum 3 gaps if evidence supports, otherwise explain why
- Maximum 15 suggestions (focus on technical aspects)
- Skills section: max 18 total skills, grouped by category`;

  // Use timeout for analysis
  const analysisTimeout = ACTIVE_AI_PROVIDER === 'openai' ? OPENAI_ANALYSIS_TIMEOUT : OLLAMA_ANALYSIS_TIMEOUT;
  const modelName = ACTIVE_AI_PROVIDER === 'openai' ? OPENAI_MODEL : OLLAMA_MODEL;
  
  console.log(`${'-'.repeat(80)}`);
  console.log(`🤖 STEP 3: Calling AI (${ACTIVE_AI_PROVIDER.toUpperCase()}) for analysis...`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`   - User prompt length: ${userPrompt.length} characters`);
  console.log(`   - RAG context length: ${ragContext.length} characters`);
  console.log(`   - Total prompt size: ${userPrompt.length + ragContext.length} characters`);
  console.log(`   - Timeout: ${Math.round(analysisTimeout / 1000)} seconds`);
  console.log(`   - Model: ${modelName}`);
  console.log(`   - Provider: ${ACTIVE_AI_PROVIDER === 'openai' ? 'OpenAI API' : 'Ollama (local)'}`);
  console.log(`   ⏳ Waiting for AI response... (this may take 1-3 minutes)\n`);
  
  const aiStartTime = Date.now();
  const response = await generateAIResponse(userPrompt, ragContext, analysisTimeout);
  const aiDuration = Math.round((Date.now() - aiStartTime) / 1000);
  console.log(`✅ AI response received in ${aiDuration}s`);
  console.log(`   - Response length: ${response.length} characters`);
  console.log(`${'-'.repeat(80)}\n`);
  
  console.log(`${'-'.repeat(80)}`);
  console.log(`📝 STEP 4: Parsing and validating response...`);
  console.log(`${'-'.repeat(80)}`);
  
  // Extract JSON from response
  let jsonText = response.trim();
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }
  
  try {
    console.log(`   - Extracted JSON length: ${jsonText.length} characters`);
    const parsed = JSON.parse(jsonText);
    console.log(`   - JSON parsed successfully`);
    console.log(`   - Score: ${parsed.score}`);
    console.log(`   - Matched keywords: ${parsed.matched_keywords?.length || 0}`);
    console.log(`   - Missing keywords: ${parsed.missing_keywords?.length || 0}`);
    console.log(`   - Suggested edits: ${parsed.suggested_edits?.length || 0}`);
    console.log(`${'-'.repeat(80)}\n`);
    
    // Transform new format to expected format for backward compatibility
    // New format: { top_alignment_gaps, resume_edits, skills_section, ignored_noise }
    // Expected format: { score, matched_keywords, missing_keywords, suggested_edits, updated_draft }
    
    if (parsed.resume_edits && Array.isArray(parsed.resume_edits)) {
      // New format detected - transform it
      const suggested_edits = parsed.resume_edits.map(edit => ({
        section: edit.section || 'experience',
        before: edit.before || null,
        after: edit.after || '',
        reason: edit.reason || '',
        job_requirement: edit.job_requirement || '',
        alignment_impact: edit.alignment_impact || '',
        priority: edit.priority || 'medium',
        job_keywords_addressed: edit.job_keywords_addressed || []
      }));
      
      // Extract keywords from gaps and edits
      const missing_keywords = [];
      const matched_keywords = [];
      
      if (parsed.top_alignment_gaps && Array.isArray(parsed.top_alignment_gaps)) {
        parsed.top_alignment_gaps.forEach(gap => {
          // Extract keywords from evidence
          const evidence = gap.evidence_from_job || '';
          const keywords = evidence.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'or', 'with', 'for'].includes(w.toLowerCase()));
          missing_keywords.push(...keywords.slice(0, 5));
        });
      }
      
      // Calculate score based on gaps and edits
      const gapCount = parsed.top_alignment_gaps ? parsed.top_alignment_gaps.length : 0;
      const editCount = suggested_edits.length;
      const score = Math.max(0, Math.min(100, 100 - (gapCount * 10) - (editCount * 5)));
      
      const result = {
        score: score,
        matched_keywords: matched_keywords,
        missing_keywords: [...new Set(missing_keywords)],
        suggested_edits: suggested_edits,
        updated_draft: resumeText,
        // Include new format fields for future use
        top_alignment_gaps: parsed.top_alignment_gaps || [],
        skills_section: parsed.skills_section || {},
        ignored_noise: parsed.ignored_noise || []
      };
      
      // Log final summary
      const totalDuration = Math.round((Date.now() - analysisStartTime) / 1000);
      const parseDuration = Math.round((Date.now() - aiStartTime - aiDuration) / 1000);
      console.log(`${'='.repeat(80)}`);
      console.log(`✅ ANALYSIS COMPLETED SUCCESSFULLY`);
      console.log(`${'='.repeat(80)}`);
      console.log(`⏱️  Total time: ${totalDuration} seconds (${Math.round(totalDuration / 60)} minutes)`);
      console.log(`   - Storage: ${Math.round((storeStartTime - analysisStartTime) / 1000)}s`);
      console.log(`   - RAG retrieval: ${ragDuration}s`);
      console.log(`   - AI processing: ${aiDuration}s`);
      console.log(`   - Parsing: ${parseDuration}s`);
      console.log(`⏰ End time: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(80)}\n`);
      
      return result;
    } else if (parsed.suggested_edits) {
      // Old format - return as is
      // Log final summary
      const totalDuration = Math.round((Date.now() - analysisStartTime) / 1000);
      const parseDuration = Math.round((Date.now() - aiStartTime - aiDuration) / 1000);
      console.log(`${'='.repeat(80)}`);
      console.log(`✅ ANALYSIS COMPLETED SUCCESSFULLY`);
      console.log(`${'='.repeat(80)}`);
      console.log(`⏱️  Total time: ${totalDuration} seconds (${Math.round(totalDuration / 60)} minutes)`);
      console.log(`   - Storage: ${Math.round((storeStartTime - analysisStartTime) / 1000)}s`);
      console.log(`   - RAG retrieval: ${ragDuration}s`);
      console.log(`   - AI processing: ${aiDuration}s`);
      console.log(`   - Parsing: ${parseDuration}s`);
      console.log(`⏰ End time: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(80)}\n`);
      
      return parsed;
    } else if (parsed.gaps && Array.isArray(parsed.gaps)) {
      // Handle OpenAI returning "gaps" format - convert to resume_edits
      console.log(`   ⚠️  Received "gaps" format, converting to "resume_edits"...`);
      const resume_edits = parsed.gaps.map((gap, idx) => ({
        section: gap.section || 'experience',
        job_requirement: gap.job_requirement || gap.requirement || '',
        before: gap.before || gap.current || null,
        after: gap.after || gap.suggested || '',
        reason: gap.reason || gap.explanation || '',
        alignment_impact: gap.alignment_impact || gap.impact || '',
        priority: gap.priority || 'medium',
        job_keywords_addressed: gap.job_keywords_addressed || gap.keywords || []
      }));
      
      const top_alignment_gaps = parsed.gaps.map(gap => ({
        job_requirement: gap.job_requirement || gap.requirement || '',
        evidence_from_job: gap.evidence_from_job || gap.job_requirement || '',
        evidence_from_resume: gap.evidence_from_resume || gap.before || 'NOT FOUND IN RESUME',
        gap_type: gap.gap_type || 'missing',
        priority: gap.priority || 'medium'
      }));
      
      const gapCount = top_alignment_gaps.length;
      const editCount = resume_edits.length;
      const score = Math.max(0, Math.min(100, 100 - (gapCount * 10) - (editCount * 5)));
      
      const missing_keywords = [];
      top_alignment_gaps.forEach(gap => {
        const evidence = gap.evidence_from_job || '';
        const keywords = evidence.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'or', 'with', 'for'].includes(w.toLowerCase()));
        missing_keywords.push(...keywords.slice(0, 5));
      });
      
      const result = {
        score: score,
        matched_keywords: [],
        missing_keywords: [...new Set(missing_keywords)],
        suggested_edits: resume_edits,
        updated_draft: resumeText,
        top_alignment_gaps: top_alignment_gaps,
        skills_section: parsed.skills_section || {},
        ignored_noise: parsed.ignored_noise || []
      };
      
      // Log final summary
      const totalDuration = Math.round((Date.now() - analysisStartTime) / 1000);
      const parseDuration = Math.round((Date.now() - aiStartTime - aiDuration) / 1000);
      console.log(`${'='.repeat(80)}`);
      console.log(`✅ ANALYSIS COMPLETED SUCCESSFULLY`);
      console.log(`${'='.repeat(80)}`);
      console.log(`⏱️  Total time: ${totalDuration} seconds (${Math.round(totalDuration / 60)} minutes)`);
      console.log(`   - Storage: ${Math.round((storeStartTime - analysisStartTime) / 1000)}s`);
      console.log(`   - RAG retrieval: ${ragDuration}s`);
      console.log(`   - AI processing: ${aiDuration}s`);
      console.log(`   - Parsing: ${parseDuration}s`);
      console.log(`⏰ End time: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(80)}\n`);
      
      return result;
    } else {
      // Unknown format - log what we received and try to construct from available data
      console.error('   ❌ Unexpected response format. Received keys:', Object.keys(parsed));
      console.error('   Response preview:', JSON.stringify(parsed).substring(0, 500));
      throw new Error('Unexpected response format from AI. Expected "resume_edits" or "suggested_edits" or "gaps" array.');
    }
  } catch (error) {
    console.error('Error parsing AI response:', error);
    console.error('Response was:', response.substring(0, 500));
    throw new Error('Invalid JSON response from AI: ' + error.message);
  }
}

/**
 * Handle chat message with RAG
 */
async function handleChatMessage(message, currentDraft, jobText, chatHistory) {
  try {
    // Retrieve relevant context from vector DB (allow more time for better results)
    let context = [];
    try {
      const queryText = `${message} ${jobText}`;
      // Add timeout to RAG retrieval - max 10 seconds (allow time for better context)
      const ragPromise = retrieveSimilarContent(queryText, 5); // Get more results for better AI context
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('RAG timeout')), 10000)
      );
      
      context = await Promise.race([ragPromise, timeoutPromise]);
      if (!Array.isArray(context)) {
        context = [];
      }
    } catch (error) {
      // If RAG times out, continue without it but log the warning
      console.warn('RAG retrieval timed out, continuing without context:', error.message);
      context = [];
    }
    
    const systemPrompt = `You are a resume editing assistant. Help users iteratively improve their resume through conversation. You MUST provide SPECIFIC, JOB-SPECIFIC suggestions based on the ACTUAL job description and ACTUAL resume content.

CRITICAL RULES:
1. NO full resume rewrites - only propose incremental changes
2. Changes must be grounded in the existing resume content AND the job description
3. Propose specific, focused edits (1-3 changes per message) that directly address job requirements
4. For EVERY edit, you MUST:
   a. Reference a SPECIFIC requirement from the job description (quote it)
   b. Quote the EXACT text from the resume that needs changing (or null if adding)
   c. Write replacement text that incorporates the exact wording from the job requirement
   d. Explain how this specific change addresses the specific job requirement
5. If you need clarification, ask questions and set updated_draft to null
6. Return ONLY valid JSON - no markdown, no code blocks, no explanations
7. NO generic advice - every suggestion must tie to a specific job requirement

Return exactly this JSON structure:
{
  "assistant_message": "<your response to the user>",
  "proposed_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": "<EXACT current text to replace from resume, or null>",
      "after": "<proposed replacement text that incorporates EXACT job requirement wording>",
      "reason": "<explain how this SPECIFIC change addresses a SPECIFIC job requirement - quote the requirement>",
      "job_requirement": "<quote the EXACT requirement from job description this addresses>"
    }
  ],
  "updated_draft": "<updated resume with ONLY the proposed edits applied, or null if just asking questions>"
}`;

    // Dynamic sizing: Use intelligent extraction for job text, reasonable limits for draft/history
    const maxDraftLength = 3000; // Draft limit (resumes are typically shorter)
    const maxHistoryLength = 1000; // History limit for context
    
    // Intelligently extract job sections (same as analysis)
    const extractJobSectionsForChat = (jobText) => {
      const lines = jobText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const sections = { requirements: [], qualifications: [], skills: [], responsibilities: [], preferred: [], other: [] };
      let currentSection = 'other';
      let currentSectionLines = [];
      
      lines.forEach((line) => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('required') || lowerLine.includes('must have')) {
          if (currentSectionLines.length > 0) sections[currentSection].push(currentSectionLines.join('\n'));
          currentSection = 'requirements';
          currentSectionLines = [line];
        } else if (lowerLine.includes('qualification') || lowerLine.includes('education')) {
          if (currentSectionLines.length > 0) sections[currentSection].push(currentSectionLines.join('\n'));
          currentSection = 'qualifications';
          currentSectionLines = [line];
        } else if (lowerLine.includes('skill') || lowerLine.includes('technology')) {
          if (currentSectionLines.length > 0 && currentSection !== 'skills') {
            sections[currentSection].push(currentSectionLines.join('\n'));
          }
          if (currentSection !== 'skills') {
            currentSection = 'skills';
            currentSectionLines = [line];
          } else {
            currentSectionLines.push(line);
          }
        } else if (lowerLine.includes('responsibilit') || lowerLine.includes('duties')) {
          if (currentSectionLines.length > 0) sections[currentSection].push(currentSectionLines.join('\n'));
          currentSection = 'responsibilities';
          currentSectionLines = [line];
        } else {
          currentSectionLines.push(line);
        }
      });
      if (currentSectionLines.length > 0) sections[currentSection].push(currentSectionLines.join('\n'));
      return sections;
    };
    
    const jobSectionsForChat = extractJobSectionsForChat(jobText);
    const prioritizedJobForChat = [
      ...(jobSectionsForChat.requirements.length > 0 ? [`=== REQUIRED ===\n${jobSectionsForChat.requirements.join('\n\n')}`] : []),
      ...(jobSectionsForChat.qualifications.length > 0 ? [`=== QUALIFICATIONS ===\n${jobSectionsForChat.qualifications.join('\n\n')}`] : []),
      ...(jobSectionsForChat.skills.length > 0 ? [`=== SKILLS ===\n${jobSectionsForChat.skills.join('\n\n')}`] : []),
      ...(jobSectionsForChat.responsibilities.length > 0 ? [`=== RESPONSIBILITIES ===\n${jobSectionsForChat.responsibilities.join('\n\n')}`] : []),
      ...(jobSectionsForChat.preferred.length > 0 ? [`=== PREFERRED ===\n${jobSectionsForChat.preferred.join('\n\n')}`] : []),
      ...(jobSectionsForChat.other.length > 0 ? [`=== OTHER ===\n${jobSectionsForChat.other.join('\n\n')}`] : [])
    ].join('\n\n');
    
    const truncatedDraft = currentDraft.length > maxDraftLength 
      ? currentDraft.substring(0, maxDraftLength) + '[...]'
      : currentDraft;
    const jobTextForChat = prioritizedJobForChat || jobText; // Use prioritized sections, fallback to full text
    const truncatedHistory = chatHistory.length > 10
      ? chatHistory.slice(-10).map(msg => `${msg.role}: ${msg.content.substring(0, 200)}`).join('\n')
      : chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');

    const userPrompt = `=== CURRENT DRAFT RESUME ===
${truncatedDraft}

=== JOB DESCRIPTION (Intelligently Organized) ===
${jobTextForChat}

${context.length > 0 ? `=== RELEVANT CONTEXT ===\n${context.slice(0, 5).join('\n\n---\n\n')}\n` : ''}

=== PREVIOUS CONVERSATION ===
${truncatedHistory}

=== USER'S CURRENT MESSAGE ===
${message}

=== INSTRUCTIONS ===
When proposing edits:
1. Read the user's message to understand what they want
2. Check the job description for SPECIFIC requirements related to their request
3. Find the EXACT text in the resume that needs changing (quote it exactly)
4. Write replacement text that incorporates the EXACT wording from the job description
5. Explain how your change addresses a SPECIFIC job requirement (quote it)

CRITICAL: Every edit must be tied to a SPECIFIC requirement from the job description. Quote exact text from both documents. Keep response concise.`;

    // Generate response using AI (always wait for AI, no fast fallback)
    let response;
    try {
      const contextText = Array.isArray(context) ? context.join('\n\n') : '';
      // Use full prompt for better AI responses (don't truncate)
      response = await generateAIResponseForChat(userPrompt, contextText);
      
      // If response is empty or invalid, retry once
      if (!response || response.trim().length === 0) {
        console.warn('Empty AI response, retrying...');
        response = await generateAIResponseForChat(userPrompt, contextText);
      }
    } catch (error) {
      console.error('Error generating AI response, retrying once:', error.message);
      // Retry once before giving up
      try {
        const contextText = Array.isArray(context) ? context.join('\n\n') : '';
        response = await generateAIResponseForChat(userPrompt, contextText);
      } catch (retryError) {
        console.error('AI response failed after retry, using fallback:', retryError.message);
        // Only use fallback as last resort
        return generateChatFallbackResponse(message, currentDraft);
      }
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
 * Get analysis status (check if analysis is in progress)
 */
app.get('/api/analysis/status', (req, res) => {
  if (activeAnalysisRequest) {
    const duration = activeAnalysisRequestStartTime 
      ? Math.round((Date.now() - activeAnalysisRequestStartTime) / 1000)
      : null;
    res.json({
      inProgress: true,
      requestId: activeAnalysisRequest,
      durationSeconds: duration,
    });
  } else {
    res.json({
      inProgress: false,
      requestId: null,
      durationSeconds: null,
    });
  }
});

/**
 * Reset analysis state (clear stuck requests)
 * Use with caution - only if a request is truly stuck
 */
app.post('/api/analysis/reset', (req, res) => {
  const previousRequestId = activeAnalysisRequest;
  activeAnalysisRequest = null;
  activeAnalysisRequestStartTime = null;
  console.warn(`⚠️  Analysis state reset. Previous request ID: ${previousRequestId || 'none'}`);
  res.json({
    success: true,
    message: 'Analysis state cleared',
    previousRequestId: previousRequestId,
  });
});

// Request deduplication - prevent multiple concurrent analyses
let activeAnalysisRequest = null;
let activeAnalysisRequestStartTime = null;

/**
 * Analyze resume endpoint
 */
app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`📊 Analysis request received [${requestId}]`);
  
  // Check if there's already an active analysis
  if (activeAnalysisRequest) {
    const duration = activeAnalysisRequestStartTime 
      ? Math.round((Date.now() - activeAnalysisRequestStartTime) / 1000)
      : null;
    console.warn(`⚠️  Analysis already in progress [${activeAnalysisRequest}] (running for ${duration}s), rejecting request [${requestId}]`);
    
    // Auto-clear if request has been running for more than 20 minutes (likely stuck)
    if (duration && duration > 1200) {
      console.warn(`⚠️  Auto-clearing stuck request [${activeAnalysisRequest}] (running for ${duration}s)`);
      activeAnalysisRequest = null;
      activeAnalysisRequestStartTime = null;
    } else {
    return res.status(429).json({
      success: false,
        error: `Analysis already in progress. Please wait for the current analysis to complete. (Running for ${duration || 'unknown'} seconds)`,
        requestId: activeAnalysisRequest,
        durationSeconds: duration,
    });
    }
  }
  
  try {
    const { resumeText, jobText } = req.body;
    activeAnalysisRequest = requestId;
    activeAnalysisRequestStartTime = Date.now();
    
    if (!resumeText || !jobText) {
      console.error('❌ Missing required fields');
      activeAnalysisRequest = null;
      activeAnalysisRequestStartTime = null;
      return res.status(400).json({
        success: false,
        error: 'Both resumeText and jobText are required',
      });
    }
    
    console.log(`📝 Resume length: ${resumeText.length} chars, Job length: ${jobText.length} chars [${requestId}]`);
    console.log('🤖 Starting analysis with Ollama...');
    
    // Set a timeout for the entire HTTP request (15 minutes max)
    const requestTimeout = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`⏱️  Request timeout after 15 minutes [${requestId}]`);
        activeAnalysisRequest = null; // Clear active request
        activeAnalysisRequestStartTime = null;
        res.status(504).json({
          success: false,
          error: 'Analysis timed out after 15 minutes. The request may be too complex or Ollama may be overloaded.',
        });
      }
    }, 900000); // 15 minutes
    
    // Safety: Clear active request if client disconnects
    req.on('close', () => {
      if (activeAnalysisRequest === requestId) {
        console.warn(`⚠️  Client disconnected, clearing active request [${requestId}]`);
        activeAnalysisRequest = null;
        activeAnalysisRequestStartTime = null;
        clearTimeout(requestTimeout);
      }
    });
    
    try {
      const result = await analyzeResume(resumeText, jobText);
      clearTimeout(requestTimeout);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ Analysis completed successfully in ${duration} seconds [${requestId}]`);
      
      activeAnalysisRequest = null; // Clear active request
      activeAnalysisRequestStartTime = null;
      res.json({
        success: true,
        result,
      });
    } catch (analysisError) {
      clearTimeout(requestTimeout);
      activeAnalysisRequest = null; // Clear active request on error
      activeAnalysisRequestStartTime = null;
      throw analysisError;
    }
  } catch (error) {
    activeAnalysisRequest = null; // Clear active request on error
    activeAnalysisRequestStartTime = null;
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Analysis error after ${duration} seconds [${requestId}]:`, error);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Analysis failed',
      });
    }
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

/**
 * Check Ollama health and wait for it to be ready
 */
async function checkOllamaHealth(maxWaitSeconds = 30) {
  const startTime = Date.now();
  const maxWait = maxWaitSeconds * 1000;
  
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout for health check
      });
      
      if (response.ok) {
        const data = await response.json();
        // Check if the model is available
        const modelAvailable = data.models?.some(m => 
          m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL + ':')
        );
        
        if (modelAvailable) {
          ollamaHealthy = true;
          console.log(`✅ Ollama is healthy and model '${OLLAMA_MODEL}' is available`);
          return true;
        } else {
          console.warn(`⚠️  Ollama is running but model '${OLLAMA_MODEL}' not found. Available models:`, 
            data.models?.map(m => m.name).join(', ') || 'none');
          // Still mark as healthy if Ollama is responding
          ollamaHealthy = true;
          return true;
        }
      }
    } catch (error) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏳ Waiting for Ollama... (${elapsed}s/${maxWaitSeconds}s)`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
    }
  }
  
  ollamaHealthy = false;
  console.error(`❌ Ollama not available after ${maxWaitSeconds} seconds`);
  return false;
}

// Initialize and start server
async function startServer() {
  try {
    // Initialize embedding model
    await initializeEmbeddingModel();
    
    // Check Ollama health and wait for it (critical for this project)
    if (USE_OLLAMA) {
      console.log('🔍 Checking Ollama health...');
      await checkOllamaHealth(30); // Wait up to 30 seconds for Ollama
      if (!ollamaHealthy) {
        console.error('❌ CRITICAL: Ollama is not available. This service requires Ollama to function properly.');
        console.error('   Please ensure Ollama is running: ollama serve');
        console.error('   Or install it: https://ollama.ai');
        console.error('   Service will continue but may have limited functionality.');
      }
    }
    
    // Test vector DB connection with timeout and retry
    console.log('🔍 Checking ChromaDB connection...');
    let chromaConnected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const heartbeatPromise = chromaClient.heartbeat();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );
      
      await Promise.race([heartbeatPromise, timeoutPromise]);
      chromaAvailable = true;
        chromaConnected = true;
      await getOrCreateCollection();
      console.log('✅ Vector database (ChromaDB) connected');
        break;
    } catch (error) {
        console.warn(`⚠️  ChromaDB connection attempt ${attempt}/3 failed: ${error.message}`);
        if (attempt < 3) {
          console.log(`   Retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!chromaConnected) {
      chromaAvailable = false;
      console.warn('⚠️  Vector database (ChromaDB) not available after 3 attempts');
      console.warn('   Service will continue but RAG features will be limited');
      console.warn('   To enable: docker run -d -p 8000:8000 chromadb/chroma');
      console.warn('   The service will automatically reconnect when ChromaDB becomes available');
    }
    
    // Start periodic health check for ChromaDB (every 30 seconds)
    setInterval(async () => {
      if (!chromaAvailable) {
        console.log('🔄 Checking ChromaDB availability...');
        await checkChromaHealth();
      }
    }, 30000); // Check every 30 seconds
    
    // Display configuration
    console.log('\n📋 Configuration:');
    console.log(`   AI Provider: ${ACTIVE_AI_PROVIDER === 'openai' ? '✅ OpenAI' : '✅ Ollama'}`);
    if (ACTIVE_AI_PROVIDER === 'openai') {
      console.log(`   OpenAI Model: ${OPENAI_MODEL}`);
      console.log(`   OpenAI API Key: ${OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
    } else {
    console.log(`   Ollama: ${USE_OLLAMA ? (ollamaHealthy ? '✅ Healthy' : '❌ Not available') : '❌ Disabled'}`);
    if (USE_OLLAMA) {
      console.log(`   Ollama URL: ${OLLAMA_URL}`);
      console.log(`   Ollama Model: ${OLLAMA_MODEL}`);
      }
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

