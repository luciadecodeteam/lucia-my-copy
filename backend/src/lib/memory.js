// memory.js with Lambda proxy integration using axios
const { getFirestore, Timestamp } = require('./firebaseAdmin');
const axios = require('axios');

const LAMBDA_URL = process.env.AI_PROXY_URL || 'https://acmjtgoc47eieiii6gksw3bx6u0feemy.lambda-url.eu-west-1.on.aws/';

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
 * Updates the user's long-term memory summary using the AI Lambda proxy.
 * This should be called asynchronously/background.
 * @param {string} id The user ID or session ID.
 * @param {Array} newMessages - Array of {role, content}
 * @param {string} existingSummary - Optional, optimization to avoid refetching
 * @param {boolean} [isDemo=false] Whether this is a demo session.
 */
async function updateMemory(id, newMessages, existingSummary = null, isDemo = false) {
  console.log(`[SCRIBE] 0. updateMemory called for id: ${id}`);
  if (!LAMBDA_URL) {
    console.error("[SCRIBE] FATAL: AI_PROXY_URL is not set. Cannot update memory.");
    return;
  }
  
  try {
    // 1. Get current summary if not provided
    let currentSummary = existingSummary;
    if (currentSummary === null) {
      currentSummary = await getMemory(id, isDemo);
    }
    console.log('[SCRIBE] 3. Current summary loaded.');

    // 2. Prepare the prompt for the AI model
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
    console.log('[SCRIBE] 4. Prompt created. Calling AI Lambda Proxy...');

    // 3. Construct the payload for our Lambda proxy
    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }]
    };
    
    // 4. Call the Lambda proxy using axios
    const response = await axios.post(LAMBDA_URL, payload, {
        headers: { 'Content-Type': 'application/json' }
    });

    if (response.status !== 200) {
      throw new Error(`AI Lambda proxy failed with status ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const result = response.data;
    console.log('[SCRIBE] 5. Lambda proxy call completed.');
    
    const updatedSummary = result?.content?.trim();
    console.log('[SCRIBE] 6. Summary extracted from response.');

    if (updatedSummary && updatedSummary !== currentSummary) {
      // 5. Save to Firestore
      const collectionName = isDemo ? 'demo_sessions' : 'users';
      const docRef = db.collection(collectionName).doc(id).collection('memory').doc('summary');
      await docRef.set({
        content: updatedSummary,
        updatedAt: Timestamp.now()
      });
      console.log(`[SCRIBE] 7. SUCCESS: Memory updated for id ${id}`);
    } else {
      console.log(`[SCRIBE] 7. SKIPPED: No new summary content to save for id ${id}`);
    }

  } catch (err) {
    const errorDetails = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[SCRIBE] 99. FATAL ERROR in updateMemory for id ${id}:`, errorDetails);
  }
}

module.exports = { getMemory, updateMemory };