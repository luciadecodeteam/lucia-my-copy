"use strict";

const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

let firebaseApp = null;

function resolveServiceAccountKey() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && rawPrivateKey && projectId) {
    const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

function initFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const existing = getApps();
  if (existing.length > 0) {
    firebaseApp = existing[0];
    return firebaseApp;
  }

  const serviceAccount = resolveServiceAccountKey();
  if (serviceAccount) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    return firebaseApp;
  }

  try {
    firebaseApp = initializeApp({
      credential: applicationDefault(),
    });
    return firebaseApp;
  } catch (err) {
    throw new Error(
      `Firebase Admin SDK failed to initialize. Provide FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL or application default credentials. (${err.message})`
    );
  }
}

function getFirestoreClient() {
  const app = initFirebaseApp();
  return getFirestore(app);
}

module.exports = {
  getFirestore: getFirestoreClient,
  FieldValue,
  Timestamp,
};
