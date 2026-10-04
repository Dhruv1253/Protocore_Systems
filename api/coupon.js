// POST { code } → { code, percent } if the coupon is valid, 404 otherwise. Used to preview the discount;
// create-order re-checks the code before charging.
import { HttpError, findCoupon, fail } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const c = findCoupon(req.body && req.body.code);
    if (!c) throw new HttpError(404, 'This coupon code is not valid.');
    res.status(200).json(c);
  } catch (e) { fail(res, e); }
}
