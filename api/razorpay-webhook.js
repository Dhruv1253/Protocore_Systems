// Razorpay webhook (event: order.paid). Backup path that enrols the buyer even if they closed the tab after paying.
import { webhookSecret, hmacHex, safeEqual, grantCourse, fail } from './_lib.js';

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    // The signature covers the exact bytes Razorpay sent, so read the raw body rather than req.body.
    const body = await rawBody(req);
    if (!safeEqual(hmacHex(body, webhookSecret()), req.headers['x-razorpay-signature'])) {
      res.status(400).json({ error: 'Bad signature.' });
      return;
    }
    const event = JSON.parse(body.toString('utf8'));
    if (event.event === 'order.paid') {
      await grantCourse(event.payload.order.entity.id, event.payload.payment.entity.id);
    }
    res.status(200).json({ ok: true });
  } catch (e) { fail(res, e); }
}
