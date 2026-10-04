/**
 * Shared server code for course payments (Vercel functions; files starting with _ are not routes).
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   RAZORPAY_KEY_ID           rzp_test_… or rzp_live_…
 *   RAZORPAY_KEY_SECRET       secret paired with the key id
 *   RAZORPAY_WEBHOOK_SECRET   secret typed when creating the webhook in the Razorpay dashboard
 *   FIREBASE_SERVICE_ACCOUNT  full JSON of a Firebase service-account key (one line)
 *
 * Firestore (written only from here, never from the browser):
 *   orders/{razorpayOrderId}     { uid, email, courseId, amount (paise), currency, status: 'created' | 'paid', paymentId }
 *   enrollments/{uid}_{courseId} { uid, email, courseId, orderId, paymentId, amount, createdAt }
 */
import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Prices are decided here, never by the browser. Keep in sync with `courses` in index.html.
export const COURSES = {
  // TEMP: ₹10 test prices. Real prices: c1 4999, c2 3999, c3 6499, c4 3499 (restore here and in index.html).
  c1: { title: 'LT Control Panel Design from Scratch', price: 10 },
  c2: { title: 'VFD and Soft Starter Commissioning', price: 10 },
  c3: { title: 'PLC Programming for Pump Automation', price: 10 },
  c4: { title: 'IoT Remote Monitoring for Panels', price: 10 }
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * Coupons live in Firestore and are managed from the Admin page:
 *   coupons/{CODE}                    { code, percent, validFrom, validUntil, active, maxUses (0 = unlimited), onePerStudent, uses }
 *   coupons/{CODE}/redemptions/{uid}  { orderId, at }  written here when a paid order used the coupon
 * Returns { code, percent } if the coupon may be used now (by `uid`, when given); otherwise throws HttpError with the reason.
 */
export async function findCoupon(code, uid) {
  const c = String(code || '').trim().toUpperCase();
  const bad = (msg) => new HttpError(400, msg);
  if (!c) throw bad('Enter a coupon code.');
  const snap = await db().collection('coupons').doc(c).get();
  if (!snap.exists) throw bad('This coupon code is not valid.');
  const k = snap.data();
  const now = Date.now();
  const from = k.validFrom && k.validFrom.toMillis ? k.validFrom.toMillis() : 0;
  const until = k.validUntil && k.validUntil.toMillis ? k.validUntil.toMillis() : 0;
  if (k.active !== true) throw bad('This coupon is no longer active.');
  if (from && now < from) throw bad('This coupon is not active yet.');
  if (until && now > until) throw bad('This coupon has expired.');
  if (k.maxUses > 0 && (k.uses || 0) >= k.maxUses) throw bad('This coupon has reached its usage limit.');
  if (k.onePerStudent && uid) {
    const used = await snap.ref.collection('redemptions').doc(uid).get();
    if (used.exists) throw bad('You have already used this coupon.');
  }
  const percent = Number(k.percent);
  if (!(percent > 0 && percent <= 100)) throw bad('This coupon code is not valid.');
  return { code: c, percent };
}

/** Course price (₹) after a percent discount, rounded to whole rupees; never below ₹1 (Razorpay's minimum). */
export const discounted = (price, percent) => Math.max(1, Math.round(price * (100 - (percent || 0)) / 100));

function env(name) {
  const v = process.env[name];
  if (!v) throw new HttpError(500, 'Payments are not configured yet (missing ' + name + ').');
  return v;
}

function adminApp() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
  return getApps()[0];
}

export const db = () => getFirestore(adminApp());
export const keyId = () => env('RAZORPAY_KEY_ID');
export const keySecret = () => env('RAZORPAY_KEY_SECRET');
export const webhookSecret = () => env('RAZORPAY_WEBHOOK_SECRET');

/** Verifies the Firebase ID token sent as "Authorization: Bearer <token>". */
export async function requireUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in first.');
  try { return await getAuth(adminApp()).verifyIdToken(m[1]); }
  catch { throw new HttpError(401, 'Your session has expired. Sign in again.'); }
}

export function hmacHex(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const enrollmentId = (uid, courseId) => uid + '_' + courseId;

/** Courses in an order as [{ courseId, price (₹) }]. Orders made before the cart hold a single courseId. */
export function orderItems(o) {
  if (Array.isArray(o.items) && o.items.length) return o.items;
  return [{ courseId: o.courseId, price: o.amount / 100 }];
}

/** Marks the order paid and enrols its buyer in every course in it. Safe to call more than once for the same order. */
export async function grantCourse(orderId, paymentId) {
  const store = db();
  const orderRef = store.collection('orders').doc(orderId);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpError(404, 'Unknown order.');
    const o = snap.data();
    const items = orderItems(o);
    const refs = items.map((it) => store.collection('enrollments').doc(enrollmentId(o.uid, it.courseId)));
    const existing = await Promise.all(refs.map((r) => tx.get(r)));
    const couponRef = o.coupon ? store.collection('coupons').doc(o.coupon) : null;
    const couponSnap = couponRef && o.status !== 'paid' ? await tx.get(couponRef) : null;
    if (o.status !== 'paid') {
      tx.update(orderRef, { status: 'paid', paymentId, paidAt: FieldValue.serverTimestamp() });
      // A coupon use counts only once its order is paid.
      if (couponSnap && couponSnap.exists) {
        tx.update(couponRef, { uses: FieldValue.increment(1) });
        tx.set(couponRef.collection('redemptions').doc(o.uid), { orderId, at: FieldValue.serverTimestamp() });
      }
    }
    items.forEach((it, i) => {
      if (existing[i].exists) return;
      tx.set(refs[i], {
        uid: o.uid, email: o.email || '', courseId: it.courseId, orderId, paymentId,
        amount: it.price, createdAt: FieldValue.serverTimestamp()
      });
    });
  });
}

export function fail(res, e) {
  if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return; }
  console.error(e);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
