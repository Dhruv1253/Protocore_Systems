/**
 * Firebase wiring for the Protocore site: sign-in, founder profiles, the expense ledger and course purchases.
 *
 * Data model (Firestore):
 *   Founders/{uid}   { name, email, role: 'Admin' | 'Founder', active: true }  (role and active are matched loosely)
 *   expenses/{id}    { fid, founderName, date, amount, category, desc, method, status, createdAt }
 *   meta/counters    { expense: <last expense number> }
 *   enrollments/{uid}_{courseId}, orders/{id}  written only by the /api payment functions
 *
 * Anyone may create an account; accounts without a Founders record are students.
 * Who may do what is enforced server-side by firestore.rules and /api, not by this file.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail,
  createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, onSnapshot, query, where, orderBy, runTransaction, deleteDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const FOUNDERS = 'Founders';
const isAdminRole = (r) => String(r || '').toLowerCase() === 'admin';
const isActive = (a) => a === true || String(a).toLowerCase() === 'true';

export const configured = !String(firebaseConfig.apiKey || '').includes('REPLACE_ME');

const app = configured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

const friendly = (e) => {
  const code = (e && e.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Incorrect email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('email-already-in-use')) return 'An account with this email already exists. Sign in instead.';
  if (code.includes('weak-password')) return 'Use a password of at least 6 characters.';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return 'Google sign-in was cancelled.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.';
  if (code.includes('permission-denied')) return 'You do not have permission to do that.';
  if (code.includes('network')) return 'Network error. Check your connection.';
  return (e && e.message) || 'Something went wrong.';
};

/** Calls cb({ uid, name, email, role, admin }) when someone is signed in, or cb(null). role is ADMIN, FOUNDER or STUDENT. */
export function watchUser(cb) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { cb(null); return; }
    try {
      const snap = await getDoc(doc(db, FOUNDERS, user.uid));
      const f = snap.exists() ? snap.data() : null;
      if (!f) {
        cb({ uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'STUDENT', admin: false });
        return;
      }
      if (!isActive(f.active)) {
        await fbSignOut(auth);
        cb(null, 'This founder account has been deactivated.');
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

export async function signUp(name, email, password) {
  if (!auth) throw new Error('Sign-in is not set up yet (firebase-config.js).');
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(email || '').trim(), password || '');
    if (String(name || '').trim()) await updateProfile(cred.user, { displayName: String(name).trim() });
  } catch (e) { throw new Error(friendly(e)); }
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Sign-in is not set up yet (firebase-config.js).');
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { throw new Error(friendly(e)); }
}

export function signOut() { return auth ? fbSignOut(auth) : Promise.resolve(); }

export const currentEmail = () => (auth && auth.currentUser && auth.currentUser.email) || '';

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

/** Live list of course ids the user has paid for; cb(array). */
export function watchEnrollments(uid, cb, onError) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'enrollments'), where('uid', '==', uid)),
    (qs) => cb(qs.docs.map(d => d.data().courseId)),
    (e) => onError && onError(friendly(e)));
}

async function callApi(path, body) {
  const user = auth && auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Payment service is unavailable. Please try again.');
  return data;
}

let razorpayLoading = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  razorpayLoading = razorpayLoading || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => { razorpayLoading = null; reject(new Error('Could not load the payment window. Check your connection.')); };
    document.head.appendChild(s);
  });
  return razorpayLoading;
}

/**
 * Runs one Razorpay Checkout for one or more courses. Resolves to the purchased course ids once the server has
 * verified the payment and enrolled the user; resolves to 'dismissed' if the buyer closes the window without paying.
 */
export async function buyCourses(courseIds, buyer, coupon) {
  const order = await callApi('/api/create-order', coupon ? { courseIds, coupon } : { courseIds });
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    // A failed attempt keeps the window open so the buyer can retry; report it only if they then give up.
    let lastError = null;
    const rzp = new window.Razorpay({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: 'Protocore Systems', description: order.title,
      prefill: { name: buyer.name || '', email: buyer.email || '' },
      theme: { color: '#D81324' },
      handler: (resp) => callApi('/api/verify-payment', resp).then((r) => resolve(r.courseIds || order.courseIds), reject),
      modal: { ondismiss: () => (lastError ? reject(lastError) : resolve('dismissed')) }
    });
    rzp.on('payment.failed', (r) => { lastError = new Error((r.error && r.error.description) || 'Payment failed.'); });
    rzp.open();
  });
}

export const buyCourse = (courseId, buyer, coupon) => buyCourses([courseId], buyer, coupon);

/** Checks a coupon code with the server; resolves to { code, percent } or throws with a readable message. */
export async function checkCoupon(code) {
  const r = await fetch('/api/coupon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Could not check the coupon. Please try again.');
  return data;
}
