export type LanguageCode = 'en' | 'ar';
export type ThemeMode = 'light' | 'dark';
export type AccentColor = 'teal' | 'indigo' | 'amber' | 'rose';
export type VisibilityLevel = 'everyone' | 'contacts' | 'nobody';
export type DevicePlatform = 'web' | 'windows' | 'android';
export type AppSection =
  | 'chats'
  | 'groups'
  | 'channels'
  | 'stories'
  | 'stickers'
  | 'calls'
  | 'directory'
  | 'media'
  | 'saved'
  | 'notifications'
  | 'privacy'
  | 'profile';
export type SmartFolder = 'all' | 'unread' | 'work' | 'family' | 'followup' | 'favorites' | 'archived';
export type FontScale = 'sm' | 'md' | 'lg';
export type NotificationSoundId = 'chime' | 'pulse' | 'soft_bell' | 'none';
export type LockScreenPreviewMode = 'full' | 'name_only' | 'hidden';
export type MediaQualityPreset = 'original' | 'balanced' | 'compact';
export type ChannelRole = 'owner' | 'admin' | 'moderator' | 'subscriber';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  statusText: string;
  avatarUrl: string;
  preferredLanguage: LanguageCode;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  phoneNumber: string;
  phoneVerified: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface PrivacySettings {
  onlineStatusVisibility: VisibilityLevel;
  lastSeenVisibility: VisibilityLevel;
  profilePhotoVisibility: VisibilityLevel;
  bioVisibility: VisibilityLevel;
  statusUpdatesVisibility: VisibilityLevel;
  contactInfoVisibility: VisibilityLevel;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  biometricLockEnabled: boolean;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  platform: DevicePlatform;
  userAgent: string;
  isCurrent: boolean;
  lastActiveAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface PublicUserSummary {
  id: number;
  username: string;
  displayName: string;
  bio: string;
  statusText: string;
  avatarUrl: string;
  online: boolean;
  lastSeenAt: string | null;
  isContact?: boolean;
  isFavorite?: boolean;
  isBlocked?: boolean;
  hasE2eeKey?: boolean;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: number[];
}

export interface MediaAttachmentMeta {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  durationMs: number;
}

export type StickerVisualPreset =
  | 'pulse_ring'
  | 'wave_bars'
  | 'prism_burst'
  | 'orbit_spark'
  | 'custom_image';

export interface VoiceStickerItem {
  id: number;
  packId: number;
  creatorId: number;
  name: string;
  nameAr: string;
  category: string;
  kind: 'static' | 'animated' | 'voice_animated';
  visualPreset: StickerVisualPreset;
  visualUrl: string | null;
  visualMimeType?: string | null;
  audioUrl: string | null;
  audioDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  syncOffsetMs: number;
  defaultVolume: number;
  usageCount: number;
  isFavorite: boolean;
  toneHz?: number[];
  createdAt?: string;
}

export interface StickerPackItem {
  id: number;
  creatorId: number;
  title: string;
  titleAr: string;
  category: string;
  shareCode: string;
  isPublic: boolean;
  stickers: VoiceStickerItem[];
}

export interface E2eeEnvelope {
  v: 1;
  alg: 'ECDH-P256-HKDF-AES256GCM';
  senderPubJwk: JsonWebKey;
  iv: string;
  ct: string;
}

export interface ChatMessage {
  id: number;
  clientMessageId: string;
  conversationId: number;
  senderId: number;
  senderUsername: string;
  senderDisplayName: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice_sticker' | 'voice_sticker_preview';
  body: string;
  e2eeEnvelope?: string | null;
  decryptedBody?: string;
  isEncrypted?: boolean;
  e2eeVerified?: boolean;
  attachment?: MediaAttachmentMeta | null;
  sticker?: VoiceStickerItem | null;
  stickerMeta?: {
    title: string;
    titleAr: string;
    durationMs: number;
    toneHz: number[];
  };
  replyToId: number | null;
  replyPreview?: {
    id: number;
    senderDisplayName: string;
    body: string;
  } | null;
  forwardedFromId?: number | null;
  pinned?: boolean;
  starred?: boolean;
  scheduledAt?: string | null;
  scheduledFor?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions: ReactionSummary[];
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  type: 'direct' | 'group' | 'saved';
  title: string;
  description?: string;
  folder: SmartFolder;
  customLabel?: string;
  pinned: boolean;
  needsFollowUp: boolean;
  archived?: boolean;
  snoozedUntil?: string | null;
  draftBody?: string;
  unreadCount: number;
  memberCount?: number;
  myRole?: 'owner' | 'admin' | 'member';
  inviteCode?: string | null;
  approvalRequired?: boolean;
  announcementsOnly?: boolean;
  peer?: PublicUserSummary;
  lastMessagePreview: string;
  lastMessageAt: string;
}

export interface SavedNoteItem {
  id: number;
  category: 'note' | 'link' | 'snippet';
  title: string;
  content: string;
  createdAt: string;
}

export interface MessageReminderItem {
  id: number;
  messageId: number;
  conversationId: number;
  messageBody: string;
  remindAt: string;
  note: string;
  triggered: boolean;
  createdAt: string;
}

export interface GroupPollItem {
  id: number;
  conversationId: number;
  question: string;
  options: { index: number; label: string; votes: number; votedByMe: boolean }[];
  closed: boolean;
  createdAt: string;
}

export interface GroupEventItem {
  id: number;
  conversationId: number;
  title: string;
  description: string;
  location: string;
  startsAt: string;
}

export interface GroupTaskItem {
  id: number;
  conversationId: number;
  title: string;
  completed: boolean;
}

export interface GroupJoinRequestItem {
  id: number;
  conversationId: number;
  userId: number;
  username: string;
  displayName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface GroupMemberItem {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: 'owner' | 'admin' | 'member';
}

export interface StoryItem {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  kind: 'text' | 'image' | 'video';
  textContent: string;
  backgroundHex: string;
  mediaUrl: string | null;
  audience: 'everyone' | 'contacts';
  expiresAt: string;
  createdAt: string;
  viewCount: number;
  viewedByMe: boolean;
  reactions: { emoji: string; count: number }[];
}

export interface CallRecordItem {
  id: number;
  conversationId: number;
  peerDisplayName: string;
  peerUsername: string;
  callerId: number;
  callType: 'audio' | 'video' | 'group';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  startedAt: string;
  endedAt: string | null;
}

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface AccessibilityPrefs {
  fontScale: FontScale;
  highContrast: boolean;
  reduceMotion: boolean;
}

export interface NotificationPrefs {
  soundId: NotificationSoundId;
  dndEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  lockScreenPreview: LockScreenPreviewMode;
  mutedConversationIds: number[];
}

export interface FriendRequestItem {
  id: number;
  senderId: number;
  receiverId: number;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatarUrl: string;
  receiverUsername: string;
  receiverDisplayName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface MutualGroupSummary {
  id: number;
  title: string;
  memberCount: number;
}

export interface ChannelSummary {
  id: number;
  creatorId: number;
  handle: string;
  title: string;
  description: string;
  avatarUrl: string;
  isPublic: boolean;
  verified: boolean;
  inviteCode: string;
  subscriberCount: number;
  joined: boolean;
  myRole: ChannelRole | null;
  createdAt: string;
}

export interface ChannelMemberItem {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: ChannelRole;
  joinedAt: string;
}

export interface ChannelPostItem {
  id: number;
  channelId: number;
  authorId: number;
  authorDisplayName: string;
  body: string;
  pinned: boolean;
  viewCount: number;
  reactions: ReactionSummary[];
  createdAt: string;
}

export interface LocationShareItem {
  id: number;
  conversationId: number;
  userId: number;
  senderDisplayName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isLive: boolean;
  expiresAt: string;
  stoppedAt: string | null;
  createdAt: string;
}

export interface EncryptedBackupItem {
  id: number;
  cadence: 'manual' | 'daily' | 'weekly';
  checksumSha256: string;
  cipherPayloadJson: string;
  includesSummary: string;
  messageCount: number;
  verifiedAt: string | null;
  createdAt: string;
}

export interface MediaInventoryItem extends MediaAttachmentMeta {
  conversationId: number | null;
  uploaderId: number;
  createdAt: string;
}

export interface LoginHistoryItem {
  id: number;
  deviceName: string;
  platform: DevicePlatform;
  userAgent: string;
  isNewDevice: boolean;
  suspiciousFlag: boolean;
  createdAt: string;
}

export interface SafetyReportItem {
  id: number;
  reporterId: number;
  targetType: 'user' | 'group' | 'channel' | 'message';
  targetId: string;
  reason: string;
  details: string;
  status: 'open' | 'reviewing' | 'resolved' | 'appealed';
  appealNote: string;
  createdAt: string;
}

export interface ModeratorAuditItem {
  id: number;
  actorDisplayName: string;
  scopeType: string;
  scopeId: string;
  action: string;
  metadataSummary: string;
  createdAt: string;
}

export interface ReleaseNoteItem {
  version: string;
  date: string;
  highlightsEn: string[];
  highlightsAr: string[];
}

export interface AppHealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  dbStatus: 'ok' | 'error';
  dbLatencyMs: number;
  uptimeSec: number;
  releaseNotes: ReleaseNoteItem[];
}

