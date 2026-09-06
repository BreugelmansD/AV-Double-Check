import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig.js';

const SDK_VERSION = '10.13.2';
const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let appPromise = null;

/**
 * Laadt de Firebase SDK's (via CDN, ES modules) en initialiseert de app.
 * Wordt lui geladen zodat het setup-scherm ook werkt zonder internetverbinding
 * naar gstatic wanneer er nog geen geldige config is ingevuld.
 */
export async function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is nog niet geconfigureerd (src/firebaseConfig.js).');
  }
  if (!appPromise) {
    appPromise = (async () => {
      const [{ initializeApp }, authMod, storeMod] = await Promise.all([
        import(/* @vite-ignore */ `${base}/firebase-app.js`),
        import(/* @vite-ignore */ `${base}/firebase-auth.js`),
        import(/* @vite-ignore */ `${base}/firebase-firestore.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      // Sommige netwerken/ad-blockers/proxies blokkeren Firestore's normale
      // streaming-verbinding (WebChannel), wat zich uit als valse
      // "client is offline"-fouten. auto-detect long polling laat de SDK dan
      // zelf terugvallen op gewone HTTP long-polling.
      const db = storeMod.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
      return { app, auth, db, authMod, storeMod };
    })();
  }
  return appPromise;
}
