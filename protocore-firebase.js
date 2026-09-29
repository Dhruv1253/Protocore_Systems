/**
 * Firebase wiring for the Protocore workspace: sign-in, founder profiles and the expense ledger.
 *
 * Data model (Firestore):
 *   Founders/{uid}   { name, email, role: 'Admin' | 'Founder', active: true }  (role and active are matched loosely)
 *   expenses/{id}    { fid, founderName, date, amount, category, desc, method, status, createdAt }
 *   meta/counters    { expense: <last expense number> }
 *
 * Who may do what is enforced server-side by firestore.rules, not by this file.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, onSnapshot, query, orderBy, runTransaction, deleteDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const FOUNDERS = 'Founders';
const isAdminRole = (r) => String(r || '').toLowerCase() === 'admin';
const isActive = (a) => a === true || String(a).toLowerCase() === 'true';

export const configured = !String(firebaseConfig.apiKey || '').includes('REPLACE_ME');

const app = configured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const friendly = (e) => {
  const code = (e && e.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Incorrect email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('permission-denied')) return 'You do not have permission to do that.';
  if (code.includes('network')) return 'Network error. Check your connection.';
  return (e && e.message) || 'Something went wrong.';
};

/** Calls cb({ uid, name, email, role, admin }) when a founder is signed in, or cb(null). */
export function watchUser(cb) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { cb(null); return; }
    try {
      const snap = await getDoc(doc(db, FOUNDERS, user.uid));
      const f = snap.exists() ? snap.data() : null;
      if (!f || !isActive(f.active)) {
        await fbSignOut(auth);
        cb(null, 'This account is not an active Protocore founder.');
        return;
      }
      cb({ uid: user.uid, name: f.name || user.email, email: user.email, role: isAdminRole(f.role) ? 'ADMIN' : 'FOUNDER', admin: isAdminRole(f.role) });
    } catch (e) {
      cb(null, friendly(e));
    }
  });
}

export async function signIn(email, password) {
  if (!auth) throw new Error('Sign-in is not set up yet (firebase-config.js).');
  try { await signInWithEmailAndPassword(auth, String(email || '').trim(), password || ''); }
  catch (e) { throw new Error(friendly(e)); }
}

export function signOut() { return auth ? fbSignOut(auth) : Promise.resolve(); }

export async function resetPassword(email) {
  if (!auth) throw new Error('Sign-in is not set up yet (firebase-config.js).');
  try { await sendPasswordResetEmail(auth, String(email || '').trim()); }
  catch (e) { throw new Error(friendly(e)); }
}

/** Live list of founders; cb(array). */
export function watchFounders(cb, onError) {
  if (!db) return () => {};
  return onSnapshot(collection(db, FOUNDERS),
    (qs) => cb(qs.docs.map(d => Object.assign({ id: d.id }, d.data(), { admin: isAdminRole(d.data().role), active: isActive(d.data().active) }))),
    (e) => onError && onError(friendly(e)));
}

/** Live expense ledger, newest first; cb(array). */
export function watchExpenses(cb, onError) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')),
    (qs) => cb(qs.docs.map(d => Object.assign({ id: d.id }, d.data()))),
    (e) => onError && onError(friendly(e)));
}

/** Records an expense for the signed-in founder as EXP-0001, EXP-0002, … Returns the id. */
export async function addExpense(data) {
  const user = auth && auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const counterRef = doc(db, 'meta', 'counters');
  try {
    return await runTransaction(db, async (tx) => {
      const c = await tx.get(counterRef);
      const n = (c.exists() ? c.data().expense || 0 : 0) + 1;
      const id = 'EXP-' + String(n).padStart(4, '0');
      tx.set(counterRef, { expense: n });
      tx.set(doc(db, 'expenses', id), Object.assign({}, data, { fid: user.uid, createdAt: serverTimestamp() }));
      return id;
    });
  } catch (e) { throw new Error(friendly(e)); }
}

export async function deleteExpense(id) {
  try { await deleteDoc(doc(db, 'expenses', id)); }
  catch (e) { throw new Error(friendly(e)); }
}

export async function setFounderActive(uid, active) {
  try { await updateDoc(doc(db, FOUNDERS, uid), { active: !!active }); }
  catch (e) { throw new Error(friendly(e)); }
}
