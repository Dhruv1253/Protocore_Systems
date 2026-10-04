// POST { razorpay_order_id, razorpay_payment_id, razorpay_signature } from Razorpay Checkout → enrols the buyer.
import { HttpError, db, keySecret, requireUser, hmacHex, safeEqual, grantCourse, orderItems, fail } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const user = await requireUser(req);
    const b = req.body || {};
    const orderId = String(b.razorpay_order_id || '');
    const paymentId = String(b.razorpay_payment_id || '');
    if (!orderId || !paymentId) throw new HttpError(400, 'Missing payment details.');

    if (!safeEqual(hmacHex(orderId + '|' + paymentId, keySecret()), b.razorpay_signature)) {
      throw new HttpError(400, 'Payment could not be verified.');
    }
    const order = await db().collection('orders').doc(orderId).get();
    if (!order.exists || order.data().uid !== user.uid) throw new HttpError(403, 'This order belongs to another account.');

    await grantCourse(orderId, paymentId);
    res.status(200).json({ ok: true, courseIds: orderItems(order.data()).map((it) => it.courseId) });
  } catch (e) { fail(res, e); }
}
