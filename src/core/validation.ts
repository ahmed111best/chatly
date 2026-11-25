import type { AccentColor, LanguageCode, ThemeMode, VisibilityLevel } from './types';

export interface ProfileValidationErrors {
  username?: string;
  displayName?: string;
  bio?: string;
  statusText?: string;
  phoneNumber?: string;
}

const USERNAME_REGEX = /^[a-z0-9._]{3,24}$/;
const CONSECUTIVE_DOTS_OR_UNDERSCORES = /(\.\.|__)/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'chatly',
  'support',
  'security',
  'system',
  'root',
  'help',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const normalized = normalizeUsername(raw);
  if (!normalized) return 'usernameRequired';
  if (normalized.length < 3 || normalized.length > 24) return 'usernameLength';
  if (!USERNAME_REGEX.test(normalized)) return 'usernameChars';
  if (CONSECUTIVE_DOTS_OR_UNDERSCORES.test(normalized)) return 'usernameRepeatedPunctuation';
  if (normalized.startsWith('.') || normalized.endsWith('.')) return 'usernameEdgeDot';
  if (RESERVED_USERNAMES.has(normalized)) return 'usernameReserved';
  return null;
}

export function validateDisplayName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return 'displayNameTooShort';
  if (trimmed.length > 50) return 'displayNameTooLong';
  return null;
}

export function validateBio(raw: string): string | null {
  if (raw.trim().length > 180) return 'bioTooLong';
  return null;
}

export function validateStatusText(raw: string): string | null {
  if (raw.trim().length > 60) return 'statusTooLong';
  return null;
}

export function validatePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null; // Optional field
  const digitsOnly = trimmed.replace(/[\s\-()+]/g, '');
  if (!/^\d{7,15}$/.test(digitsOnly)) return 'phoneInvalid';
  return null;
}

export function validateProfileForm(input: {
  username: string;
  displayName: string;
  bio: string;
  statusText: string;
  phoneNumber: string;
}): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {};
  const uErr = validateUsername(input.username);
  if (uErr) errors.username = uErr;

  const dErr = validateDisplayName(input.displayName);
  if (dErr) errors.displayName = dErr;

  const bErr = validateBio(input.bio);
  if (bErr) errors.bio = bErr;

  const sErr = validateStatusText(input.statusText);
  if (sErr) errors.statusText = sErr;

  const pErr = validatePhoneNumber(input.phoneNumber);
  if (pErr) errors.phoneNumber = pErr;

  return errors;
}

export function isValidVisibility(val: string): val is VisibilityLevel {
  return val === 'everyone' || val === 'contacts' || val === 'nobody';
}

export function isValidLanguage(val: string): val is LanguageCode {
  return val === 'en' || val === 'ar';
}

export function isValidThemeMode(val: string): val is ThemeMode {
  return val === 'light' || val === 'dark';
}

export function isValidAccentColor(val: string): val is AccentColor {
  return val === 'teal' || val === 'indigo' || val === 'amber' || val === 'rose';
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.apng': 'image/apng',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function inferMediaMimeType(fileName: string, providedMime?: string | null): string {
  const cleaned = (providedMime || '').trim().toLowerCase();
  if (cleaned && cleaned !== 'application/octet-stream') {
    return cleaned;
  }
  const lower = fileName.trim().toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = lower.slice(dotIdx);
    if (EXTENSION_MIME_MAP[ext]) {
      return EXTENSION_MIME_MAP[ext];
    }
  }
  return cleaned || 'application/octet-stream';
}

export function inferMediaKind(
  mimeType: string,
  fileName: string
): 'image' | 'video' | 'audio' | 'document' {
  const mime = inferMediaMimeType(fileName, mimeType);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export function validateStickerInput(input: {
  name: string;
  trimStartMs?: number;
  trimEndMs?: number;
  defaultVolume?: number;
}): string | null {
  const name = input.name.trim();
  if (!name) return 'Sticker name is required.';
  if (name.length > 80) return 'Sticker name must be 80 characters or fewer.';
  const start = input.trimStartMs ?? 0;
  const end = input.trimEndMs ?? 0;
  if (start < 0 || end < 0) return 'Audio trim timestamps must be non-negative.';
  if (end > 0 && start >= end) return 'Trim start must be earlier than trim end.';
  const vol = input.defaultVolume ?? 85;
  if (vol < 0 || vol > 100) return 'Volume must be between 0 and 100.';
  return null;
}

export function validateScheduledTimestamp(
  raw: string | null | undefined,
  options?: { requireFuture?: boolean; nowMs?: number }
): { valid: boolean; date: Date | null; error?: string } {
  if (!raw || !raw.trim()) {
    return { valid: true, date: null };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, date: null, error: 'Invalid scheduledAt timestamp.' };
  }
  const nowMs = options?.nowMs ?? Date.now();
  if (options?.requireFuture && parsed.getTime() <= nowMs + 5000) {
    return { valid: false, date: null, error: 'scheduledAt must be in the future.' };
  }
  return { valid: true, date: parsed };
}

