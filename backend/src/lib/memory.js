const { VertexAI } = require('@google-cloud/vertexai');
const { getFirestore, Timestamp } = require('./firebaseAdmin');

// Initialize Vertex AI
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_LOCATION || 'us-central1';

let generativeModel = null;

function getModel() {
  console.log('[SCRIBE DEBUG] 1. Inside getModel()');
  if (generativeModel) {
    console.log('[SCRIBE DEBUG] 1a. Returning cached model.');
    return generativeModel;
  }
  
  if (!projectId) {
    console.error('[SCRIBE DEBUG] FATAL: Project ID not found. Searched for FIREBASE_PROJECT_ID, GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT.');
    return null;
  }
  console.log(`[SCRIBE DEBUG] 1b. Project ID found: ${projectId}`);

  try {
    const vertex_ai = new VertexAI({ project: projectId, location: location });
    console.log('[SCRIBE DEBUG] 1c. VertexAI object created.');
    
    generativeModel = vertex_ai.getGenerativeModel({
      model: 'gemini-2.0-flash-lite', // Efficient model for summarization
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.2, // Low temperature for factual consistency
      }
    });
    console.log('[SCRIBE DEBUG] 1d. Generative model object created. Returning model.');
    return generativeModel;
  } catch (err) {
    console.error('[SCRIBE DEBUG] FATAL: Error creating VertexAI or getGenerativeModel.', err);
    return null;
  }
}

const db = getFirestore();

/**
 * Retrieves the user's long-term memory summary.
 * @param {string} id The user ID or session ID.
 * @param {boolean} [isDemo=false] Whether this is a demo session.
 * @returns {Promise<string>} The summary text or empty string.
 */
async function getMemory(id, isDemo = false) {
  const collectionName = isDemo ? 'demo_sessions' : 'users';
  try {
    const docRef = db.collection(collectionName).doc(id).collection('memory').doc('summary');
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data().content || '';
    }
    return '';
  } catch (err) {
    console.error(`Error fetching memory for id ${id}:`, err);
    return '';
  }
}

/**
 * Updates the user's long-term memory summary using Vertex AI.
 * This should be called asynchronously/background.
 * @param {string} id The user ID or session ID.
 * @param {Array} newMessages - Array of {role, content}
 * @param {string} existingSummary - Optional, optimization to avoid refetching
 * @param {boolean} [isDemo=false] Whether this is a demo session.
 */
async function updateMemory(id, newMessages, existingSummary = null, isDemo = false) {
  console.log(`[SCRIBE DEBUG] 0. updateMemory called for id: ${id}`);
  try {
    const model = getModel();
    if (!model) {
      console.error('[SCRIBE DEBUG] 2. updateMemory failed because getModel() returned null.');
      return;
    }
    console.log('[SCRIBE DEBUG] 2. Model successfully retrieved.');

    // 1. Get current summary if not provided
    let currentSummary = existingSummary;
    if (currentSummary === null) {
      currentSummary = await getMemory(id, isDemo);
    }
    console.log('[SCRIBE DEBUG] 3. Current summary loaded.');

    // 2. Prepare the prompt
    const interactionText = newMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    
    const prompt = `You are an expert memory assistant. Your goal is to maintain a comprehensive and accurate summary of a user's life, preferences, and conversations.
    
EXISTING MEMORY:
"${currentSummary || "(No memory yet)"}"

NEW INTERACTION:
${interactionText}

INSTRUCTIONS:
Update the EXISTING MEMORY to include any new, relevant details from the NEW INTERACTION. 
- Focus on facts, user preferences, names, dates, and emotional context.
- Consolidate information.
- If the new interaction is just chit-chat with no long-term value, keep the memory mostly as is.
- Output ONLY the updated memory text. Do not add "Here is the updated memory:" or similar.
`;
    console.log('[SCRIBE DEBUG] 4. Prompt created. Calling Vertex AI...');
    
    // 3. Call Vertex AI
    const result = await model.generateContent(prompt);
    console.log('[SCRIBE DEBUG] 5. Vertex AI call completed.');
    const response = await result.response;
    const updatedSummary = response.candidates[0].content.parts[0].text.trim();
    console.log('[SCRIBE DEBUG] 6. Summary extracted from response.');

    if (updatedSummary && updatedSummary !== currentSummary) {
      // 4. Save to Firestore
      const collectionName = isDemo ? 'demo_sessions' : 'users';
      const docRef = db.collection(collectionName).doc(id).collection('memory').doc('summary');
      await docRef.set({
        content: updatedSummary,
        updatedAt: Timestamp.now()
      });
      console.log(`[SCRIBE DEBUG] 7. SUCCESS: Memory updated for id ${id}`);
    } else {
      console.log(`[SCRIBE DEBUG] 7. SKIPPED: No new summary content to save for id ${id}`);
    }

  } catch (err) {
    console.error(`[SCRIBE DEBUG] 99. FATAL ERROR in updateMemory for id ${id}:`, err);
  }
}

module.exports = { getMemory, updateMemory };
