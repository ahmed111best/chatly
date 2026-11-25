import type {
  AccessibilityPrefs,
  AppHealthStatus,
  CallRecordItem,
  ChannelMemberItem,
  ChannelPostItem,
  ChannelRole,
  ChannelSummary,
  ChatMessage,
  ConversationSummary,
  DeviceSession,
  EncryptedBackupItem,
  FriendRequestItem,
  GroupEventItem,
  GroupJoinRequestItem,
  GroupMemberItem,
  GroupPollItem,
  GroupTaskItem,
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
  StickerPackItem,
  StickerVisualPreset,
  StoryItem,
  UserProfile,
  VoiceStickerItem,
} from '../core/types';
import {
  addSavedNoteDoc,
  appealSafetyReportDoc,
  bootstrapFirebaseUser,
  createCallRecordDoc,
  createChannelDoc,
  createGroupDoc,
  createGroupEventDoc,
  createGroupPollDoc,
  createGroupTaskDoc,
  createReminderDoc,
  createStickerPackDoc,
  createStoryDoc,
  createVoiceStickerDoc,
  decideFriendRequestDoc,
  deleteMyAccountDocs,
  deleteVoiceStickerDoc,
  exportMyAccountDataDoc,
  fetchCallHistoryDocs,
  fetchChannelDetailsDoc,
  fetchChannelsDocs,
  fetchConversationLocationsDocs,
  fetchConversationMessages,
  fetchEncryptedBackupsDocs,
  fetchFriendsWorkspace,
  fetchGroupDetailsDoc,
  fetchMediaLibraryDocs,
  fetchMutualGroupsDoc,
  fetchNotificationsDocs,
  fetchRemindersDocs,
  fetchSafetyReportsDocs,
  fetchSavedNotesDocs,
  fetchSecurityBundle,
  fetchStickerPacksDocs,
  fetchStoriesDocs,
  fetchUserE2eeKeysDoc,
  fileToBase64,
  getChatlySessionId,
  getFirestoreHealthStatus,
  importStickerPackByCodeDoc,
  incrementChannelPostViewDoc,
  joinChannelByInviteDoc,
  joinGroupByInviteDoc,
  listMyConversations,
  logoutFirestoreSession,
  markNotificationReadDoc,
  mutateConversationMessage,
  openDirectConversationDoc,
  publishChannelPostDoc,
  reactChannelPostDoc,
  reactStoryDoc,
  registerE2eePublicKeyDoc,
  removeContactRelationDoc,
  removeSavedNoteDoc,
  revokeMyDeviceSession,
  rotateChatlySessionId,
  saveEncryptedBackupDoc,
  saveUserPreferences,
  searchDirectoryUsers,
  sendConversationMessage,
  sendFriendRequestDoc,
  setOrClearPinLock,
  shareConversationLocationDoc,
  stopLocationShareDoc,
  submitSafetyReportDoc,
  toggleChannelPostPinDoc,
  toggleChannelSubscriptionDoc,
  toggleFavoriteStickerLocal,
  toggleGroupTaskDoc,
  toggleMessageReactionDoc,
  updateCallStatusDoc,
  updateChannelMemberRoleDoc,
  updateContactRelationDoc,
  updateConversationMetaDoc,
  updateGroupMemberRoleDoc,
  updateMyPrivacy,
  updateMyProfile,
  updateVoiceStickerDoc,
  uploadMediaToFirestore,
  verifyEncryptedBackupDoc,
  verifyPinLock,
  viewStoryDoc,
  voteGroupPollDoc,
  detectPlatform,
} from './firestoreService';

export { fileToBase64, getChatlySessionId, rotateChatlySessionId };

export function detectPlatformHeader(): 'web' | 'windows' | 'android' {
  return detectPlatform();
}

export async function verifyAuthSession(_token: string): Promise<{
  verified: boolean;
  tokenClaims: { uid: string; email: string; emailVerified: boolean };
  user: UserProfile;
  privacy: PrivacySettings;
  sessions: DeviceSession[];
}> {
  const ctx = await bootstrapFirebaseUser();
  return {
    verified: ctx.verified,
    tokenClaims: ctx.tokenClaims,
    user: ctx.user,
    privacy: ctx.privacy,
    sessions: ctx.sessions,
  };
}

export function logoutAuthSession(_token: string) {
  return logoutFirestoreSession();
}

export async function fetchWorkspaceContext(_token: string) {
  const ctx = await bootstrapFirebaseUser();
  return {
    user: ctx.user,
    privacy: ctx.privacy,
    sessions: ctx.sessions,
  };
}

