const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin if not already initialized (it might be in firebaseAdmin.js, 
// but auth is separate from firestore usually, although they share the app)
// We'll rely on the existing initialization in firebaseAdmin.js if possible, 
// or just re-import the init logic if needed. 
// Actually, let's reuse the app instance from firebaseAdmin.js if exported, 
// or just ensure we get the default app.

const { getFirestore } = require('./firebaseAdmin');

// Ensure app is initialized by calling getFirestore (which calls initFirebaseApp)
getFirestore();

const auth = getAuth();

/**
 * Middleware to verify Firebase ID token
 * Expects Authorization: Bearer <token>
 */
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
  }
}

module.exports = { verifyAuth };
