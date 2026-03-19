// lucia-secure/frontend/src/firebase.js
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onIdTokenChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import {
  getFirestore, serverTimestamp, doc, getDoc, setDoc, updateDoc,
  addDoc, collection, query, orderBy, onSnapshot, increment
} from 'firebase/firestore';
import { resolveUsageLimits, coerceNumber } from './lib/usageLimits';

// --------------------------
// Firebase init
// --------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
};

const app = initializeApp(firebaseConfig);

// ===== Auth =====
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Extra helpers for Email/Password
async function registerWithEmail(email, password) {
  const res = await createUserWithEmailAndPassword(auth, email, password);
  return res.user;
}
async function loginWithEmail(email, password) {
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

// ===== Firestore =====
const db = getFirestore(app);

// --------------------------
// Client-side crypto helpers
// AES-GCM 256; per-user DEK, cached by uid.
// Stored as Base64 'raw' key in localStorage (lucia_dek_v1:<uid>).
// --------------------------
const TEXT = {
  enc: new TextEncoder(),
  dec: new TextDecoder()
};

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

function dekStorageKey(uid) {
  return `lucia_dek_v1:${uid}`;
}

async function getOrCreateDEK(uid) {
  if (!uid) throw new Error('Missing uid for DEK');
  const k = dekStorageKey(uid);
  const existing = localStorage.getItem(k);
  if (existing) {
    const raw = fromBase64(existing);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(k, toBase64(raw));
  return key;
}

/**
 * NEW: E2EE Sync Logic
 * This allows a user to "lock" their DEK with a passphrase and store it in Firestore.
 * Another device can then "unlock" it using the same passphrase.
 */

async function deriveMasterKey(passphrase, salt) {
  const pwBuf = TEXT.enc.encode(passphrase);
  const saltBuf = fromBase64(salt);
  
  const baseKey = await crypto.subtle.importKey(
    'raw', pwBuf, 'PBKDF2', false, ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function syncDEK(uid, passphrase) {
  const k = dekStorageKey(uid);
  const localRawB64 = localStorage.getItem(k);
  if (!localRawB64) throw new Error('No local key to sync');
  
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const masterKey = await deriveMasterKey(passphrase, salt);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedDEK = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    fromBase64(localRawB64)
  );
  
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    sync: {
      encryptedDEK: toBase64(encryptedDEK),
      iv: toBase64(iv),
      salt: salt,
      updatedAt: serverTimestamp()
    }
  });
}

async function recoverDEK(uid, passphrase) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('User not found');
  const data = snap.data();
  if (!data.sync?.encryptedDEK) throw new Error('No synced key found');
  
  const { encryptedDEK, iv, salt } = data.sync;
  const masterKey = await deriveMasterKey(passphrase, salt);
  
  try {
    const decryptedDEK = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) },
      masterKey,
      fromBase64(encryptedDEK)
    );
    
    const k = dekStorageKey(uid);
    localStorage.setItem(k, toBase64(decryptedDEK));
    return true;
  } catch (e) {
    throw new Error('Invalid Access Key');
  }
}

async function encryptForUser(uid, text) {
  const dek = await getOrCreateDEK(uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = TEXT.enc.encode(String(text ?? ''));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, pt);
  return { ciphertext: toBase64(ctBuf), iv: toBase64(iv.buffer) };
}

async function decryptForUser(uid, ciphertextB64, ivB64) {
  const dek = await getOrCreateDEK(uid);
  const ct = fromBase64(ciphertextB64);
  const iv = new Uint8Array(fromBase64(ivB64));
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct);
  return TEXT.dec.decode(ptBuf);
}

async function encryptTitle(uid, title) {
  return encryptForUser(uid, title);
}

async function decryptTitle(uid, ciphertextB64, ivB64) {
  try {
    return await decryptForUser(uid, ciphertextB64, ivB64);
  } catch {
    return '[Encrypted]'; // Fallback if decryption fails
  }
}

// --------------------------
// User and conversations
// --------------------------
async function ensureUser(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      tier: 'free',
      exchanges_used: 0,
      courtesy_used: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  return ref;
}