export function saveProfile(
  _token: string,
  payload: {
    username: string;
    displayName: string;
    bio: string;
    statusText: string;
    preferredLanguage: 'en' | 'ar';
    themeMode: 'light' | 'dark';
    accentColor: 'teal' | 'indigo' | 'amber' | 'rose';
    twoFactorEnabled: boolean;
    phoneNumber: string;
  }
) {
  return updateMyProfile(payload);
}

export function savePrivacy(_token: string, payload: PrivacySettings) {
  return updateMyPrivacy(payload);
}

export function revokeDeviceSession(_token: string, sessionId: string) {
  return revokeMyDeviceSession(sessionId);
}

export function registerE2eePublicKey(
  _token: string,
  payload: { deviceId: string; publicKeyJwk: string }
) {
  return registerE2eePublicKeyDoc(payload);
}

export function fetchUserE2eeKeys(_token: string, userId: number) {
  return fetchUserE2eeKeysDoc(userId);
}

export function searchDirectory(_token: string, queryText: string) {
  return searchDirectoryUsers(queryText);
}

export function updateContactRelation(
  _token: string,
  targetUserId: number,
  payload: { isBlocked?: boolean; isFavorite?: boolean }
) {
  return updateContactRelationDoc(targetUserId, payload);
}

export async function submitUserReport(
  _token: string,
  payload: { reportedUserId: number; reason: string; details?: string }
) {
  await submitSafetyReportDoc({
    targetType: 'user',
    targetId: String(payload.reportedUserId),
    reason: payload.reason,
    details: payload.details,
  });
  return { submitted: true };
}

export function listConversations(_token: string) {
  return listMyConversations();
}

export function openDirectConversation(_token: string, targetUserId: number) {
  return openDirectConversationDoc(targetUserId);
}

export function updateConversationMeta(
  _token: string,
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
) {
  return updateConversationMetaDoc(conversationId, payload);
}

export function fetchMessages(
  _token: string,
  conversationId: number,
  opts: { beforeId?: number; search?: string } = {}
) {
  return fetchConversationMessages(conversationId, opts);
}

export function sendMessage(
  _token: string,
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
) {
  return sendConversationMessage(conversationId, payload);
}

export function mutateMessage(
  _token: string,
  messageId: number,
  payload: { action: 'edit' | 'delete' | 'pin' | 'star'; body?: string }
) {
  return mutateConversationMessage(messageId, payload);
}

export function toggleMessageReactionApi(
  _token: string,
  messageId: number,
  emoji: string
): Promise<{ reactions: ReactionSummary[] }> {
  return toggleMessageReactionDoc(messageId, emoji);
}

export function fetchReminders(_token: string) {
  return fetchRemindersDocs();
}

export function createReminder(
  _token: string,
  payload: { messageId: number; remindAt: string; note?: string }
) {
  return createReminderDoc(payload);
}

export function uploadMediaWithProgress(
  _token: string,
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
  return uploadMediaToFirestore(params, onProgress, signal);
}

export async function downloadMediaWithProgress(
  url: string,
  _token: string | null,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  onProgress?.(100);
  return blob;
}

export function getAuthorizedMediaUrl(url: string | null | undefined, _token: string | null): string {
  return url || '';
}

export function fetchStickerPacks(_token: string, query = '') {
  return fetchStickerPacksDocs(query);
}

export function createStickerPackApi(
  _token: string,
  payload: { title: string; titleAr?: string; category?: string; isPublic?: boolean }
) {
  return createStickerPackDoc(payload);
}

export function createVoiceStickerApi(
  _token: string,
  payload: {
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
  }
) {
  return createVoiceStickerDoc(payload);
}

export function updateVoiceStickerApi(
  _token: string,
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
) {
  return updateVoiceStickerDoc(stickerId, payload);
}

export function deleteVoiceStickerApi(_token: string, stickerId: number) {
  return deleteVoiceStickerDoc(stickerId);
}

export function importStickerPackByCodeApi(_token: string, shareCode: string) {
  return importStickerPackByCodeDoc(shareCode);
}

export function toggleFavoriteStickerApi(_token: string, stickerId: number) {
  return toggleFavoriteStickerLocal(stickerId);
}

export function createGroupApi(
  _token: string,
  payload: {
    title: string;
    description?: string;
    approvalRequired?: boolean;
    announcementsOnly?: boolean;
    memberIds?: number[];
  }
) {
  return createGroupDoc(payload);
}

