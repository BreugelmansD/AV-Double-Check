// Vul dit bestand in met de config van je eigen Firebase-project.
// Firebase console -> Project instellingen -> Algemeen -> "Je apps" -> Web-app
// -> "SDK setup and configuration" -> "Config". Kopieer de waarden hieronder.
//
// Zolang apiKey op "VUL_IN" staat, toont de app een setup-scherm in plaats van
// te proberen in te loggen (zie src/main.js).
export const firebaseConfig = {
  apiKey: 'AIzaSyDBtnfDLc-NH20VuDJnx22-VXBZFFrVDyY',
  authDomain: 'av-double-check.firebaseapp.com',
  projectId: 'av-double-check',
  storageBucket: 'av-double-check.firebasestorage.app',
  messagingSenderId: '152069939641',
  appId: '1:152069939641:web:028e152c06499a4b239668',
};

// Enkel Google-accounts met dit e-maildomein krijgen toegang tot de app.
export const ALLOWED_EMAIL_DOMAIN = 'bluemoon.be';

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== 'VUL_IN' && !!firebaseConfig.apiKey;
}
