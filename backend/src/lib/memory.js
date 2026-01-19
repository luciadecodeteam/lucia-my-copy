const { VertexAI } = require('@google-cloud/vertexai');
const { getFirestore, Timestamp } = require('./firebaseAdmin');

// Initialize Vertex AI
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_LOCATION || 'us-central1';

let generativeModel = null;

function getModel() {
  if (generativeModel) return generativeModel;
  
  if (!projectId) {
    console.warn('Vertex AI: Project ID not found. Memory features may fail.');
    return null;
  }

  const vertex_ai = new VertexAI({ project: projectId, location: location });
  generativeModel = vertex_ai.getGenerativeModel({
    model: 'gemini-2.0-flash-lite', // Efficient model for summarization
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.2, // Low temperature for factual consistency
    }
  });
  return generativeModel;
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
  try {
    const model = getModel();
    if (!model) return;

    // 1. Get current summary if not provided
    let currentSummary = existingSummary;
    if (currentSummary === null) {
      currentSummary = await getMemory(id, isDemo);
    }

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

    // 3. Call Vertex AI
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const updatedSummary = response.candidates[0].content.parts[0].text.trim();

    if (updatedSummary && updatedSummary !== currentSummary) {
      // 4. Save to Firestore
      const collectionName = isDemo ? 'demo_sessions' : 'users';
      const docRef = db.collection(collectionName).doc(id).collection('memory').doc('summary');
      await docRef.set({
        content: updatedSummary,
        updatedAt: Timestamp.now()
      });
      console.log(`Memory updated for id ${id}`);
    }

  } catch (err) {
    console.error(`Error updating memory for id ${id}:`, err);
  }
}

module.exports = { getMemory, updateMemory };
