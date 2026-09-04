// Firestore-laag: gedeelde data (productcatalogus, altijd-nodig-lijst, regels,
// controlegeschiedenis) zodat collega's binnen Blue Moon dezelfde data zien.
import { getFirebase } from './firebase.js';

async function store() {
  const { db, storeMod } = await getFirebase();
  return { db, s: storeMod };
}

/* ---------------------------- Producten ---------------------------- */

export async function getProductsMeta() {
  const { db, s } = await store();
  const snap = await s.getDoc(s.doc(db, 'meta', 'products'));
  return snap.exists() ? snap.data() : null;
}

export async function fetchAllProducts() {
  const { db, s } = await store();
  const snap = await s.getDocs(s.collection(db, 'products'));
  return snap.docs.map((d) => d.data());
}

/**
 * Vervangt de volledige productcatalogus door de meegegeven lijst (batched writes).
 * Bestaande producten die niet meer in de nieuwe lijst zitten, blijven wél staan
 * tenzij removeMissing=true — zo kan een gedeeltelijke her-import geen data verliezen
 * per ongeluk.
 */
export async function importProducts(products, { removeMissing = false } = {}) {
  const { db, s } = await store();
  const existing = removeMissing ? await fetchAllProducts() : [];
  const newCodes = new Set(products.map((p) => p.code));

  const chunks = [];
  for (let i = 0; i < products.length; i += 400) chunks.push(products.slice(i, i + 400));

  for (const chunk of chunks) {
    const batch = s.writeBatch(db);
    for (const p of chunk) {
      batch.set(s.doc(db, 'products', p.code), p);
    }
    await batch.commit();
  }

  if (removeMissing) {
    const toRemove = existing.filter((p) => !newCodes.has(p.code));
    for (let i = 0; i < toRemove.length; i += 400) {
      const batch = s.writeBatch(db);
      toRemove.slice(i, i + 400).forEach((p) => batch.delete(s.doc(db, 'products', p.code)));
      await batch.commit();
    }
  }

  await s.setDoc(s.doc(db, 'meta', 'products'), {
    count: products.length,
    updatedAt: s.serverTimestamp(),
  });
}

export async function seedProductsIfEmpty(seedProducts) {
  const meta = await getProductsMeta();
  if (meta && meta.count > 0) return false;
  await importProducts(seedProducts);
  return true;
}

/* ------------------------- Altijd nodig ------------------------- */

export function listenAlwaysRequired(callback) {
  let unsub = () => {};
  store().then(({ db, s }) => {
    unsub = s.onSnapshot(
      s.query(s.collection(db, 'alwaysRequired'), s.orderBy('createdAt', 'asc')),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('listenAlwaysRequired', err)
    );
  });
  return () => unsub();
}

export async function addAlwaysRequired(item, user) {
  const { db, s } = await store();
  await s.addDoc(s.collection(db, 'alwaysRequired'), {
    ...item,
    addedBy: user.displayName || user.email,
    addedByUid: user.uid,
    createdAt: s.serverTimestamp(),
  });
}

export async function updateAlwaysRequired(id, item) {
  const { db, s } = await store();
  await s.updateDoc(s.doc(db, 'alwaysRequired', id), item);
}

export async function deleteAlwaysRequired(id) {
  const { db, s } = await store();
  await s.deleteDoc(s.doc(db, 'alwaysRequired', id));
}

/* ------------------------------ Regels ------------------------------ */

export function listenRules(callback) {
  let unsub = () => {};
  store().then(({ db, s }) => {
    unsub = s.onSnapshot(
      s.query(s.collection(db, 'rules'), s.orderBy('createdAt', 'asc')),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('listenRules', err)
    );
  });
  return () => unsub();
}

export async function addRule(rule, user) {
  const { db, s } = await store();
  await s.addDoc(s.collection(db, 'rules'), {
    ...rule,
    ownerUid: user.uid,
    ownerName: user.displayName || user.email,
    createdAt: s.serverTimestamp(),
  });
}

export async function updateRule(id, rule) {
  const { db, s } = await store();
  await s.updateDoc(s.doc(db, 'rules', id), rule);
}

export async function deleteRule(id) {
  const { db, s } = await store();
  await s.deleteDoc(s.doc(db, 'rules', id));
}

/* --------------------------- Geschiedenis --------------------------- */

export function listenHistory(callback, max = 200) {
  let unsub = () => {};
  store().then(({ db, s }) => {
    unsub = s.onSnapshot(
      s.query(s.collection(db, 'checks'), s.orderBy('timestamp', 'desc'), s.limit(max)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('listenHistory', err)
    );
  });
  return () => unsub();
}

export async function addHistoryEntry(entry, user) {
  const { db, s } = await store();
  await s.addDoc(s.collection(db, 'checks'), {
    ...entry,
    uid: user.uid,
    userName: user.displayName || user.email,
    timestamp: s.serverTimestamp(),
  });
}

export async function deleteHistoryEntry(id) {
  const { db, s } = await store();
  await s.deleteDoc(s.doc(db, 'checks', id));
}
