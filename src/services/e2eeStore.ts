import {
  decryptMessageText,
  encryptMessageText,
  exportKeyJwk,
  generateDeviceKeyPair,
  importPrivateKeyJwk,
} from '../core/e2ee';

const DB_NAME = 'chatly_e2ee_keystore';
const STORE_NAME = 'device_keys';

export interface StoredDeviceKeyBundle {
  userKey: string;
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  fingerprint: string;
  createdAt: string;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

async function computeFingerprint(jwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

export async function getStoredDeviceKeyBundle(
  userKey: string
): Promise<StoredDeviceKeyBundle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(userKey);
    req.onsuccess = () => resolve((req.result as StoredDeviceKeyBundle) || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveDeviceKeyBundle(bundle: StoredDeviceKeyBundle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ensureDeviceKeyBundle(
  userKey: string,
  forceRotate = false
): Promise<StoredDeviceKeyBundle> {
  if (!forceRotate) {
    const existing = await getStoredDeviceKeyBundle(userKey);
    if (existing) return existing;
  }

  const pair = await generateDeviceKeyPair();
  const publicKeyJwk = await exportKeyJwk(pair.publicKey);
  const privateKeyJwk = await exportKeyJwk(pair.privateKey);
  const fingerprint = await computeFingerprint(publicKeyJwk);
  const bundle: StoredDeviceKeyBundle = {
    userKey,
    deviceId: `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
    publicKeyJwk,
    privateKeyJwk,
    fingerprint,
    createdAt: new Date().toISOString(),
  };
  await saveDeviceKeyBundle(bundle);
  return bundle;
}

export async function encryptForRecipient(params: {
  bundle: StoredDeviceKeyBundle;
  recipientPublicKeyJwk: JsonWebKey;
  plaintext: string;
}): Promise<string> {
  const privateKey = await importPrivateKeyJwk(params.bundle.privateKeyJwk);
  return encryptMessageText({
    plaintext: params.plaintext,
    myPrivateKey: privateKey,
    myPublicKeyJwk: params.bundle.publicKeyJwk,
    recipientPublicKeyJwk: params.recipientPublicKeyJwk,
  });
}

export async function decryptWithDeviceKey(params: {
  bundle: StoredDeviceKeyBundle;
  envelopeJson: string;
}): Promise<{ plaintext: string; verified: boolean }> {
  const privateKey = await importPrivateKeyJwk(params.bundle.privateKeyJwk);
  return decryptMessageText({
    envelopeJson: params.envelopeJson,
    myPrivateKey: privateKey,
  });
}
