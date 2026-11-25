import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  firebaseConfig,
  formatAndLogFirestoreError,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { buildDirectConversationId, sortAndDedupeMessages } from '../core/chatHelpers';
import { DEFAULT_PRIVACY_SETTINGS } from '../core/privacy';
import { inferMediaMimeType } from '../core/validation';
import type {
  AccentColor,
  AccessibilityPrefs,
  AppHealthStatus,
  CallRecordItem,
  ChannelMemberItem,
  ChannelPostItem,
  ChannelRole,
  ChannelSummary,
  ChatMessage,
  ConversationSummary,
  DevicePlatform,
  DeviceSession,
  EncryptedBackupItem,
  FriendRequestItem,
  GroupEventItem,
  GroupJoinRequestItem,
  GroupMemberItem,
  GroupPollItem,
  GroupTaskItem,
  LanguageCode,
  LocationShareItem,
  LoginHistoryItem,
  MediaAttachmentMeta,
  MediaInventoryItem,
  MessageReminderItem,
  ModeratorAuditItem,
  MutualGroupSummary,
  NotificationItem,
  NotificationPrefs,
  PrivacySettings,
  PublicUserSummary,
  ReactionSummary,
  SafetyReportItem,
  SavedNoteItem,
  SmartFolder,
  StickerPackItem,
  StickerVisualPreset,
  StoryItem,
  ThemeMode,
  UserProfile,
  VoiceStickerItem,
} from '../core/types';
import { DEMO_RELEASE_NOTES } from '../core/demoData';

// -----------------------------------------------------------------------------
// Bidirectional Numeric ID <-> Firestore Document ID Registry
// -----------------------------------------------------------------------------
const docToNumMap = new Map<string, number>();
const numToDocMap = new Map<number, string>();
const msgToConvMap = new Map<string, string>();
const pollToConvMap = new Map<string, string>();
const taskToConvMap = new Map<string, string>();
const locationToConvMap = new Map<string, string>();
const stickerToPackMap = new Map<string, string>();
const mediaDataUrlCache = new Map<string, { dataUrl: string; mimeType: string; sizeBytes: number }>();

function hashDocId(docId: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < docId.length; i++) {
    const ch = docId.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const combined = ((h1 & 0xfffff) * 0x1000000 + (h2 & 0xffffff)) + 1_000_000;
  return combined;
}

export function registerDocNum(docId: string): number {
  const existing = docToNumMap.get(docId);
  if (existing !== undefined) return existing;
  let num = hashDocId(docId);
  while (numToDocMap.has(num) && numToDocMap.get(num) !== docId) {
    num += 1;
  }
  docToNumMap.set(docId, num);
  numToDocMap.set(num, docId);
  return num;
}

export function resolveDocId(numOrId: number | string): string {
  if (typeof numOrId === 'string') return numOrId;
  return numToDocMap.get(numOrId) || String(numOrId);
}

export function sanitizeId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return clean || `id_${Date.now()}`;
}

function newFirestoreId(prefix: string): string {
  return sanitizeId(`${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`);
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) return val;
  if (typeof val === 'number') return new Date(val).toISOString();
  return new Date().toISOString();
}

function toMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'string' && val) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function requireCurrentUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in with Google.');
  }
  return user;
}

export function detectPlatform(): DevicePlatform {
  if (typeof window !== 'undefined') {
    const w = window as unknown as {
      chatlyElectron?: { isElectron?: boolean };
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    if (w.chatlyElectron?.isElectron) return 'windows';
    if (w.Capacitor?.isNativePlatform?.()) return 'android';
  }
  return 'web';
}

export function getChatlySessionId(): string {
  const key = 'chatly_device_session_id';
  try {
    let existing = window.sessionStorage.getItem(key);
    if (!existing) {
      existing = `web_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      window.sessionStorage.setItem(key, existing);
    }
    return sanitizeId(existing);
  } catch {
    return 'web_default_session';
  }
}

export function rotateChatlySessionId(): string {
  const key = 'chatly_device_session_id';
  try {
    const next = `web_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    window.sessionStorage.setItem(key, next);
    return sanitizeId(next);
  } catch {
    return 'web_default_session';
  }
}

// -----------------------------------------------------------------------------
// Media Conversion & Browser Image Compression (Keeps Firestore Docs < 1 MiB)
// -----------------------------------------------------------------------------
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read media file.'));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file as data URL.'));
    reader.readAsDataURL(blob);
  });
}

async function compressImageBlobToDataUrl(
  blob: Blob,
  mimeType: string,
  maxBytes = 320_000
): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  const rawDataUrl = await blobToDataUrl(blob);
  if (rawDataUrl.length <= maxBytes && blob.size <= maxBytes) {
    return { dataUrl: rawDataUrl, mimeType, sizeBytes: blob.size };
  }
  // Preserve animated GIFs if under hard Firestore limit (650KB)
  if (mimeType === 'image/gif' && rawDataUrl.length <= 650_000) {
    return { dataUrl: rawDataUrl, mimeType, sizeBytes: blob.size };
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUrl: rawDataUrl.slice(0, 840_000), mimeType, sizeBytes: blob.size };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: rawDataUrl, mimeType, sizeBytes: blob.size });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const outMime = mimeType === 'image/png' ? 'image/webp' : 'image/jpeg';
      let quality = 0.82;
      let candidate = canvas.toDataURL(outMime, quality);
      while (candidate.length > maxBytes && quality > 0.35) {
        quality -= 0.12;
        candidate = canvas.toDataURL('image/jpeg', quality);
      }
      resolve({
        dataUrl: candidate,
        mimeType: candidate.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg',
        sizeBytes: Math.round(candidate.length * 0.75),
      });
    };
    img.onerror = () => resolve({ dataUrl: rawDataUrl, mimeType, sizeBytes: blob.size });
    img.src = rawDataUrl;
  });
}

// -----------------------------------------------------------------------------
// Default Preferences & Normalization Helpers
// -----------------------------------------------------------------------------
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  soundId: 'chime',
  dndEnabled: false,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  lockScreenPreview: 'full',
  mutedConversationIds: [],
};

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  fontScale: 'md',
  highContrast: false,
  reduceMotion: false,
};

function sanitizeUsernameFromProfile(email: string | null, displayName: string | null, uid: string): string {
  const base = (email?.split('@')[0] || displayName || `user_${uid.slice(0, 6)}`)
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .replace(/[._]{2,}/g, '_')
    .slice(0, 18);
  const clean = base.length >= 3 ? base : `chatly_${uid.slice(0, 5).toLowerCase()}`;
  return clean.slice(0, 24);
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getFavoriteStickerSet(uid: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`chatly_fav_stickers_${uid}`);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveFavoriteStickerSet(uid: string, set: Set<string>) {
  try {
    window.localStorage.setItem(`chatly_fav_stickers_${uid}`, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage limits
  }
}

function formatReactions(
  rawList: unknown,
  myUid: string
): ReactionSummary[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => {
      const entry = item as { emoji?: string; userUids?: string[] };
      const userUids = Array.isArray(entry.userUids) ? entry.userUids : [];
      return {
        emoji: String(entry.emoji || ''),
        count: userUids.length,
        reactedByMe: userUids.includes(myUid),
        userIds: userUids.map((u) => registerDocNum(u)),
      };
    })
    .filter((r) => r.emoji && r.count > 0);
}

// -----------------------------------------------------------------------------
// Bootstrap & Auth Session Sync
// -----------------------------------------------------------------------------
export async function bootstrapFirebaseUser(): Promise<{
  verified: boolean;
  tokenClaims: { uid: string; email: string; emailVerified: boolean };
  user: UserProfile;
  privacy: PrivacySettings;
  sessions: DeviceSession[];
  notificationPrefs: NotificationPrefs;
  accessibilityPrefs: AccessibilityPrefs;
  hasPinLock: boolean;
  crashDiagnosticsOptIn: boolean;
  phoneDiscoveryConsent: boolean;
  inviteToken: string;
}> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  registerDocNum(uid);

  const pubRef = doc(db, 'users_public', uid);
  const privRef = doc(db, 'users_private', uid);

  let pubSnap;
  let privSnap;
  try {
    [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users_public/${uid}`);
  }

  const nowIso = new Date().toISOString();
  let pubData = pubSnap.exists() ? pubSnap.data() : null;
  let privData = privSnap.exists() ? privSnap.data() : null;

  if (!pubData) {
    let candidateUsername = sanitizeUsernameFromProfile(fbUser.email, fbUser.displayName, uid);
    // Check if candidateUsername already taken
    try {
      const dupQ = query(collection(db, 'users_public'), where('username', '==', candidateUsername), limit(1));
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty && dupSnap.docs[0].id !== uid) {
        candidateUsername = `${candidateUsername.slice(0, 18)}_${uid.slice(0, 4).toLowerCase()}`;
      }
    } catch {
      // ignore check error
    }

    const avatarRaw = (fbUser.photoURL || '').slice(0, 95000);
    const displayName = (fbUser.displayName || candidateUsername).slice(0, 64);

    const newPub = {
      uid,
      username: candidateUsername,
      displayName,
      bio: 'Available on Chatly',
      statusText: 'Online',
      avatarUrl: avatarRaw,
      online: true,
      hasE2eeKey: false,
      lastSeenAt: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(pubRef, newPub);
      pubData = newPub;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users_public/${uid}`);
    }
  } else {
    const isNavigatorOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (isNavigatorOnline) {
      updateDoc(pubRef, {
        online: true,
        lastSeenAt: nowIso,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        console.warn('Non-fatal offline/transient presence update:', err);
      });
    }
    pubData = { ...pubData, online: isNavigatorOnline, lastSeenAt: nowIso };
  }

  if (!privData) {
    const newPriv = {
      uid,
      email: (fbUser.email || '').slice(0, 254),
      phoneNumber: (fbUser.phoneNumber || '').slice(0, 32),
      preferredLanguage: 'en',
      themeMode: 'dark',
      accentColor: 'teal',
      emailVerified: Boolean(fbUser.emailVerified),
      twoFactorEnabled: false,
      phoneVerified: Boolean(fbUser.phoneNumber),
      inviteToken: `CHATLY-${uid.slice(0, 6).toUpperCase()}`,
      pinHash: '',
      crashDiagnosticsOptIn: false,
      phoneDiscoveryConsent: false,
      privacy: DEFAULT_PRIVACY_SETTINGS,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      accessibilityPrefs: DEFAULT_ACCESSIBILITY_PREFS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(privRef, newPriv);
      privData = newPriv;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users_private/${uid}`);
    }
  }

  // Register or refresh current device session (non-blocking when offline so cached reopen works)
  const sessionId = getChatlySessionId();
  const platform = detectPlatform();
  const sessionRef = doc(db, 'users_private', uid, 'sessions', sessionId);
  const deviceLabel =
    platform === 'windows'
      ? 'Chatly Desktop (Windows)'
      : platform === 'android'
        ? 'Chatly Mobile (Android)'
        : (typeof navigator !== 'undefined' && navigator.platform ? `Web (${navigator.platform})` : 'Web Browser');

  try {
    const sSnap = await getDoc(sessionRef);
    const sessionWrite = !sSnap.exists()
      ? setDoc(sessionRef, {
          id: sessionId,
          uid,
          deviceName: deviceLabel.slice(0, 120),
          platform,
          userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : 'browser').slice(0, 512),
          revoked: false,
          lastActiveAt: nowIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      : updateDoc(sessionRef, {
          revoked: false,
          lastActiveAt: nowIso,
          updatedAt: serverTimestamp(),
        });

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      await Promise.race([
        sessionWrite,
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
      ]);
    }
  } catch (err) {
    console.warn(`Session sync skipped (${sessionId}):`, err);
  }

  // Ensure default starter sticker pack exists if none present
  try {
    const packsQ = query(collection(db, 'stickerPacks'), where('isPublic', '==', true), limit(1));
    const packsSnap = await getDocs(packsQ);
    if (packsSnap.empty) {
      const packId = 'pack_chatly_ocean_starter';
      await setDoc(doc(db, 'stickerPacks', packId), {
        id: packId,
        creatorUid: uid,
        title: 'Chatly Starter Pack',
        titleAr: 'حزمة شاتلي الأساسية',
        category: 'greetings',
        shareCode: 'CHATLY-OCEAN',
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-fatal if another user creates or rules restrict
  }

  const sessions = await fetchDeviceSessions(uid);

  const userProfile: UserProfile = {
    id: registerDocNum(uid),
    uid,
    email: String(privData.email || fbUser.email || ''),
    username: String(pubData.username || 'user'),
    displayName: String(pubData.displayName || fbUser.displayName || 'Chatly User'),
    bio: String(pubData.bio || ''),
    statusText: String(pubData.statusText || ''),
    avatarUrl: String(pubData.avatarUrl || ''),
    preferredLanguage: (privData.preferredLanguage as LanguageCode) || 'en',
    themeMode: (privData.themeMode as ThemeMode) || 'dark',
    accentColor: (privData.accentColor as AccentColor) || 'teal',
    emailVerified: Boolean(fbUser.emailVerified),
    twoFactorEnabled: Boolean(privData.twoFactorEnabled),
    phoneNumber: String(privData.phoneNumber || ''),
    phoneVerified: Boolean(privData.phoneVerified),
    lastSeenAt: String(pubData.lastSeenAt || nowIso),
    createdAt: toIsoString(pubData.createdAt),
  };

  return {
    verified: true,
    tokenClaims: {
      uid,
      email: userProfile.email,
      emailVerified: Boolean(fbUser.emailVerified),
    },
    user: userProfile,
    privacy: { ...DEFAULT_PRIVACY_SETTINGS, ...(privData.privacy as Partial<PrivacySettings>) },
    sessions,
    notificationPrefs: {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(privData.notificationPrefs as Partial<NotificationPrefs>),
    },
    accessibilityPrefs: {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      ...(privData.accessibilityPrefs as Partial<AccessibilityPrefs>),
    },
    hasPinLock: Boolean(privData.pinHash),
    crashDiagnosticsOptIn: Boolean(privData.crashDiagnosticsOptIn),
    phoneDiscoveryConsent: Boolean(privData.phoneDiscoveryConsent),
    inviteToken: String(privData.inviteToken || `CHATLY-${uid.slice(0, 6).toUpperCase()}`),
  };
}

export async function setMyOnlinePresence(online: boolean): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) return;
  try {
    await updateDoc(doc(db, 'users_public', fbUser.uid), {
      online,
      lastSeenAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Best-effort presence update on unload
  }
}

export async function fetchDeviceSessions(uid: string): Promise<DeviceSession[]> {
  const currentId = getChatlySessionId();
  try {
    const snap = await getDocs(
      query(collection(db, 'users_private', uid, 'sessions'), where('uid', '==', uid))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        deviceName: String(data.deviceName || 'Web Browser'),
        platform: (data.platform as DevicePlatform) || 'web',
        userAgent: String(data.userAgent || ''),
        isCurrent: d.id === currentId,
        lastActiveAt: toIsoString(data.lastActiveAt),
        revokedAt: data.revoked ? toIsoString(data.updatedAt) : null,
        createdAt: toIsoString(data.createdAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/sessions`);
  }
}

