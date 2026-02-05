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

// --------------------------
// User and conversations
// --------------------------
async function ensureUser(uid) {
  if (!uid) throw new Error('ensureUser: uid is required');
  
  // ✅ ADDED: Wait for auth to be ready
  if (!auth.currentUser) {
    throw new Error('ensureUser: User not authenticated');
  }
  
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
  if (!uid) throw new Error('getUserData: uid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('getUserData: User not authenticated');
  }
  
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function createConversation(uid, title = 'New chat', system = '') {
  if (!uid) throw new Error('createConversation: uid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('createConversation: User not authenticated');
  }
  
  const ref = await addDoc(collection(db, 'users', uid, 'conversations'), {
    title, system, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

function newConversationId(uid) {
  if (!uid) throw new Error('newConversationId: uid is required');
  return doc(collection(db, 'users', uid, 'conversations')).id;
}

async function createConversationWithId(uid, id, init = {}) {
  if (!uid) throw new Error('createConversationWithId: uid is required');
  if (!id) throw new Error('createConversationWithId: id is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('createConversationWithId: User not authenticated');
  }
  
  const ref = doc(db, 'users', uid, 'conversations', id);
  await setDoc(ref, {
    title: init.title ?? 'New chat',
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
  // ✅ CRITICAL FIX: Validate inputs and auth state
  if (!uid) {
    console.error('listenMessages: uid is required');
    cb([]); // Return empty array instead of crashing
    return () => {}; // Return no-op unsubscribe
  }
  
  if (!cid) {
    console.error('listenMessages: cid is required');
    cb([]); // Return empty array instead of crashing
    return () => {}; // Return no-op unsubscribe
  }
  
  if (!auth.currentUser) {
    console.error('listenMessages: User not authenticated');
    cb([]); // Return empty array instead of crashing
    return () => {}; // Return no-op unsubscribe
  }
  
  // ✅ ADDED: Verify the uid matches the current user
  if (auth.currentUser.uid !== uid) {
    console.error('listenMessages: uid mismatch. Expected:', auth.currentUser.uid, 'Got:', uid);
    cb([]); // Return empty array instead of crashing
    return () => {}; // Return no-op unsubscribe
  }
  
  const q = query(
    collection(db, 'users', uid, 'conversations', cid, 'messages'),
    orderBy('createdAt', 'asc')
  );

  // onSnapshot callback cannot be async directly; use IIFE.
  return onSnapshot(
    q,
    (snap) => {
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
              console.warn('Decrypt failed:', e);
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
    },
    // ✅ ADDED: Error handler for onSnapshot
    (error) => {
      console.error('listenMessages onSnapshot error:', error);
      cb([]); // Return empty array on error
    }
  );
}

async function addMessage(uid, cid, role, content) {
  if (!uid) throw new Error('addMessage: uid is required');
  if (!cid) throw new Error('addMessage: cid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('addMessage: User not authenticated');
  }
  
  // ✅ ADDED: Verify uid matches current user
  if (auth.currentUser.uid !== uid) {
    throw new Error('addMessage: uid mismatch');
  }
  
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
  if (!uid) throw new Error('bumpUpdatedAt: uid is required');
  if (!cid) throw new Error('bumpUpdatedAt: cid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('bumpUpdatedAt: User not authenticated');
  }
  
  await updateDoc(doc(db, 'users', uid, 'conversations', cid), {
    updatedAt: serverTimestamp()
  });
}

// Free 10 + courtesy +2
async function incrementExchanges(uid) {
  if (!uid) throw new Error('incrementExchanges: uid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('incrementExchanges: User not authenticated');
  }
  
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const update = { updatedAt: serverTimestamp() };
  const limits = resolveUsageLimits(data);
  const used = coerceNumber(data.exchanges_used) ?? 0;

  if (limits.unlimited) {
    update.exchanges_used = increment(1);
    await updateDoc(ref, update);
    return;
  }

  const base = Number.isFinite(limits.baseAllowance) ? limits.baseAllowance : null;
  const courtesyCap = Number.isFinite(limits.courtesyAllowance) ? limits.courtesyAllowance : null;
  const hasCourtesy = Number.isFinite(base) && Number.isFinite(courtesyCap) && courtesyCap > base;
  const courtesyUsed = hasCourtesy ? limits.courtesyUsed : false;

  if (!Number.isFinite(base)) return;

  if (!hasCourtesy) {
    if (used >= base) return;
    update.exchanges_used = increment(1);
    await updateDoc(ref, update);
    return;
  }

  if (!courtesyUsed) {
    if (used < base) {
      update.exchanges_used = increment(1);
    } else if (used === base) {
      update.exchanges_used = base + 1;
      update.courtesy_used = true;
    } else {
      return;
    }
  } else if (used < courtesyCap) {
    update.exchanges_used = increment(1);
  } else {
    return;
  }

  await updateDoc(ref, update);
}

// ---- NEW: courtesy flag helper (admin / debug) ----
// NOTE: Under your "tight" rules, calling this alone from the client is blocked.
// Use incrementExchanges(uid) for the 10→11 courtesy bump.
async function markCourtesyUsed(uid) {
  if (!uid) throw new Error('markCourtesyUsed: uid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('markCourtesyUsed: User not authenticated');
  }
  
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    courtesy_used: true,
    updatedAt: serverTimestamp()
  });
}

async function setConversationTitle(uid, cid, title) {
  if (!uid) throw new Error('setConversationTitle: uid is required');
  if (!cid) throw new Error('setConversationTitle: cid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('setConversationTitle: User not authenticated');
  }
  
  await updateDoc(doc(db, 'users', uid, 'conversations', cid), {
    title, updatedAt: serverTimestamp()
  });
}

async function softDeleteConversation(uid, cid) {
  if (!uid) throw new Error('softDeleteConversation: uid is required');
  if (!cid) throw new Error('softDeleteConversation: cid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('softDeleteConversation: User not authenticated');
  }
  
  const ref = doc(db, 'users', uid, 'conversations', cid);
  await updateDoc(ref, { deletedAt: serverTimestamp() });
}

async function setConversationFolder(uid, cid, folder) {
  if (!uid) throw new Error('setConversationFolder: uid is required');
  if (!cid) throw new Error('setConversationFolder: cid is required');
  
  // ✅ ADDED: Check auth
  if (!auth.currentUser) {
    throw new Error('setConversationFolder: User not authenticated');
  }
  
  const ref = doc(db, 'users', uid, 'conversations', cid);
  await updateDoc(ref, {
    folder: folder || null,
    updatedAt: serverTimestamp()
  });
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
  markCourtesyUsed
};