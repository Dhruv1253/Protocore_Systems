/**
 * Finance module access control — edit this file freely in VS Code.
 *
 * Right now it holds a single hard-coded admin so the prototype can be demoed
 * offline. To connect a real backend, keep the exported `authenticate`
 * signature and replace its body, e.g.
 *
 *   import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
 *   export async function authenticate(username, password) {
 *     const cred = await signInWithEmailAndPassword(getAuth(), username, password);
 *     const role = await fetchRole(cred.user.uid);          // Firestore users/{uid}
 *     return { ok: role === 'ADMIN' || role === 'FOUNDER', user: { username, role } };
 *   }
 *
 * Never ship plaintext credentials to production — this list is a stand-in for
 * Firebase Authentication + Firestore security rules.
 */

export const FINANCE_USERS = [
  { username: 'Admin', password: 'Admin123#', role: 'ADMIN', displayName: 'Administrator' }
];

/** Roles allowed to open the Finance section. */
export const FINANCE_ROLES = ['ADMIN', 'FOUNDER'];

/**
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ok: boolean, user?: {username: string, role: string, displayName: string}, error?: string}>}
 */
export async function authenticate(username, password) {
  const u = FINANCE_USERS.find(
    x => x.username === String(username || '').trim() && x.password === password
  );
  if (!u) return { ok: false, error: 'Incorrect username or password.' };
  if (!FINANCE_ROLES.includes(u.role)) return { ok: false, error: 'This account cannot access Finance.' };
  return { ok: true, user: { username: u.username, role: u.role, displayName: u.displayName } };
}