export async function logoutFirestoreSession(): Promise<{ loggedOut: boolean }> {
  const fbUser = auth.currentUser;
  if (fbUser) {
    const sessionId = getChatlySessionId();
    try {
      await updateDoc(doc(db, 'users_private', fbUser.uid, 'sessions', sessionId), {
        revoked: true,
        lastActiveAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if session doc already deleted
    }
    await setMyOnlinePresence(false);
  }
  return { loggedOut: true };
}

// -----------------------------------------------------------------------------
// Profile, Privacy, Preferences & Security
// -----------------------------------------------------------------------------
export async function updateMyProfile(payload: {
  username: string;
  displayName: string;
  bio: string;
  statusText: string;
  preferredLanguage: 'en' | 'ar';
  themeMode: 'light' | 'dark';
  accentColor: 'teal' | 'indigo' | 'amber' | 'rose';
  twoFactorEnabled: boolean;
  phoneNumber: string;
}): Promise<{ user: UserProfile }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanUsername = payload.username
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.]/g, '_')
    .slice(0, 24);
  if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
    throw new Error('Username must be 3-24 lowercase letters, numbers, dots, or underscores.');
  }
  const dupSnap = await getDocs(
    query(collection(db, 'users_public'), where('username', '==', cleanUsername), limit(2))
  );
  if (dupSnap.docs.some((d) => d.id !== uid)) {
    throw new Error('This username is already taken.');
  }

  const cleanDisplayName = payload.displayName.trim().slice(0, 64);
  if (!cleanDisplayName) {
    throw new Error('Display name cannot be empty.');
  }

  const nowIso = new Date().toISOString();
  try {
    await Promise.all([
      updateDoc(doc(db, 'users_public', uid), {
        username: cleanUsername,
        displayName: cleanDisplayName,
        bio: payload.bio.trim().slice(0, 240),
        statusText: payload.statusText.trim().slice(0, 80),
        lastSeenAt: nowIso,
        updatedAt: serverTimestamp(),
      }),
      updateDoc(doc(db, 'users_private', uid), {
        preferredLanguage: payload.preferredLanguage,
        themeMode: payload.themeMode,
        accentColor: payload.accentColor,
        twoFactorEnabled: Boolean(payload.twoFactorEnabled),
        phoneNumber: payload.phoneNumber.trim().slice(0, 32),
        updatedAt: serverTimestamp(),
      }),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_public/${uid}`);
  }

  const ctx = await bootstrapFirebaseUser();
  return { user: ctx.user };
}

export async function updateMyPrivacy(payload: PrivacySettings): Promise<{ privacy: PrivacySettings }> {
  const fbUser = requireCurrentUser();
  try {
    await updateDoc(doc(db, 'users_private', fbUser.uid), {
      privacy: payload,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}`);
  }
  return { privacy: payload };
}

export async function revokeMyDeviceSession(sessionId: string): Promise<{ revoked: boolean; sessionId: string }> {
  const fbUser = requireCurrentUser();
  const cleanId = sanitizeId(sessionId);
  try {
    await updateDoc(doc(db, 'users_private', fbUser.uid, 'sessions', cleanId), {
      revoked: true,
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}/sessions/${cleanId}`);
  }
  return { revoked: true, sessionId: cleanId };
}

export async function saveUserPreferences(payload: {
  notificationPrefs?: NotificationPrefs;
  accessibilityPrefs?: AccessibilityPrefs;
  crashDiagnosticsOptIn?: boolean;
  phoneDiscoveryConsent?: boolean;
}) {
  const fbUser = requireCurrentUser();
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (payload.notificationPrefs !== undefined) patch.notificationPrefs = payload.notificationPrefs;
  if (payload.accessibilityPrefs !== undefined) patch.accessibilityPrefs = payload.accessibilityPrefs;
  if (payload.crashDiagnosticsOptIn !== undefined) patch.crashDiagnosticsOptIn = payload.crashDiagnosticsOptIn;
  if (payload.phoneDiscoveryConsent !== undefined) patch.phoneDiscoveryConsent = payload.phoneDiscoveryConsent;

  try {
    await updateDoc(doc(db, 'users_private', fbUser.uid), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}`);
  }
  return fetchSecurityBundle();
}

export async function fetchSecurityBundle(): Promise<{
  notificationPrefs: NotificationPrefs;
  accessibilityPrefs: AccessibilityPrefs;
  hasPinLock: boolean;
  crashDiagnosticsOptIn: boolean;
  phoneDiscoveryConsent: boolean;
  loginHistory: LoginHistoryItem[];
}> {
  const fbUser = requireCurrentUser();
  try {
    const [privSnap, sessions] = await Promise.all([
      getDoc(doc(db, 'users_private', fbUser.uid)),
      fetchDeviceSessions(fbUser.uid),
    ]);
    const data = privSnap.data() || {};
    const loginHistory: LoginHistoryItem[] = sessions.map((s) => ({
      id: registerDocNum(s.id),
      deviceName: s.deviceName,
      platform: s.platform,
      userAgent: s.userAgent,
      isNewDevice: s.isCurrent,
      suspiciousFlag: Boolean(s.revokedAt),
      createdAt: s.createdAt,
    }));
    return {
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(data.notificationPrefs || {}) },
      accessibilityPrefs: { ...DEFAULT_ACCESSIBILITY_PREFS, ...(data.accessibilityPrefs || {}) },
      hasPinLock: Boolean(data.pinHash),
      crashDiagnosticsOptIn: Boolean(data.crashDiagnosticsOptIn),
      phoneDiscoveryConsent: Boolean(data.phoneDiscoveryConsent),
      loginHistory,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users_private/${fbUser.uid}`);
  }
}

export async function setOrClearPinLock(pin: string | null): Promise<{ hasPinLock: boolean }> {
  const fbUser = requireCurrentUser();
  const pinHash = pin && pin.trim() ? await sha256Hex(`${fbUser.uid}:${pin.trim()}`) : '';
  try {
    await updateDoc(doc(db, 'users_private', fbUser.uid), {
      pinHash,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}`);
  }
  return { hasPinLock: Boolean(pinHash) };
}

export async function verifyPinLock(pin: string): Promise<{ valid: boolean }> {
  const fbUser = requireCurrentUser();
  try {
    const snap = await getDoc(doc(db, 'users_private', fbUser.uid));
    const storedHash = String(snap.data()?.pinHash || '');
    if (!storedHash) return { valid: true };
    const candidate = await sha256Hex(`${fbUser.uid}:${pin.trim()}`);
    return { valid: candidate === storedHash };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users_private/${fbUser.uid}`);
  }
}

// -----------------------------------------------------------------------------
// E2EE Public Key Directory
// -----------------------------------------------------------------------------
export async function registerE2eePublicKeyDoc(payload: {
  deviceId: string;
  publicKeyJwk: string;
}): Promise<{ registered: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanDeviceId = payload.deviceId.trim().slice(0, 128);
  const cleanJwk = payload.publicKeyJwk.slice(0, 4096);
  if (!cleanDeviceId || !cleanJwk) {
    throw new Error('Device E2EE key payload is incomplete.');
  }
  const keyRef = doc(db, 'e2eeKeys', uid);
  const pubRef = doc(db, 'users_public', uid);
  try {
    const [keySnap, pubSnap] = await Promise.all([getDoc(keyRef), getDoc(pubRef)]);
    if (keySnap.exists()) {
      const existing = keySnap.data();
      if (existing.deviceId !== cleanDeviceId || existing.publicKeyJwk !== cleanJwk) {
        await updateDoc(keyRef, {
          deviceId: cleanDeviceId,
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          publicKeyJwk: cleanJwk,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(keyRef, {
        uid,
        deviceId: cleanDeviceId,
        algorithm: 'ECDH-P256-HKDF-AES256GCM',
        publicKeyJwk: cleanJwk,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (pubSnap.exists() && pubSnap.data()?.hasE2eeKey !== true) {
      await updateDoc(pubRef, {
        hasE2eeKey: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `e2eeKeys/${uid}`);
  }
  return { registered: true };
}

export async function fetchUserE2eeKeysDoc(targetUserId: number): Promise<{
  keys: { deviceId: string; publicKeyJwk: string; updatedAt: string }[];
}> {
  requireCurrentUser();
  const targetUid = resolveDocId(targetUserId);
  try {
    const snap = await getDoc(doc(db, 'e2eeKeys', targetUid));
    if (!snap.exists()) return { keys: [] };
    const d = snap.data();
    return {
      keys: [
        {
          deviceId: String(d.deviceId || ''),
          publicKeyJwk: String(d.publicKeyJwk || ''),
          updatedAt: toIsoString(d.updatedAt),
        },
      ],
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `e2eeKeys/${targetUid}`);
  }
}

// -----------------------------------------------------------------------------
// Directory & Contacts & Friend Requests
// -----------------------------------------------------------------------------
export async function searchDirectoryUsers(searchQuery: string): Promise<{ users: PublicUserSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const qClean = searchQuery.trim().replace(/^@+/, '').toLowerCase();
  try {
    const [usersSnap, contactsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users_public'), where('online', 'in', [true, false]), limit(100))),
      getDocs(query(collection(db, 'users_private', uid, 'contacts'), where('ownerUid', '==', uid))).catch(
        () => null
      ),
    ]);

    const contactMap = new Map<string, { isFavorite: boolean; isBlocked: boolean }>();
    if (contactsSnap) {
      for (const c of contactsSnap.docs) {
        const cd = c.data();
        contactMap.set(c.id, {
          isFavorite: Boolean(cd.isFavorite),
          isBlocked: Boolean(cd.isBlocked),
        });
      }
    }

    const list: PublicUserSummary[] = [];
    for (const d of usersSnap.docs) {
      if (d.id === uid) continue;
      const data = d.data();
      const username = String(data.username || '');
      const displayName = String(data.displayName || '');
      if (
        qClean &&
        !username.toLowerCase().includes(qClean) &&
        !displayName.toLowerCase().includes(qClean)
      ) {
        continue;
      }
      const rel = contactMap.get(d.id);
      list.push({
        id: registerDocNum(d.id),
        username,
        displayName,
        bio: String(data.bio || ''),
        statusText: String(data.statusText || ''),
        avatarUrl: String(data.avatarUrl || ''),
        online: Boolean(data.online),
        lastSeenAt: data.lastSeenAt ? String(data.lastSeenAt) : null,
        isContact: Boolean(rel),
        isFavorite: Boolean(rel?.isFavorite),
        isBlocked: Boolean(rel?.isBlocked),
        hasE2eeKey: Boolean(data.hasE2eeKey),
      });
    }
    return { users: list };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users_public');
  }
}

export async function updateContactRelationDoc(
  targetUserId: number,
  payload: { isBlocked?: boolean; isFavorite?: boolean }
): Promise<{ updated: boolean }> {
  const fbUser = requireCurrentUser();
  const targetUid = resolveDocId(targetUserId);
  const ref = doc(db, 'users_private', fbUser.uid, 'contacts', targetUid);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ownerUid: fbUser.uid,
        targetUid,
        isFavorite: Boolean(payload.isFavorite),
        isBlocked: Boolean(payload.isBlocked),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existing.data();
      await updateDoc(ref, {
        isFavorite: payload.isFavorite ?? Boolean(prev.isFavorite),
        isBlocked: payload.isBlocked ?? Boolean(prev.isBlocked),
        updatedAt: serverTimestamp(),
      });
    }
    return { updated: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users_private/${fbUser.uid}/contacts/${targetUid}`);
  }
}

export async function removeContactRelationDoc(targetUserId: number): Promise<{ removed: boolean }> {
  const fbUser = requireCurrentUser();
  const targetUid = resolveDocId(targetUserId);
  try {
    await deleteDoc(doc(db, 'users_private', fbUser.uid, 'contacts', targetUid));
    return { removed: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users_private/${fbUser.uid}/contacts/${targetUid}`);
  }
}

export async function fetchFriendsWorkspace(): Promise<{
  inviteToken: string;
  requests: FriendRequestItem[];
  recentContacts: PublicUserSummary[];
}> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const [privSnap, sentSnap, recvSnap] = await Promise.all([
      getDoc(doc(db, 'users_private', uid)).catch(() => null),
      getDocs(query(collection(db, 'friendRequests'), where('senderUid', '==', uid))),
      getDocs(query(collection(db, 'friendRequests'), where('receiverUid', '==', uid))),
    ]);

    const dirRes = await searchDirectoryUsers('').catch(() => ({ users: [] as PublicUserSummary[] }));

    const seen = new Set<string>();
    const requests: FriendRequestItem[] = [];
    for (const d of [...recvSnap.docs, ...sentSnap.docs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      requests.push({
        id: registerDocNum(d.id),
        senderId: registerDocNum(String(data.senderUid)),
        receiverId: registerDocNum(String(data.receiverUid)),
        senderUsername: String(data.senderUsername || ''),
        senderDisplayName: String(data.senderDisplayName || ''),
        senderAvatarUrl: String(data.senderAvatarUrl || ''),
        receiverUsername: String(data.receiverUsername || ''),
        receiverDisplayName: String(data.receiverDisplayName || ''),
        status: (data.status as FriendRequestItem['status']) || 'pending',
        createdAt: toIsoString(data.createdAt),
      });
    }

    return {
      inviteToken: String(privSnap?.data()?.inviteToken || `CHATLY-${uid.slice(0, 6).toUpperCase()}`),
      requests,
      recentContacts: dirRes.users.slice(0, 12),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'friendRequests');
  }
}

export async function sendFriendRequestDoc(payload: {
  targetUserId?: number;
  username?: string;
  inviteToken?: string;
  phoneNumber?: string;
}): Promise<{ request?: FriendRequestItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;

  let targetUid = payload.targetUserId ? resolveDocId(payload.targetUserId) : '';
  let targetData: Record<string, unknown> | null = null;

  if (targetUid) {
    const snap = await getDoc(doc(db, 'users_public', targetUid));
    if (snap.exists()) targetData = snap.data();
  } else if (payload.username?.trim()) {
    const clean = payload.username.trim().replace(/^@+/, '').toLowerCase();
    const snap = await getDocs(
      query(collection(db, 'users_public'), where('username', '==', clean), limit(1))
    );
    if (!snap.empty) {
      targetUid = snap.docs[0].id;
      targetData = snap.docs[0].data();
    }
  }

  if (!targetUid || !targetData || targetUid === uid) {
    throw new Error('Matching Chatly user not found.');
  }

  const myPubSnap = await getDoc(doc(db, 'users_public', uid));
  const myPub = myPubSnap.data() || {};

  const reqId = newFirestoreId('freq');
  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      id: reqId,
      senderUid: uid,
      receiverUid: targetUid,
      senderUsername: String(myPub.username || 'user'),
      senderDisplayName: String(myPub.displayName || fbUser.displayName || 'Chatly User'),
      senderAvatarUrl: String(myPub.avatarUrl || ''),
      receiverUsername: String(targetData.username || ''),
      receiverDisplayName: String(targetData.displayName || ''),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `friendRequests/${reqId}`);
  }

  return {
    request: {
      id: registerDocNum(reqId),
      senderId: registerDocNum(uid),
      receiverId: registerDocNum(targetUid),
      senderUsername: String(myPub.username || ''),
      senderDisplayName: String(myPub.displayName || ''),
      senderAvatarUrl: String(myPub.avatarUrl || ''),
      receiverUsername: String(targetData.username || ''),
      receiverDisplayName: String(targetData.displayName || ''),
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  };
}

export async function decideFriendRequestDoc(
  requestId: number,
  decision: 'accepted' | 'rejected'
): Promise<{ found: boolean; status: string }> {
  const fbUser = requireCurrentUser();
  const reqDocId = resolveDocId(requestId);
  const ref = doc(db, 'friendRequests', reqDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { found: false, status: 'missing' };
    const data = snap.data();
    await updateDoc(ref, {
      status: decision,
      updatedAt: serverTimestamp(),
    });
    if (decision === 'accepted' && data.senderUid) {
      await updateContactRelationDoc(registerDocNum(String(data.senderUid)), {
        isFavorite: false,
        isBlocked: false,
      });
    }
    return { found: true, status: decision };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friendRequests/${reqDocId}`);
  }
}

