#!/usr/bin/env node

/**
 * RAG Component Test Script
 * Tests vector database storage, retrieval, and semantic matching
 */

import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';

// Configuration
const CHROMA_PATH = process.env.CHROMA_PATH || 'http://localhost:8000';
const COLLECTION_NAME = 'resumefit_test';

// Test data
const sampleResume = `
John Doe
Software Engineer
Email: john.doe@email.com | Phone: (555) 123-4567

SUMMARY
Experienced software engineer with 5+ years developing web applications using Python, JavaScript, and React. 
Strong background in full-stack development, database design, and cloud infrastructure.

WORK EXPERIENCE

Senior Software Engineer | Tech Corp | 2020 - Present
- Developed scalable web applications using Python, Django, and PostgreSQL
- Built RESTful APIs and microservices architecture
- Implemented CI/CD pipelines using Jenkins and Docker
- Led team of 3 developers in agile environment

Software Engineer | Startup Inc | 2018 - 2020
- Created frontend applications using React and TypeScript
- Designed and optimized database schemas
- Collaborated with cross-functional teams using Git

SKILLS
Programming Languages: Python, JavaScript, TypeScript, Java
Frameworks: Django, React, Node.js
Databases: PostgreSQL, MongoDB, Redis
Tools: Git, Docker, Jenkins, AWS
`;

const sampleJobDescription = `
Software Engineer - Full Stack

We are looking for an experienced Software Engineer to join our team.

REQUIREMENTS:
- 5+ years of software development experience
- Strong proficiency in Python and JavaScript
- Experience with Django framework and React
- Knowledge of PostgreSQL and database optimization
- Experience with cloud platforms (AWS preferred)
- Familiarity with Docker and containerization
- Understanding of CI/CD practices
- Experience with microservices architecture
- Strong problem-solving skills
- Bachelor's degree in Computer Science or related field

PREFERRED QUALIFICATIONS:
- Experience with TypeScript
- Knowledge of MongoDB
- Experience with Redis caching
- AWS certifications
- Experience leading small teams

RESPONSIBILITIES:
- Design and develop scalable web applications
- Build and maintain RESTful APIs
- Implement and optimize database queries
- Deploy applications using Docker and CI/CD pipelines
- Collaborate with cross-functional teams
- Mentor junior developers
`;

let embeddingModel = null;
let chromaClient = null;
let testCollection = null;

// Initialize embedding model
async function initializeEmbeddingModel() {
  console.log('🔧 Initializing embedding model...');
  try {
    embeddingModel = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log('✅ Embedding model initialized\n');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize embedding model:', error.message);
    return false;
  }
}

