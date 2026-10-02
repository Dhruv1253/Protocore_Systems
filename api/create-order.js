// POST { courseId } with the buyer's Firebase ID token → creates a Razorpay order at the server-side price.
import { COURSES, HttpError, db, keyId, keySecret, requireUser, enrollmentId, fail } from './_lib.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const user = await requireUser(req);
    const courseId = req.body && req.body.courseId;
    const course = COURSES[courseId];
    if (!course) throw new HttpError(400, 'Unknown course.');

    const store = db();
    const owned = await store.collection('enrollments').doc(enrollmentId(user.uid, courseId)).get();
    if (owned.exists) throw new HttpError(409, 'You already own this course.');

    const amount = course.price * 100;
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(keyId() + ':' + keySecret()).toString('base64')
      },
      body: JSON.stringify({
        amount, currency: 'INR',
        receipt: (courseId + '-' + Date.now()).slice(0, 40),
        notes: { uid: user.uid, courseId, email: user.email || '' }
      })
    });
    const order = await r.json();
    if (!r.ok) {
      console.error('Razorpay order failed', order);
      throw new HttpError(502, 'Could not start the payment. Please try again.');
    }

    await store.collection('orders').doc(order.id).set({
      uid: user.uid, email: user.email || '', courseId, amount, currency: 'INR',
      status: 'created', createdAt: FieldValue.serverTimestamp()
    });

    res.status(200).json({ orderId: order.id, amount, currency: 'INR', keyId: keyId(), title: course.title });
  } catch (e) { fail(res, e); }
}