export async function fetchMutualGroupsDoc(targetUserId: number): Promise<{
  mutualGroups: MutualGroupSummary[];
}> {
  const fbUser = requireCurrentUser();
  const targetUid = resolveDocId(targetUserId);
  try {
    const snap = await getDocs(
      query(collection(db, 'conversations'), where('memberUids', 'array-contains', fbUser.uid))
    );
    const mutualGroups: MutualGroupSummary[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      const members = Array.isArray(data.memberUids) ? (data.memberUids as string[]) : [];
      if (data.type === 'group' && members.includes(targetUid)) {
        mutualGroups.push({
          id: registerDocNum(d.id),
          title: String(data.title || 'Group'),
          memberCount: members.length,
        });
      }
    }
    return { mutualGroups };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'conversations');
  }
}

// -----------------------------------------------------------------------------
// Conversations, Messages, Reactions & Meta
// -----------------------------------------------------------------------------
export async function listMyConversations(): Promise<{ conversations: ConversationSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const convSnap = await getDocs(
      query(collection(db, 'conversations'), where('memberUids', 'array-contains', uid))
    );

    const [metaSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, 'users_private', uid, 'conversationMeta'), where('uid', '==', uid))).catch(
        () => null
      ),
      getDocs(query(collection(db, 'users_public'), where('online', 'in', [true, false]), limit(100))).catch(() => null),
    ]);

    const userMap = new Map<string, PublicUserSummary>();
    if (usersSnap) {
      for (const u of usersSnap.docs) {
        const ud = u.data();
        userMap.set(u.id, {
          id: registerDocNum(u.id),
          username: String(ud.username || ''),
          displayName: String(ud.displayName || ''),
          bio: String(ud.bio || ''),
          statusText: String(ud.statusText || ''),
          avatarUrl: String(ud.avatarUrl || ''),
          online: Boolean(ud.online),
          lastSeenAt: ud.lastSeenAt ? String(ud.lastSeenAt) : null,
          hasE2eeKey: Boolean(ud.hasE2eeKey),
        });
      }
    }

    const metaMap = new Map<string, Record<string, unknown>>();
    if (metaSnap) {
      for (const m of metaSnap.docs) {
        metaMap.set(m.id, m.data());
      }
    }

    const conversations: ConversationSummary[] = convSnap.docs.map((d) => {
      const data = d.data();
      const memberUids = Array.isArray(data.memberUids) ? (data.memberUids as string[]) : [];
      const meta = metaMap.get(d.id) || {};
      const peerUid = memberUids.find((m) => m !== uid);
      const peer = data.type === 'direct' && peerUid ? userMap.get(peerUid) : undefined;
      return {
        id: registerDocNum(d.id),
        type: (data.type as 'direct' | 'group') || 'direct',
        title:
          data.type === 'direct' && peer
            ? peer.displayName
            : String(data.title || 'Conversation'),
        description: String(data.description || ''),
        folder: (meta.folder as SmartFolder) || 'all',
        customLabel: String(meta.customLabel || ''),
        pinned: Boolean(meta.pinned),
        needsFollowUp: Boolean(meta.needsFollowUp),
        archived: Boolean(meta.archived),
        snoozedUntil: meta.snoozedUntil ? String(meta.snoozedUntil) : null,
        draftBody: String(meta.draftBody || ''),
        unreadCount: 0,
        memberCount: memberUids.length,
        myRole: data.creatorUid === uid ? 'owner' : 'member',
        inviteCode: data.inviteCode ? String(data.inviteCode) : null,
        approvalRequired: Boolean(data.approvalRequired),
        announcementsOnly: Boolean(data.announcementsOnly),
        peer,
        lastMessagePreview: String(data.lastMessagePreview || ''),
        lastMessageAt: new Date(toMs(data.lastMessageAtMs)).toISOString(),
      };
    });

    conversations.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
    return { conversations };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'conversations');
  }
}

