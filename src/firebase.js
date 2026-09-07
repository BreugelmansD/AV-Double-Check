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
      // BELANGRIJK: de Firestore-database moet de databaseId "default" hebben
      // (zonder haakjes) — dat is wat je krijgt als je in de Firebase console
      // handmatig een database aanmaakt via "Create database". Dat is NIET
      // hetzelfde als Google's echte standaarddatabase-ID "(default)" (met
      // haakjes) waar de SDK zonder deze instelling naar zoekt — vandaar de
      // voordien blijvende "client is offline"-fouten (in werkelijkheid was
      // het een 404: verkeerde database-naam).
      // databaseId is een apart, derde argument van initializeFirestore, geen
      // veld binnen de settings — vandaar dat een eerdere poging om het als
      // settings-veld door te geven stil genegeerd werd.
      const db = storeMod.initializeFirestore(
        app,
        { experimentalForceLongPolling: true, useFetchStreams: false },
        'default'
      );
      return { app, auth, db, authMod, storeMod };
    })();
  }
  return appPromise;
}
