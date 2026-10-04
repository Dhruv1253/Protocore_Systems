// POST { courseIds: [...] (or courseId), coupon? } with the buyer's Firebase ID token
// → one Razorpay order for all of them at the server-side prices (less any valid coupon), skipping courses already owned.
import { COURSES, HttpError, db, keyId, keySecret, requireUser, enrollmentId, findCoupon, discounted, fail } from './_lib.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const user = await requireUser(req);
    const b = req.body || {};
    const requested = [...new Set(Array.isArray(b.courseIds) ? b.courseIds : [b.courseId])].filter(Boolean);
    if (!requested.length || requested.some((id) => !COURSES[id])) throw new HttpError(400, 'Unknown course.');

    const store = db();
    const owned = await Promise.all(requested.map((id) => store.collection('enrollments').doc(enrollmentId(user.uid, id)).get()));
    const courseIds = requested.filter((_, i) => !owned[i].exists);
    if (!courseIds.length) throw new HttpError(409, requested.length > 1 ? 'You already own these courses.' : 'You already own this course.');

    const coupon = b.coupon ? findCoupon(b.coupon) : null;
    if (b.coupon && !coupon) throw new HttpError(400, 'This coupon code is not valid.');
    const pct = coupon ? coupon.percent : 0;
    const items = courseIds.map((id) => ({ courseId: id, listPrice: COURSES[id].price, price: discounted(COURSES[id].price, pct) }));
    const amount = items.reduce((a, it) => a + it.price, 0) * 100;
    const title = items.length === 1 ? COURSES[items[0].courseId].title : items.length + ' courses';
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(keyId() + ':' + keySecret()).toString('base64')
      },
      body: JSON.stringify({
        amount, currency: 'INR',
        receipt: ('cart-' + Date.now()).slice(0, 40),
        notes: { uid: user.uid, courseIds: courseIds.join(','), email: user.email || '', coupon: coupon ? coupon.code : '' }
      })
    });
    const order = await r.json();
    if (!r.ok) {
      console.error('Razorpay order failed', order);
      throw new HttpError(502, 'Could not start the payment. Please try again.');
    }

    await store.collection('orders').doc(order.id).set({
      uid: user.uid, email: user.email || '', items, courseId: courseIds[0], amount, currency: 'INR',
      coupon: coupon ? coupon.code : null, discountPercent: pct,
      status: 'created', createdAt: FieldValue.serverTimestamp()
    });

    res.status(200).json({ orderId: order.id, amount, currency: 'INR', keyId: keyId(), title, courseIds });
  } catch (e) { fail(res, e); }
}
