/**
 * Course sales for the Admin and Finance pages.
 *
 * Reads Firestore `enrollments`, which only the /api payment functions write after Razorpay confirms a payment:
 *   enrollments/{uid}_{courseId}  { uid, email, courseId, orderId, paymentId, amount (₹), createdAt }
 * Founders may read it (firestore.rules); students only see their own.
 */
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './protocore-firebase.js';

// Sales are booked on the Indian calendar day, not UTC.
const istDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

/** Live list of purchases, newest first; cb(array of { id, email, courseId, amount, paymentId, orderId, date, ms }). */
export function watchSales(cb, onError) {
  if (!db) return () => {};
  return onSnapshot(collection(db, 'enrollments'), (qs) => {
    const list = qs.docs.map((d) => {
      const e = d.data();
      const when = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : null;
      return {
        id: d.id, email: e.email || '—', courseId: e.courseId || '', amount: Number(e.amount) || 0,
        paymentId: e.paymentId || '—', orderId: e.orderId || '', date: when ? istDate(when) : '', ms: when ? when.getTime() : 0
      };
    });
    cb(list.sort((a, b) => b.ms - a.ms));
  }, (e) => onError && onError(e.message || 'Could not load course sales.'));
}

/** Last n months as 'YYYY-MM', newest first, in IST. */
export function lastMonths(n) {
  const [y, m] = istDate(new Date()).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Totals for the given purchases. courses: [{ id, title }] from the page. */
export function summarize(sales, courses) {
  const byMonth = {};
  const per = {};
  courses.forEach((c) => { per[c.id] = { id: c.id, title: c.title, count: 0, revenue: 0 }; });
  sales.forEach((s) => {
    if (s.date) byMonth[s.date.slice(0, 7)] = (byMonth[s.date.slice(0, 7)] || 0) + s.amount;
    const c = per[s.courseId] || (per[s.courseId] = { id: s.courseId, title: s.courseId, count: 0, revenue: 0 });
    c.count += 1;
    c.revenue += s.amount;
  });
  return {
    count: sales.length,
    revenue: sales.reduce((a, s) => a + s.amount, 0),
    byMonth,
    byCourse: Object.keys(per).map((k) => per[k]).sort((a, b) => b.count - a.count || b.revenue - a.revenue)
  };
}
