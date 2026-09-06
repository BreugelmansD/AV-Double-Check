import { getFirebase } from './firebase.js';

/**
 * Zorgt voor een (stille, anonieme) Firebase-sessie zodat Firestore-verzoeken
 * geauthenticeerd zijn. Er is geen Google-login meer: de toegangsdrempel voor
 * collega's is de gedeelde teamcode (zie firebaseConfig.js + main.js), niet
 * een echt account. Anonieme login heeft geen "toegestane domeinen" of
 * OAuth-consent-scherm nodig — dat maakt dit een stuk minder brekbaar dan
 * Google-login vanaf een statische GitHub Pages-site.
 *
 * Wacht eerst op de initiële auth-status (die een eerder opgeslagen anonieme
 * sessie in dezelfde browser herstelt) vóór er een nieuwe wordt aangemaakt —
 * anders zou elke herlaad-beurt een nieuwe, andere gebruiker opleveren en
 * daarmee "mijn privé-regels" telkens resetten.
 */
export async function ensureAnonymousAuth() {
  const { auth, authMod } = await getFirebase();
  const existing = await new Promise((resolve) => {
    const unsub = authMod.onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
  if (existing) return existing;
  const result = await authMod.signInAnonymously(auth);
  return result.user;
}