export function joinGroupByInviteApi(_token: string, inviteCode: string) {
  return joinGroupByInviteDoc(inviteCode);
}

export function fetchGroupDetailsApi(_token: string, conversationId: number) {
  return fetchGroupDetailsDoc(conversationId);
}

export function createGroupPollApi(
  _token: string,
  conversationId: number,
  payload: { question: string; options: string[] }
) {
  return createGroupPollDoc(conversationId, payload);
}

export function voteGroupPollApi(_token: string, pollId: number, optionIndex: number) {
  return voteGroupPollDoc(pollId, optionIndex);
}

export function createGroupEventApi(
  _token: string,
  conversationId: number,
  payload: { title: string; description?: string; location?: string; startsAt: string }
) {
  return createGroupEventDoc(conversationId, payload);
}

export function createGroupTaskApi(
  _token: string,
  conversationId: number,
  payload: { title: string }
) {
  return createGroupTaskDoc(conversationId, payload);
}

export function toggleGroupTaskApi(_token: string, taskId: number) {
  return toggleGroupTaskDoc(taskId);
}

export async function decideGroupJoinRequestApi(
  _token: string,
  _conversationId: number,
  _reqId: number,
  _decision: 'approved' | 'rejected'
) {
  return { updated: true };
}

export function updateGroupMemberRoleApi(
  _token: string,
  conversationId: number,
  targetUserId: number,
  action: 'promote' | 'demote' | 'remove'
) {
  return updateGroupMemberRoleDoc(conversationId, targetUserId, action);
}

export function fetchStoriesApi(_token: string) {
  return fetchStoriesDocs();
}

export function createStoryApi(
  _token: string,
  payload: {
    kind: 'text' | 'image' | 'video';
    textContent?: string;
    backgroundHex?: string;
    mediaId?: string | null;
    audience?: 'everyone' | 'contacts';
    expiresInHours?: number;
  }
) {
  return createStoryDoc(payload);
}

export function viewStoryApi(_token: string, storyId: number) {
  return viewStoryDoc(storyId);
}

export function reactStoryApi(_token: string, storyId: number, emoji: string) {
  return reactStoryDoc(storyId, emoji);
}

export function fetchNotificationsApi(_token: string) {
  return fetchNotificationsDocs();
}

export function markNotificationReadApi(_token: string, id: number) {
  return markNotificationReadDoc(id);
}

export function fetchCallHistoryApi(_token: string) {
  return fetchCallHistoryDocs();
}

export function createCallRecordApi(
  _token: string,
  payload: { conversationId: number; callType: 'audio' | 'video' | 'group'; offerSdp?: string }
) {
  return createCallRecordDoc(payload);
}

export function updateCallStatusApi(
  _token: string,
  callId: number,
  status: 'active' | 'ended' | 'missed' | 'declined',
  answerSdp?: string
) {
  return updateCallStatusDoc(callId, status, answerSdp);
}

export function fetchSavedNotes(_token: string) {
  return fetchSavedNotesDocs();
}

export function addSavedNote(
  _token: string,
  payload: { category: 'note' | 'link' | 'snippet'; title: string; content: string }
) {
  return addSavedNoteDoc(payload);
}

export function removeSavedNote(_token: string, noteId: number) {
  return removeSavedNoteDoc(noteId);
}

export function fetchFriendsWorkspaceApi(_token: string) {
  return fetchFriendsWorkspace();
}

export function sendFriendRequestApi(
  _token: string,
  payload: {
    targetUserId?: number;
    username?: string;
    inviteToken?: string;
    phoneNumber?: string;
  }
) {
  return sendFriendRequestDoc(payload);
}

export function decideFriendRequestApi(
  _token: string,
  requestId: number,
  decision: 'accepted' | 'rejected'
) {
  return decideFriendRequestDoc(requestId, decision);
}

export function removeContactRelationApi(_token: string, targetUserId: number) {
  return removeContactRelationDoc(targetUserId);
}

export function fetchMutualGroupsApi(_token: string, targetUserId: number): Promise<{
  mutualGroups: MutualGroupSummary[];
}> {
  return fetchMutualGroupsDoc(targetUserId);
}

export function fetchChannelsApi(_token: string) {
  return fetchChannelsDocs();
}

export function createChannelApi(
  _token: string,
  payload: { title: string; handle: string; description: string; isPublic: boolean }
) {
  return createChannelDoc(payload);
}

