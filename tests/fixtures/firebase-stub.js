// In-memory stand-in for the Firebase modules the app loads from gstatic.
// Served for every https://www.gstatic.com/firebasejs/** request, so a single
// module has to cover firebase-app, firebase-auth and firebase-firestore.
// Seed data comes from window.__RA_DATA (see tests/helpers.js).

const data = window.__RA_DATA || { accounts: {}, collections: {} };
const collections = data.collections;
let uidCounter = 0;

const clone = value => JSON.parse(JSON.stringify(value));
const fail = code => Object.assign(new Error(code), { code });
const docs = name => (collections[name] = collections[name] || {});

export function initializeApp() { return { name: 'stub' }; }
export function getAuth() { return { currentUser: null }; }
export function getFirestore() { return { stub: true }; }

export async function createUserWithEmailAndPassword(auth, email, password) {
  if (data.accounts[email]) throw fail('auth/email-already-in-use');
  if (password.length < 6) throw fail('auth/weak-password');
  const uid = `stub-uid-${++uidCounter}`;
  data.accounts[email] = { password, uid };
  return { user: { uid } };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const account = data.accounts[email];
  if (!account || account.password !== password) throw fail('auth/invalid-credential');
  return { user: { uid: account.uid } };
}

export async function signOut() {}

export function serverTimestamp() { return '<server-timestamp>'; }
export function collection(db, name) { return { name }; }
export function doc(dbOrCollection, name, id) {
  return dbOrCollection.name
    ? { name: dbOrCollection.name, id: name }
    : { name, id };
}

function snapshot(name, id) {
  const record = docs(name)[id];
  return { id, exists: () => !!record, data: () => (record ? clone(record) : undefined) };
}

export async function getDoc(ref) { return snapshot(ref.name, ref.id); }
export async function setDoc(ref, value) { docs(ref.name)[ref.id] = clone(value); }
export async function updateDoc(ref, patch) {
  const record = docs(ref.name)[ref.id];
  if (!record) throw fail('not-found');
  Object.assign(record, clone(patch));
}
export async function deleteDoc(ref) { delete docs(ref.name)[ref.id]; }

export function onSnapshot(ref, callback) {
  callback(ref.id ? snapshot(ref.name, ref.id) : queryResult({ name: ref.name, constraints: [] }));
  return () => {};
}

export function query(collectionRef, ...constraints) {
  return { name: collectionRef.name, constraints };
}
export function where(field, op, value) { return { type: 'where', field, op, value }; }
export function orderBy(field, direction = 'asc') { return { type: 'orderBy', field, direction }; }
export function limit(count) { return { type: 'limit', count }; }

const MATCHES = {
  '==': (a, b) => a === b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b
};

function runQuery({ name, constraints = [] }) {
  let entries = Object.entries(docs(name)).map(([id, record]) => ({ id, record }));
  for (const c of constraints) {
    if (c.type === 'where') {
      entries = entries.filter(e => MATCHES[c.op](e.record[c.field], c.value));
    } else if (c.type === 'orderBy') {
      const sign = c.direction === 'desc' ? -1 : 1;
      entries.sort((a, b) => (a.record[c.field] > b.record[c.field] ? sign : -sign));
    } else if (c.type === 'limit') {
      entries = entries.slice(0, c.count);
    }
  }
  return entries;
}

function queryResult(q) {
  const entries = runQuery(q);
  const snaps = entries.map(e => snapshot(q.name, e.id));
  return { docs: snaps, size: snaps.length, empty: !snaps.length, forEach: fn => snaps.forEach(fn) };
}

export async function getDocs(q) { return queryResult(q); }
export async function getCountFromServer(q) {
  const count = runQuery(q).length;
  return { data: () => ({ count }) };
}

export async function runTransaction(db, updateFn) {
  return updateFn({
    get: getDoc,
    set: (ref, value) => setDoc(ref, value),
    update: (ref, patch) => updateDoc(ref, patch),
    delete: ref => deleteDoc(ref)
  });
}