// Generate embedding
async function generateEmbedding(text) {
  if (!embeddingModel) {
    throw new Error('Embedding model not initialized');
  }
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Initialize ChromaDB client
function initializeChromaClient() {
  console.log('🔧 Initializing ChromaDB client...');
  try {
    chromaClient = new ChromaClient({
      path: CHROMA_PATH
    });
    console.log('✅ ChromaDB client initialized\n');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize ChromaDB client:', error.message);
    return false;
  }
}

// Test ChromaDB connection
async function testConnection() {
  console.log('📡 Testing ChromaDB connection...');
  try {
    const heartbeat = await chromaClient.heartbeat();
    console.log('✅ ChromaDB is connected');
    console.log(`   Heartbeat: ${JSON.stringify(heartbeat)}\n`);
    return true;
  } catch (error) {
    console.error('❌ ChromaDB connection failed:', error.message);
    console.error('   Make sure ChromaDB is running: docker run -d -p 8000:8000 chromadb/chroma\n');
    return false;
  }
}

// Get or create test collection
async function getOrCreateCollection() {
  console.log('📚 Getting or creating test collection...');
  try {
    // Try to get existing collection
    try {
      testCollection = await chromaClient.getCollection({ name: COLLECTION_NAME });
      console.log('✅ Found existing test collection');
    } catch (error) {
      // Collection doesn't exist, create it
      testCollection = await chromaClient.createCollection({
        name: COLLECTION_NAME,
        metadata: { description: 'Test collection for RAG testing' }
      });
      console.log('✅ Created new test collection');
    }
    console.log(`   Collection name: ${COLLECTION_NAME}\n`);
    return true;
  } catch (error) {
    console.error('❌ Failed to get/create collection:', error.message);
    return false;
  }
}

// Test storing chunks
async function testStoreChunks() {
  console.log('💾 Testing chunk storage...');
  
  try {
    // Chunk the resume text
    const resumeChunks = chunkText(sampleResume, 300, 50);
    console.log(`   Created ${resumeChunks.length} resume chunks`);
    
    // Chunk the job description
    const jobChunks = chunkText(sampleJobDescription, 300, 50);
    console.log(`   Created ${jobChunks.length} job description chunks`);
    
    // Generate embeddings and store
    const allChunks = [
      ...resumeChunks.map((chunk, idx) => ({ text: chunk, type: 'resume', index: idx })),
      ...jobChunks.map((chunk, idx) => ({ text: chunk, type: 'job', index: idx }))
    ];
    
    console.log(`   Generating embeddings for ${allChunks.length} chunks...`);
    const embeddings = [];
    const documents = [];
    const metadatas = [];
    const ids = [];
    
    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i];
      const embedding = await generateEmbedding(chunk.text);
      embeddings.push(embedding);
      documents.push(chunk.text);
      metadatas.push({
        type: chunk.type,
        index: chunk.index,
        timestamp: Date.now()
      });
      ids.push(`${chunk.type}_${chunk.index}_${Date.now()}`);
      
      if ((i + 1) % 5 === 0) {
        console.log(`   Processed ${i + 1}/${allChunks.length} chunks...`);
      }
    }
    
    // Store in ChromaDB
    console.log('   Storing chunks in ChromaDB...');
    await testCollection.add({
      ids: ids,
      embeddings: embeddings,
      documents: documents,
      metadatas: metadatas
    });
    
    console.log(`✅ Successfully stored ${allChunks.length} chunks\n`);
    return true;
  } catch (error) {
    console.error('❌ Failed to store chunks:', error.message);
    return false;
  }
}

// Chunk text helper
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
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Test retrieval
async function testRetrieval() {
  console.log('🔍 Testing semantic retrieval...');
  
  const testQueries = [
    'Python Django experience',
    'PostgreSQL database',
    'React TypeScript frontend',
    'AWS cloud infrastructure',
    'Docker CI/CD pipelines'
  ];
  
  try {
    for (const query of testQueries) {
      console.log(`\n   Query: "${query}"`);
      
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query);
      
      // Query ChromaDB
      const results = await testCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 3
      });
      
      if (results.documents && results.documents[0] && results.documents[0].length > 0) {
        console.log(`   ✅ Found ${results.documents[0].length} relevant chunks:`);
        results.documents[0].forEach((doc, idx) => {
          const metadata = results.metadatas[0][idx];
          const distance = results.distances[0][idx];
          console.log(`      ${idx + 1}. [${metadata.type}] (distance: ${distance.toFixed(4)})`);
          console.log(`         "${doc.substring(0, 100)}${doc.length > 100 ? '...' : ''}"`);
        });
      } else {
        console.log('   ⚠️  No results found');
      }
    }
    
    console.log('\n✅ Retrieval test completed\n');
    return true;
  } catch (error) {
    console.error('❌ Retrieval test failed:', error.message);
    return false;
  }
}