export function toggleChannelSubscriptionApi(_token: string, channelId: number) {
  return toggleChannelSubscriptionDoc(channelId);
}

export function joinChannelByInviteApi(_token: string, inviteCode: string) {
  return joinChannelByInviteDoc(inviteCode);
}

export function fetchChannelDetailsApi(_token: string, channelId: number) {
  return fetchChannelDetailsDoc(channelId);
}

export function publishChannelPostApi(
  _token: string,
  channelId: number,
  payload: { body: string; pinned?: boolean }
) {
  return publishChannelPostDoc(channelId, payload);
}

export function toggleChannelPostPinApi(_token: string, channelId: number, postId: number) {
  return toggleChannelPostPinDoc(channelId, postId);
}

export function incrementChannelPostViewApi(_token: string, channelId: number, postId: number) {
  return incrementChannelPostViewDoc(channelId, postId);
}

export function reactChannelPostApi(
  _token: string,
  channelId: number,
  postId: number,
  emoji: string
) {
  return reactChannelPostDoc(channelId, postId, emoji);
}

export function updateChannelMemberRoleApi(
  _token: string,
  channelId: number,
  targetUserId: number,
  role: Exclude<ChannelRole, 'owner'>
) {
  return updateChannelMemberRoleDoc(channelId, targetUserId, role);
}

export function fetchConversationLocationsApi(_token: string, conversationId: number) {
  return fetchConversationLocationsDocs(conversationId);
}

export function shareConversationLocationApi(
  _token: string,
  conversationId: number,
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    isLive: boolean;
    durationMinutes: number;
  }
) {
  return shareConversationLocationDoc(conversationId, payload);
}

export function stopLocationShareApi(_token: string, shareId: number) {
  return stopLocationShareDoc(shareId);
}

export function fetchEncryptedBackupsApi(_token: string) {
  return fetchEncryptedBackupsDocs();
}

export function saveEncryptedBackupApi(
  _token: string,
  payload: {
    cadence: 'manual' | 'daily' | 'weekly';
    checksumSha256: string;
    cipherPayloadJson: string;
    includesSummary: string;
    messageCount: number;
  }
) {
  return saveEncryptedBackupDoc(payload);
}

export function verifyEncryptedBackupApi(_token: string, backupId: number) {
  return verifyEncryptedBackupDoc(backupId);
}

export function fetchSecurityBundleApi(_token: string): Promise<{
  notificationPrefs: NotificationPrefs;
  accessibilityPrefs: AccessibilityPrefs;
  hasPinLock: boolean;
  crashDiagnosticsOptIn: boolean;
  phoneDiscoveryConsent: boolean;
  loginHistory: LoginHistoryItem[];
}> {
  return fetchSecurityBundle();
}

export function saveUserPreferencesApi(
  _token: string,
  payload: {
    notificationPrefs?: NotificationPrefs;
    accessibilityPrefs?: AccessibilityPrefs;
    crashDiagnosticsOptIn?: boolean;
    phoneDiscoveryConsent?: boolean;
  }
) {
  return saveUserPreferences(payload);
}

export function setOrClearPinLockApi(_token: string, pin: string | null) {
  return setOrClearPinLock(pin);
}

export function verifyPinLockApi(_token: string, pin: string) {
  return verifyPinLock(pin);
}

export function exportAccountDataApi(_token: string) {
  return exportMyAccountDataDoc();
}

export function deleteAccountApi(_token: string) {
  return deleteMyAccountDocs();
}

export function fetchMediaLibraryApi(_token: string) {
  return fetchMediaLibraryDocs();
}

export function fetchSafetyReportsApi(_token: string) {
  return fetchSafetyReportsDocs();
}

export function submitSafetyReportApi(
  _token: string,
  payload: {
    targetType: 'user' | 'group' | 'channel' | 'message';
    targetId: string;
    reason: string;
    details?: string;
  }
) {
  return submitSafetyReportDoc(payload);
}

export function appealSafetyReportApi(_token: string, reportId: number, appealNote: string) {
  return appealSafetyReportDoc(reportId, appealNote);
}

export async function fetchModeratorAuditLogsApi(_token: string): Promise<{ logs: ModeratorAuditItem[] }> {
  return { logs: [] };
}

export async function submitDiagnosticReportApi(
  _token: string,
  _payload: { surface: string; errorSummary: string; appVersion?: string }
) {
  return { recorded: true };
}

export function fetchHealthStatusApi(): Promise<AppHealthStatus> {
  return getFirestoreHealthStatus();
}
