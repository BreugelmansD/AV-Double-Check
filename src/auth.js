import { getFirebase } from './firebase.js';
import { ALLOWED_EMAIL_DOMAIN } from './firebaseConfig.js';

export class AccessDeniedError extends Error {}

export function isAllowedEmail(email) {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`);
}

export async function signIn() {
  const { auth, authMod } = await getFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN });
  const result = await authMod.signInWithPopup(auth, provider);
  const email = result.user.email || '';
  if (!isAllowedEmail(email)) {
    await authMod.signOut(auth);
    throw new AccessDeniedError(`Enkel toegankelijk voor @${ALLOWED_EMAIL_DOMAIN}-accounts. Je logde in met ${email}.`);
  }
  return result.user;
}

export async function signOutUser() {
  const { auth, authMod } = await getFirebase();
  return authMod.signOut(auth);
}

/**
 * @param {(user: object|null) => void} callback
 * @returns {Promise<() => void>} unsubscribe function
 */
export async function watchAuth(callback) {
  const { auth, authMod } = await getFirebase();
  return authMod.onAuthStateChanged(auth, (user) => {
    if (user && !isAllowedEmail(user.email)) {
      // Sessie van een vorig, niet-toegelaten account: uitloggen.
      authMod.signOut(auth);
      callback(null);
      return;
    }
    callback(user);
  });
}
