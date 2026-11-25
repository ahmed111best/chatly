import type { E2eeEnvelope } from './types';

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in this environment.');
  }
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits', 'deriveKey']
  );
}

export async function exportKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return getSubtle().exportKey('jwk', key);
}

export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return getSubtle().importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return getSubtle().importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits', 'deriveKey']
  );
}

async function deriveSharedAesKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    256
  );

  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const encoder = new TextEncoder();

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('chatly-e2ee-v1-salt'),
      info: encoder.encode('chatly-message-aes256gcm'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessageText(params: {
  plaintext: string;
  myPrivateKey: CryptoKey;
  myPublicKeyJwk: JsonWebKey;
  recipientPublicKeyJwk: JsonWebKey;
}): Promise<string> {
  const subtle = getSubtle();
  const recipientPub = await importPublicKeyJwk(params.recipientPublicKeyJwk);
  const aesKey = await deriveSharedAesKey(params.myPrivateKey, recipientPub);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(params.plaintext);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  const envelope: E2eeEnvelope = {
    v: 1,
    alg: 'ECDH-P256-HKDF-AES256GCM',
    senderPubJwk: params.myPublicKeyJwk,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuffer)),
  };

  return JSON.stringify(envelope);
}

export async function decryptMessageText(params: {
  envelopeJson: string;
  myPrivateKey: CryptoKey;
  peerPublicKeyJwk?: JsonWebKey;
}): Promise<{ plaintext: string; verified: boolean }> {
  const envelope = parseE2eeEnvelope(params.envelopeJson);
  if (!envelope) {
    throw new Error('Invalid E2EE envelope.');
  }

  const senderOrPeerJwk = params.peerPublicKeyJwk || envelope.senderPubJwk;
  const peerPub = await importPublicKeyJwk(senderOrPeerJwk);
  const aesKey = await deriveSharedAesKey(params.myPrivateKey, peerPub);

  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const plainBuf = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    ct as BufferSource
  );

  return {
    plaintext: new TextDecoder().decode(plainBuf),
    verified: true,
  };
}

export function parseE2eeEnvelope(raw: string | null | undefined): E2eeEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<E2eeEnvelope>;
    if (
      parsed.v === 1 &&
      parsed.alg === 'ECDH-P256-HKDF-AES256GCM' &&
      parsed.senderPubJwk &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ct === 'string'
    ) {
      return parsed as E2eeEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}
