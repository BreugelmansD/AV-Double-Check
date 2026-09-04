// Vul dit bestand in met de config van je eigen Firebase-project.
// Firebase console -> Project instellingen -> Algemeen -> "Je apps" -> Web-app
// -> "SDK setup and configuration" -> "Config". Kopieer de waarden hieronder.
//
// Zolang apiKey op "VUL_IN" staat, toont de app een setup-scherm in plaats van
// te proberen in te loggen (zie src/main.js).
export const firebaseConfig = {
  apiKey: 'VUL_IN',
  authDomain: 'VUL_IN.firebaseapp.com',
  projectId: 'VUL_IN',
  storageBucket: 'VUL_IN.appspot.com',
  messagingSenderId: 'VUL_IN',
  appId: 'VUL_IN',
};

// Enkel Google-accounts met dit e-maildomein krijgen toegang tot de app.
export const ALLOWED_EMAIL_DOMAIN = 'bluemoon.be';

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== 'VUL_IN' && !!firebaseConfig.apiKey;
}
