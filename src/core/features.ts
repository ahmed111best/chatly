import type {
  FontScale,
  LocationShareItem,
  MediaInventoryItem,
  NotificationPrefs,
} from './types';

export function isWithinQuietHours(
  now: Date,
  startHHMM: string,
  endHHMM: string
): boolean {
  const parseMinutes = (val: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(val.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  };
  const start = parseMinutes(startHHMM);
  const end = parseMinutes(endHHMM);
  if (start === null || end === null || start === end) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight quiet window (e.g. 22:00 -> 07:00)
  return current >= start || current < end;
}

export function shouldSuppressNotification(
  prefs: NotificationPrefs,
  conversationId?: number | null,
  now = new Date()
): boolean {
  if (prefs.dndEnabled) return true;
  if (conversationId && prefs.mutedConversationIds.includes(conversationId)) return true;
  if (prefs.quietHoursEnabled && isWithinQuietHours(now, prefs.quietStart, prefs.quietEnd)) {
    return true;
  }
  return false;
}

export function formatNotificationPreview(
  prefs: NotificationPrefs,
  senderName: string,
  body: string
): { title: string; body: string } {
  if (prefs.lockScreenPreview === 'hidden') {
    return { title: 'Chatly', body: 'New message received' };
  }
  if (prefs.lockScreenPreview === 'name_only') {
    return { title: senderName || 'Chatly', body: 'Sent you a message' };
  }
  return { title: senderName || 'Chatly', body };
}

export function formatQrProfileUri(username: string, inviteToken?: string): string {
  const clean = username.trim().replace(/^@+/, '').toLowerCase();
  const base = `chatly://user/@${clean}`;
  return inviteToken ? `${base}?invite=${encodeURIComponent(inviteToken)}` : base;
}

export function parseQrProfileInput(raw: string): {
  username: string | null;
  inviteToken: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { username: null, inviteToken: null };

  if (trimmed.startsWith('chatly://')) {
    try {
      const normalized = trimmed.replace('chatly://user/', 'https://chatly.local/user/');
      const url = new URL(normalized);
      const seg = url.pathname.split('/').filter(Boolean).pop() || '';
      const username = seg.replace(/^@+/, '').toLowerCase() || null;
      const inviteToken = url.searchParams.get('invite');
      return { username, inviteToken };
    } catch {
      return { username: null, inviteToken: null };
    }
  }

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as { username?: string; invite?: string };
      return {
        username: obj.username ? obj.username.replace(/^@+/, '').toLowerCase() : null,
        inviteToken: obj.invite ?? null,
      };
    } catch {
      return { username: null, inviteToken: null };
    }
  }

  const clean = trimmed.replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{3,24}$/.test(clean)
    ? { username: clean, inviteToken: null }
    : { username: null, inviteToken: null };
}

export function isLocationShareActive(
  share: Pick<LocationShareItem, 'expiresAt' | 'stoppedAt'>,
  nowMs = Date.now()
): boolean {
  if (share.stoppedAt) return false;
  const exp = new Date(share.expiresAt).getTime();
  return Number.isFinite(exp) && exp > nowMs;
}

export function formatCoordinatesDisplay(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

export function validateChannelInput(input: {
  title: string;
  handle: string;
  description?: string;
}): string | null {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) {
    return 'Channel title must be between 2 and 80 characters.';
  }
  const handle = input.handle.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,28}$/.test(handle)) {
    return 'Channel handle must be 3–28 lowercase letters, numbers, or underscores.';
  }
  if ((input.description || '').trim().length > 400) {
    return 'Channel description must be 400 characters or fewer.';
  }
  return null;
}

export function validatePinCode(pin: string): string | null {
  const cleaned = pin.trim();
  if (!/^\d{4,8}$/.test(cleaned)) {
    return 'Security PIN must be 4 to 8 digits.';
  }
  return null;
}

export function getRootFontSizePx(scale: FontScale): string {
  if (scale === 'sm') return '14px';
  if (scale === 'lg') return '18px';
  return '16px';
}

export function computeStorageSummary(items: MediaInventoryItem[]): {
  totalBytes: number;
  byKind: Record<'image' | 'video' | 'audio' | 'document', { count: number; bytes: number }>;
} {
  const byKind: Record<'image' | 'video' | 'audio' | 'document', { count: number; bytes: number }> = {
    image: { count: 0, bytes: 0 },
    video: { count: 0, bytes: 0 },
    audio: { count: 0, bytes: 0 },
    document: { count: 0, bytes: 0 },
  };
  let totalBytes = 0;
  for (const item of items) {
    totalBytes += item.sizeBytes || 0;
    const k = item.kind in byKind ? item.kind : 'document';
    byKind[k].count += 1;
    byKind[k].bytes += item.sizeBytes || 0;
  }
  return { totalBytes, byKind };
}
