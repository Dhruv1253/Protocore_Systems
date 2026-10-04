// POST { code } → { code, percent } if the coupon can be used now, 400 with the reason otherwise.
// Used to preview the discount; create-order re-checks the code before charging.
// Signing in is optional here; when the buyer's ID token is sent, "once per student" is checked too.
import { findCoupon, requireUser, fail } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const user = req.headers.authorization ? await requireUser(req) : null;
    res.status(200).json(await findCoupon(req.body && req.body.code, user && user.uid));
  } catch (e) { fail(res, e); }
}
