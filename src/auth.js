import { getFirebase } from './firebase.js';
import { ALLOWED_EMAIL_DOMAIN } from './firebaseConfig.js';

export function isAllowedEmail(email) {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`);
}

/**
 * Start de Google-login via een volledige pagina-redirect (niet via een popup).
 * Een popup breekt hier gemakkelijk: zodra er vóór signInWithPopup nog een
 * asynchrone stap zit (zoals de lazy-geladen Firebase SDK hieronder), ziet de
 * browser de aanroep niet meer als een directe reactie op de klik en blokkeert
 * hij het venster stilzwijgend (auth/popup-blocked) — ook al klikte de
 * gebruiker echt. Een redirect heeft dat probleem niet en werkt overal.
 */
export async function signIn() {
  const { auth, authMod } = await getFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN });
  await authMod.signInWithRedirect(auth, provider);
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
  return authMod.onAuthStateChanged(auth, callback);
}