export async function openDirectConversationDoc(targetUserId: number): Promise<{
  conversationId: number;
  conversations: ConversationSummary[];
}> {
  const fbUser = requireCurrentUser();
  const myUid = fbUser.uid;
  const targetUid = resolveDocId(targetUserId);
  const convId = buildDirectConversationId(myUid, targetUid);
  const convRef = doc(db, 'conversations', convId);

  try {
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      const [myPubSnap, targetPubSnap] = await Promise.all([
        getDoc(doc(db, 'users_public', myUid)),
        getDoc(doc(db, 'users_public', targetUid)),
      ]);
      const myPub = myPubSnap.data() || {};
      const targetPub = targetPubSnap.data() || {};
      const memberUids = Array.from(new Set([myUid, targetUid]));
      await setDoc(convRef, {
        id: convId,
        type: 'direct',
        title: String(targetPub.displayName || 'Direct Chat').slice(0, 120),
        description: '',
        creatorUid: myUid,
        memberUids,
        inviteCode: '',
        approvalRequired: false,
        announcementsOnly: false,
        lastMessagePreview: '',
        lastMessageAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await Promise.all([
        setDoc(doc(db, 'conversations', convId, 'members', myUid), {
          uid: myUid,
          username: String(myPub.username || 'user'),
          displayName: String(myPub.displayName || 'User'),
          avatarUrl: String(myPub.avatarUrl || ''),
          role: 'owner',
          memberUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        ...(targetUid !== myUid
          ? [
              setDoc(doc(db, 'conversations', convId, 'members', targetUid), {
                uid: targetUid,
                username: String(targetPub.username || 'peer'),
                displayName: String(targetPub.displayName || 'Peer'),
                avatarUrl: String(targetPub.avatarUrl || ''),
                role: 'member',
                memberUids,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            ]
          : []),
      ]);
    }
    const list = await listMyConversations();
    return {
      conversationId: registerDocNum(convId),
      conversations: list.conversations,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}`);
  }
}

export async function updateConversationMetaDoc(
  conversationId: number,
  payload: {
    pinned?: boolean;
    needsFollowUp?: boolean;
    archived?: boolean;
    snoozedUntil?: string | null;
    customLabel?: string;
    folder?: string;
    draftBody?: string;
  }
): Promise<{ updated: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  const metaRef = doc(db, 'users_private', uid, 'conversationMeta', convDocId);

  try {
    const existing = await getDoc(metaRef);
    if (!existing.exists()) {
      await setDoc(metaRef, {
        uid,
        conversationId: convDocId,
        folder: (payload.folder as SmartFolder) || 'all',
        customLabel: String(payload.customLabel || '').slice(0, 40),
        pinned: Boolean(payload.pinned),
        needsFollowUp: Boolean(payload.needsFollowUp),
        archived: Boolean(payload.archived),
        snoozedUntil: payload.snoozedUntil ? String(payload.snoozedUntil).slice(0, 64) : '',
        draftBody: String(payload.draftBody || '').slice(0, 4000),
        lastReadAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existing.data();
      await updateDoc(metaRef, {
        folder: payload.folder ?? prev.folder ?? 'all',
        customLabel: (payload.customLabel ?? prev.customLabel ?? '').slice(0, 40),
        pinned: payload.pinned ?? Boolean(prev.pinned),
        needsFollowUp: payload.needsFollowUp ?? Boolean(prev.needsFollowUp),
        archived: payload.archived ?? Boolean(prev.archived),
        snoozedUntil:
          payload.snoozedUntil !== undefined
            ? String(payload.snoozedUntil || '').slice(0, 64)
            : String(prev.snoozedUntil || ''),
        draftBody:
          payload.draftBody !== undefined
            ? payload.draftBody.slice(0, 4000)
            : String(prev.draftBody || ''),
        lastReadAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    }
    return { updated: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users_private/${uid}/conversationMeta/${convDocId}`);
  }
}

export function mapMessageDoc(
  docId: string,
  convDocId: string,
  data: Record<string, unknown>,
  myUid: string
): ChatMessage {
  msgToConvMap.set(docId, convDocId);
  const numId = registerDocNum(docId);
  const convNumId = registerDocNum(convDocId);

  let attachment: MediaAttachmentMeta | null = null;
  if (typeof data.attachmentJson === 'string' && data.attachmentJson.trim()) {
    try {
      attachment = JSON.parse(data.attachmentJson) as MediaAttachmentMeta;
    } catch {
      attachment = null;
    }
  }

  let sticker: VoiceStickerItem | null = null;
  if (typeof data.stickerJson === 'string' && data.stickerJson.trim()) {
    try {
      sticker = JSON.parse(data.stickerJson) as VoiceStickerItem;
    } catch {
      sticker = null;
    }
  }

  let replyPreview: ChatMessage['replyPreview'] = null;
  if (typeof data.replyPreviewJson === 'string' && data.replyPreviewJson.trim()) {
    try {
      replyPreview = JSON.parse(data.replyPreviewJson) as ChatMessage['replyPreview'];
    } catch {
      replyPreview = null;
    }
  }

  const starredByUids = Array.isArray(data.starredByUids) ? (data.starredByUids as string[]) : [];
  const readByUids = Array.isArray(data.readByUids) ? (data.readByUids as string[]) : [];
  const scheduled = data.scheduledAt ? String(data.scheduledAt) : null;
  const timestampMs = data.createdAt ? toMs(data.createdAt) : toMs(data.createdAtMs);

  return {
    id: numId,
    clientMessageId: String(data.clientMessageId || docId),
    conversationId: convNumId,
    senderId: registerDocNum(String(data.senderUid || '')),
    senderUsername: String(data.senderUsername || 'user'),
    senderDisplayName: String(data.senderDisplayName || 'Chatly User'),
    type: (data.type as ChatMessage['type']) || 'text',
    body: String(data.body || ''),
    e2eeEnvelope: data.e2eeEnvelope ? String(data.e2eeEnvelope) : null,
    attachment,
    sticker,
    replyToId: data.replyToId ? registerDocNum(String(data.replyToId)) : null,
    replyPreview,
    forwardedFromId: data.forwardedFromId ? registerDocNum(String(data.forwardedFromId)) : null,
    pinned: Boolean(data.pinned),
    starred: starredByUids.includes(myUid),
    scheduledAt: scheduled,
    scheduledFor: scheduled,
    deliveredAt: data.createdAt ? toIsoString(data.createdAt) : null,
    readAt: readByUids.some((u) => u !== String(data.senderUid)) ? toIsoString(data.updatedAt) : null,
    editedAt: data.edited ? toIsoString(data.updatedAt) : null,
    deletedAt: data.deleted ? toIsoString(data.updatedAt) : null,
    reactions: formatReactions(data.reactions, myUid),
    createdAt: new Date(timestampMs).toISOString(),
  };
}

export async function fetchConversationMessages(
  conversationId: number,
  opts: { beforeId?: number; search?: string } = {}
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  try {
    const snap = await getDocs(
      query(
        collection(db, 'conversations', convDocId, 'messages'),
        where('memberUids', 'array-contains', uid)
      )
    );
    let messages = sortAndDedupeMessages(
      snap.docs.map((d) =>
        mapMessageDoc(d.id, convDocId, d.data({ serverTimestamps: 'estimate' }), uid)
      )
    );

    if (opts.search?.trim()) {
      const q = opts.search.trim().toLowerCase();
      messages = messages.filter((m) => m.body.toLowerCase().includes(q));
    }
    return { messages, hasMore: false };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `conversations/${convDocId}/messages`);
  }
}

export async function sendConversationMessage(
  conversationId: number,
  payload: {
    clientMessageId: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice_sticker';
    body: string;
    e2eeEnvelope?: string | null;
    attachmentId?: string | null;
    stickerId?: number | null;
    replyToId?: number | null;
    forwardedFromId?: number | null;
    scheduledAt?: string | null;
    scheduledFor?: string | null;
  }
): Promise<{ message: ChatMessage }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  const convRef = doc(db, 'conversations', convDocId);

  try {
    const [convSnap, myPubSnap] = await Promise.all([
      getDoc(convRef),
      getDoc(doc(db, 'users_public', uid)),
    ]);
    if (!convSnap.exists()) {
      throw new Error('Conversation not found.');
    }
    const convData = convSnap.data();
    const memberUids = Array.isArray(convData.memberUids)
      ? (convData.memberUids as string[])
      : [uid];
    const myPub = myPubSnap.data() || {};

    let attachmentJson = '';
    if (payload.attachmentId) {
      const mediaSnap = await getDoc(doc(db, 'media', payload.attachmentId));
      if (mediaSnap.exists()) {
        const md = mediaSnap.data();
        const meta: MediaAttachmentMeta = {
          id: mediaSnap.id,
          kind: (md.kind as MediaAttachmentMeta['kind']) || 'document',
          fileName: String(md.fileName || 'file'),
          mimeType: String(md.mimeType || 'application/octet-stream'),
          sizeBytes: Number(md.sizeBytes || 0),
          url: String(md.dataUrl || ''),
          durationMs: Number(md.durationMs || 0),
        };
        attachmentJson = JSON.stringify(meta).slice(0, 845000);
      }
    }

    let stickerJson = '';
    if (payload.stickerId) {
      const stickerDocId = resolveDocId(payload.stickerId);
      const packDocId = stickerToPackMap.get(stickerDocId);
      if (packDocId) {
        const sSnap = await getDoc(doc(db, 'stickerPacks', packDocId, 'stickers', stickerDocId));
        if (sSnap.exists()) {
          const item = mapVoiceStickerDoc(sSnap.id, packDocId, sSnap.data(), uid);
          stickerJson = JSON.stringify(item).slice(0, 198000);
        }
      }
    }

    let replyToDocId = '';
    let replyPreviewJson = '';
    if (payload.replyToId) {
      replyToDocId = resolveDocId(payload.replyToId);
      const rSnap = await getDoc(doc(db, 'conversations', convDocId, 'messages', replyToDocId));
      if (rSnap.exists()) {
        const rd = rSnap.data();
        replyPreviewJson = JSON.stringify({
          id: payload.replyToId,
          senderDisplayName: String(rd.senderDisplayName || ''),
          body: String(rd.body || '').slice(0, 140),
        }).slice(0, 2400);
      }
    }

    const msgId = newFirestoreId('msg');
    const createdAtMs = Date.now();
    const effectiveSchedule = String(payload.scheduledAt ?? payload.scheduledFor ?? '').slice(0, 64);

    const msgDoc = {
      id: msgId,
      clientMessageId: payload.clientMessageId.slice(0, 128),
      conversationId: convDocId,
      senderUid: uid,
      senderUsername: String(myPub.username || 'user').slice(0, 40),
      senderDisplayName: String(myPub.displayName || fbUser.displayName || 'Chatly User').slice(0, 80),
      senderAvatarUrl: String(myPub.avatarUrl || '').slice(0, 99000),
      type: payload.type || 'text',
      body: payload.body.slice(0, 8000),
      e2eeEnvelope: payload.e2eeEnvelope ? payload.e2eeEnvelope.slice(0, 32000) : '',
      attachmentJson,
      stickerJson,
      replyToId: replyToDocId,
      replyPreviewJson,
      forwardedFromId: payload.forwardedFromId ? resolveDocId(payload.forwardedFromId) : '',
      pinned: false,
      deleted: false,
      edited: false,
      scheduledAt: effectiveSchedule,
      createdAtMs,
      memberUids,
      reactions: [],
      starredByUids: [],
      readByUids: [uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'conversations', convDocId, 'messages', msgId), msgDoc);

    const isFutureScheduled = Boolean(
      effectiveSchedule && Date.parse(effectiveSchedule) > Date.now()
    );
    if (!isFutureScheduled) {
      await updateDoc(convRef, {
        lastMessagePreview: (payload.body || `[${payload.type || 'media'}]`).slice(0, 500),
        lastMessageAtMs: createdAtMs,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      message: mapMessageDoc(msgId, convDocId, { ...msgDoc, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }, uid),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convDocId}/messages`);
  }
}

export async function mutateConversationMessage(
  messageId: number,
  payload: { action: 'edit' | 'delete' | 'pin' | 'star'; body?: string }
): Promise<{ message: ChatMessage }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const msgDocId = resolveDocId(messageId);
  const convDocId = msgToConvMap.get(msgDocId);
  if (!convDocId) {
    throw new Error('Conversation reference for message was not found.');
  }
  const ref = doc(db, 'conversations', convDocId, 'messages', msgDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Message not found.');
    const existing = snap.data();

    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (payload.action === 'edit' && payload.body !== undefined) {
      patch.body = payload.body.slice(0, 8000);
      patch.edited = true;
    } else if (payload.action === 'delete') {
      patch.body = '';
      patch.deleted = true;
    } else if (payload.action === 'pin') {
      patch.pinned = !Boolean(existing.pinned);
    } else if (payload.action === 'star') {
      const prev = Array.isArray(existing.starredByUids) ? (existing.starredByUids as string[]) : [];
      patch.starredByUids = prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid];
    }
    await updateDoc(ref, patch);
    const updatedSnap = await getDoc(ref);
    return {
      message: mapMessageDoc(msgDocId, convDocId, updatedSnap.data() || existing, uid),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/messages/${msgDocId}`);
  }
}

export async function toggleMessageReactionDoc(
  messageId: number,
  emoji: string
): Promise<{ reactions: ReactionSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const msgDocId = resolveDocId(messageId);
  const convDocId = msgToConvMap.get(msgDocId);
  if (!convDocId) {
    throw new Error('Conversation reference for reaction was not found.');
  }
  const ref = doc(db, 'conversations', convDocId, 'messages', msgDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Message not found.');
    const existing = snap.data();
    const list: { emoji: string; userUids: string[] }[] = Array.isArray(existing.reactions)
      ? existing.reactions.map((r: { emoji?: string; userUids?: string[] }) => ({
          emoji: String(r.emoji || ''),
          userUids: Array.isArray(r.userUids) ? [...r.userUids] : [],
        }))
      : [];

    const idx = list.findIndex((r) => r.emoji === emoji);
    if (idx === -1) {
      list.push({ emoji, userUids: [uid] });
    } else {
      const hasMe = list[idx].userUids.includes(uid);
      list[idx].userUids = hasMe
        ? list[idx].userUids.filter((u) => u !== uid)
        : [...list[idx].userUids, uid];
      if (list[idx].userUids.length === 0) {
        list.splice(idx, 1);
      }
    }

    await updateDoc(ref, {
      reactions: list.slice(0, 40),
      updatedAt: serverTimestamp(),
    });

    return { reactions: formatReactions(list, uid) };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/messages/${msgDocId}`);
  }
}

export async function publishTypingState(conversationId: number, isTyping: boolean): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) return;
  const convDocId = resolveDocId(conversationId);
  try {
    const convSnap = await getDoc(doc(db, 'conversations', convDocId));
    const memberUids = Array.isArray(convSnap.data()?.memberUids)
      ? (convSnap.data()?.memberUids as string[])
      : [fbUser.uid];
    await setDoc(doc(db, 'conversations', convDocId, 'typing', fbUser.uid), {
      uid: fbUser.uid,
      isTyping,
      memberUids,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal typing indicator
  }
}

// -----------------------------------------------------------------------------
// Media Upload & Library (Firestore Embedded Compressed DataURL <= 850KB)
// -----------------------------------------------------------------------------
export async function uploadMediaToFirestore(
  params: {
    file: Blob;
    fileName: string;
    mimeType: string;
    kind: 'image' | 'video' | 'audio' | 'document';
    conversationId?: number | null;
    durationMs?: number;
  },
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<MediaAttachmentMeta> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  if (params.file.size === 0) throw new Error('Selected media file is empty.');
  if (signal?.aborted) throw new Error('Upload cancelled.');

  onProgress?.(20);
  const normalizedMime = inferMediaMimeType(params.fileName, params.mimeType);

  let dataUrl = '';
  let finalMime = normalizedMime;
  let finalSize = params.file.size;

  if (params.kind === 'image') {
    const compressed = await compressImageBlobToDataUrl(params.file, normalizedMime, 340_000);
    dataUrl = compressed.dataUrl;
    finalMime = compressed.mimeType;
    finalSize = compressed.sizeBytes;
  } else {
    dataUrl = await blobToDataUrl(params.file);
  }
  if (!dataUrl || dataUrl.length > 840_000 || finalSize > 680_000) {
    throw new Error(
      'File exceeds Firestore 680 KB inline limit. Please select a smaller clip or image.'
    );
  }

  if (signal?.aborted) throw new Error('Upload cancelled.');
  onProgress?.(60);

  let convDocId = '';
  let allowedUids = [uid];
  if (params.conversationId) {
    convDocId = resolveDocId(params.conversationId);
    try {
      const cSnap = await getDoc(doc(db, 'conversations', convDocId));
      if (cSnap.exists() && Array.isArray(cSnap.data().memberUids)) {
        allowedUids = cSnap.data().memberUids as string[];
      }
    } catch {
      // keep self
    }
  }

  const mediaId = newFirestoreId('med');
  mediaDataUrlCache.set(mediaId, { dataUrl, mimeType: finalMime, sizeBytes: finalSize });

  try {
    await setDoc(doc(db, 'media', mediaId), {
      id: mediaId,
      uploaderUid: uid,
      conversationId: convDocId,
      allowedUids,
      kind: params.kind,
      fileName: params.fileName.slice(0, 200),
      mimeType: finalMime.slice(0, 120),
      sizeBytes: Math.max(1, Math.min(700000, Math.round(finalSize))),
      durationMs: Math.max(0, Math.round(params.durationMs ?? 0)),
      dataUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `media/${mediaId}`);
  }

  onProgress?.(100);
  return {
    id: mediaId,
    kind: params.kind,
    fileName: params.fileName,
    mimeType: finalMime,
    sizeBytes: finalSize,
    url: dataUrl,
    durationMs: params.durationMs ?? 0,
  };
}

export async function fetchMediaLibraryDocs(): Promise<{ items: MediaInventoryItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'media'), where('uploaderUid', '==', uid), limit(100))
    );
    const items: MediaInventoryItem[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          kind: (data.kind as MediaAttachmentMeta['kind']) || 'document',
          fileName: String(data.fileName || 'file'),
          mimeType: String(data.mimeType || 'application/octet-stream'),
          sizeBytes: Number(data.sizeBytes || 0),
          url: String(data.dataUrl || ''),
          durationMs: Number(data.durationMs || 0),
          conversationId: data.conversationId ? registerDocNum(String(data.conversationId)) : null,
          uploaderId: registerDocNum(String(data.uploaderUid || uid)),
          createdAt: toIsoString(data.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { items };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'media');
  }
}

// -----------------------------------------------------------------------------
// Voice Stickers & Packs
// -----------------------------------------------------------------------------
function mapVoiceStickerDoc(
  docId: string,
  packDocId: string,
  data: Record<string, unknown>,
  uid: string
): VoiceStickerItem {
  stickerToPackMap.set(docId, packDocId);
  const favs = getFavoriteStickerSet(uid);
  return {
    id: registerDocNum(docId),
    packId: registerDocNum(packDocId),
    creatorId: registerDocNum(String(data.creatorUid || uid)),
    name: String(data.name || 'Sticker'),
    nameAr: String(data.nameAr || ''),
    category: String(data.category || 'custom'),
    kind: (data.kind as VoiceStickerItem['kind']) || 'voice_animated',
    visualPreset: (data.visualPreset as StickerVisualPreset) || 'pulse_ring',
    visualUrl: data.visualUrl ? String(data.visualUrl) : null,
    visualMimeType: data.visualMimeType ? String(data.visualMimeType) : null,
    audioUrl: data.audioUrl ? String(data.audioUrl) : null,
    audioDurationMs: Number(data.audioDurationMs || 0),
    trimStartMs: Number(data.trimStartMs || 0),
    trimEndMs: Number(data.trimEndMs || 0),
    syncOffsetMs: Number(data.syncOffsetMs || 0),
    defaultVolume: Number(data.defaultVolume ?? 100),
    usageCount: 0,
    isFavorite: favs.has(docId),
    toneHz: [440, 554.37, 659.25],
    createdAt: toIsoString(data.createdAt),
  };
}

export async function fetchStickerPacksDocs(search = ''): Promise<{ packs: StickerPackItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const qLower = search.trim().toLowerCase();

  try {
    const [pubPacks, myPacks] = await Promise.all([
      getDocs(query(collection(db, 'stickerPacks'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'stickerPacks'), where('creatorUid', '==', uid))),
    ]);

    const packMap = new Map<string, Record<string, unknown>>();
    for (const d of [...pubPacks.docs, ...myPacks.docs]) {
      packMap.set(d.id, d.data());
    }

    const packs: StickerPackItem[] = [];
    for (const [packDocId, pData] of packMap.entries()) {
      const [pubStickers, myStickers] = await Promise.all([
        getDocs(query(collection(db, 'stickerPacks', packDocId, 'stickers'), where('isPublic', '==', true))),
        getDocs(query(collection(db, 'stickerPacks', packDocId, 'stickers'), where('creatorUid', '==', uid))),
      ]);
      const stickerMap = new Map<string, VoiceStickerItem>();
      for (const sd of [...pubStickers.docs, ...myStickers.docs]) {
        const mapped = mapVoiceStickerDoc(sd.id, packDocId, sd.data(), uid);
        if (
          !qLower ||
          mapped.name.toLowerCase().includes(qLower) ||
          mapped.nameAr.toLowerCase().includes(qLower) ||
          mapped.category.toLowerCase().includes(qLower)
        ) {
          stickerMap.set(sd.id, mapped);
        }
      }
      packs.push({
        id: registerDocNum(packDocId),
        creatorId: registerDocNum(String(pData.creatorUid || uid)),
        title: String(pData.title || 'Sticker Pack'),
        titleAr: String(pData.titleAr || ''),
        category: String(pData.category || 'custom'),
        shareCode: String(pData.shareCode || ''),
        isPublic: Boolean(pData.isPublic),
        stickers: Array.from(stickerMap.values()),
      });
    }

    return { packs };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'stickerPacks');
  }
}

export async function createStickerPackDoc(payload: {
  title: string;
  titleAr?: string;
  category?: string;
  isPublic?: boolean;
}): Promise<{ pack: StickerPackItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const packId = newFirestoreId('pack');
  const shareCode = `CHATLY-${packId.slice(-5).toUpperCase()}`;

  const cleanTitle = payload.title.trim().slice(0, 80);
  if (!cleanTitle) {
    throw new Error('Sticker pack title cannot be empty.');
  }

  try {
    await setDoc(doc(db, 'stickerPacks', packId), {
      id: packId,
      creatorUid: uid,
      title: cleanTitle,
      titleAr: (payload.titleAr || '').trim().slice(0, 80),
      category: (payload.category || 'custom').trim().slice(0, 40),
      shareCode,
      isPublic: payload.isPublic ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `stickerPacks/${packId}`);
  }

  return {
    pack: {
      id: registerDocNum(packId),
      creatorId: registerDocNum(uid),
      title: payload.title.trim(),
      titleAr: payload.titleAr || '',
      category: payload.category || 'custom',
      shareCode,
      isPublic: payload.isPublic ?? true,
      stickers: [],
    },
  };
}

async function resolveMediaUrlForSticker(mediaId: string | null | undefined): Promise<{
  url: string;
  mimeType: string;
}> {
  if (!mediaId) return { url: '', mimeType: '' };
  const cached = mediaDataUrlCache.get(mediaId);
  if (cached) return { url: cached.dataUrl.slice(0, 445000), mimeType: cached.mimeType };
  try {
    const snap = await getDoc(doc(db, 'media', mediaId));
    if (snap.exists()) {
      const d = snap.data();
      return {
        url: String(d.dataUrl || '').slice(0, 445000),
        mimeType: String(d.mimeType || ''),
      };
    }
  } catch {
    // ignore
  }
  return { url: '', mimeType: '' };
}

export async function createVoiceStickerDoc(payload: {
  packId?: number | null;
  name: string;
  nameAr?: string;
  category?: string;
  kind: 'static' | 'animated' | 'voice_animated';
  visualPreset: StickerVisualPreset;
  visualMediaId?: string | null;
  audioMediaId?: string | null;
  audioDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  syncOffsetMs: number;
  defaultVolume: number;
}): Promise<{ sticker: VoiceStickerItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;

  let packDocId = payload.packId ? resolveDocId(payload.packId) : '';
  if (!packDocId) {
    const existing = await fetchStickerPacksDocs();
    if (existing.packs.length > 0) {
      packDocId = resolveDocId(existing.packs[0].id);
    } else {
      const createdPack = await createStickerPackDoc({
        title: 'My Voice Stickers',
        titleAr: 'ملصقاتي الصوتية',
        isPublic: true,
      });
      packDocId = resolveDocId(createdPack.pack.id);
    }
  }

  const [visualAsset, audioAsset] = await Promise.all([
    resolveMediaUrlForSticker(payload.visualMediaId),
    resolveMediaUrlForSticker(payload.audioMediaId),
  ]);

  const cleanName = payload.name.trim().slice(0, 80);
  if (!cleanName) {
    throw new Error('Sticker name cannot be empty.');
  }

  const stickerId = newFirestoreId('stk');
  const docBody = {
    id: stickerId,
    packId: packDocId,
    creatorUid: uid,
    name: cleanName,
    nameAr: (payload.nameAr || '').trim().slice(0, 80),
    category: (payload.category || 'custom').trim().slice(0, 40),
    kind: payload.kind,
    visualPreset: payload.visualPreset,
    visualUrl: visualAsset.url,
    visualMimeType: visualAsset.mimeType.slice(0, 120),
    audioUrl: audioAsset.url,
    audioDurationMs: Math.max(0, Math.round(payload.audioDurationMs || 0)),
    trimStartMs: Math.max(0, Math.round(payload.trimStartMs || 0)),
    trimEndMs: Math.max(0, Math.round(payload.trimEndMs || 0)),
    syncOffsetMs: Math.round(payload.syncOffsetMs || 0),
    defaultVolume: Math.max(0, Math.min(100, Math.round(payload.defaultVolume ?? 100))),
    isPublic: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'stickerPacks', packDocId, 'stickers', stickerId), docBody);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `stickerPacks/${packDocId}/stickers/${stickerId}`);
  }

  return {
    sticker: mapVoiceStickerDoc(stickerId, packDocId, docBody, uid),
  };
}

export async function updateVoiceStickerDoc(
  stickerId: number,
  payload: {
    packId?: number;
    name?: string;
    nameAr?: string;
    category?: string;
    kind?: 'static' | 'animated' | 'voice_animated';
    visualPreset?: StickerVisualPreset;
    visualMediaId?: string | null;
    audioMediaId?: string | null;
    audioDurationMs?: number;
    trimStartMs?: number;
    trimEndMs?: number;
    syncOffsetMs?: number;
    defaultVolume?: number;
  }
): Promise<{ sticker: VoiceStickerItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const stickerDocId = resolveDocId(stickerId);
  const packDocId =
    stickerToPackMap.get(stickerDocId) || (payload.packId ? resolveDocId(payload.packId) : '');
  if (!packDocId) throw new Error('Sticker pack reference not found.');

  const ref = doc(db, 'stickerPacks', packDocId, 'stickers', stickerDocId);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (payload.name !== undefined) {
    const trimmedName = payload.name.trim().slice(0, 80);
    if (!trimmedName) throw new Error('Sticker name cannot be empty.');
    patch.name = trimmedName;
  }
  if (payload.nameAr !== undefined) patch.nameAr = payload.nameAr.trim().slice(0, 80);
  if (payload.category !== undefined) patch.category = payload.category.trim().slice(0, 40);
  if (payload.kind !== undefined) patch.kind = payload.kind;
  if (payload.visualPreset !== undefined) patch.visualPreset = payload.visualPreset;
  if (payload.audioDurationMs !== undefined) patch.audioDurationMs = payload.audioDurationMs;
  if (payload.trimStartMs !== undefined) patch.trimStartMs = payload.trimStartMs;
  if (payload.trimEndMs !== undefined) patch.trimEndMs = payload.trimEndMs;
  if (payload.syncOffsetMs !== undefined) patch.syncOffsetMs = payload.syncOffsetMs;
  if (payload.defaultVolume !== undefined) patch.defaultVolume = payload.defaultVolume;

  if (payload.visualMediaId) {
    const v = await resolveMediaUrlForSticker(payload.visualMediaId);
    patch.visualUrl = v.url;
    patch.visualMimeType = v.mimeType.slice(0, 120);
  }
  if (payload.audioMediaId) {
    const a = await resolveMediaUrlForSticker(payload.audioMediaId);
    patch.audioUrl = a.url;
  }

  try {
    await updateDoc(ref, patch);
    const snap = await getDoc(ref);
    return {
      sticker: mapVoiceStickerDoc(stickerDocId, packDocId, snap.data() || {}, uid),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stickerPacks/${packDocId}/stickers/${stickerDocId}`);
  }
}

export async function deleteVoiceStickerDoc(stickerId: number): Promise<{ deleted: boolean; id: number }> {
  requireCurrentUser();
  const stickerDocId = resolveDocId(stickerId);
  const packDocId = stickerToPackMap.get(stickerDocId);
  if (!packDocId) throw new Error('Sticker pack reference not found.');
  try {
    await deleteDoc(doc(db, 'stickerPacks', packDocId, 'stickers', stickerDocId));
    return { deleted: true, id: stickerId };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `stickerPacks/${packDocId}/stickers/${stickerDocId}`);
  }
}

export async function importStickerPackByCodeDoc(shareCode: string): Promise<{
  imported: boolean;
  packId: number;
  packs: StickerPackItem[];
}> {
  requireCurrentUser();
  const clean = shareCode.trim().toUpperCase();
  const res = await fetchStickerPacksDocs();
  const matched = res.packs.find((p) => p.shareCode.toUpperCase() === clean);
  if (!matched) {
    throw new Error('Sticker pack share code not found.');
  }
  return { imported: true, packId: matched.id, packs: res.packs };
}

export async function toggleFavoriteStickerLocal(stickerId: number): Promise<{ isFavorite: boolean }> {
  const fbUser = requireCurrentUser();
  const docId = resolveDocId(stickerId);
  const favs = getFavoriteStickerSet(fbUser.uid);
  const next = !favs.has(docId);
  if (next) favs.add(docId);
  else favs.delete(docId);
  saveFavoriteStickerSet(fbUser.uid, favs);
  return { isFavorite: next };
}

// -----------------------------------------------------------------------------
// Groups, Polls, Events, Tasks
// -----------------------------------------------------------------------------
export async function createGroupDoc(payload: {
  title: string;
  description?: string;
  approvalRequired?: boolean;
  announcementsOnly?: boolean;
  memberIds?: number[];
}): Promise<{ group: ConversationSummary; conversations: ConversationSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convId = newFirestoreId('grp');
  const memberUids = Array.from(
    new Set([uid, ...(payload.memberIds || []).map((id) => resolveDocId(id))])
  ).slice(0, 100);
  const inviteCode = `CHATLY-${convId.slice(-5).toUpperCase()}`;

  const cleanTitle = payload.title.trim().slice(0, 120);
  if (!cleanTitle) {
    throw new Error('Group title cannot be empty.');
  }

  try {
    await setDoc(doc(db, 'conversations', convId), {
      id: convId,
      type: 'group',
      title: cleanTitle,
      description: (payload.description || '').trim().slice(0, 500),
      creatorUid: uid,
      memberUids,
      inviteCode,
      approvalRequired: Boolean(payload.approvalRequired),
      announcementsOnly: Boolean(payload.announcementsOnly),
      lastMessagePreview: '',
      lastMessageAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const userSnaps = await Promise.all(
      memberUids.map((mUid) => getDoc(doc(db, 'users_public', mUid)))
    );
    await Promise.all(
      userSnaps.map((us, i) => {
        const mUid = memberUids[i];
        const ud = us.data() || {};
        return setDoc(doc(db, 'conversations', convId, 'members', mUid), {
          uid: mUid,
          username: String(ud.username || 'member').slice(0, 40),
          displayName: String(ud.displayName || 'Chatly Member').slice(0, 80),
          avatarUrl: String(ud.avatarUrl || '').slice(0, 99000),
          role: mUid === uid ? 'owner' : 'member',
          memberUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      })
    );

    const list = await listMyConversations();
    const numId = registerDocNum(convId);
    const group = list.conversations.find((c) => c.id === numId) || {
      id: numId,
      type: 'group',
      title: payload.title.trim(),
      description: payload.description || '',
      folder: 'all',
      pinned: false,
      needsFollowUp: false,
      unreadCount: 0,
      memberCount: memberUids.length,
      myRole: 'owner',
      inviteCode,
      lastMessagePreview: '',
      lastMessageAt: new Date().toISOString(),
    };
    return { group, conversations: list.conversations };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convId}`);
  }
}

export async function joinGroupByInviteDoc(inviteCode: string): Promise<{
  found: boolean;
  joined?: boolean;
  pendingApproval?: boolean;
  conversationId?: number;
}> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { found: false };
  }
  try {
    const snap = await getDocs(
      query(
        collection(db, 'conversations'),
        where('type', '==', 'group'),
        where('inviteCode', '==', cleanCode),
        limit(1)
      )
    );
    if (snap.empty) return { found: false };
    const convDoc = snap.docs[0];
    const data = convDoc.data();
    const memberUids = Array.isArray(data.memberUids) ? (data.memberUids as string[]) : [];
    if (!memberUids.includes(uid)) {
      if (Boolean(data.approvalRequired)) {
        return {
          found: true,
          joined: false,
          pendingApproval: true,
          conversationId: registerDocNum(convDoc.id),
        };
      }
      const nextMembers = [...memberUids, uid].slice(0, 100);
      await updateDoc(convDoc.ref, {
        memberUids: nextMembers,
        updatedAt: serverTimestamp(),
      });
      const myPub = (await getDoc(doc(db, 'users_public', uid))).data() || {};
      await setDoc(doc(db, 'conversations', convDoc.id, 'members', uid), {
        uid,
        username: String(myPub.username || 'user'),
        displayName: String(myPub.displayName || 'Chatly User'),
        avatarUrl: String(myPub.avatarUrl || ''),
        role: 'member',
        memberUids: nextMembers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { found: true, joined: true, conversationId: registerDocNum(convDoc.id) };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'conversations');
  }
}

export async function fetchGroupDetailsDoc(conversationId: number): Promise<{
  members: GroupMemberItem[];
  joinRequests: GroupJoinRequestItem[];
  polls: GroupPollItem[];
  events: GroupEventItem[];
  tasks: GroupTaskItem[];
  mediaGallery: MediaAttachmentMeta[];
}> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  try {
    const [membersSnap, pollsSnap, eventsSnap, tasksSnap, mediaSnap] = await Promise.all([
      getDocs(query(collection(db, 'conversations', convDocId, 'members'), where('memberUids', 'array-contains', uid))),
      getDocs(query(collection(db, 'conversations', convDocId, 'polls'), where('memberUids', 'array-contains', uid))),
      getDocs(query(collection(db, 'conversations', convDocId, 'events'), where('memberUids', 'array-contains', uid))),
      getDocs(query(collection(db, 'conversations', convDocId, 'tasks'), where('memberUids', 'array-contains', uid))),
      getDocs(query(collection(db, 'media'), where('allowedUids', 'array-contains', uid))),
    ]);

    const members: GroupMemberItem[] = membersSnap.docs.map((d) => {
      const md = d.data();
      return {
        userId: registerDocNum(d.id),
        username: String(md.username || ''),
        displayName: String(md.displayName || ''),
        avatarUrl: String(md.avatarUrl || ''),
        role: (md.role as GroupMemberItem['role']) || 'member',
      };
    });

    const polls: GroupPollItem[] = pollsSnap.docs.map((d) => {
      pollToConvMap.set(d.id, convDocId);
      const pd = d.data();
      const opts = Array.isArray(pd.options) ? pd.options : [];
      return {
        id: registerDocNum(d.id),
        conversationId,
        question: String(pd.question || ''),
        options: opts.map((o: { index?: number; label?: string; voterUids?: string[] }, idx: number) => {
          const voters = Array.isArray(o.voterUids) ? o.voterUids : [];
          return {
            index: Number(o.index ?? idx),
            label: String(o.label || ''),
            votes: voters.length,
            votedByMe: voters.includes(uid),
          };
        }),
        closed: Boolean(pd.closed),
        createdAt: toIsoString(pd.createdAt),
      };
    });

    const events: GroupEventItem[] = eventsSnap.docs.map((d) => {
      const ed = d.data();
      return {
        id: registerDocNum(d.id),
        conversationId,
        title: String(ed.title || ''),
        description: String(ed.description || ''),
        location: String(ed.location || ''),
        startsAt: String(ed.startsAt || ''),
      };
    });

    const tasks: GroupTaskItem[] = tasksSnap.docs.map((d) => {
      taskToConvMap.set(d.id, convDocId);
      const td = d.data();
      return {
        id: registerDocNum(d.id),
        conversationId,
        title: String(td.title || ''),
        completed: Boolean(td.completed),
      };
    });

    const mediaGallery: MediaAttachmentMeta[] = mediaSnap.docs
      .filter((d) => d.data().conversationId === convDocId)
      .map((d) => {
        const md = d.data();
        return {
          id: d.id,
          kind: (md.kind as MediaAttachmentMeta['kind']) || 'image',
          fileName: String(md.fileName || ''),
          mimeType: String(md.mimeType || ''),
          sizeBytes: Number(md.sizeBytes || 0),
          url: String(md.dataUrl || ''),
          durationMs: Number(md.durationMs || 0),
        };
      });

    return { members, joinRequests: [], polls, events, tasks, mediaGallery };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `conversations/${convDocId}`);
  }
}

export async function createGroupPollDoc(
  conversationId: number,
  payload: { question: string; options: string[] }
): Promise<{ poll: GroupPollItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  const convSnap = await getDoc(doc(db, 'conversations', convDocId));
  const memberUids = Array.isArray(convSnap.data()?.memberUids)
    ? (convSnap.data()?.memberUids as string[])
    : [uid];
  const cleanQuestion = payload.question.trim().slice(0, 300);
  if (!cleanQuestion) {
    throw new Error('Poll question cannot be empty.');
  }
  const cleanLabels = payload.options
    .map((label) => label.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 10);
  if (cleanLabels.length < 2) {
    throw new Error('Polls must include at least two non-empty options.');
  }

  const pollId = newFirestoreId('poll');
  pollToConvMap.set(pollId, convDocId);
  const options = cleanLabels.map((label, index) => ({
    index,
    label,
    voterUids: [] as string[],
  }));

  try {
    await setDoc(doc(db, 'conversations', convDocId, 'polls', pollId), {
      id: pollId,
      conversationId: convDocId,
      creatorUid: uid,
      question: cleanQuestion,
      options,
      closed: false,
      memberUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convDocId}/polls/${pollId}`);
  }

  return {
    poll: {
      id: registerDocNum(pollId),
      conversationId,
      question: payload.question.trim(),
      options: options.map((o) => ({
        index: o.index,
        label: o.label,
        votes: 0,
        votedByMe: false,
      })),
      closed: false,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function voteGroupPollDoc(pollId: number, optionIndex: number): Promise<{ voted: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const pollDocId = resolveDocId(pollId);
  const convDocId = pollToConvMap.get(pollDocId);
  if (!convDocId) throw new Error('Poll conversation reference not found.');
  const ref = doc(db, 'conversations', convDocId, 'polls', pollDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { voted: false };
    const opts = (snap.data().options || []) as { index: number; label: string; voterUids: string[] }[];
    const nextOpts = opts.map((o) => {
      const cleaned = (o.voterUids || []).filter((u) => u !== uid);
      return {
        ...o,
        voterUids: o.index === optionIndex ? [...cleaned, uid] : cleaned,
      };
    });
    await updateDoc(ref, { options: nextOpts, updatedAt: serverTimestamp() });
    return { voted: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/polls/${pollDocId}`);
  }
}

export async function createGroupEventDoc(
  conversationId: number,
  payload: { title: string; description?: string; location?: string; startsAt: string }
): Promise<{ event: GroupEventItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  const convSnap = await getDoc(doc(db, 'conversations', convDocId));
  const memberUids = Array.isArray(convSnap.data()?.memberUids)
    ? (convSnap.data()?.memberUids as string[])
    : [uid];
  const cleanTitle = payload.title.trim().slice(0, 160);
  if (!cleanTitle) {
    throw new Error('Event title cannot be empty.');
  }
  const cleanStartsAt = (payload.startsAt.trim() || new Date().toISOString()).slice(0, 64);

  const eventId = newFirestoreId('evt');
  try {
    await setDoc(doc(db, 'conversations', convDocId, 'events', eventId), {
      id: eventId,
      conversationId: convDocId,
      creatorUid: uid,
      title: cleanTitle,
      description: (payload.description || '').trim().slice(0, 600),
      location: (payload.location || '').trim().slice(0, 200),
      startsAt: cleanStartsAt,
      memberUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convDocId}/events/${eventId}`);
  }
  return {
    event: {
      id: registerDocNum(eventId),
      conversationId,
      title: cleanTitle,
      description: payload.description || '',
      location: payload.location || '',
      startsAt: cleanStartsAt,
    },
  };
}

export async function createGroupTaskDoc(
  conversationId: number,
  payload: { title: string }
): Promise<{ task: GroupTaskItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanTaskTitle = payload.title.trim().slice(0, 200);
  if (!cleanTaskTitle) {
    throw new Error('Task title cannot be empty.');
  }
  const convDocId = resolveDocId(conversationId);
  const convSnap = await getDoc(doc(db, 'conversations', convDocId));
  const memberUids = Array.isArray(convSnap.data()?.memberUids)
    ? (convSnap.data()?.memberUids as string[])
    : [uid];
  const taskId = newFirestoreId('tsk');
  taskToConvMap.set(taskId, convDocId);
  try {
    await setDoc(doc(db, 'conversations', convDocId, 'tasks', taskId), {
      id: taskId,
      conversationId: convDocId,
      creatorUid: uid,
      title: cleanTaskTitle,
      completed: false,
      memberUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convDocId}/tasks/${taskId}`);
  }
  return {
    task: {
      id: registerDocNum(taskId),
      conversationId,
      title: payload.title,
      completed: false,
    },
  };
}

export async function toggleGroupTaskDoc(taskId: number): Promise<{ task: GroupTaskItem }> {
  requireCurrentUser();
  const taskDocId = resolveDocId(taskId);
  const convDocId = taskToConvMap.get(taskDocId);
  if (!convDocId) throw new Error('Task conversation reference not found.');
  const ref = doc(db, 'conversations', convDocId, 'tasks', taskDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Task not found.');
    const data = snap.data();
    const nextCompleted = !Boolean(data.completed);
    await updateDoc(ref, { completed: nextCompleted, updatedAt: serverTimestamp() });
    return {
      task: {
        id: taskId,
        conversationId: registerDocNum(convDocId),
        title: String(data.title || ''),
        completed: nextCompleted,
      },
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/tasks/${taskDocId}`);
  }
}

export async function updateGroupMemberRoleDoc(
  conversationId: number,
  targetUserId: number,
  action: 'promote' | 'demote' | 'remove'
): Promise<{ updated: boolean }> {
  requireCurrentUser();
  const convDocId = resolveDocId(conversationId);
  const targetUid = resolveDocId(targetUserId);
  const memberRef = doc(db, 'conversations', convDocId, 'members', targetUid);
  const convRef = doc(db, 'conversations', convDocId);
  try {
    if (action === 'remove') {
      const convSnap = await getDoc(convRef);
      const prevMembers = Array.isArray(convSnap.data()?.memberUids)
        ? (convSnap.data()?.memberUids as string[])
        : [];
      await deleteDoc(memberRef);
      await updateDoc(convRef, {
        memberUids: prevMembers.filter((m) => m !== targetUid),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(memberRef, {
        role: action === 'promote' ? 'admin' : 'member',
        updatedAt: serverTimestamp(),
      });
    }
    return { updated: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/members/${targetUid}`);
  }
}

// -----------------------------------------------------------------------------
// Stories
// -----------------------------------------------------------------------------
export async function fetchStoriesDocs(): Promise<{ stories: StoryItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const [pubSnap, mineSnap] = await Promise.all([
      getDocs(query(collection(db, 'stories'), where('audience', '==', 'everyone'))),
      getDocs(query(collection(db, 'stories'), where('userUid', '==', uid))),
    ]);
    const map = new Map<string, StoryItem>();
    const now = Date.now();
    for (const d of [...pubSnap.docs, ...mineSnap.docs]) {
      const data = d.data();
      const expiresAt = String(data.expiresAt || '');
      if (expiresAt && Date.parse(expiresAt) < now) continue;
      const viewUids = Array.isArray(data.viewUids) ? (data.viewUids as string[]) : [];
      const rawReacts = Array.isArray(data.reactions) ? data.reactions : [];
      map.set(d.id, {
        id: registerDocNum(d.id),
        userId: registerDocNum(String(data.userUid || uid)),
        username: String(data.username || ''),
        displayName: String(data.displayName || ''),
        avatarUrl: String(data.avatarUrl || ''),
        kind: (data.kind as StoryItem['kind']) || 'text',
        textContent: String(data.textContent || ''),
        backgroundHex: String(data.backgroundHex || '#0D9488'),
        mediaUrl: data.mediaUrl ? String(data.mediaUrl) : null,
        audience: (data.audience as StoryItem['audience']) || 'everyone',
        expiresAt,
        createdAt: toIsoString(data.createdAt),
        viewCount: viewUids.length,
        viewedByMe: viewUids.includes(uid),
        reactions: rawReacts.map((r: { emoji?: string; userUids?: string[] }) => ({
          emoji: String(r.emoji || ''),
          count: Array.isArray(r.userUids) ? r.userUids.length : 0,
        })),
      });
    }
    return {
      stories: Array.from(map.values()).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      ),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'stories');
  }
}

export async function createStoryDoc(payload: {
  kind: 'text' | 'image' | 'video';
  textContent?: string;
  backgroundHex?: string;
  mediaId?: string | null;
  audience?: 'everyone' | 'contacts';
  expiresInHours?: number;
}): Promise<{ story: StoryItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const myPub = (await getDoc(doc(db, 'users_public', uid))).data() || {};
  const mediaAsset = payload.mediaId ? await resolveMediaUrlForSticker(payload.mediaId) : { url: '' };
  const storyId = newFirestoreId('sty');
  const expiresAt = new Date(
    Date.now() + Math.max(1, Math.min(72, payload.expiresInHours ?? 24)) * 3600_000
  ).toISOString();

  try {
    await setDoc(doc(db, 'stories', storyId), {
      id: storyId,
      userUid: uid,
      username: String(myPub.username || 'user').slice(0, 40),
      displayName: String(myPub.displayName || fbUser.displayName || 'Chatly User').slice(0, 80),
      avatarUrl: String(myPub.avatarUrl || '').slice(0, 99000),
      kind: payload.kind,
      textContent: (payload.textContent || '').slice(0, 1000),
      backgroundHex: (payload.backgroundHex || '#0D9488').slice(0, 24),
      mediaUrl: mediaAsset.url.slice(0, 645000),
      audience: payload.audience || 'everyone',
      expiresAt,
      viewUids: [uid],
      reactions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `stories/${storyId}`);
  }

  return {
    story: {
      id: registerDocNum(storyId),
      userId: registerDocNum(uid),
      username: String(myPub.username || 'user'),
      displayName: String(myPub.displayName || 'User'),
      avatarUrl: String(myPub.avatarUrl || ''),
      kind: payload.kind,
      textContent: payload.textContent || '',
      backgroundHex: payload.backgroundHex || '#0D9488',
      mediaUrl: mediaAsset.url || null,
      audience: payload.audience || 'everyone',
      expiresAt,
      createdAt: new Date().toISOString(),
      viewCount: 1,
      viewedByMe: true,
      reactions: [],
    },
  };
}

export async function viewStoryDoc(storyId: number): Promise<{ viewed: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const storyDocId = resolveDocId(storyId);
  const ref = doc(db, 'stories', storyDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { viewed: false };
    const viewUids = Array.isArray(snap.data().viewUids) ? (snap.data().viewUids as string[]) : [];
    if (!viewUids.includes(uid)) {
      await updateDoc(ref, {
        viewUids: [...viewUids, uid].slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    }
    return { viewed: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stories/${storyDocId}`);
  }
}

export async function reactStoryDoc(storyId: number, emoji: string): Promise<{ reacted: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const storyDocId = resolveDocId(storyId);
  const ref = doc(db, 'stories', storyDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { reacted: false };
    const reactions: { emoji: string; userUids: string[] }[] = Array.isArray(snap.data().reactions)
      ? snap.data().reactions
      : [];
    const idx = reactions.findIndex((r) => r.emoji === emoji);
    if (idx === -1) reactions.push({ emoji, userUids: [uid] });
    else if (!reactions[idx].userUids.includes(uid)) reactions[idx].userUids.push(uid);
    await updateDoc(ref, { reactions: reactions.slice(0, 100), updatedAt: serverTimestamp() });
    return { reacted: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stories/${storyDocId}`);
  }
}

// -----------------------------------------------------------------------------
// Broadcast Channels
// -----------------------------------------------------------------------------
export async function fetchChannelsDocs(): Promise<{ channels: ChannelSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const [pubSnap, mySnap] = await Promise.all([
      getDocs(query(collection(db, 'channels'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'channels'), where('creatorUid', '==', uid))),
    ]);
    const map = new Map<string, Record<string, unknown>>();
    for (const d of [...pubSnap.docs, ...mySnap.docs]) {
      map.set(d.id, d.data());
    }
    const channels: ChannelSummary[] = [];
    for (const [channelDocId, data] of map.entries()) {
      let joined = data.creatorUid === uid;
      let myRole: ChannelRole | null = joined ? 'owner' : null;
      try {
        const mSnap = await getDoc(doc(db, 'channels', channelDocId, 'members', uid));
        if (mSnap.exists()) {
          joined = true;
          myRole = (mSnap.data().role as ChannelRole) || 'subscriber';
        }
      } catch {
        // ignore if private
      }
      channels.push({
        id: registerDocNum(channelDocId),
        creatorId: registerDocNum(String(data.creatorUid || uid)),
        handle: String(data.handle || ''),
        title: String(data.title || ''),
        description: String(data.description || ''),
        avatarUrl: '',
        isPublic: Boolean(data.isPublic),
        verified: false,
        inviteCode: String(data.inviteCode || ''),
        subscriberCount: Number(data.subscriberCount || 1),
        joined,
        myRole,
        createdAt: toIsoString(data.createdAt),
      });
    }
    return { channels };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'channels');
  }
}

export async function createChannelDoc(payload: {
  title: string;
  handle: string;
  description: string;
  isPublic: boolean;
}): Promise<{ channel: ChannelSummary }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const channelId = newFirestoreId('chn');
  const inviteCode = `CHN-${channelId.slice(-5).toUpperCase()}`;
  const cleanHandle = payload.handle.trim().replace(/^@+/, '').toLowerCase().slice(0, 32);
  const cleanTitle = payload.title.trim().slice(0, 120);
  if (!cleanHandle || !cleanTitle) {
    throw new Error('Channel title and handle cannot be empty.');
  }

  try {
    const myPub = (await getDoc(doc(db, 'users_public', uid))).data() || {};
    await setDoc(doc(db, 'channels', channelId), {
      id: channelId,
      creatorUid: uid,
      handle: cleanHandle,
      title: cleanTitle,
      description: payload.description.trim().slice(0, 500),
      isPublic: Boolean(payload.isPublic),
      inviteCode,
      subscriberCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'channels', channelId, 'members', uid), {
      uid,
      username: String(myPub.username || 'owner'),
      displayName: String(myPub.displayName || 'Owner'),
      avatarUrl: String(myPub.avatarUrl || ''),
      role: 'owner',
      isPublic: Boolean(payload.isPublic),
      creatorUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `channels/${channelId}`);
  }

  return {
    channel: {
      id: registerDocNum(channelId),
      creatorId: registerDocNum(uid),
      handle: cleanHandle,
      title: payload.title.trim(),
      description: payload.description.trim(),
      avatarUrl: '',
      isPublic: payload.isPublic,
      verified: false,
      inviteCode,
      subscriberCount: 1,
      joined: true,
      myRole: 'owner',
      createdAt: new Date().toISOString(),
    },
  };
}

export async function toggleChannelSubscriptionDoc(channelId: number): Promise<{ found: boolean; joined: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const chDocId = resolveDocId(channelId);
  try {
    const chSnap = await getDoc(doc(db, 'channels', chDocId));
    if (!chSnap.exists()) return { found: false, joined: false };
    const chData = chSnap.data();
    const memberRef = doc(db, 'channels', chDocId, 'members', uid);
    const mSnap = await getDoc(memberRef);
    if (mSnap.exists()) {
      await deleteDoc(memberRef);
      await updateDoc(chSnap.ref, {
        subscriberCount: Math.max(0, Number(chData.subscriberCount || 1) - 1),
        updatedAt: serverTimestamp(),
      });
      return { found: true, joined: false };
    } else {
      const myPub = (await getDoc(doc(db, 'users_public', uid))).data() || {};
      await setDoc(memberRef, {
        uid,
        username: String(myPub.username || 'user'),
        displayName: String(myPub.displayName || 'User'),
        avatarUrl: String(myPub.avatarUrl || ''),
        role: 'subscriber',
        isPublic: Boolean(chData.isPublic),
        creatorUid: String(chData.creatorUid || uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(chSnap.ref, {
        subscriberCount: Number(chData.subscriberCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      return { found: true, joined: true };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `channels/${chDocId}/members/${uid}`);
  }
}

export async function joinChannelByInviteDoc(inviteCode: string): Promise<{ found: boolean; channelId?: number }> {
  requireCurrentUser();
  const clean = inviteCode.trim().toUpperCase();
  const snap = await getDocs(query(collection(db, 'channels'), where('isPublic', '==', true)));
  const found = snap.docs.find((d) => String(d.data().inviteCode || '').toUpperCase() === clean);
  if (!found) return { found: false };
  const numId = registerDocNum(found.id);
  await toggleChannelSubscriptionDoc(numId);
  return { found: true, channelId: numId };
}

export async function fetchChannelDetailsDoc(channelId: number): Promise<{
  posts: ChannelPostItem[];
  members: ChannelMemberItem[];
}> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const chDocId = resolveDocId(channelId);
  try {
    const chSnap = await getDoc(doc(db, 'channels', chDocId));
    const isOwner = chSnap.data()?.creatorUid === uid;

    const [postsSnap, membersSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'channels', chDocId, 'posts'),
          where(isOwner ? 'authorUid' : 'isPublic', '==', isOwner ? uid : true)
        )
      ),
      getDocs(
        query(
          collection(db, 'channels', chDocId, 'members'),
          where(isOwner ? 'creatorUid' : 'isPublic', '==', isOwner ? uid : true)
        )
      ),
    ]);

    const posts: ChannelPostItem[] = postsSnap.docs
      .map((d) => {
        const pd = d.data();
        return {
          id: registerDocNum(d.id),
          channelId,
          authorId: registerDocNum(String(pd.authorUid || uid)),
          authorDisplayName: String(pd.authorDisplayName || ''),
          body: String(pd.body || ''),
          pinned: Boolean(pd.pinned),
          viewCount: Number(pd.viewCount || 0),
          reactions: formatReactions(pd.reactions, uid),
          createdAt: toIsoString(pd.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const members: ChannelMemberItem[] = membersSnap.docs.map((d) => {
      const md = d.data();
      return {
        userId: registerDocNum(d.id),
        username: String(md.username || ''),
        displayName: String(md.displayName || ''),
        avatarUrl: String(md.avatarUrl || ''),
        role: (md.role as ChannelRole) || 'subscriber',
        joinedAt: toIsoString(md.createdAt),
      };
    });

    return { posts, members };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `channels/${chDocId}`);
  }
}

export async function publishChannelPostDoc(
  channelId: number,
  payload: { body: string; pinned?: boolean }
): Promise<{ post: ChannelPostItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanBody = payload.body.trim().slice(0, 8000);
  if (!cleanBody) {
    throw new Error('Channel post body cannot be empty.');
  }
  const chDocId = resolveDocId(channelId);
  const postId = newFirestoreId('post');
  try {
    const [chSnap, myPubSnap] = await Promise.all([
      getDoc(doc(db, 'channels', chDocId)),
      getDoc(doc(db, 'users_public', uid)),
    ]);
    const isPublic = Boolean(chSnap.data()?.isPublic ?? true);
    const authorDisplayName = String(myPubSnap.data()?.displayName || fbUser.displayName || 'Owner');
    await setDoc(doc(db, 'channels', chDocId, 'posts', postId), {
      id: postId,
      channelId: chDocId,
      authorUid: uid,
      authorDisplayName: authorDisplayName.slice(0, 80),
      body: cleanBody,
      pinned: Boolean(payload.pinned),
      viewCount: 1,
      reactions: [],
      isPublic,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      post: {
        id: registerDocNum(postId),
        channelId,
        authorId: registerDocNum(uid),
        authorDisplayName,
        body: payload.body.trim(),
        pinned: Boolean(payload.pinned),
        viewCount: 1,
        reactions: [],
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `channels/${chDocId}/posts/${postId}`);
  }
}

export async function toggleChannelPostPinDoc(channelId: number, postId: number): Promise<{ pinned: boolean }> {
  requireCurrentUser();
  const chDocId = resolveDocId(channelId);
  const postDocId = resolveDocId(postId);
  const ref = doc(db, 'channels', chDocId, 'posts', postDocId);
  try {
    const snap = await getDoc(ref);
    const nextPinned = !Boolean(snap.data()?.pinned);
    await updateDoc(ref, { pinned: nextPinned, updatedAt: serverTimestamp() });
    return { pinned: nextPinned };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `channels/${chDocId}/posts/${postDocId}`);
  }
}

export async function incrementChannelPostViewDoc(channelId: number, postId: number): Promise<{ viewCount: number | null }> {
  requireCurrentUser();
  const chDocId = resolveDocId(channelId);
  const postDocId = resolveDocId(postId);
  const ref = doc(db, 'channels', chDocId, 'posts', postDocId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { viewCount: null };
    const nextCount = Number(snap.data().viewCount || 0) + 1;
    await updateDoc(ref, { viewCount: nextCount, updatedAt: serverTimestamp() });
    return { viewCount: nextCount };
  } catch {
    return { viewCount: null };
  }
}

export async function reactChannelPostDoc(
  channelId: number,
  postId: number,
  emoji: string
): Promise<{ reactions: ReactionSummary[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const chDocId = resolveDocId(channelId);
  const postDocId = resolveDocId(postId);
  const ref = doc(db, 'channels', chDocId, 'posts', postDocId);
  try {
    const snap = await getDoc(ref);
    const list: { emoji: string; userUids: string[] }[] = Array.isArray(snap.data()?.reactions)
      ? snap.data()?.reactions
      : [];
    const idx = list.findIndex((r) => r.emoji === emoji);
    if (idx === -1) list.push({ emoji, userUids: [uid] });
    else {
      const has = list[idx].userUids.includes(uid);
      list[idx].userUids = has ? list[idx].userUids.filter((u) => u !== uid) : [...list[idx].userUids, uid];
      if (list[idx].userUids.length === 0) list.splice(idx, 1);
    }
    await updateDoc(ref, { reactions: list.slice(0, 40), updatedAt: serverTimestamp() });
    return { reactions: formatReactions(list, uid) };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `channels/${chDocId}/posts/${postDocId}`);
  }
}

export async function updateChannelMemberRoleDoc(
  channelId: number,
  targetUserId: number,
  role: Exclude<ChannelRole, 'owner'>
): Promise<{ updated: boolean }> {
  requireCurrentUser();
  const chDocId = resolveDocId(channelId);
  const targetUid = resolveDocId(targetUserId);
  try {
    await updateDoc(doc(db, 'channels', chDocId, 'members', targetUid), {
      role,
      updatedAt: serverTimestamp(),
    });
    return { updated: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `channels/${chDocId}/members/${targetUid}`);
  }
}

// -----------------------------------------------------------------------------
// Live Locations, Notifications, Reminders, Saved Vault, Backups, Calls, Safety
// -----------------------------------------------------------------------------
export async function fetchConversationLocationsDocs(conversationId: number): Promise<{ locations: LocationShareItem[] }> {
  const fbUser = requireCurrentUser();
  const convDocId = resolveDocId(conversationId);
  try {
    const snap = await getDocs(
      query(
        collection(db, 'conversations', convDocId, 'locations'),
        where('memberUids', 'array-contains', fbUser.uid)
      )
    );
    const locations: LocationShareItem[] = snap.docs
      .map((d) => {
        locationToConvMap.set(d.id, convDocId);
        const ld = d.data();
        return {
          id: registerDocNum(d.id),
          conversationId,
          userId: registerDocNum(String(ld.userUid || fbUser.uid)),
          senderDisplayName: String(ld.senderDisplayName || ''),
          latitude: Number(ld.latitude || 0),
          longitude: Number(ld.longitude || 0),
          accuracyMeters: Number(ld.accuracyMeters || 0),
          isLive: Boolean(ld.isLive),
          expiresAt: String(ld.expiresAt || ''),
          stoppedAt: ld.stopped ? toIsoString(ld.updatedAt) : null,
          createdAt: toIsoString(ld.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { locations };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `conversations/${convDocId}/locations`);
  }
}

export async function shareConversationLocationDoc(
  conversationId: number,
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    isLive: boolean;
    durationMinutes: number;
  }
): Promise<{ location: LocationShareItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(conversationId);
  const [convSnap, myPubSnap] = await Promise.all([
    getDoc(doc(db, 'conversations', convDocId)),
    getDoc(doc(db, 'users_public', uid)),
  ]);
  const memberUids = Array.isArray(convSnap.data()?.memberUids)
    ? (convSnap.data()?.memberUids as string[])
    : [uid];
  const senderDisplayName = String(myPubSnap.data()?.displayName || fbUser.displayName || 'User');
  const shareId = newFirestoreId('loc');
  locationToConvMap.set(shareId, convDocId);
  const expiresAt = new Date(Date.now() + Math.max(1, payload.durationMinutes) * 60_000).toISOString();

  try {
    await setDoc(doc(db, 'conversations', convDocId, 'locations', shareId), {
      id: shareId,
      conversationId: convDocId,
      userUid: uid,
      senderDisplayName: senderDisplayName.slice(0, 80),
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters,
      isLive: payload.isLive,
      expiresAt,
      stopped: false,
      memberUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convDocId}/locations/${shareId}`);
  }

  return {
    location: {
      id: registerDocNum(shareId),
      conversationId,
      userId: registerDocNum(uid),
      senderDisplayName,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters,
      isLive: payload.isLive,
      expiresAt,
      stoppedAt: null,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function stopLocationShareDoc(shareId: number): Promise<{ stopped: boolean; stoppedAt: string }> {
  requireCurrentUser();
  const shareDocId = resolveDocId(shareId);
  const convDocId = locationToConvMap.get(shareDocId);
  if (!convDocId) throw new Error('Location share reference not found.');
  try {
    await updateDoc(doc(db, 'conversations', convDocId, 'locations', shareDocId), {
      stopped: true,
      updatedAt: serverTimestamp(),
    });
    return { stopped: true, stoppedAt: new Date().toISOString() };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convDocId}/locations/${shareDocId}`);
  }
}

export async function fetchNotificationsDocs(): Promise<{ notifications: NotificationItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'users_private', uid, 'notifications'), where('uid', '==', uid))
    );
    return {
      notifications: snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: registerDocNum(d.id),
            kind: String(data.kind || 'info'),
            title: String(data.title || ''),
            body: String(data.body || ''),
            readAt: data.read ? toIsoString(data.updatedAt) : null,
            createdAt: toIsoString(data.createdAt),
          };
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/notifications`);
  }
}

export async function markNotificationReadDoc(id: number): Promise<{ read: boolean }> {
  const fbUser = requireCurrentUser();
  const docId = resolveDocId(id);
  try {
    await updateDoc(doc(db, 'users_private', fbUser.uid, 'notifications', docId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
    return { read: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}/notifications/${docId}`);
  }
}

export async function fetchRemindersDocs(): Promise<{ reminders: MessageReminderItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'users_private', uid, 'reminders'), where('uid', '==', uid))
    );
    return {
      reminders: snap.docs.map((d) => {
        const data = d.data();
        return {
          id: registerDocNum(d.id),
          messageId: registerDocNum(String(data.messageDocId || '')),
          conversationId: registerDocNum(String(data.conversationDocId || '')),
          messageBody: String(data.messageBody || ''),
          remindAt: String(data.remindAt || ''),
          note: String(data.note || ''),
          triggered: Boolean(data.triggered),
          createdAt: toIsoString(data.createdAt),
        };
      }),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/reminders`);
  }
}

export async function createReminderDoc(payload: {
  messageId: number;
  remindAt: string;
  note?: string;
}): Promise<{ reminder: MessageReminderItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const msgDocId = resolveDocId(payload.messageId);
  const convDocId = msgToConvMap.get(msgDocId) || 'unknown';
  let messageBody = '';
  if (convDocId !== 'unknown') {
    const mSnap = await getDoc(doc(db, 'conversations', convDocId, 'messages', msgDocId));
    messageBody = String(mSnap.data()?.body || '');
  }
  const remId = newFirestoreId('rem');
  try {
    await setDoc(doc(db, 'users_private', uid, 'reminders', remId), {
      id: remId,
      uid,
      messageDocId: msgDocId,
      conversationDocId: convDocId,
      messageBody: messageBody.slice(0, 2000),
      remindAt: payload.remindAt.slice(0, 64),
      note: (payload.note || '').slice(0, 300),
      triggered: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users_private/${uid}/reminders/${remId}`);
  }
  return {
    reminder: {
      id: registerDocNum(remId),
      messageId: payload.messageId,
      conversationId: registerDocNum(convDocId),
      messageBody,
      remindAt: payload.remindAt,
      note: payload.note || '',
      triggered: false,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function fetchSavedNotesDocs(): Promise<{ notes: SavedNoteItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'users_private', uid, 'savedNotes'), where('uid', '==', uid))
    );
    return {
      notes: snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: registerDocNum(d.id),
            category: (data.category as SavedNoteItem['category']) || 'note',
            title: String(data.title || ''),
            content: String(data.content || ''),
            createdAt: toIsoString(data.createdAt),
          };
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/savedNotes`);
  }
}

export async function addSavedNoteDoc(payload: {
  category: 'note' | 'link' | 'snippet';
  title: string;
  content: string;
}): Promise<{ note: SavedNoteItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanTitle = payload.title.trim().slice(0, 160);
  const cleanContent = payload.content.trim().slice(0, 8000);
  if (!cleanTitle || !cleanContent) {
    throw new Error('Saved note title and content cannot be empty.');
  }
  const noteId = newFirestoreId('note');
  try {
    await setDoc(doc(db, 'users_private', uid, 'savedNotes', noteId), {
      id: noteId,
      uid,
      category: payload.category,
      title: cleanTitle,
      content: cleanContent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users_private/${uid}/savedNotes/${noteId}`);
  }
  return {
    note: {
      id: registerDocNum(noteId),
      category: payload.category,
      title: payload.title.trim(),
      content: payload.content.trim(),
      createdAt: new Date().toISOString(),
    },
  };
}

export async function removeSavedNoteDoc(noteId: number): Promise<{ deleted: boolean }> {
  const fbUser = requireCurrentUser();
  const docId = resolveDocId(noteId);
  try {
    await deleteDoc(doc(db, 'users_private', fbUser.uid, 'savedNotes', docId));
    return { deleted: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users_private/${fbUser.uid}/savedNotes/${docId}`);
  }
}

export async function fetchEncryptedBackupsDocs(): Promise<{ backups: EncryptedBackupItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'users_private', uid, 'backups'), where('uid', '==', uid))
    );
    return {
      backups: snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: registerDocNum(d.id),
            cadence: (data.cadence as EncryptedBackupItem['cadence']) || 'manual',
            checksumSha256: String(data.checksumSha256 || ''),
            cipherPayloadJson: String(data.cipherPayloadJson || ''),
            includesSummary: String(data.includesSummary || ''),
            messageCount: Number(data.messageCount || 0),
            verifiedAt: data.verifiedAt ? String(data.verifiedAt) : null,
            createdAt: toIsoString(data.createdAt),
          };
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users_private/${uid}/backups`);
  }
}

export async function saveEncryptedBackupDoc(payload: {
  cadence: 'manual' | 'daily' | 'weekly';
  checksumSha256: string;
  cipherPayloadJson: string;
  includesSummary: string;
  messageCount: number;
}): Promise<{ backup: EncryptedBackupItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const backupId = newFirestoreId('bak');
  const nowIso = new Date().toISOString();
  try {
    await setDoc(doc(db, 'users_private', uid, 'backups', backupId), {
      id: backupId,
      uid,
      cadence: payload.cadence,
      checksumSha256: payload.checksumSha256.slice(0, 128),
      cipherPayloadJson: payload.cipherPayloadJson.slice(0, 695000),
      includesSummary: payload.includesSummary.slice(0, 300),
      messageCount: Math.max(0, payload.messageCount),
      verifiedAt: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users_private/${uid}/backups/${backupId}`);
  }
  return {
    backup: {
      id: registerDocNum(backupId),
      ...payload,
      verifiedAt: nowIso,
      createdAt: nowIso,
    },
  };
}

export async function verifyEncryptedBackupDoc(backupId: number): Promise<{ verified: boolean; checksumSha256: string }> {
  const fbUser = requireCurrentUser();
  const docId = resolveDocId(backupId);
  const ref = doc(db, 'users_private', fbUser.uid, 'backups', docId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { verified: false, checksumSha256: '' };
    const checksumSha256 = String(snap.data().checksumSha256 || '');
    await updateDoc(ref, {
      verifiedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    return { verified: true, checksumSha256 };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users_private/${fbUser.uid}/backups/${docId}`);
  }
}

// -----------------------------------------------------------------------------
// Calls & WebRTC Firestore Signaling
// -----------------------------------------------------------------------------
export interface FirestoreCallDoc {
  docId: string;
  id: number;
  conversationId: number;
  conversationDocId: string;
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  peerUsername: string;
  callType: 'audio' | 'video' | 'group';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  offerSdp: string;
  answerSdp: string;
  participantUids: string[];
  startedAt: string;
  endedAt: string | null;
}

export async function fetchCallHistoryDocs(): Promise<{ calls: CallRecordItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'calls'), where('participantUids', 'array-contains', uid))
    );
    const calls: CallRecordItem[] = snap.docs
      .map((d) => {
        const data = d.data();
        const amCaller = data.callerUid === uid;
        return {
          id: registerDocNum(d.id),
          conversationId: registerDocNum(String(data.conversationId || '')),
          peerDisplayName: String(amCaller ? data.calleeName : data.callerName),
          peerUsername: String(data.peerUsername || 'peer'),
          callerId: registerDocNum(String(data.callerUid || uid)),
          callType: (data.callType as CallRecordItem['callType']) || 'audio',
          status: (data.status as CallRecordItem['status']) || 'ended',
          startedAt: String(data.startedAt || toIsoString(data.createdAt)),
          endedAt: data.endedAt ? String(data.endedAt) : null,
        };
      })
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return { calls };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'calls');
  }
}

export async function createCallRecordDoc(payload: {
  conversationId: number;
  callType: 'audio' | 'video' | 'group';
  offerSdp?: string;
}): Promise<{ call: CallRecordItem; callDocId: string }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const convDocId = resolveDocId(payload.conversationId);
  const [convSnap, myPubSnap] = await Promise.all([
    getDoc(doc(db, 'conversations', convDocId)),
    getDoc(doc(db, 'users_public', uid)),
  ]);
  const convData = convSnap.data() || {};
  const memberUids = Array.isArray(convData.memberUids)
    ? (convData.memberUids as string[])
    : [uid];
  const calleeUid = memberUids.find((m) => m !== uid) || uid;
  const calleeSnap = await getDoc(doc(db, 'users_public', calleeUid));
  const calleeData = calleeSnap.data() || {};
  const myPub = myPubSnap.data() || {};

  const callId = newFirestoreId('call');
  const startedAt = new Date().toISOString();
  const calleeName = String(calleeData.displayName || convData.title || 'Call');
  const callerName = String(myPub.displayName || fbUser.displayName || 'Caller');
  const peerUsername = String(calleeData.username || 'peer');

  try {
    await setDoc(doc(db, 'calls', callId), {
      id: callId,
      conversationId: convDocId,
      callerUid: uid,
      calleeUid,
      callerName: callerName.slice(0, 80),
      calleeName: calleeName.slice(0, 80),
      peerUsername: peerUsername.slice(0, 40),
      callType: payload.callType,
      status: 'ringing',
      offerSdp: (payload.offerSdp || '').slice(0, 32000),
      answerSdp: '',
      participantUids: Array.from(new Set([uid, calleeUid, ...memberUids])).slice(0, 20),
      startedAt,
      endedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `calls/${callId}`);
  }

  return {
    callDocId: callId,
    call: {
      id: registerDocNum(callId),
      conversationId: payload.conversationId,
      peerDisplayName: calleeName,
      peerUsername,
      callerId: registerDocNum(uid),
      callType: payload.callType,
      status: 'ringing',
      startedAt,
      endedAt: null,
    },
  };
}

export async function updateCallStatusDoc(
  callId: number,
  status: 'active' | 'ended' | 'missed' | 'declined',
  answerSdp?: string
): Promise<{ updated: boolean }> {
  requireCurrentUser();
  const callDocId = resolveDocId(callId);
  const patch: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (answerSdp !== undefined) {
    patch.answerSdp = answerSdp.slice(0, 32000);
  }
  if (status === 'ended' || status === 'missed' || status === 'declined') {
    patch.endedAt = new Date().toISOString();
  }
  try {
    await updateDoc(doc(db, 'calls', callDocId), patch);
    return { updated: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `calls/${callDocId}`);
  }
}

export async function publishWebRtcOffer(
  callId: number,
  sdp: RTCSessionDescriptionInit
): Promise<void> {
  requireCurrentUser();
  const callDocId = resolveDocId(callId);
  try {
    await updateDoc(doc(db, 'calls', callDocId), {
      offerSdp: JSON.stringify(sdp).slice(0, 32000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `calls/${callDocId}`);
  }
}

export async function addWebRtcIceCandidateDoc(
  callId: number,
  candidate: RTCIceCandidateInit
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) return;
  const callDocId = resolveDocId(callId);
  const candId = newFirestoreId('ice');
  try {
    const callSnap = await getDoc(doc(db, 'calls', callDocId));
    const participantUids = Array.isArray(callSnap.data()?.participantUids)
      ? (callSnap.data()?.participantUids as string[])
      : [fbUser.uid];
    await setDoc(doc(db, 'calls', callDocId, 'candidates', candId), {
      id: candId,
      senderUid: fbUser.uid,
      candidateJson: JSON.stringify(candidate).slice(0, 4096),
      participantUids,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal ICE candidate error
  }
}

// -----------------------------------------------------------------------------
// Safety Reports, Account Export & Deletion, Health
// -----------------------------------------------------------------------------
export async function fetchSafetyReportsDocs(): Promise<{ reports: SafetyReportItem[] }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'safetyReports'), where('reporterUid', '==', uid))
    );
    return {
      reports: snap.docs.map((d) => {
        const data = d.data();
        return {
          id: registerDocNum(d.id),
          reporterId: registerDocNum(uid),
          targetType: (data.targetType as SafetyReportItem['targetType']) || 'user',
          targetId: String(data.targetId || ''),
          reason: String(data.reason || ''),
          details: String(data.details || ''),
          status: (data.status as SafetyReportItem['status']) || 'open',
          appealNote: String(data.appealNote || ''),
          createdAt: toIsoString(data.createdAt),
        };
      }),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'safetyReports');
  }
}

export async function submitSafetyReportDoc(payload: {
  targetType: 'user' | 'group' | 'channel' | 'message';
  targetId: string;
  reason: string;
  details?: string;
}): Promise<{ report: SafetyReportItem }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  const cleanTargetId = payload.targetId.trim().slice(0, 128);
  const cleanReason = payload.reason.trim().slice(0, 200);
  if (!cleanTargetId || !cleanReason) {
    throw new Error('Safety report target and reason are required.');
  }
  const repId = newFirestoreId('rep');
  try {
    await setDoc(doc(db, 'safetyReports', repId), {
      id: repId,
      reporterUid: uid,
      targetType: payload.targetType,
      targetId: cleanTargetId,
      reason: cleanReason,
      details: (payload.details || '').trim().slice(0, 2000),
      status: 'open',
      appealNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `safetyReports/${repId}`);
  }
  return {
    report: {
      id: registerDocNum(repId),
      reporterId: registerDocNum(uid),
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason,
      details: payload.details || '',
      status: 'open',
      appealNote: '',
      createdAt: new Date().toISOString(),
    },
  };
}

export async function appealSafetyReportDoc(
  reportId: number,
  appealNote: string
): Promise<{ report: SafetyReportItem }> {
  const fbUser = requireCurrentUser();
  const docId = resolveDocId(reportId);
  const ref = doc(db, 'safetyReports', docId);
  try {
    await updateDoc(ref, {
      status: 'appealed',
      appealNote: appealNote.trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    const data = snap.data() || {};
    return {
      report: {
        id: reportId,
        reporterId: registerDocNum(fbUser.uid),
        targetType: (data.targetType as SafetyReportItem['targetType']) || 'user',
        targetId: String(data.targetId || ''),
        reason: String(data.reason || ''),
        details: String(data.details || ''),
        status: 'appealed',
        appealNote: appealNote.trim(),
        createdAt: toIsoString(data.createdAt),
      },
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `safetyReports/${docId}`);
  }
}

export async function exportMyAccountDataDoc(): Promise<Record<string, unknown>> {
  const fbUser = requireCurrentUser();
  const [ctx, convs, notes, backups, reports] = await Promise.all([
    bootstrapFirebaseUser(),
    listMyConversations(),
    fetchSavedNotesDocs(),
    fetchEncryptedBackupsDocs(),
    fetchSafetyReportsDocs(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    provider: 'firebase-firestore',
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    uid: fbUser.uid,
    user: ctx.user,
    privacy: ctx.privacy,
    sessions: ctx.sessions,
    conversations: convs.conversations,
    savedNotes: notes.notes,
    backups: backups.backups,
    safetyReports: reports.reports,
  };
}

export async function deleteMyAccountDocs(): Promise<{ deleted: boolean }> {
  const fbUser = requireCurrentUser();
  const uid = fbUser.uid;
  try {
    const subcollections = [
      'sessions',
      'contacts',
      'conversationMeta',
      'savedNotes',
      'reminders',
      'backups',
      'notifications',
    ];
    for (const sub of subcollections) {
      const ownerField = sub === 'contacts' ? 'ownerUid' : 'uid';
      const snap = await getDocs(
        query(collection(db, 'users_private', uid, sub), where(ownerField, '==', uid))
      );
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    }
    await Promise.all([
      deleteDoc(doc(db, 'e2eeKeys', uid)).catch(() => {}),
      deleteDoc(doc(db, 'users_private', uid)).catch(() => {}),
      deleteDoc(doc(db, 'users_public', uid)).catch(() => {}),
    ]);
    return { deleted: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users_private/${uid}`);
  }
}

export async function getFirestoreHealthStatus(): Promise<AppHealthStatus> {
  const started = performance.now();
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    if (auth.currentUser) {
      await getDoc(doc(db, 'test', 'connection'));
    }
  } catch {
    dbStatus = 'error';
  }
  const latency = Math.max(1, Math.round(performance.now() - started));
  return {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    service: `Cloud Firestore (${firebaseConfig.firestoreDatabaseId})`,
    version: '2.0.0-firebase',
    dbStatus,
    dbLatencyMs: latency,
    uptimeSec: Math.round(performance.now() / 1000),
    releaseNotes: DEMO_RELEASE_NOTES,
  };
}

// -----------------------------------------------------------------------------
// Worldwide Real-Time Firestore Subscription Orchestrator
// -----------------------------------------------------------------------------
export interface RealtimeWorkspaceCallbacks {
  onConversationsUpdated: (conversations: ConversationSummary[]) => void;
  onDirectoryUpdated: (users: PublicUserSummary[]) => void;
  onFriendRequestsUpdated: (requests: FriendRequestItem[]) => void;
  onNotificationsUpdated: (notifications: NotificationItem[]) => void;
  onStoriesUpdated: (stories: StoryItem[]) => void;
  onCallsUpdated: (calls: CallRecordItem[], activeIncomingCall: FirestoreCallDoc | null) => void;
  onActiveCallUpdated: (call: FirestoreCallDoc | null) => void;
  onError?: (err: Error) => void;
}

export function subscribeWorldwideWorkspace(
  uid: string,
  callbacks: RealtimeWorkspaceCallbacks
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let convTimer: number | null = null;
  let dirTimer: number | null = null;

  // 1. Live conversations (worldwide real-time chat rooms & group additions)
  unsubs.push(
    onSnapshot(
      query(collection(db, 'conversations'), where('memberUids', 'array-contains', uid)),
      () => {
        if (convTimer !== null) window.clearTimeout(convTimer);
        convTimer = window.setTimeout(async () => {
          try {
            const res = await listMyConversations();
            callbacks.onConversationsUpdated(res.conversations);
          } catch (err) {
            callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }, 120);
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'conversations');
        callbacks.onError?.(formatted);
      }
    )
  );

  // 2. Live public user directory + worldwide online presence
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users_public'), where('online', 'in', [true, false]), limit(100)),
      () => {
        if (dirTimer !== null) window.clearTimeout(dirTimer);
        dirTimer = window.setTimeout(async () => {
          try {
            const res = await searchDirectoryUsers('');
            callbacks.onDirectoryUpdated(res.users);
          } catch (err) {
            console.warn('Directory refresh warning:', err);
          }
        }, 180);
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'users_public');
        callbacks.onError?.(formatted);
      }
    )
  );

  // 3. Live friend requests (incoming & outgoing)
  const refreshFriends = async () => {
    try {
      const res = await fetchFriendsWorkspace();
      callbacks.onFriendRequestsUpdated(res.requests);
    } catch {
      // ignore transient error
    }
  };
  unsubs.push(
    onSnapshot(
      query(collection(db, 'friendRequests'), where('receiverUid', '==', uid)),
      () => {
        void refreshFriends();
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'friendRequests');
        callbacks.onError?.(formatted);
      }
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, 'friendRequests'), where('senderUid', '==', uid)),
      () => {
        void refreshFriends();
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'friendRequests');
        callbacks.onError?.(formatted);
      }
    )
  );

  // 4. Live notifications
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users_private', uid, 'notifications'), where('uid', '==', uid)),
      async () => {
        try {
          const res = await fetchNotificationsDocs();
          callbacks.onNotificationsUpdated(res.notifications);
        } catch {
          // ignore
        }
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(
          err,
          OperationType.LIST,
          `users_private/${uid}/notifications`
        );
        callbacks.onError?.(formatted);
      }
    )
  );

  // 5. Live public stories
  unsubs.push(
    onSnapshot(
      query(collection(db, 'stories'), where('audience', '==', 'everyone')),
      async () => {
        try {
          const res = await fetchStoriesDocs();
          callbacks.onStoriesUpdated(res.stories);
        } catch {
          // ignore
        }
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'stories');
        callbacks.onError?.(formatted);
      }
    )
  );

  // 6. Live WebRTC call invitations & status changes
  unsubs.push(
    onSnapshot(
      query(collection(db, 'calls'), where('participantUids', 'array-contains', uid)),
      async (snap) => {
        try {
          const res = await fetchCallHistoryDocs();
          let incoming: FirestoreCallDoc | null = null;
          for (const d of snap.docs) {
            const data = d.data();
            if (
              data.status === 'ringing' &&
              data.callerUid !== uid &&
              data.calleeUid === uid &&
              data.offerSdp
            ) {
              incoming = {
                docId: d.id,
                id: registerDocNum(d.id),
                conversationId: registerDocNum(String(data.conversationId || '')),
                conversationDocId: String(data.conversationId || ''),
                callerUid: String(data.callerUid || ''),
                calleeUid: String(data.calleeUid || ''),
                callerName: String(data.callerName || 'Caller'),
                calleeName: String(data.calleeName || ''),
                peerUsername: String(data.peerUsername || ''),
                callType: (data.callType as FirestoreCallDoc['callType']) || 'audio',
                status: 'ringing',
                offerSdp: String(data.offerSdp || ''),
                answerSdp: String(data.answerSdp || ''),
                participantUids: Array.isArray(data.participantUids) ? (data.participantUids as string[]) : [],
                startedAt: String(data.startedAt || ''),
                endedAt: data.endedAt ? String(data.endedAt) : null,
              };
            }
          }
          callbacks.onCallsUpdated(res.calls, incoming);
        } catch {
          // ignore
        }
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(err, OperationType.LIST, 'calls');
        callbacks.onError?.(formatted);
      }
    )
  );

  return () => {
    if (convTimer !== null) window.clearTimeout(convTimer);
    if (dirTimer !== null) window.clearTimeout(dirTimer);
    for (const u of unsubs) u();
  };
}

