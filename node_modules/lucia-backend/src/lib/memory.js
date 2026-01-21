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
  // The collection is now always 'memory', 'isDemo' might be used for other logic if needed.
  const collectionName = 'memory';
  try {
    const docRef = db.collection(collectionName).doc(id);
    const doc = await docRef.get();
    if (doc.exists) {
      // Return the 'summary' field from the document
      return doc.data().summary || '';
    }
    console.log(`No memory document found for id: ${id}`);
    return '';
  } catch (err) {
    console.error(`❌ Error fetching memory for id ${id}:`, err);
    // Re-throwing the error might be better to signal failure to the caller
    throw err;
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
module.exports = {};