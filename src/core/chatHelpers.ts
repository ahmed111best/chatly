import type { ChatMessage } from './types';

function shortDeterministicHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i * 7;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`.slice(0, 10);
}

function cleanSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Deterministic 1-to-1 direct conversation ID independent of which participant opens the chat.
 * Stays within Firestore's safe document ID limits (<= 120 chars) without truncation collisions.
 */
export function buildDirectConversationId(uidA: string, uidB: string): string {
  const a = cleanSegment(uidA.trim());
  const b = cleanSegment(uidB.trim());
  const [first, second] = [a, b].sort();
  const raw = `direct_${first}_${second}`;
  if (raw.length <= 120) {
    return raw;
  }
  const digest = shortDeterministicHash(`${uidA}:${uidB}:${[uidA, uidB].sort().join('|')}`);
  return `direct_${first.slice(0, 48)}_${second.slice(0, 48)}_${digest}`.slice(0, 120);
}

export function resolveMessageTimestampMs(msg: {
  createdAt?: string | null;
  createdAtMs?: number | null;
}): number {
  if (typeof msg.createdAt === 'string' && msg.createdAt.trim()) {
    const parsed = Date.parse(msg.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof msg.createdAtMs === 'number' && Number.isFinite(msg.createdAtMs)) {
    return msg.createdAtMs;
  }
  return 0;
}

/**
 * Chronologically sorts messages ascending by timestamp (breaking ties deterministically by id)
 * and removes duplicates by clientMessageId or numeric message id.
 */
export function sortAndDedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  for (const msg of messages) {
    const key = msg.clientMessageId ? `c:${msg.clientMessageId}` : `id:${msg.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, msg);
    } else {
      // Prefer server-delivered/edited snapshot over optimistic placeholder
      const merged: ChatMessage = {
        ...existing,
        ...msg,
        decryptedBody: msg.decryptedBody ?? existing.decryptedBody,
        e2eeVerified: msg.e2eeVerified ?? existing.e2eeVerified,
        isEncrypted: msg.isEncrypted ?? existing.isEncrypted,
      };
      byKey.set(key, merged);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const ta = resolveMessageTimestampMs(a);
    const tb = resolveMessageTimestampMs(b);
    if (ta !== tb) return ta - tb;
    if (a.id !== b.id) return a.id - b.id;
    return (a.clientMessageId || '').localeCompare(b.clientMessageId || '');
  });
}
