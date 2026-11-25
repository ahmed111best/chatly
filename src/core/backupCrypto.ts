import type { EncryptedBackupItem } from './types';

export interface EncryptedBackupEnvelope {
  v: 1;
  alg: 'PBKDF2-AES256GCM';
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

const RECOVERY_WORDS = [
  'amber', 'anchor', 'atlas', 'aurora', 'beacon', 'breeze', 'cedar', 'cinder',
  'cipher', 'cloud', 'cobalt', 'coral', 'crest', 'dawn', 'delta', 'dune',
  'echo', 'ember', 'fable', 'falcon', 'field', 'flame', 'flint', 'forest',
  'frost', 'garden', 'glacier', 'glow', 'granite', 'harbor', 'haven', 'horizon',
  'indigo', 'island', 'ivory', 'jade', 'jasmine', 'jasper', 'lagoon', 'lantern',
  'laurel', 'linen', 'lotus', 'lunar', 'maple', 'marble', 'meadow', 'meridian',
  'mirage', 'mist', 'moon', 'moss', 'nebula', 'nectar', 'oasis', 'olive',
  'onyx', 'opal', 'orbit', 'palm', 'pearl', 'pebble', 'phoenix', 'pine',
  'planet', 'plume', 'prism', 'pulse', 'quartz', 'quiet', 'rain', 'raven',
  'reed', 'ridge', 'ripple', 'river', 'saffron', 'sage', 'sand', 'sapphire',
  'shore', 'sierra', 'silk', 'silver', 'sky', 'slate', 'solar', 'spark',
  'spire', 'spring', 'star', 'stone', 'stream', 'summit', 'sun', 'teal',
  'timber', 'topaz', 'trail', 'tulip', 'valley', 'velvet', 'verge', 'wave',
  'willow', 'wind', 'winter', 'zenith',
];

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

export function generateRecoveryPhrase(wordCount = 12): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(wordCount));
  const words: string[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    words.push(RECOVERY_WORDS[bytes[i] % RECOVERY_WORDS.length]);
  }
  return words.join(' ');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await getSubtle().digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveBackupAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = 150000
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createEncryptedBackupBlob(
  payload: unknown,
  passphrase: string
): Promise<{ cipherPayloadJson: string; checksumSha256: string }> {
  const cleanPass = passphrase.trim();
  if (cleanPass.length < 6) {
    throw new Error('Recovery passphrase must be at least 6 characters.');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations = 150000;
  const key = await deriveBackupAesKey(cleanPass, salt, iterations);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await getSubtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded
  );

  const envelope: EncryptedBackupEnvelope = {
    v: 1,
    alg: 'PBKDF2-AES256GCM',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuffer)),
  };
  const cipherPayloadJson = JSON.stringify(envelope);
  const checksumSha256 = await sha256Hex(cipherPayloadJson);
  return { cipherPayloadJson, checksumSha256 };
}

export async function decryptEncryptedBackupBlob<T = unknown>(
  cipherPayloadJson: string,
  passphrase: string,
  expectedChecksum?: string
): Promise<T> {
  if (expectedChecksum) {
    const actualChecksum = await sha256Hex(cipherPayloadJson);
    if (actualChecksum !== expectedChecksum) {
      throw new Error('Backup integrity verification failed: checksum mismatch.');
    }
  }

  const envelope = JSON.parse(cipherPayloadJson) as Partial<EncryptedBackupEnvelope>;
  if (
    envelope.v !== 1 ||
    envelope.alg !== 'PBKDF2-AES256GCM' ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ct !== 'string'
  ) {
    throw new Error('Unsupported or corrupted encrypted backup envelope.');
  }

  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const key = await deriveBackupAesKey(
    passphrase.trim(),
    salt,
    envelope.iterations || 150000
  );

  const plainBuffer = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plainBuffer)) as T;
}

export function summarizeBackupScope(backup: EncryptedBackupItem): string {
  return backup.includesSummary || 'Conversations, contacts & saved vault metadata (encrypted client-side)';
}