async function getUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function createConversation(uid, title = 'New chat', system = '') {
  const { ciphertext, iv } = await encryptTitle(uid, title);
  const ref = await addDoc(collection(db, 'users', uid, 'conversations'), {
    titleCiphertext: ciphertext,
    titleIv: iv,
    system,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

function newConversationId(uid) {
  return doc(collection(db, 'users', uid, 'conversations')).id;
}

async function createConversationWithId(uid, id, init = {}) {
  const { ciphertext, iv } = await encryptTitle(uid, init.title ?? 'New chat');
  const ref = doc(db, 'users', uid, 'conversations', id);
  await setDoc(ref, {
    titleCiphertext: ciphertext,
    titleIv: iv,
    system: init.system ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

// --------------------------
// Messages (ENCRYPTED AT REST)
// --------------------------
function listenMessages(uid, cid, cb) {
  const q = query(
    collection(db, 'users', uid, 'conversations', cid, 'messages'),
    orderBy('createdAt', 'asc')
  );

  // onSnapshot callback cannot be async directly; use IIFE.
  return onSnapshot(q, (snap) => {
    (async () => {
      const items = await Promise.all(snap.docs.map(async d => {
        const raw = d.data();
        let content = '';

        // Back-compat: plaintext content (legacy)
        if (typeof raw.content === 'string') {
          content = raw.content;
        } else if (raw.ciphertext && raw.iv) {
          // Decrypt new-format messages
          try {
            content = await decryptForUser(uid, raw.ciphertext, raw.iv);
          } catch (e) {
            // If decryption fails, show a placeholder rather than crashing UI
            content = '[Cannot decrypt message on this device]';
            // You may log this if needed
            // console.warn('Decrypt failed:', e);
          }
        } else {
          // Unknown shape; keep it safely empty
          content = '';
        }

        return {
          id: d.id,
          role: raw.role || 'assistant',
          content,
          createdAt: raw.createdAt ?? null
        };
      }));

      cb(items);
    })();
  });
}

async function addMessage(uid, cid, role, content) {
  // Always store encrypted
  const { ciphertext, iv } = await encryptForUser(uid, content);
  return addDoc(collection(db, 'users', uid, 'conversations', cid, 'messages'), {
    role,
    ciphertext,
    iv,
    createdAt: serverTimestamp()
  });
}

async function bumpUpdatedAt(uid, cid) {
  await updateDoc(doc(db, 'users', uid, 'conversations', cid), {
    updatedAt: serverTimestamp()
  });
}

async function incrementExchanges(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const limits = resolveUsageLimits(data);

  // Only unlimited tiers can increment
  if (!limits.unlimited) {
    throw new Error('Free tier has no message allowance');
  }

  await updateDoc(ref, { 
    exchanges_used: increment(1),
    updatedAt: serverTimestamp()
  });
}

// ---- NEW: courtesy flag helper (admin / debug) ----
// NOTE: Under your "tight" rules, calling this alone from the client is blocked.
// Use incrementExchanges(uid) for the 10→11 courtesy bump.
async function markCourtesyUsed(uid) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    courtesy_used: true,
    updatedAt: serverTimestamp()
  });
}

async function setConversationTitle(uid, cid, title) {
  const { ciphertext, iv } = await encryptTitle(uid, title);
  await updateDoc(doc(db, 'users', uid, 'conversations', cid), {
    titleCiphertext: ciphertext,
    titleIv: iv,
    updatedAt: serverTimestamp()
  });
}

async function softDeleteConversation(uid, cid) {
  const ref = doc(db, 'users', uid, 'conversations', cid);
  await updateDoc(ref, { deletedAt: serverTimestamp() });
}

async function setConversationFolder(uid, cid, folder) {
  const ref = doc(db, 'users', uid, 'conversations', cid);
  await updateDoc(ref, {
    folder: folder || null,
    updatedAt: serverTimestamp()
  });
}

// ---- Summary helpers (encrypted at rest) ----
async function getDecryptedSummary(uid, cid) {
  const ref = doc(db, 'users', uid, 'conversations', cid, 'memory', 'summary');
  const snap = await getDoc(ref);
  if (!snap.exists()) return '';
  const { ciphertext, iv } = snap.data();
  if (!ciphertext || !iv) return '';
  try {
    return await decryptForUser(uid, ciphertext, iv);
  } catch {
    return '';
  }
}

async function saveEncryptedSummary(uid, cid, summaryText) {
  const { ciphertext, iv } = await encryptForUser(uid, summaryText);
  const ref = doc(db, 'users', uid, 'conversations', cid, 'memory', 'summary');
  await setDoc(ref, {
    ciphertext,
    iv,
    lastUpdated: serverTimestamp()
  }, { merge: true });
}

export {
  app, auth, googleProvider, signInWithPopup, signOut, onIdTokenChanged,
  db,
  ensureUser, getUserData,
  createConversation,
  newConversationId, createConversationWithId,
  listenMessages, addMessage, bumpUpdatedAt, incrementExchanges,
  setConversationTitle, softDeleteConversation, setConversationFolder,
  registerWithEmail, loginWithEmail,
  markCourtesyUsed,
  encryptTitle, decryptTitle,
  getDecryptedSummary, saveEncryptedSummary,
  syncDEK, recoverDEK
};