// Test RAG workflow
async function testRAGWorkflow() {
  console.log('🔄 Testing full RAG workflow...');
  
  try {
    // Simulate a job requirement query
    const jobRequirement = 'Experience with Django framework and PostgreSQL database';
    console.log(`\n   Job Requirement: "${jobRequirement}"`);
    
    // Generate embedding for the requirement
    const requirementEmbedding = await generateEmbedding(jobRequirement);
    
    // Query for relevant resume sections
    const results = await testCollection.query({
      queryEmbeddings: [requirementEmbedding],
      nResults: 5,
      where: { type: 'resume' } // Only search in resume chunks
    });
    
    if (results.documents && results.documents[0] && results.documents[0].length > 0) {
      console.log(`   ✅ Found ${results.documents[0].length} relevant resume sections:`);
      results.documents[0].forEach((doc, idx) => {
        const distance = results.distances[0][idx];
        const relevance = (1 - distance) * 100;
        console.log(`\n      Match ${idx + 1} (${relevance.toFixed(1)}% relevant):`);
        console.log(`      "${doc}"`);
      });
    } else {
      console.log('   ⚠️  No matching resume sections found');
    }
    
    // Now query for relevant job requirements from resume section
    const resumeSection = 'Developed scalable web applications using Python, Django, and PostgreSQL';
    console.log(`\n   Resume Section: "${resumeSection}"`);
    
    const resumeEmbedding = await generateEmbedding(resumeSection);
    const jobResults = await testCollection.query({
      queryEmbeddings: [resumeEmbedding],
      nResults: 5,
      where: { type: 'job' } // Only search in job chunks
    });
    
    if (jobResults.documents && jobResults.documents[0] && jobResults.documents[0].length > 0) {
      console.log(`   ✅ Found ${jobResults.documents[0].length} relevant job requirements:`);
      jobResults.documents[0].forEach((doc, idx) => {
        const distance = jobResults.distances[0][idx];
        const relevance = (1 - distance) * 100;
        console.log(`\n      Match ${idx + 1} (${relevance.toFixed(1)}% relevant):`);
        console.log(`      "${doc}"`);
      });
    } else {
      console.log('   ⚠️  No matching job requirements found');
    }
    
    console.log('\n✅ RAG workflow test completed\n');
    return true;
  } catch (error) {
    console.error('❌ RAG workflow test failed:', error.message);
    return false;
  }
}

// Cleanup test collection
async function cleanup() {
  console.log('🧹 Cleaning up test collection...');
  try {
    await chromaClient.deleteCollection({ name: COLLECTION_NAME });
    console.log('✅ Test collection deleted\n');
  } catch (error) {
    console.warn('⚠️  Could not delete collection (may not exist):', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 RAG Component Test Suite');
  console.log('='.repeat(80));
  console.log(`ChromaDB: ${CHROMA_PATH}`);
  console.log(`Collection: ${COLLECTION_NAME}\n`);
  
  const results = {
    embeddingModel: false,
    chromaClient: false,
    connection: false,
    collection: false,
    storage: false,
    retrieval: false,
    ragWorkflow: false
  };
  
  // Test 1: Initialize embedding model
  results.embeddingModel = await initializeEmbeddingModel();
  if (!results.embeddingModel) {
    console.error('❌ Cannot continue without embedding model\n');
    return results;
  }
  
  // Test 2: Initialize ChromaDB client
  results.chromaClient = initializeChromaClient();
  if (!results.chromaClient) {
    console.error('❌ Cannot continue without ChromaDB client\n');
    return results;
  }
  
  // Test 3: Test connection
  results.connection = await testConnection();
  if (!results.connection) {
    console.error('❌ Cannot continue without ChromaDB connection\n');
    return results;
  }
  
  // Test 4: Get or create collection
  results.collection = await getOrCreateCollection();
  if (!results.collection) {
    console.error('❌ Cannot continue without collection\n');
    return results;
  }
  
  // Test 5: Store chunks
  results.storage = await testStoreChunks();
  if (!results.storage) {
    console.error('❌ Storage test failed\n');
    return results;
  }
  
  // Test 6: Test retrieval
  results.retrieval = await testRetrieval();
  
  // Test 7: Test RAG workflow
  results.ragWorkflow = await testRAGWorkflow();
  
  // Summary
  console.log('='.repeat(80));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(80));
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${test}`);
  });
  
  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + '='.repeat(80));
  if (allPassed) {
    console.log('🎉 All tests passed! RAG component is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  console.log('='.repeat(80));
  
  // Cleanup
  const shouldCleanup = process.argv.includes('--cleanup') || process.argv.includes('-c');
  if (shouldCleanup) {
    await cleanup();
  } else {
    console.log('\n💡 Tip: Run with --cleanup flag to delete test collection after tests');
  }
  
  return results;
}

// Run tests
runTests()
  .then((results) => {
    const exitCode = Object.values(results).every(r => r) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Test suite crashed:', error);
    process.exit(1);
  });