export function subscribeActiveConversation(
  uid: string,
  conversationId: number,
  callbacks: {
    onMessages: (messages: ChatMessage[]) => void;
    onTyping: (peerIsTyping: boolean) => void;
    onLocations: (locations: LocationShareItem[]) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  const convDocId = resolveDocId(conversationId);
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'conversations', convDocId, 'messages'),
        where('memberUids', 'array-contains', uid)
      ),
      (snap) => {
        const msgs = sortAndDedupeMessages(
          snap.docs.map((d) =>
            mapMessageDoc(d.id, convDocId, d.data({ serverTimestamps: 'estimate' }), uid)
          )
        );
        callbacks.onMessages(msgs);
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(
          err,
          OperationType.LIST,
          `conversations/${convDocId}/messages`
        );
        callbacks.onError?.(formatted);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'conversations', convDocId, 'typing'),
        where('memberUids', 'array-contains', uid)
      ),
      (snap) => {
        const someoneTyping = snap.docs.some((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          if (d.id === uid || !data.isTyping) return false;
          const updatedMs = toMs(data.updatedAt);
          return Date.now() - updatedMs < 8000;
        });
        callbacks.onTyping(someoneTyping);
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(
          err,
          OperationType.LIST,
          `conversations/${convDocId}/typing`
        );
        callbacks.onError?.(formatted);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'conversations', convDocId, 'locations'),
        where('memberUids', 'array-contains', uid)
      ),
      (snap) => {
        const locs: LocationShareItem[] = snap.docs
          .map((d) => {
            locationToConvMap.set(d.id, convDocId);
            const ld = d.data({ serverTimestamps: 'estimate' });
            return {
              id: registerDocNum(d.id),
              conversationId,
              userId: registerDocNum(String(ld.userUid || uid)),
              senderDisplayName: String(ld.senderDisplayName || ''),
              latitude: Number(ld.latitude || 0),
              longitude: Number(ld.longitude || 0),
              accuracyMeters: Number(ld.accuracyMeters || 0),
              isLive: Boolean(ld.isLive),
              expiresAt: String(ld.expiresAt || ''),
              stoppedAt: ld.stopped ? toIsoString(ld.updatedAt) : null,
              createdAt: toIsoString(ld.createdAt),
            };
          })
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        callbacks.onLocations(locs);
      },
      (err) => {
        const formatted = formatAndLogFirestoreError(
          err,
          OperationType.LIST,
          `conversations/${convDocId}/locations`
        );
        callbacks.onError?.(formatted);
      }
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export function subscribeWebRtcCallSignaling(
  uid: string,
  callId: number,
  callbacks: {
    onAnswerSdp: (answer: RTCSessionDescriptionInit) => void;
    onRemoteIceCandidate: (candidate: RTCIceCandidateInit) => void;
    onCallStatus: (status: FirestoreCallDoc['status']) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  const callDocId = resolveDocId(callId);
  const seenCandidates = new Set<string>();
  let appliedAnswer = false;

  const unsubCall = onSnapshot(
    doc(db, 'calls', callDocId),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status) {
        callbacks.onCallStatus(data.status as FirestoreCallDoc['status']);
      }
      if (!appliedAnswer && data.answerSdp && data.callerUid === uid) {
        try {
          appliedAnswer = true;
          callbacks.onAnswerSdp(JSON.parse(String(data.answerSdp)) as RTCSessionDescriptionInit);
        } catch {
          // ignore malformed answer
        }
      }
    },
    (err) => {
      const formatted = formatAndLogFirestoreError(err, OperationType.GET, `calls/${callDocId}`);
      callbacks.onError?.(formatted);
    }
  );

  const unsubCands = onSnapshot(
    query(
      collection(db, 'calls', callDocId, 'candidates'),
      where('participantUids', 'array-contains', uid)
    ),
    (snap) => {
      for (const d of snap.docs) {
        if (seenCandidates.has(d.id)) continue;
        seenCandidates.add(d.id);
        const data = d.data();
        if (data.senderUid === uid) continue;
        try {
          const parsed = JSON.parse(String(data.candidateJson)) as RTCIceCandidateInit;
          callbacks.onRemoteIceCandidate(parsed);
        } catch {
          // ignore malformed candidate
        }
      }
    },
    (err) => {
      const formatted = formatAndLogFirestoreError(
        err,
        OperationType.LIST,
        `calls/${callDocId}/candidates`
      );
      callbacks.onError?.(formatted);
    }
  );

  return () => {
    unsubCall();
    unsubCands();
  };
}

// Unused helper export kept for lint cleanliness if collectionGroup is used later
export { collectionGroup, orderBy };
