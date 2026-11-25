import { useCallback, useEffect, useRef, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import {
  Bell,
  Bookmark,
  CircleDot,
  Globe,
  HardDrive,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Phone,
  Radio,
  Shield,
  Sticker,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { auth, signInWithGooglePopup, signOutFirebase, testFirestoreConnection } from './lib/firebase';
import { formatFirebaseAuthError } from './core/authHelpers';
import { createEncryptedBackupBlob } from './core/backupCrypto';
import { sortAndDedupeMessages } from './core/chatHelpers';
import {
  publishTypingState,
  setMyOnlinePresence,
  subscribeActiveConversation,
  subscribeWorldwideWorkspace,
} from './services/firestoreService';
import {
  DEMO_AUDIT_LOGS,
  DEMO_BACKUPS,
  DEMO_CALL_RECORDS,
  DEMO_CHANNEL_MEMBERS,
  DEMO_CHANNEL_POSTS,
  DEMO_CHANNELS,
  DEMO_CONTACTS,
  DEMO_CONVERSATIONS,
  DEMO_FRIEND_REQUESTS,
  DEMO_GROUP_EVENTS,
  DEMO_GROUP_POLLS,
  DEMO_GROUP_TASKS,
  DEMO_LOCATION_SHARES,
  DEMO_LOGIN_HISTORY,
  DEMO_MEDIA_LIBRARY,
  DEMO_MESSAGES_BY_CONVERSATION,
  DEMO_NOTIFICATIONS,
  DEMO_PRIVACY,
  DEMO_RELEASE_NOTES,
  DEMO_REMINDERS,
  DEMO_SAFETY_REPORTS,
  DEMO_SAVED_NOTES,
  DEMO_SESSIONS,
  DEMO_STICKER_PACKS,
  DEMO_STORIES,
  DEMO_USER,
} from './core/demoData';
import {
  formatNotificationPreview,
  getRootFontSizePx,
  shouldSuppressNotification,
} from './core/features';
import { getTextDirection, TRANSLATIONS } from './core/localization';
import { toggleReactionInList } from './core/reactions';
import { ACCENT_PALETTES } from './core/theme';
import { inferMediaKind } from './core/validation';
import type {
  AccentColor,
  AccessibilityPrefs,
  AppHealthStatus,
  AppSection,
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
  LanguageCode,
  LocationShareItem,
  LoginHistoryItem,
  MediaAttachmentMeta,
  MediaInventoryItem,
  MediaQualityPreset,
  MessageReminderItem,
  ModeratorAuditItem,
  MutualGroupSummary,
  NotificationItem,
  NotificationPrefs,
  PrivacySettings,
  PublicUserSummary,
  ReactionSummary,
  ReleaseNoteItem,
  SafetyReportItem,
  SavedNoteItem,
  SmartFolder,
  StickerPackItem,
  StickerVisualPreset,
  StoryItem,
  ThemeMode,
  UserProfile,
  VoiceStickerItem,
} from './core/types';
import {
  addSavedNote,
  appealSafetyReportApi,
  createCallRecordApi,
  createChannelApi,
  createGroupApi,
  createGroupEventApi,
  createGroupPollApi,
  createGroupTaskApi,
  createReminder,
  createStickerPackApi,
  createStoryApi,
  createVoiceStickerApi,
  decideFriendRequestApi,
  decideGroupJoinRequestApi,
  deleteAccountApi,
  deleteVoiceStickerApi,
  exportAccountDataApi,
  fetchCallHistoryApi,
  fetchChannelDetailsApi,
  fetchChannelsApi,
  fetchConversationLocationsApi,
  fetchEncryptedBackupsApi,
  fetchFriendsWorkspaceApi,
  fetchGroupDetailsApi,
  fetchHealthStatusApi,
  fetchMediaLibraryApi,
  fetchMessages,
  fetchModeratorAuditLogsApi,
  fetchMutualGroupsApi,
  fetchNotificationsApi,
  fetchReminders,
  fetchSafetyReportsApi,
  fetchSavedNotes,
  fetchSecurityBundleApi,
  fetchStickerPacks,
  fetchStoriesApi,
  fetchUserE2eeKeys,
  importStickerPackByCodeApi,
  incrementChannelPostViewApi,
  joinChannelByInviteApi,
  joinGroupByInviteApi,
  listConversations,
  logoutAuthSession,
  markNotificationReadApi,
  mutateMessage,
  openDirectConversation,
  publishChannelPostApi,
  reactChannelPostApi,
  reactStoryApi,
  registerE2eePublicKey,
  removeContactRelationApi,
  removeSavedNote,
  revokeDeviceSession,
  rotateChatlySessionId,
  saveEncryptedBackupApi,
  savePrivacy,
  saveProfile,
  saveUserPreferencesApi,
  searchDirectory,
  sendFriendRequestApi,
  sendMessage,
  setOrClearPinLockApi,
  shareConversationLocationApi,
  stopLocationShareApi,
  submitSafetyReportApi,
  submitUserReport,
  toggleChannelPostPinApi,
  toggleChannelSubscriptionApi,
  toggleFavoriteStickerApi,
  toggleGroupTaskApi,
  toggleMessageReactionApi,
  updateCallStatusApi,
  updateChannelMemberRoleApi,
  updateContactRelation,
  updateConversationMeta,
  updateGroupMemberRoleApi,
  updateVoiceStickerApi,
  uploadMediaWithProgress,
  verifyAuthSession,
  verifyEncryptedBackupApi,
  verifyPinLockApi,
  viewStoryApi,
  voteGroupPollApi,
} from './services/api';
import {
  decryptWithDeviceKey,
  encryptForRecipient,
  ensureDeviceKeyBundle,
  type StoredDeviceKeyBundle,
} from './services/e2eeStore';
import { triggerDesktopOrBrowserNotification } from './services/platform';
import { playNotificationSound } from './services/sound';
import { AuthLanding } from './components/AuthLanding';
import { CallsView } from './components/CallsView';
import { ChannelsView } from './components/ChannelsView';
import { ChatlyAvatar } from './components/ChatlyAvatar';
import { ChatlyLogo } from './components/ChatlyLogo';
import { ChatThreadView } from './components/ChatThreadView';
import { ConversationListPane } from './components/ConversationListPane';
import { DirectoryView } from './components/DirectoryView';
import { GroupsView } from './components/GroupsView';
import { MediaManagerView } from './components/MediaManagerView';
import { NotificationsView } from './components/NotificationsView';
import { PinLockGate } from './components/PinLockGate';
import { PrivacyDashboardView } from './components/PrivacyDashboardView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { SavedVaultView } from './components/SavedVaultView';
import { StoriesView } from './components/StoriesView';
import { VoiceStickerStudioView } from './components/VoiceStickerStudioView';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  soundId: 'chime',
  dndEnabled: false,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  lockScreenPreview: 'full',
  mutedConversationIds: [],
};

const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  fontScale: 'md',
  highContrast: false,
  reduceMotion: false,
};

type SessionMode = 'auth_loading' | 'landing' | 'demo' | 'live';

export default function App() {
  const [mode, setMode] = useState<SessionMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'demo' : 'auth_loading';
  });

  const [idToken, setIdToken] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [lang, setLang] = useState<LanguageCode>('en');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [accentColor, setAccentColor] = useState<AccentColor>('teal');

  const [section, setSection] = useState<AppSection>('chats');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [user, setUser] = useState<UserProfile>(DEMO_USER);
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEMO_PRIVACY);
  const [sessions, setSessions] = useState<DeviceSession[]>(DEMO_SESSIONS);

  const [conversations, setConversations] = useState<ConversationSummary[]>(DEMO_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    DEMO_CONVERSATIONS[0]?.id ?? null
  );
  const [messagesByConv, setMessagesByConv] = useState<Record<number, ChatMessage[]>>(
    DEMO_MESSAGES_BY_CONVERSATION
  );
  const [hasMoreByConv, setHasMoreByConv] = useState<Record<number, boolean>>({});
  const [typingByConv, setTypingByConv] = useState<Record<number, boolean>>({});
  const [chatSearch, setChatSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<SmartFolder>('all');
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<PublicUserSummary[]>(DEMO_CONTACTS);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  const [savedNotes, setSavedNotes] = useState<SavedNoteItem[]>(DEMO_SAVED_NOTES);
  const [stickerPacks, setStickerPacks] = useState<StickerPackItem[]>(DEMO_STICKER_PACKS);
  const [stories, setStories] = useState<StoryItem[]>(DEMO_STORIES);
  const [notifications, setNotifications] = useState<NotificationItem[]>(DEMO_NOTIFICATIONS);
  const [reminders, setReminders] = useState<MessageReminderItem[]>(DEMO_REMINDERS);
  const [calls, setCalls] = useState<CallRecordItem[]>(DEMO_CALL_RECORDS);

  // Group Collaboration State
  const [activeGroupId, setActiveGroupId] = useState<number | null>(301);
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([
    {
      userId: DEMO_USER.id,
      username: DEMO_USER.username,
      displayName: DEMO_USER.displayName,
      avatarUrl: DEMO_USER.avatarUrl,
      role: 'owner',
    },
    ...DEMO_CONTACTS.map((c) => ({
      userId: c.id,
      username: c.username,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      role: 'member' as const,
    })),
  ]);
  const [groupJoinRequests, setGroupJoinRequests] = useState<GroupJoinRequestItem[]>([]);
  const [groupPolls, setGroupPolls] = useState<GroupPollItem[]>(DEMO_GROUP_POLLS);
  const [groupEvents, setGroupEvents] = useState<GroupEventItem[]>(DEMO_GROUP_EVENTS);
  const [groupTasks, setGroupTasks] = useState<GroupTaskItem[]>(DEMO_GROUP_TASKS);
  const [groupMediaGallery, setGroupMediaGallery] = useState<MediaAttachmentMeta[]>([]);

  // E2EE State
  const [e2eeBundle, setE2eeBundle] = useState<StoredDeviceKeyBundle | null>(null);
  const [peerE2eePubJwkByConv, setPeerE2eePubJwkByConv] = useState<
    Record<number, JsonWebKey | null>
  >({});
  const [e2eeEnabledByConv, setE2eeEnabledByConv] = useState<Record<number, boolean>>({});

  // WebRTC Call State
  const [activeCall, setActiveCall] = useState<{
    callId: number | null;
    conversationId: number;
    peerUserId: number | null;
    peerName: string;
    callType: 'audio' | 'video' | 'group';
    direction: 'outgoing' | 'incoming';
    incomingOffer?: RTCSessionDescriptionInit;
  } | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [isOnlineNet, setIsOnlineNet] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Extended Features State
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS
  );
  const [accessibilityPrefs, setAccessibilityPrefs] = useState<AccessibilityPrefs>(
    DEFAULT_ACCESSIBILITY_PREFS
  );
  const [phoneDiscoveryConsent, setPhoneDiscoveryConsent] = useState(false);
  const [crashDiagnosticsOptIn, setCrashDiagnosticsOptIn] = useState(false);
  const [hasPinLock, setHasPinLock] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const [demoPinCode, setDemoPinCode] = useState<string | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>(DEMO_LOGIN_HISTORY);
  const [backups, setBackups] = useState<EncryptedBackupItem[]>(DEMO_BACKUPS);
  const [safetyReports, setSafetyReports] = useState<SafetyReportItem[]>(DEMO_SAFETY_REPORTS);
  const [auditLogs, setAuditLogs] = useState<ModeratorAuditItem[]>(DEMO_AUDIT_LOGS);
  const [healthStatus, setHealthStatus] = useState<AppHealthStatus | null>(null);
  const [releaseNotes] = useState<ReleaseNoteItem[]>(DEMO_RELEASE_NOTES);

  const [inviteToken, setInviteToken] = useState('CHATLY-DEMO-INV');
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>(DEMO_FRIEND_REQUESTS);
  const [recentContacts, setRecentContacts] = useState<PublicUserSummary[]>(DEMO_CONTACTS);
  const [mutualGroupsByUser, setMutualGroupsByUser] = useState<
    Record<number, MutualGroupSummary[]>
  >({
    101: [{ id: 301, title: 'Chatly Core Engineering', memberCount: 4 }],
  });

  const [channels, setChannels] = useState<ChannelSummary[]>(DEMO_CHANNELS);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    DEMO_CHANNELS[0]?.id ?? null
  );
  const [channelPostsById, setChannelPostsById] =
    useState<Record<number, ChannelPostItem[]>>(DEMO_CHANNEL_POSTS);
  const [channelMembersById, setChannelMembersById] =
    useState<Record<number, ChannelMemberItem[]>>(DEMO_CHANNEL_MEMBERS);
  const [channelsLoading, setChannelsLoading] = useState(false);

  const [mediaLibrary, setMediaLibrary] = useState<MediaInventoryItem[]>(DEMO_MEDIA_LIBRARY);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [uploadQuality, setUploadQuality] = useState<MediaQualityPreset>('balanced');
  const [locationsByConv, setLocationsByConv] = useState<Record<number, LocationShareItem[]>>({
    201: DEMO_LOCATION_SHARES,
  });

  const e2eeBundleRef = useRef<StoredDeviceKeyBundle | null>(null);
  const hydratedUidRef = useRef<string | null>(null);
  const hydrationInFlightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);
  const langRef = useRef<LanguageCode>(lang);
  const userIdRef = useRef<number>(user.id);
  const notificationPrefsRef = useRef<NotificationPrefs>(notificationPrefs);
  const autostartActive = useRef(
    new URLSearchParams(window.location.search).get('autostart') === '1'
  );

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    userIdRef.current = user.id;
  }, [user.id]);

  useEffect(() => {
    notificationPrefsRef.current = notificationPrefs;
  }, [notificationPrefs]);

  useEffect(() => {
    e2eeBundleRef.current = e2eeBundle;
  }, [e2eeBundle]);

  useEffect(() => {
    document.documentElement.dir = getTextDirection(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.style.fontSize = getRootFontSizePx(accessibilityPrefs.fontScale);
    document.documentElement.setAttribute(
      'data-contrast',
      accessibilityPrefs.highContrast ? 'high' : 'normal'
    );
    document.documentElement.setAttribute(
      'data-reduce-motion',
      accessibilityPrefs.reduceMotion ? 'true' : 'false'
    );
  }, [accessibilityPrefs]);

  useEffect(() => {
    if (mode !== 'live') return;
    void testFirestoreConnection();
    fetchHealthStatusApi()
      .then(setHealthStatus)
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    const goOnline = () => setIsOnlineNet(true);
    const goOffline = () => setIsOnlineNet(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Keyboard shortcuts (Alt + 1..5, Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '1') setSection('chats');
      if (e.altKey && e.key === '2') setSection('groups');
      if (e.altKey && e.key === '3') setSection('stories');
      if (e.altKey && e.key === '4') setSection('stickers');
      if (e.altKey && e.key === '5') setSection('directory');
      if (e.key === 'Escape') setMobileMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const decryptMessageIfNeeded = useCallback(
    async (msg: ChatMessage, bundle: StoredDeviceKeyBundle | null): Promise<ChatMessage> => {
      if (!msg.e2eeEnvelope || !bundle) return msg;
      try {
        const res = await decryptWithDeviceKey({
          bundle,
          envelopeJson: msg.e2eeEnvelope,
        });
        return {
          ...msg,
          isEncrypted: true,
          e2eeVerified: res.verified,
          decryptedBody: res.plaintext,
        };
      } catch {
        return {
          ...msg,
          isEncrypted: true,
          e2eeVerified: false,
          decryptedBody: '[Encrypted message — key mismatch or unavailable]',
        };
      }
    },
    []
  );

  const loadDemoData = useCallback(async () => {
    setUser(DEMO_USER);
    setPrivacy(DEMO_PRIVACY);
    setSessions(DEMO_SESSIONS);
    setConversations(DEMO_CONVERSATIONS);
    setActiveConversationId(DEMO_CONVERSATIONS[0]?.id ?? null);
    setMessagesByConv(DEMO_MESSAGES_BY_CONVERSATION);
    setDirectoryUsers(DEMO_CONTACTS);
    setSavedNotes(DEMO_SAVED_NOTES);
    setStickerPacks(DEMO_STICKER_PACKS);
    setStories(DEMO_STORIES);
    setNotifications(DEMO_NOTIFICATIONS);
    setReminders(DEMO_REMINDERS);
    setCalls(DEMO_CALL_RECORDS);
    setGroupPolls(DEMO_GROUP_POLLS);
    setGroupEvents(DEMO_GROUP_EVENTS);
    setGroupTasks(DEMO_GROUP_TASKS);
    setChannels(DEMO_CHANNELS);
    setSelectedChannelId(DEMO_CHANNELS[0]?.id ?? null);
    setChannelPostsById(DEMO_CHANNEL_POSTS);
    setChannelMembersById(DEMO_CHANNEL_MEMBERS);
    setMediaLibrary(DEMO_MEDIA_LIBRARY);
    setLocationsByConv({ 201: DEMO_LOCATION_SHARES });
    setFriendRequests(DEMO_FRIEND_REQUESTS);
    setRecentContacts(DEMO_CONTACTS);
    setBackups(DEMO_BACKUPS);
    setLoginHistory(DEMO_LOGIN_HISTORY);
    setSafetyReports(DEMO_SAFETY_REPORTS);
    setAuditLogs(DEMO_AUDIT_LOGS);
    setMobileShowThread(false);
    try {
      const bundle = await ensureDeviceKeyBundle(DEMO_USER.uid);
      setE2eeBundle(bundle);
    } catch {
      // WebCrypto unavailable
    }
  }, []);

  // Initialize local device keypair for demo mode on first boot
  useEffect(() => {
    if (mode === 'demo' && !e2eeBundle) {
      ensureDeviceKeyBundle(DEMO_USER.uid)
        .then(setE2eeBundle)
        .catch(() => {});
    }
  }, [mode, e2eeBundle]);

  const hydrateLiveWorkspace = useCallback(async (token: string) => {
    // Verify Google Firebase Auth session and sync the Cloud Firestore user profile and device session.
    const ctx = await verifyAuthSession(token);
    if (!ctx.verified) {
      throw new Error('Firebase Auth session verification failed.');
    }

    const [
      convResult,
      notesResult,
      dirResult,
      stickerResult,
      storiesResult,
      notifResult,
      remResult,
      callResult,
      secResult,
      friendsResult,
      channelsResult,
      mediaResult,
      backupsResult,
      reportsResult,
      auditResult,
    ] = await Promise.allSettled([
      listConversations(token),
      fetchSavedNotes(token),
      searchDirectory(token, ''),
      fetchStickerPacks(token),
      fetchStoriesApi(token),
      fetchNotificationsApi(token),
      fetchReminders(token),
      fetchCallHistoryApi(token),
      fetchSecurityBundleApi(token),
      fetchFriendsWorkspaceApi(token),
      fetchChannelsApi(token),
      fetchMediaLibraryApi(token),
      fetchEncryptedBackupsApi(token),
      fetchSafetyReportsApi(token),
      fetchModeratorAuditLogsApi(token),
    ]);

    const convRes = convResult.status === 'fulfilled' ? convResult.value : { conversations: [] };
    const notesRes = notesResult.status === 'fulfilled' ? notesResult.value : { notes: [] };
    const dirRes = dirResult.status === 'fulfilled' ? dirResult.value : { users: [] };
    const stickerRes = stickerResult.status === 'fulfilled' ? stickerResult.value : { packs: [] };
    const storiesRes = storiesResult.status === 'fulfilled' ? storiesResult.value : { stories: [] };
    const notifRes = notifResult.status === 'fulfilled' ? notifResult.value : { notifications: [] };
    const remRes = remResult.status === 'fulfilled' ? remResult.value : { reminders: [] };
    const callRes = callResult.status === 'fulfilled' ? callResult.value : { calls: [] };
    const secRes = secResult.status === 'fulfilled' ? secResult.value : null;
    const friendsRes = friendsResult.status === 'fulfilled' ? friendsResult.value : null;
    const channelsRes = channelsResult.status === 'fulfilled' ? channelsResult.value : null;
    const mediaRes = mediaResult.status === 'fulfilled' ? mediaResult.value : null;
    const backupsRes = backupsResult.status === 'fulfilled' ? backupsResult.value : null;
    const reportsRes = reportsResult.status === 'fulfilled' ? reportsResult.value : null;
    const auditRes = auditResult.status === 'fulfilled' ? auditResult.value : null;

    const firstCriticalErr =
      convResult.status === 'rejected'
        ? convResult.reason
        : dirResult.status === 'rejected'
          ? dirResult.reason
          : null;
    setWorkspaceError(
      firstCriticalErr
        ? firstCriticalErr instanceof Error
          ? firstCriticalErr.message
          : String(firstCriticalErr)
        : null
    );

    setUser(ctx.user);
    setPrivacy(ctx.privacy);
    setSessions(ctx.sessions);
    setLang(ctx.user.preferredLanguage);
    setThemeMode(ctx.user.themeMode);
    setAccentColor(ctx.user.accentColor);
    setConversations(convRes.conversations);
    setActiveConversationId(convRes.conversations[0]?.id ?? null);
    setSavedNotes(notesRes.notes);
    setDirectoryUsers(dirRes.users);
    setStickerPacks(stickerRes.packs);
    setStories(storiesRes.stories);
    setNotifications(notifRes.notifications);
    setReminders(remRes.reminders);
    setCalls(callRes.calls);
    setMessagesByConv({});
    setLocationsByConv({});
    setAuthError(null);

    if (secRes) {
      setNotificationPrefs(secRes.notificationPrefs);
      setAccessibilityPrefs(secRes.accessibilityPrefs);
      setHasPinLock(secRes.hasPinLock);
      setAppLocked(secRes.hasPinLock);
      setCrashDiagnosticsOptIn(secRes.crashDiagnosticsOptIn);
      setPhoneDiscoveryConsent(secRes.phoneDiscoveryConsent);
      setLoginHistory(secRes.loginHistory);
    }
    if (friendsRes) {
      setInviteToken(friendsRes.inviteToken);
      setFriendRequests(friendsRes.requests);
      setRecentContacts(friendsRes.recentContacts);
    }
    if (channelsRes) {
      setChannels(channelsRes.channels);
      setSelectedChannelId(channelsRes.channels[0]?.id ?? null);
    }
    if (mediaRes) {
      setMediaLibrary(mediaRes.items);
    }
    if (backupsRes) {
      setBackups(backupsRes.backups);
    }
    if (reportsRes) {
      setSafetyReports(reportsRes.reports);
    }
    if (auditRes) {
      setAuditLogs(auditRes.logs);
    }

    setMode('live');

    const firstGroup = convRes.conversations.find((c) => c.type === 'group');
    if (firstGroup) setActiveGroupId(firstGroup.id);

    try {
      const bundle = await ensureDeviceKeyBundle(ctx.user.uid);
      setE2eeBundle(bundle);
      await registerE2eePublicKey(token, {
        deviceId: bundle.deviceId,
        publicKeyJwk: JSON.stringify(bundle.publicKeyJwk),
      });
    } catch {
      // Non-fatal if IndexedDB/WebCrypto restricted
    }
  }, []);

  const ensureHydratedForUser = useCallback(
    async (uid: string, token: string) => {
      if (hydratedUidRef.current === uid) return;
      if (hydrationInFlightRef.current && hydrationInFlightRef.current.uid === uid) {
        return hydrationInFlightRef.current.promise;
      }
      const p = hydrateLiveWorkspace(token).then(() => {
        hydratedUidRef.current = uid;
      });
      hydrationInFlightRef.current = { uid, promise: p };
      try {
        await p;
      } finally {
        if (hydrationInFlightRef.current?.promise === p) {
          hydrationInFlightRef.current = null;
        }
      }
    },
    [hydrateLiveWorkspace]
  );

  // Firebase Auth ID token listener (handles initial persistence across reloads + automatic 1-hour refreshes)
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setIdToken(token);
          await ensureHydratedForUser(fbUser.uid, token);
        } catch (err) {
          console.error('Failed to verify Google ID token or hydrate live workspace:', err);
          const msg = err instanceof Error ? err.message : String(err);
          const lower = msg.toLowerCase();
          const isOfflineTransient =
            (typeof navigator !== 'undefined' && navigator.onLine === false) ||
            lower.includes('offline') ||
            lower.includes('unavailable');

          if (isOfflineTransient) {
            setWorkspaceError(
              langRef.current === 'ar'
                ? 'أنت غير متصل حالياً — يتم استخدام البيانات المخزنة محلياً حتى عودة الاتصال.'
                : 'Currently offline — using cached workspace until connection returns.'
            );
            return;
          }

          const isAuthCredentialError =
            lower.includes('auth/') ||
            lower.includes('token') ||
            lower.includes('unauthenticated') ||
            lower.includes('session verification failed');

          if (isAuthCredentialError) {
            hydratedUidRef.current = null;
            setIdToken(null);
            rotateChatlySessionId();
            await signOutFirebase().catch(() => {});
            setAuthError(formatFirebaseAuthError(err, langRef.current));
            setMode('landing');
          } else {
            setWorkspaceError(msg);
          }
        }
      } else {
        hydratedUidRef.current = null;
        hydrationInFlightRef.current = null;
        setIdToken(null);
        if (!autostartActive.current) {
          setMode((prev) => (prev === 'demo' ? 'demo' : 'landing'));
        }
      }
    });
    return () => unsubscribe();
  }, [ensureHydratedForUser]);

  // Worldwide real-time Firestore subscriptions for authenticated users
  useEffect(() => {
    const currentFbUser = auth.currentUser;
    if (mode !== 'live' || !idToken || !currentFbUser) {
      return;
    }

    const uid = currentFbUser.uid;
    void setMyOnlinePresence(true);

    const onVisibility = () => {
      void setMyOnlinePresence(document.visibilityState === 'visible');
    };
    const onUnload = () => {
      void setMyOnlinePresence(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);

    let lastNotifCount = 0;
    const unsubscribeWorkspace = subscribeWorldwideWorkspace(uid, {
      onConversationsUpdated: (nextConvs) => {
        setConversations((prev) => {
          const draftMap = new Map(prev.map((c) => [c.id, c.draftBody]));
          return nextConvs.map((c) => ({
            ...c,
            draftBody: draftMap.get(c.id) ?? c.draftBody,
          }));
        });
      },
      onDirectoryUpdated: (nextUsers) => {
        setDirectoryUsers(nextUsers);
        setRecentContacts(nextUsers.slice(0, 12));
      },
      onFriendRequestsUpdated: (nextRequests) => {
        setFriendRequests(nextRequests);
      },
      onNotificationsUpdated: (nextNotifs) => {
        setNotifications(nextNotifs);
        if (nextNotifs.length > lastNotifCount && lastNotifCount > 0) {
          const latest = nextNotifs[0];
          const prefs = notificationPrefsRef.current;
          if (latest && !shouldSuppressNotification(prefs, null)) {
            const preview = formatNotificationPreview(prefs, latest.title, latest.body);
            triggerDesktopOrBrowserNotification(preview.title, preview.body);
            playNotificationSound(prefs.soundId);
          }
        }
        lastNotifCount = nextNotifs.length;
      },
      onStoriesUpdated: (nextStories) => {
        setStories(nextStories);
      },
      onCallsUpdated: (nextCalls, incomingCall) => {
        setCalls(nextCalls);
        if (incomingCall) {
          try {
            const offer = JSON.parse(incomingCall.offerSdp) as RTCSessionDescriptionInit;
            setActiveCall((prev) => {
              if (prev && prev.callId === incomingCall.id) return prev;
              return {
                callId: incomingCall.id,
                conversationId: incomingCall.conversationId,
                peerUserId: null,
                peerName: incomingCall.callerName,
                callType: incomingCall.callType,
                direction: 'incoming',
                incomingOffer: offer,
              };
            });
            setSection('calls');
          } catch {
            // ignore malformed offer
          }
        }
      },
      onActiveCallUpdated: () => {},
      onError: (err) => {
        setWorkspaceError(err.message);
      },
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
      unsubscribeWorkspace();
    };
  }, [mode, idToken]);

  const activeConvForSub = conversations.find((c) => c.id === activeConversationId) || null;
  const activeConvType = activeConvForSub?.type ?? null;
  const activePeerId = activeConvForSub?.peer?.id ?? null;

  // Real-time Firestore listener for active conversation messages, typing, locations & E2EE peer key
  useEffect(() => {
    const currentFbUser = auth.currentUser;
    if (mode !== 'live' || !idToken || !currentFbUser || !activeConversationId) {
      setThreadLoading(false);
      return;
    }

    let cancelled = false;
    let lastCount = -1;
    setThreadError(null);
    setThreadLoading(true);

    const unsubConv = subscribeActiveConversation(currentFbUser.uid, activeConversationId, {
      onMessages: async (rawMessages) => {
        const decoded = await Promise.all(
          rawMessages.map((m) => decryptMessageIfNeeded(m, e2eeBundleRef.current))
        );
        if (cancelled) return;
        const ordered = sortAndDedupeMessages(decoded);
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConversationId]: ordered,
        }));
        setHasMoreByConv((prev) => ({
          ...prev,
          [activeConversationId]: false,
        }));
        setThreadLoading(false);
        if (lastCount >= 0 && ordered.length > lastCount) {
          const newest = ordered[ordered.length - 1];
          const prefs = notificationPrefsRef.current;
          if (
            newest &&
            newest.senderId !== userIdRef.current &&
            !shouldSuppressNotification(prefs, activeConversationId)
          ) {
            playNotificationSound(prefs.soundId);
          }
        }
        lastCount = ordered.length;
      },
      onTyping: (peerIsTyping) => {
        if (!cancelled) {
          setTypingByConv((prev) => ({ ...prev, [activeConversationId]: peerIsTyping }));
        }
      },
      onLocations: (locs) => {
        if (!cancelled) {
          setLocationsByConv((prev) => ({ ...prev, [activeConversationId]: locs }));
        }
      },
      onError: (err) => {
        if (!cancelled) {
          setThreadLoading(false);
          setThreadError(err.message);
        }
      },
    });

    if (activeConvType === 'direct' && activePeerId) {
      fetchUserE2eeKeys(idToken, activePeerId)
        .then((res) => {
          if (cancelled) return;
          const raw = res.keys[0]?.publicKeyJwk;
          const jwk = raw ? (JSON.parse(raw) as JsonWebKey) : null;
          setPeerE2eePubJwkByConv((prev) => ({
            ...prev,
            [activeConversationId]: jwk,
          }));
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      unsubConv();
    };
  }, [mode, idToken, activeConversationId, activeConvType, activePeerId, decryptMessageIfNeeded]);

  // Fetch channel posts & members when selecting a channel in live mode
  useEffect(() => {
    if (mode !== 'live' || !idToken || !selectedChannelId) return;
    let cancelled = false;
    setChannelsLoading(true);
    fetchChannelDetailsApi(idToken, selectedChannelId)
      .then((res) => {
        if (cancelled) return;
        setChannelPostsById((prev) => ({ ...prev, [selectedChannelId]: res.posts }));
        setChannelMembersById((prev) => ({ ...prev, [selectedChannelId]: res.members }));
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkspaceError(err instanceof Error ? err.message : 'Failed to load channel details.');
        }
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, idToken, selectedChannelId]);

  // Fetch group details when selecting a group in GroupsView
  useEffect(() => {
    if (mode !== 'live' || !idToken || !activeGroupId) return;
    let cancelled = false;
    fetchGroupDetailsApi(idToken, activeGroupId)
      .then((details) => {
        if (cancelled) return;
        setGroupMembers(details.members);
        setGroupJoinRequests(details.joinRequests);
        setGroupPolls(details.polls);
        setGroupEvents(details.events);
        setGroupTasks(details.tasks);
        setGroupMediaGallery(details.mediaGallery);
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkspaceError(err instanceof Error ? err.message : 'Failed to load group details.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, idToken, activeGroupId]);

  // Directory search
  useEffect(() => {
    if (mode === 'demo') {
      const q = directoryQuery.trim().replace(/^@+/, '').toLowerCase();
      setDirectoryUsers(
        DEMO_CONTACTS.filter(
          (c) =>
            !q ||
            c.username.toLowerCase().includes(q) ||
            c.displayName.toLowerCase().includes(q)
        )
      );
      return;
    }

    if (mode === 'live' && idToken) {
      let cancelled = false;
      setDirectoryLoading(true);
      const timer = window.setTimeout(() => {
        searchDirectory(idToken, directoryQuery)
          .then((res) => {
            if (!cancelled) setDirectoryUsers(res.users);
          })
          .catch((err) => {
            if (!cancelled) {
              setWorkspaceError(err instanceof Error ? err.message : 'Failed to search directory.');
            }
          })
          .finally(() => {
            if (!cancelled) setDirectoryLoading(false);
          });
      }, 180);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
  }, [mode, idToken, directoryQuery]);

  const handleSignInWithGoogle = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const credential = await signInWithGooglePopup();
      const token = await credential.user.getIdToken();
      setIdToken(token);
      await ensureHydratedForUser(credential.user.uid, token);
    } catch (err) {
      hydratedUidRef.current = null;
      setIdToken(null);
      setAuthError(formatFirebaseAuthError(err, lang));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEnterDemo = () => {
    loadDemoData();
    setMode('demo');
  };

  const handleExitOrSignOut = async () => {
    if (mode === 'live') {
      if (idToken) {
        await logoutAuthSession(idToken).catch(() => {});
      }
      rotateChatlySessionId();
      hydratedUidRef.current = null;
      await signOutFirebase().catch(() => {});
    }
    autostartActive.current = false;
    setIdToken(null);
    setMode('landing');
  };

  const handleSelectConversation = (id: number) => {
    setActiveConversationId(id);
    setMobileShowThread(true);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleLoadOlderMessages = async () => {
    if (mode !== 'live' || !idToken || !activeConversationId) return;
    const current = messagesByConv[activeConversationId] || [];
    const oldest = current[0];
    if (!oldest) return;
    try {
      const res = await fetchMessages(idToken, activeConversationId, { beforeId: oldest.id });
      const decoded = await Promise.all(
        res.messages.map((m) => decryptMessageIfNeeded(m, e2eeBundle))
      );
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: sortAndDedupeMessages([
          ...decoded,
          ...(prev[activeConversationId] || []),
        ]),
      }));
      setHasMoreByConv((prev) => ({ ...prev, [activeConversationId]: res.hasMore }));
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to load older messages.');
    }
  };

  const handleSendMessage = async (payload: {
    body: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice_sticker';
    replyToId?: number | null;
    attachmentFile?: {
      file: Blob;
      fileName: string;
      mimeType: string;
      kind: 'image' | 'video' | 'audio' | 'document';
      durationMs?: number;
    };
    sticker?: VoiceStickerItem;
    scheduledAt?: string | null;
    scheduledFor?: string | null;
    onUploadProgress?: (pct: number) => void;
    abortSignal?: AbortSignal;
  }) => {
    if (!activeConversationId) return;
    const clientMessageId = `msg_${crypto.randomUUID()}`;
    const conv = conversations.find((c) => c.id === activeConversationId);
    const list = messagesByConv[activeConversationId] || [];
    const replyTarget = payload.replyToId
      ? list.find((m) => m.id === payload.replyToId)
      : undefined;
    const effectiveSchedule = payload.scheduledAt ?? payload.scheduledFor ?? null;
    const isFutureScheduled = Boolean(
      effectiveSchedule && new Date(effectiveSchedule).getTime() > Date.now()
    );

    if (mode === 'demo') {
      let attachment: MediaAttachmentMeta | null = null;
      if (payload.attachmentFile) {
        payload.onUploadProgress?.(100);
        attachment = {
          id: `demo_att_${Date.now()}`,
          kind: payload.attachmentFile.kind,
          fileName: payload.attachmentFile.fileName,
          mimeType: payload.attachmentFile.mimeType,
          sizeBytes: payload.attachmentFile.file.size,
          url: URL.createObjectURL(payload.attachmentFile.file),
          durationMs: payload.attachmentFile.durationMs || 0,
        };
        setMediaLibrary((prev) => [
          {
            ...attachment!,
            conversationId: activeConversationId,
            uploaderId: user.id,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      const nextMsg: ChatMessage = {
        id: Date.now(),
        clientMessageId,
        conversationId: activeConversationId,
        senderId: user.id,
        senderUsername: user.username,
        senderDisplayName: user.displayName,
        type: payload.type || 'text',
        body: payload.body,
        attachment,
        sticker: payload.sticker || null,
        replyToId: payload.replyToId ?? null,
        replyPreview: replyTarget
          ? {
              id: replyTarget.id,
              senderDisplayName: replyTarget.senderDisplayName,
              body: replyTarget.body,
            }
          : null,
        scheduledAt: effectiveSchedule,
        scheduledFor: effectiveSchedule,
        deliveredAt: isFutureScheduled ? null : new Date().toISOString(),
        reactions: [],
        createdAt: new Date().toISOString(),
      };

      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...(prev[activeConversationId] || []), nextMsg],
      }));
      if (!isFutureScheduled) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  lastMessagePreview: payload.body,
                  lastMessageAt: nextMsg.createdAt,
                  draftBody: '',
                }
              : c
          )
        );
      }
      return;
    }

    if (mode === 'live' && idToken) {
      setSendingMessage(true);
      try {
        let attachmentId: string | null = null;
        if (payload.attachmentFile) {
          const uploaded = await uploadMediaWithProgress(
            idToken,
            {
              ...payload.attachmentFile,
              conversationId: activeConversationId,
            },
            payload.onUploadProgress,
            payload.abortSignal
          );
          attachmentId = uploaded.id;
          fetchMediaLibraryApi(idToken)
            .then((r) => setMediaLibrary(r.items))
            .catch(() => {});
        }

        let e2eeEnvelope: string | null = null;
        let finalBody = payload.body;
        const peerJwk = peerE2eePubJwkByConv[activeConversationId];
        const useE2ee =
          Boolean(e2eeEnabledByConv[activeConversationId]) &&
          conv?.type === 'direct' &&
          Boolean(peerJwk) &&
          Boolean(e2eeBundle) &&
          (payload.type || 'text') === 'text';

        if (useE2ee && e2eeBundle && peerJwk) {
          e2eeEnvelope = await encryptForRecipient({
            bundle: e2eeBundle,
            recipientPublicKeyJwk: peerJwk,
            plaintext: payload.body,
          });
          finalBody = '[Encrypted message]';
        }

        const res = await sendMessage(idToken, activeConversationId, {
          clientMessageId,
          type: payload.type || 'text',
          body: finalBody,
          e2eeEnvelope,
          attachmentId,
          stickerId: payload.sticker?.id ?? null,
          replyToId: payload.replyToId ?? null,
          scheduledAt: effectiveSchedule,
          scheduledFor: effectiveSchedule,
        });

        const displayed: ChatMessage = e2eeEnvelope
          ? {
              ...res.message,
              isEncrypted: true,
              e2eeVerified: true,
              decryptedBody: payload.body,
            }
          : res.message;

        setMessagesByConv((prev) => ({
          ...prev,
          [activeConversationId]: sortAndDedupeMessages([
            ...(prev[activeConversationId] || []),
            displayed,
          ]),
        }));

        if (!isFutureScheduled) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConversationId
                ? {
                    ...c,
                    lastMessagePreview: displayed.decryptedBody ?? displayed.body,
                    lastMessageAt: displayed.createdAt,
                    draftBody: '',
                  }
                : c
            )
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message.';
        setThreadError(msg);
        throw err;
      } finally {
        setSendingMessage(false);
      }
    }
  };

  const handleToggleReaction = async (
    messageId: number,
    emoji: string,
    syncedReactions?: ReactionSummary[]
  ) => {
    if (!activeConversationId) return;

    if (mode === 'demo') {
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                reactions: toggleReactionInList(msg.reactions || [], emoji, user.id, true),
              }
            : msg
        ),
      }));
      return;
    }

    if (syncedReactions) {
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, reactions: syncedReactions } : msg
        ),
      }));
      return;
    }

    if (mode === 'live' && idToken) {
      const res = await toggleMessageReactionApi(idToken, messageId, emoji);
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, reactions: res.reactions } : msg
        ),
      }));
    }
  };

  const handleMutateMessage = async (
    messageId: number,
    action: 'edit' | 'delete' | 'pin' | 'star',
    body?: string
  ) => {
    if (!activeConversationId) return;
    if (mode === 'demo') {
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((msg) => {
          if (msg.id !== messageId) return msg;
          if (action === 'edit' && body) {
            return { ...msg, body, editedAt: new Date().toISOString() };
          }
          if (action === 'delete') {
            return { ...msg, body: '', deletedAt: new Date().toISOString() };
          }
          if (action === 'pin') return { ...msg, pinned: !msg.pinned };
          if (action === 'star') return { ...msg, starred: !msg.starred };
          return msg;
        }),
      }));
      return;
    }

    if (mode === 'live' && idToken) {
      const res = await mutateMessage(idToken, messageId, { action, body });
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((msg) =>
          msg.id === messageId ? res.message : msg
        ),
      }));
    }
  };

  const handleForwardMessage = async (message: ChatMessage, targetConversationId: number) => {
    const clientMessageId = `msg_${crypto.randomUUID()}`;
    const body = message.decryptedBody ?? message.body;
    if (mode === 'demo') {
      const nextMsg: ChatMessage = {
        ...message,
        id: Date.now(),
        clientMessageId,
        conversationId: targetConversationId,
        senderId: user.id,
        senderUsername: user.username,
        senderDisplayName: user.displayName,
        forwardedFromId: message.id,
        reactions: [],
        createdAt: new Date().toISOString(),
      };
      setMessagesByConv((prev) => ({
        ...prev,
        [targetConversationId]: [...(prev[targetConversationId] || []), nextMsg],
      }));
      return;
    }

    if (mode === 'live' && idToken) {
      await sendMessage(idToken, targetConversationId, {
        clientMessageId,
        type: 'text',
        body,
        forwardedFromId: message.id,
      });
    }
  };

  const handleCreateReminder = async (
    messageId: number,
    remindAt: string,
    note: string
  ) => {
    if (!activeConversationId) return;
    if (mode === 'demo') {
      const msg = (messagesByConv[activeConversationId] || []).find((m) => m.id === messageId);
      setReminders((prev) => [
        {
          id: Date.now(),
          messageId,
          conversationId: activeConversationId,
          messageBody: msg?.body || '',
          remindAt,
          note,
          triggered: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }
    if (mode === 'live' && idToken) {
      const res = await createReminder(idToken, { messageId, remindAt, note });
      setReminders((prev) => [res.reminder, ...prev]);
    }
  };

  const handleUpdateConversationMeta = async (
    conversationId: number,
    patch: {
      pinned?: boolean;
      needsFollowUp?: boolean;
      archived?: boolean;
      snoozedUntil?: string | null;
      customLabel?: string;
      folder?: SmartFolder;
      draftBody?: string;
    }
  ) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, ...patch } : c))
    );
    if (mode === 'live' && idToken) {
      await updateConversationMeta(idToken, conversationId, patch);
    }
  };

  const handleStartChat = async (peer: PublicUserSummary) => {
    if (mode === 'demo') {
      const existing = conversations.find((c) => c.peer?.id === peer.id);
      if (existing) {
        setActiveConversationId(existing.id);
      } else {
        const newId = Date.now();
        const created: ConversationSummary = {
          id: newId,
          type: 'direct',
          title: peer.displayName,
          folder: 'all',
          pinned: false,
          needsFollowUp: false,
          unreadCount: 0,
          peer,
          lastMessagePreview: '',
          lastMessageAt: new Date().toISOString(),
        };
        setConversations((prev) => [created, ...prev]);
        setActiveConversationId(newId);
      }
      setSection('chats');
      setMobileShowThread(true);
      return;
    }

    if (mode === 'live' && idToken) {
      try {
        const res = await openDirectConversation(idToken, peer.id);
        setConversations(res.conversations);
        setActiveConversationId(res.conversationId);
        setSection('chats');
        setMobileShowThread(true);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Unable to start conversation.');
      }
    }
  };

  const handleAddNote = async (input: {
    category: 'note' | 'link' | 'snippet';
    title: string;
    content: string;
  }) => {
    if (mode === 'demo') {
      setSavedNotes((prev) => [
        { id: Date.now(), ...input, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      return;
    }
    if (mode === 'live' && idToken) {
      const res = await addSavedNote(idToken, input);
      setSavedNotes((prev) => [res.note, ...prev]);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (mode === 'demo') {
      setSavedNotes((prev) => prev.filter((n) => n.id !== noteId));
      return;
    }
    if (mode === 'live' && idToken) {
      await removeSavedNote(idToken, noteId);
      setSavedNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  };

  const handleSavePrivacy = async (next: PrivacySettings) => {
    if (mode === 'demo') {
      setPrivacy(next);
      return;
    }
    if (mode === 'live' && idToken) {
      setSavingPrivacy(true);
      try {
        const res = await savePrivacy(idToken, next);
        setPrivacy(res.privacy);
      } finally {
        setSavingPrivacy(false);
      }
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (mode === 'demo') {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, revokedAt: new Date().toISOString() } : s
        )
      );
      return;
    }
    if (mode === 'live' && idToken) {
      await revokeDeviceSession(idToken, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
  };

  const handleRotateE2eeKey = async () => {
    const bundle = await ensureDeviceKeyBundle(user.uid, true);
    setE2eeBundle(bundle);
    if (mode === 'live' && idToken) {
      await registerE2eePublicKey(idToken, {
        deviceId: bundle.deviceId,
        publicKeyJwk: JSON.stringify(bundle.publicKeyJwk),
      });
    }
  };

  const handleSaveProfile = async (payload: {
    username: string;
    displayName: string;
    bio: string;
    statusText: string;
    preferredLanguage: LanguageCode;
    themeMode: ThemeMode;
    accentColor: AccentColor;
    twoFactorEnabled: boolean;
    phoneNumber: string;
  }) => {
    setProfileError(null);
    if (mode === 'demo') {
      setUser((prev) => ({ ...prev, ...payload }));
      return;
    }
    if (mode === 'live' && idToken) {
      setSavingProfile(true);
      try {
        const res = await saveProfile(idToken, payload);
        setUser(res.user);
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Failed to save profile.');
      } finally {
        setSavingProfile(false);
      }
    }
  };

  const handleStartCall = async (conversationId: number, callType: 'audio' | 'video') => {
    const conv = conversations.find((c) => c.id === conversationId);
    let callId: number | null = null;
    if (mode === 'live' && idToken) {
      const res = await createCallRecordApi(idToken, { conversationId, callType });
      callId = res.call.id;
      setCalls((prev) => [res.call, ...prev]);
    } else {
      const demoCall: CallRecordItem = {
        id: Date.now(),
        conversationId,
        peerDisplayName: conv?.title || 'Call',
        peerUsername: conv?.peer?.username || 'group',
        callerId: user.id,
        callType,
        status: 'active',
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      callId = demoCall.id;
      setCalls((prev) => [demoCall, ...prev]);
    }
    setActiveCall({
      callId,
      conversationId,
      peerUserId: conv?.peer?.id ?? null,
      peerName: conv?.title || 'Chatly Call',
      callType,
      direction: 'outgoing',
    });
    setSection('calls');
  };

  const handleEndCall = async (callId: number | null, status: 'ended' | 'declined') => {
    setActiveCall(null);
    if (callId && mode === 'live' && idToken) {
      await updateCallStatusApi(idToken, callId, status);
      const res = await fetchCallHistoryApi(idToken);
      setCalls(res.calls);
    } else if (callId) {
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId ? { ...c, status, endedAt: new Date().toISOString() } : c
        )
      );
    }
  };

  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  if (mode === 'auth_loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
          <ChatlyLogo accentColor={accentColor} size={36} />
          <span className="font-display text-lg font-semibold">{t.brandName}</span>
        </div>
      </div>
    );
  }

  if (mode === 'landing') {
    return (
      <AuthLanding
        lang={lang}
        themeMode={themeMode}
        accentColor={accentColor}
        authBusy={authBusy}
        authError={authError}
        onToggleLanguage={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
        onToggleTheme={() => setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onSignInWithGoogle={handleSignInWithGoogle}
        onEnterDemoWorkspace={handleEnterDemo}
      />
    );
  }

  const allNavItems: { id: AppSection; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chats', label: t.navChats, icon: MessageSquare },
    { id: 'groups', label: t.navGroups, icon: Layers },
    { id: 'channels', label: t.navChannels, icon: Radio },
    { id: 'stories', label: t.navStories, icon: CircleDot },
    { id: 'stickers', label: t.navStickers, icon: Sticker },
    { id: 'calls', label: t.navCalls, icon: Phone },
    { id: 'directory', label: t.navDirectory, icon: Users },
    { id: 'media', label: t.navMedia, icon: HardDrive },
    { id: 'saved', label: t.navSaved, icon: Bookmark },
    { id: 'notifications', label: t.navNotifications, icon: Bell },
    { id: 'privacy', label: t.navPrivacy, icon: Shield },
    { id: 'profile', label: t.navProfile, icon: User },
  ];

  const primaryMobileNav = allNavItems.filter((i) =>
    ['chats', 'groups', 'stickers', 'directory'].includes(i.id)
  );
  const secondaryMobileNav = allNavItems.filter(
    (i) => !['chats', 'groups', 'stickers', 'directory'].includes(i.id)
  );

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;
  const activeMessages = activeConversationId
    ? messagesByConv[activeConversationId] || []
    : [];
  const activeGroups = conversations.filter((c) => c.type === 'group');
  const unreadAlertsCount = notifications.filter((n) => !n.readAt).length;
  const totalUnreadChats = conversations
    .filter((c) => !c.archived)
    .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--chatly-bg-canvas)] text-[var(--chatly-text-primary)] overflow-hidden">
      {/* Compact Oceanic Navy Top Bar */}
      <header className="h-14 border-b border-white/10 bg-[var(--chatly-bg-sidebar)] text-white px-4 sm:px-5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ChatlyLogo accentColor={accentColor} size={30} />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display font-bold text-base tracking-tight whitespace-nowrap shrink-0">
              {t.brandName}
            </span>
            <span className="hidden lg:inline text-xs text-slate-400 truncate">
              · {mode === 'demo' ? (lang === 'ar' ? 'مساحة العرض' : 'Demo Workspace') : (lang === 'ar' ? 'متزامن لحظياً' : 'Firestore Real-Time')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
            aria-label={t.languageLabel}
            className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-white/12 text-xs font-medium text-slate-100 hover:bg-[var(--chatly-bg-sidebar-hover)] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>{t.languageLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label={themeMode === 'dark' ? t.lightMode : t.darkMode}
            className="min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl border border-white/12 text-xs font-medium text-slate-100 hover:bg-[var(--chatly-bg-sidebar-hover)] flex items-center justify-center gap-1.5 shrink-0"
          >
            {themeMode === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-teal-400" />
            )}
            <span className="hidden sm:inline">
              {themeMode === 'dark' ? t.lightMode : t.darkMode}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExitOrSignOut}
            aria-label={mode === 'demo' ? t.exitDemo : t.signOut}
            className="min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl border border-white/12 text-xs font-medium text-slate-100 hover:bg-[var(--chatly-bg-sidebar-hover)] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {mode === 'demo' ? t.exitDemo : t.signOut}
            </span>
          </button>
        </div>
      </header>

      {(!isOnlineNet || workspaceError) && (
        <div
          role={workspaceError ? 'alert' : 'status'}
          className="px-4 py-2 border-b border-amber-500/30 bg-amber-500/10 text-xs flex items-center justify-between gap-3 shrink-0"
        >
          <span className="text-amber-800 dark:text-amber-200 font-medium truncate">
            {workspaceError ||
              (lang === 'ar'
                ? 'وضع غير متصل — سيتم مزامنة الرسائل تلقائياً عند عودة الإنترنت.'
                : 'Offline — queued messages will sync automatically when back online.')}
          </span>
          {workspaceError && (
            <button
              type="button"
              onClick={() => setWorkspaceError(null)}
              aria-label="Dismiss alert"
              className="p-1 rounded-lg text-amber-800 dark:text-amber-200 hover:bg-amber-500/15 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden pb-14 lg:pb-0">
        {/* Desktop Oceanic Navigation Sidebar */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex w-56 flex-col p-3 gap-3 border-e border-white/10 bg-[var(--chatly-bg-sidebar)] text-slate-300 shrink-0 overflow-y-auto"
        >
          {/* Active User Card */}
          <button
            type="button"
            onClick={() => setSection('profile')}
            className="w-full p-2.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-[var(--chatly-bg-sidebar-hover)] flex items-center gap-2.5 text-start transition-colors"
          >
            <div className="relative shrink-0">
              <ChatlyAvatar src={user.avatarUrl} name={user.displayName} size="sm" />
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--chatly-bg-sidebar)]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user.displayName}</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span>{t.onlineLabel}</span>
              </div>
            </div>
          </button>

          {/* Primary Sidebar CTA matching reference */}
          <button
            type="button"
            onClick={() => setSection('directory')}
            className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shadow-[0_6px_18px_rgba(6,182,212,0.24)] transition-all ${palette.primaryBg} ${palette.primaryHover}`}
          >
            <span>+ {t.newChatBtn}</span>
          </button>

          {/* Vertical Nav Links */}
          <div className="flex-1 flex flex-col gap-1">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              const badgeCount =
                item.id === 'chats'
                  ? totalUnreadChats
                  : item.id === 'notifications'
                    ? unreadAlertsCount
                    : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    if (item.id === 'chats') setMobileShowThread(false);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-gradient-to-r from-teal-500/22 to-cyan-500/12 text-teal-300 border border-teal-400/25 shadow-[inset_0_0_16px_rgba(20,184,166,0.12)]'
                      : 'text-slate-300/85 hover:bg-[var(--chatly-bg-sidebar-hover)] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-300' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badgeCount > 0 && (
                    <span
                      className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-mono tabular-nums font-bold flex items-center justify-center ${
                        item.id === 'notifications'
                          ? 'bg-rose-500 text-white'
                          : 'bg-teal-500 text-slate-950'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Active Section */}
        <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
          {section === 'chats' && (
            <div className="flex-1 flex min-w-0 min-h-0">
              <aside
                className={`${
                  mobileShowThread ? 'hidden lg:block' : 'block'
                } w-full lg:w-80 xl:w-96 shrink-0 h-full`}
              >
                <ConversationListPane
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  currentUser={user}
                  stories={stories}
                  typingByConv={typingByConv}
                  searchQuery={chatSearch}
                  activeFolder={activeFolder}
                  lang={lang}
                  accentColor={accentColor}
                  onSearchChange={setChatSearch}
                  onFolderChange={setActiveFolder}
                  onSelectConversation={handleSelectConversation}
                  onNewChat={() => setSection('directory')}
                  onOpenStories={() => setSection('stories')}
                  onUpdateConversationMeta={handleUpdateConversationMeta}
                />
              </aside>
              <div
                className={`${
                  mobileShowThread ? 'block' : 'hidden lg:block'
                } flex-1 min-w-0 h-full`}
              >
                <ChatThreadView
                  conversation={activeConversation}
                  allConversations={conversations}
                  messages={activeMessages}
                  hasMoreMessages={
                    activeConversationId ? Boolean(hasMoreByConv[activeConversationId]) : false
                  }
                  currentUserId={user.id}
                  lang={lang}
                  accentColor={accentColor}
                  sending={sendingMessage}
                  isLiveMode={mode === 'live'}
                  authToken={idToken}
                  stickerPacks={stickerPacks}
                  peerIsTyping={
                    activeConversationId ? Boolean(typingByConv[activeConversationId]) : false
                  }
                  e2eeAvailable={
                    activeConversationId
                      ? Boolean(peerE2eePubJwkByConv[activeConversationId])
                      : false
                  }
                  e2eeActive={
                    activeConversationId ? Boolean(e2eeEnabledByConv[activeConversationId]) : false
                  }
                  onToggleE2ee={() => {
                    if (!activeConversationId) return;
                    setE2eeEnabledByConv((prev) => ({
                      ...prev,
                      [activeConversationId]: !prev[activeConversationId],
                    }));
                  }}
                  onBackMobile={() => setMobileShowThread(false)}
                  onTypingChange={(isTyping) => {
                    if (mode === 'live' && activeConversationId) {
                      void publishTypingState(activeConversationId, isTyping);
                    }
                  }}
                  onDraftChange={(convId, draft) => {
                    setConversations((prev) =>
                      prev.map((c) => (c.id === convId ? { ...c, draftBody: draft } : c))
                    );
                  }}
                  onLoadOlder={handleLoadOlderMessages}
                  onSendMessage={handleSendMessage}
                  onToggleReaction={handleToggleReaction}
                  onEditMessage={(id, body) => handleMutateMessage(id, 'edit', body)}
                  onDeleteMessage={(id) => handleMutateMessage(id, 'delete')}
                  onForwardMessage={handleForwardMessage}
                  onTogglePin={(id) => handleMutateMessage(id, 'pin')}
                  onToggleStar={(id) => handleMutateMessage(id, 'star')}
                  onCreateReminder={handleCreateReminder}
                  onSaveSticker={async (stickerId) => {
                    if (mode === 'demo') {
                      setStickerPacks((prev) =>
                        prev.map((p) => ({
                          ...p,
                          stickers: p.stickers.map((s) =>
                            s.id === stickerId ? { ...s, isFavorite: !s.isFavorite } : s
                          ),
                        }))
                      );
                    } else if (idToken) {
                      const res = await toggleFavoriteStickerApi(idToken, stickerId);
                      setStickerPacks((prev) =>
                        prev.map((p) => ({
                          ...p,
                          stickers: p.stickers.map((s) =>
                            s.id === stickerId ? { ...s, isFavorite: res.isFavorite } : s
                          ),
                        }))
                      );
                    }
                  }}
                  onStartCall={handleStartCall}
                  onUpdateConversationMeta={handleUpdateConversationMeta}
                  activeLocations={
                    activeConversationId ? locationsByConv[activeConversationId] || [] : []
                  }
                  onShareLocation={async (locPayload) => {
                    if (!activeConversationId) return;
                    if (mode === 'demo') {
                      const created: LocationShareItem = {
                        id: Date.now(),
                        conversationId: activeConversationId,
                        userId: user.id,
                        senderDisplayName: user.displayName,
                        latitude: locPayload.latitude,
                        longitude: locPayload.longitude,
                        accuracyMeters: locPayload.accuracyMeters,
                        isLive: locPayload.isLive,
                        expiresAt: new Date(
                          Date.now() + Math.max(1, locPayload.durationMinutes) * 60_000
                        ).toISOString(),
                        stoppedAt: null,
                        createdAt: new Date().toISOString(),
                      };
                      setLocationsByConv((prev) => ({
                        ...prev,
                        [activeConversationId]: [
                          created,
                          ...(prev[activeConversationId] || []),
                        ],
                      }));
                      return;
                    }
                    if (idToken) {
                      const res = await shareConversationLocationApi(
                        idToken,
                        activeConversationId,
                        locPayload
                      );
                      setLocationsByConv((prev) => ({
                        ...prev,
                        [activeConversationId]: [
                          res.location,
                          ...(prev[activeConversationId] || []),
                        ],
                      }));
                    }
                  }}
                  onStopLocation={async (shareId) => {
                    if (!activeConversationId) return;
                    const stoppedAt = new Date().toISOString();
                    setLocationsByConv((prev) => ({
                      ...prev,
                      [activeConversationId]: (prev[activeConversationId] || []).map((s) =>
                        s.id === shareId ? { ...s, stoppedAt } : s
                      ),
                    }));
                    if (mode === 'live' && idToken) {
                      await stopLocationShareApi(idToken, shareId);
                    }
                  }}
                  threadLoading={threadLoading}
                  threadError={threadError}
                  onClearThreadError={() => setThreadError(null)}
                />
              </div>
            </div>
          )}

          {section === 'channels' && (
            <div className="flex-1 min-w-0 h-full">
              <ChannelsView
                channels={channels}
                selectedChannelId={selectedChannelId}
                posts={selectedChannelId ? channelPostsById[selectedChannelId] || [] : []}
                members={selectedChannelId ? channelMembersById[selectedChannelId] || [] : []}
                loading={channelsLoading}
                lang={lang}
                accentColor={accentColor}
                onSelectChannel={(cid) => setSelectedChannelId(cid)}
                onCreateChannel={async (payload) => {
                  if (mode === 'demo') {
                    const id = Date.now();
                    const created: ChannelSummary = {
                      id,
                      creatorId: user.id,
                      handle: payload.handle,
                      title: payload.title,
                      description: payload.description,
                      avatarUrl: '',
                      isPublic: payload.isPublic,
                      verified: false,
                      inviteCode: `CHN-${String(id).slice(-5)}`,
                      subscriberCount: 1,
                      joined: true,
                      myRole: 'owner',
                      createdAt: new Date().toISOString(),
                    };
                    setChannels((prev) => [created, ...prev]);
                    setSelectedChannelId(id);
                    setChannelPostsById((prev) => ({ ...prev, [id]: [] }));
                    setChannelMembersById((prev) => ({
                      ...prev,
                      [id]: [
                        {
                          userId: user.id,
                          username: user.username,
                          displayName: user.displayName,
                          avatarUrl: user.avatarUrl,
                          role: 'owner',
                          joinedAt: new Date().toISOString(),
                        },
                      ],
                    }));
                    return;
                  }
                  if (idToken) {
                    const res = await createChannelApi(idToken, payload);
                    setChannels((prev) => [res.channel, ...prev]);
                    setSelectedChannelId(res.channel.id);
                  }
                }}
                onJoinByCode={async (code) => {
                  if (mode === 'demo') {
                    const target = channels.find(
                      (c) => c.inviteCode.toUpperCase() === code.trim().toUpperCase()
                    );
                    if (!target) {
                      throw new Error(
                        lang === 'ar' ? 'رمز القناة غير موجود.' : 'Channel invite code not found.'
                      );
                    }
                    setChannels((prev) =>
                      prev.map((c) =>
                        c.id === target.id
                          ? { ...c, joined: true, myRole: c.myRole ?? 'subscriber' }
                          : c
                      )
                    );
                    setSelectedChannelId(target.id);
                    return;
                  }
                  if (idToken) {
                    const res = await joinChannelByInviteApi(idToken, code);
                    const list = await fetchChannelsApi(idToken);
                    setChannels(list.channels);
                    if (res.channelId) setSelectedChannelId(res.channelId);
                  }
                }}
                onToggleSubscribe={async (channelId) => {
                  if (mode === 'demo') {
                    setChannels((prev) =>
                      prev.map((c) =>
                        c.id === channelId
                          ? {
                              ...c,
                              joined: !c.joined,
                              subscriberCount: c.joined
                                ? Math.max(0, c.subscriberCount - 1)
                                : c.subscriberCount + 1,
                              myRole: !c.joined ? c.myRole ?? 'subscriber' : null,
                            }
                          : c
                      )
                    );
                    return;
                  }
                  if (idToken) {
                    await toggleChannelSubscriptionApi(idToken, channelId);
                    const list = await fetchChannelsApi(idToken);
                    setChannels(list.channels);
                  }
                }}
                onPublishPost={async (channelId, body, pinned) => {
                  if (mode === 'demo') {
                    const created: ChannelPostItem = {
                      id: Date.now(),
                      channelId,
                      authorId: user.id,
                      authorDisplayName: user.displayName,
                      body,
                      pinned,
                      viewCount: 1,
                      reactions: [],
                      createdAt: new Date().toISOString(),
                    };
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: [created, ...(prev[channelId] || [])],
                    }));
                    return;
                  }
                  if (idToken) {
                    const res = await publishChannelPostApi(idToken, channelId, { body, pinned });
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: [res.post, ...(prev[channelId] || [])],
                    }));
                  }
                }}
                onTogglePinPost={async (channelId, postId) => {
                  if (mode === 'demo') {
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((p) =>
                        p.id === postId ? { ...p, pinned: !p.pinned } : p
                      ),
                    }));
                    return;
                  }
                  if (idToken) {
                    const res = await toggleChannelPostPinApi(idToken, channelId, postId);
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((p) =>
                        p.id === postId ? { ...p, pinned: res.pinned } : p
                      ),
                    }));
                  }
                }}
                onReactPost={async (channelId, postId, emoji) => {
                  if (mode === 'demo') {
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((p) =>
                        p.id === postId
                          ? {
                              ...p,
                              reactions: toggleReactionInList(
                                p.reactions || [],
                                emoji,
                                user.id,
                                true
                              ),
                            }
                          : p
                      ),
                    }));
                    return;
                  }
                  if (idToken) {
                    const res = await reactChannelPostApi(idToken, channelId, postId, emoji);
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((p) =>
                        p.id === postId ? { ...p, reactions: res.reactions } : p
                      ),
                    }));
                  }
                }}
                onIncrementView={(channelId, postId) => {
                  if (mode === 'demo') {
                    setChannelPostsById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((p) =>
                        p.id === postId ? { ...p, viewCount: p.viewCount + 1 } : p
                      ),
                    }));
                    return;
                  }
                  if (idToken) {
                    incrementChannelPostViewApi(idToken, channelId, postId)
                      .then((res) => {
                        if (typeof res.viewCount === 'number') {
                          setChannelPostsById((prev) => ({
                            ...prev,
                            [channelId]: (prev[channelId] || []).map((p) =>
                              p.id === postId ? { ...p, viewCount: res.viewCount! } : p
                            ),
                          }));
                        }
                      })
                      .catch(() => {});
                  }
                }}
                onUpdateMemberRole={async (channelId, targetUserId, role: Exclude<ChannelRole, 'owner'>) => {
                  if (mode === 'demo') {
                    setChannelMembersById((prev) => ({
                      ...prev,
                      [channelId]: (prev[channelId] || []).map((m) =>
                        m.userId === targetUserId ? { ...m, role } : m
                      ),
                    }));
                    return;
                  }
                  if (idToken) {
                    await updateChannelMemberRoleApi(idToken, channelId, targetUserId, role);
                    const details = await fetchChannelDetailsApi(idToken, channelId);
                    setChannelMembersById((prev) => ({ ...prev, [channelId]: details.members }));
                  }
                }}
              />
            </div>
          )}

          {section === 'groups' && (
            <div className="flex-1 min-w-0 h-full">
              <GroupsView
                groups={activeGroups}
                contacts={directoryUsers}
                activeGroupId={activeGroupId}
                members={groupMembers}
                joinRequests={groupJoinRequests}
                polls={groupPolls.filter((p) => !activeGroupId || p.conversationId === activeGroupId)}
                events={groupEvents.filter((e) => !activeGroupId || e.conversationId === activeGroupId)}
                tasks={groupTasks.filter((tItem) => !activeGroupId || tItem.conversationId === activeGroupId)}
                mediaGallery={groupMediaGallery}
                lang={lang}
                accentColor={accentColor}
                authToken={idToken}
                onSelectGroup={(id) => setActiveGroupId(id)}
                onOpenGroupChat={(id) => {
                  setActiveConversationId(id);
                  setSection('chats');
                  setMobileShowThread(true);
                }}
                onCreateGroup={async (payload) => {
                  if (mode === 'demo') {
                    const id = Date.now();
                    const created: ConversationSummary = {
                      id,
                      type: 'group',
                      title: payload.title,
                      description: payload.description,
                      folder: 'work',
                      pinned: false,
                      needsFollowUp: false,
                      unreadCount: 0,
                      memberCount: 1 + payload.memberIds.length,
                      myRole: 'owner',
                      inviteCode: `CHATLY-${String(id).slice(-4)}`,
                      lastMessagePreview: '',
                      lastMessageAt: new Date().toISOString(),
                    };
                    setConversations((prev) => [created, ...prev]);
                    setActiveGroupId(id);
                    return;
                  }
                  if (idToken) {
                    const res = await createGroupApi(idToken, payload);
                    setConversations(res.conversations);
                    setActiveGroupId(res.group.id);
                  }
                }}
                onJoinByInviteCode={async (code) => {
                  if (mode === 'demo') {
                    return lang === 'ar'
                      ? 'في وضع العرض، انضمام المجموعات الحقيقي يتطلب حساب Google.'
                      : 'In Demo Mode, joining live invite codes requires a signed-in Google account.';
                  }
                  if (idToken) {
                    const res = await joinGroupByInviteApi(idToken, code);
                    const convs = await listConversations(idToken);
                    setConversations(convs.conversations);
                    if (res.pendingApproval) return 'Join request sent for admin approval.';
                    if (res.joined) return 'Joined group successfully.';
                  }
                  return 'Updated.';
                }}
                onCreatePoll={async (groupId, question, options) => {
                  if (mode === 'demo') {
                    setGroupPolls((prev) => [
                      {
                        id: Date.now(),
                        conversationId: groupId,
                        question,
                        options: options.map((label, index) => ({
                          index,
                          label,
                          votes: 0,
                          votedByMe: false,
                        })),
                        closed: false,
                        createdAt: new Date().toISOString(),
                      },
                      ...prev,
                    ]);
                    return;
                  }
                  if (idToken) {
                    const res = await createGroupPollApi(idToken, groupId, { question, options });
                    setGroupPolls((prev) => [res.poll, ...prev]);
                  }
                }}
                onVotePoll={async (pollId, optionIndex) => {
                  if (mode === 'demo') {
                    setGroupPolls((prev) =>
                      prev.map((poll) =>
                        poll.id !== pollId
                          ? poll
                          : {
                              ...poll,
                              options: poll.options.map((opt) => ({
                                ...opt,
                                votes:
                                  opt.index === optionIndex
                                    ? opt.votedByMe
                                      ? opt.votes
                                      : opt.votes + 1
                                    : opt.votedByMe
                                      ? Math.max(0, opt.votes - 1)
                                      : opt.votes,
                                votedByMe: opt.index === optionIndex,
                              })),
                            }
                      )
                    );
                    return;
                  }
                  if (idToken && activeGroupId) {
                    await voteGroupPollApi(idToken, pollId, optionIndex);
                    const details = await fetchGroupDetailsApi(idToken, activeGroupId);
                    setGroupPolls(details.polls);
                  }
                }}
                onCreateEvent={async (groupId, payload) => {
                  if (mode === 'demo') {
                    setGroupEvents((prev) => [
                      { id: Date.now(), conversationId: groupId, ...payload },
                      ...prev,
                    ]);
                    return;
                  }
                  if (idToken) {
                    const res = await createGroupEventApi(idToken, groupId, payload);
                    setGroupEvents((prev) => [res.event, ...prev]);
                  }
                }}
                onCreateTask={async (groupId, title) => {
                  if (mode === 'demo') {
                    setGroupTasks((prev) => [
                      { id: Date.now(), conversationId: groupId, title, completed: false },
                      ...prev,
                    ]);
                    return;
                  }
                  if (idToken) {
                    const res = await createGroupTaskApi(idToken, groupId, { title });
                    setGroupTasks((prev) => [res.task, ...prev]);
                  }
                }}
                onToggleTask={async (taskId) => {
                  if (mode === 'demo') {
                    setGroupTasks((prev) =>
                      prev.map((tk) =>
                        tk.id === taskId ? { ...tk, completed: !tk.completed } : tk
                      )
                    );
                    return;
                  }
                  if (idToken) {
                    const res = await toggleGroupTaskApi(idToken, taskId);
                    setGroupTasks((prev) =>
                      prev.map((tk) => (tk.id === taskId ? res.task : tk))
                    );
                  }
                }}
                onDecideJoinRequest={async (groupId, reqId, decision) => {
                  if (mode === 'live' && idToken) {
                    await decideGroupJoinRequestApi(idToken, groupId, reqId, decision);
                    const details = await fetchGroupDetailsApi(idToken, groupId);
                    setGroupJoinRequests(details.joinRequests);
                    setGroupMembers(details.members);
                  }
                }}
                onUpdateMemberRole={async (groupId, targetUserId, action) => {
                  if (mode === 'live' && idToken) {
                    await updateGroupMemberRoleApi(idToken, groupId, targetUserId, action);
                    const details = await fetchGroupDetailsApi(idToken, groupId);
                    setGroupMembers(details.members);
                  }
                }}
              />
            </div>
          )}

          {section === 'stories' && (
            <div className="flex-1 min-w-0 h-full">
              <StoriesView
                stories={stories}
                lang={lang}
                accentColor={accentColor}
                authToken={idToken}
                onCreateStory={async (payload) => {
                  if (mode === 'demo') {
                    setStories((prev) => [
                      {
                        id: Date.now(),
                        userId: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        avatarUrl: user.avatarUrl,
                        kind: payload.kind,
                        textContent: payload.textContent,
                        backgroundHex: payload.backgroundHex,
                        mediaUrl: payload.mediaFile ? URL.createObjectURL(payload.mediaFile) : null,
                        audience: payload.audience,
                        expiresAt: new Date(
                          Date.now() + payload.expiresInHours * 3600_000
                        ).toISOString(),
                        createdAt: new Date().toISOString(),
                        viewCount: 0,
                        viewedByMe: true,
                        reactions: [],
                      },
                      ...prev,
                    ]);
                    return;
                  }
                  if (idToken) {
                    let mediaId: string | null = null;
                    if (payload.mediaFile && payload.mediaFileName && payload.mediaMimeType) {
                      const uploaded = await uploadMediaWithProgress(idToken, {
                        file: payload.mediaFile,
                        fileName: payload.mediaFileName,
                        mimeType: payload.mediaMimeType,
                        kind: payload.kind === 'video' ? 'video' : 'image',
                      });
                      mediaId = uploaded.id;
                    }
                    const res = await createStoryApi(idToken, {
                      kind: payload.kind,
                      textContent: payload.textContent,
                      backgroundHex: payload.backgroundHex,
                      mediaId,
                      audience: payload.audience,
                      expiresInHours: payload.expiresInHours,
                    });
                    setStories((prev) => [res.story, ...prev]);
                  }
                }}
                onViewStory={async (storyId) => {
                  if (mode === 'demo') {
                    setStories((prev) =>
                      prev.map((s) =>
                        s.id === storyId && !s.viewedByMe
                          ? { ...s, viewedByMe: true, viewCount: s.viewCount + 1 }
                          : s
                      )
                    );
                    return;
                  }
                  if (idToken) {
                    await viewStoryApi(idToken, storyId);
                    const res = await fetchStoriesApi(idToken);
                    setStories(res.stories);
                  }
                }}
                onReactStory={async (storyId, emoji) => {
                  if (mode === 'demo') {
                    setStories((prev) =>
                      prev.map((s) =>
                        s.id === storyId
                          ? {
                              ...s,
                              reactions: [...s.reactions, { emoji, count: 1 }],
                            }
                          : s
                      )
                    );
                    return;
                  }
                  if (idToken) {
                    await reactStoryApi(idToken, storyId, emoji);
                    const res = await fetchStoriesApi(idToken);
                    setStories(res.stories);
                  }
                }}
              />
            </div>
          )}

          {section === 'stickers' && (
            <div className="flex-1 min-w-0 h-full">
              <VoiceStickerStudioView
                packs={stickerPacks}
                currentUserId={user.id}
                lang={lang}
                accentColor={accentColor}
                authToken={idToken}
                hasActiveChat={Boolean(activeConversationId)}
                onCreatePack={async (payload) => {
                  if (mode === 'demo') {
                    const created: StickerPackItem = {
                      id: Date.now(),
                      creatorId: user.id,
                      title: payload.title,
                      titleAr: payload.titleAr,
                      category: payload.category,
                      shareCode: `CHATLY-${String(Date.now()).slice(-4)}`,
                      isPublic: true,
                      stickers: [],
                    };
                    setStickerPacks((prev) => [created, ...prev]);
                    return created;
                  }
                  if (idToken) {
                    const res = await createStickerPackApi(idToken, payload);
                    setStickerPacks((prev) => [res.pack, ...prev]);
                    return res.pack;
                  }
                }}
                onImportPackByCode={async (shareCode) => {
                  if (mode === 'demo') {
                    throw new Error(
                      lang === 'ar'
                        ? 'استيراد الحزم برمز المشاركة متاح عند تسجيل الدخول بحساب Google.'
                        : 'Importing sticker packs by code requires a signed-in Google account.'
                    );
                  }
                  if (idToken) {
                    const res = await importStickerPackByCodeApi(idToken, shareCode);
                    setStickerPacks(res.packs);
                  }
                }}
                onCreateSticker={async (payload) => {
                  if (mode === 'demo') {
                    const created: VoiceStickerItem = {
                      id: Date.now(),
                      packId: payload.packId || stickerPacks[0]?.id || 1,
                      creatorId: user.id,
                      name: payload.name,
                      nameAr: payload.nameAr,
                      category: payload.category,
                      kind: payload.kind,
                      visualPreset: payload.visualPreset,
                      visualUrl: payload.visualFile ? URL.createObjectURL(payload.visualFile) : null,
                      visualMimeType: payload.visualMimeType ?? null,
                      audioUrl: payload.audioFile ? URL.createObjectURL(payload.audioFile) : null,
                      audioDurationMs: payload.audioDurationMs,
                      trimStartMs: payload.trimStartMs,
                      trimEndMs: payload.trimEndMs,
                      syncOffsetMs: payload.syncOffsetMs,
                      defaultVolume: payload.defaultVolume,
                      usageCount: 0,
                      isFavorite: false,
                      toneHz: [440, 554.37, 659.25],
                      createdAt: new Date().toISOString(),
                    };
                    setStickerPacks((prev) =>
                      prev.map((p, idx) =>
                        p.id === created.packId || (idx === 0 && !prev.some((x) => x.id === created.packId))
                          ? { ...p, stickers: [created, ...p.stickers] }
                          : p
                      )
                    );
                    payload.onUploadProgress?.(100);
                    return created;
                  }
                  if (idToken) {
                    let visualMediaId: string | null = null;
                    let audioMediaId: string | null = null;
                    if (payload.visualFile && payload.visualFileName && payload.visualMimeType) {
                      const visualKind = inferMediaKind(
                        payload.visualMimeType,
                        payload.visualFileName
                      );
                      const v = await uploadMediaWithProgress(
                        idToken,
                        {
                          file: payload.visualFile,
                          fileName: payload.visualFileName,
                          mimeType: payload.visualMimeType,
                          kind: visualKind,
                        },
                        (pct) => payload.onUploadProgress?.(Math.round(pct * 0.5))
                      );
                      visualMediaId = v.id;
                    }
                    if (payload.audioFile && payload.audioFileName && payload.audioMimeType) {
                      const a = await uploadMediaWithProgress(
                        idToken,
                        {
                          file: payload.audioFile,
                          fileName: payload.audioFileName,
                          mimeType: payload.audioMimeType,
                          kind: 'audio',
                          durationMs: payload.audioDurationMs,
                        },
                        (pct) =>
                          payload.onUploadProgress?.(
                            visualMediaId ? 50 + Math.round(pct * 0.45) : Math.round(pct * 0.9)
                          )
                      );
                      audioMediaId = a.id;
                    }
                    const res = await createVoiceStickerApi(idToken, {
                      packId: payload.packId > 0 ? payload.packId : null,
                      name: payload.name,
                      nameAr: payload.nameAr,
                      category: payload.category,
                      kind: payload.kind,
                      visualPreset: payload.visualPreset as StickerVisualPreset,
                      visualMediaId,
                      audioMediaId,
                      audioDurationMs: payload.audioDurationMs,
                      trimStartMs: payload.trimStartMs,
                      trimEndMs: payload.trimEndMs,
                      syncOffsetMs: payload.syncOffsetMs,
                      defaultVolume: payload.defaultVolume,
                    });
                    const packsRes = await fetchStickerPacks(idToken);
                    setStickerPacks(packsRes.packs);
                    payload.onUploadProgress?.(100);
                    return res.sticker;
                  }
                }}
                onUpdateSticker={async (stickerId, payload) => {
                  if (mode === 'demo') {
                    let updatedItem: VoiceStickerItem | undefined;
                    setStickerPacks((prev) =>
                      prev.map((p) => ({
                        ...p,
                        stickers: p.stickers.map((s) => {
                          if (s.id !== stickerId) return s;
                          updatedItem = {
                            ...s,
                            packId: payload.packId || s.packId,
                            name: payload.name,
                            nameAr: payload.nameAr,
                            category: payload.category,
                            kind: payload.kind,
                            visualPreset: payload.visualPreset,
                            visualUrl: payload.visualFile
                              ? URL.createObjectURL(payload.visualFile)
                              : s.visualUrl,
                            visualMimeType: payload.visualMimeType ?? s.visualMimeType,
                            audioUrl: payload.audioFile
                              ? URL.createObjectURL(payload.audioFile)
                              : s.audioUrl,
                            audioDurationMs: payload.audioDurationMs,
                            trimStartMs: payload.trimStartMs,
                            trimEndMs: payload.trimEndMs,
                            syncOffsetMs: payload.syncOffsetMs,
                            defaultVolume: payload.defaultVolume,
                          };
                          return updatedItem;
                        }),
                      }))
                    );
                    payload.onUploadProgress?.(100);
                    return updatedItem;
                  }
                  if (idToken) {
                    let visualMediaId: string | undefined;
                    let audioMediaId: string | undefined;
                    if (payload.visualFile && payload.visualFileName && payload.visualMimeType) {
                      const visualKind = inferMediaKind(
                        payload.visualMimeType,
                        payload.visualFileName
                      );
                      const v = await uploadMediaWithProgress(
                        idToken,
                        {
                          file: payload.visualFile,
                          fileName: payload.visualFileName,
                          mimeType: payload.visualMimeType,
                          kind: visualKind,
                        },
                        (pct) => payload.onUploadProgress?.(Math.round(pct * 0.5))
                      );
                      visualMediaId = v.id;
                    }
                    if (payload.audioFile && payload.audioFileName && payload.audioMimeType) {
                      const a = await uploadMediaWithProgress(
                        idToken,
                        {
                          file: payload.audioFile,
                          fileName: payload.audioFileName,
                          mimeType: payload.audioMimeType,
                          kind: 'audio',
                          durationMs: payload.audioDurationMs,
                        },
                        (pct) => payload.onUploadProgress?.(50 + Math.round(pct * 0.45))
                      );
                      audioMediaId = a.id;
                    }
                    const res = await updateVoiceStickerApi(idToken, stickerId, {
                      packId: payload.packId > 0 ? payload.packId : undefined,
                      name: payload.name,
                      nameAr: payload.nameAr,
                      category: payload.category,
                      kind: payload.kind,
                      visualPreset: payload.visualPreset as StickerVisualPreset,
                      ...(visualMediaId ? { visualMediaId } : {}),
                      ...(audioMediaId ? { audioMediaId } : {}),
                      audioDurationMs: payload.audioDurationMs,
                      trimStartMs: payload.trimStartMs,
                      trimEndMs: payload.trimEndMs,
                      syncOffsetMs: payload.syncOffsetMs,
                      defaultVolume: payload.defaultVolume,
                    });
                    const packsRes = await fetchStickerPacks(idToken);
                    setStickerPacks(packsRes.packs);
                    payload.onUploadProgress?.(100);
                    return res.sticker;
                  }
                }}
                onDeleteSticker={async (stickerId) => {
                  if (mode === 'demo') {
                    setStickerPacks((prev) =>
                      prev.map((p) => ({
                        ...p,
                        stickers: p.stickers.filter((s) => s.id !== stickerId),
                      }))
                    );
                    return;
                  }
                  if (idToken) {
                    await deleteVoiceStickerApi(idToken, stickerId);
                    const packsRes = await fetchStickerPacks(idToken);
                    setStickerPacks(packsRes.packs);
                  }
                }}
                onToggleFavorite={async (stickerId) => {
                  if (mode === 'demo') {
                    setStickerPacks((prev) =>
                      prev.map((p) => ({
                        ...p,
                        stickers: p.stickers.map((s) =>
                          s.id === stickerId ? { ...s, isFavorite: !s.isFavorite } : s
                        ),
                      }))
                    );
                    return;
                  }
                  if (idToken) {
                    const res = await toggleFavoriteStickerApi(idToken, stickerId);
                    setStickerPacks((prev) =>
                      prev.map((p) => ({
                        ...p,
                        stickers: p.stickers.map((s) =>
                          s.id === stickerId ? { ...s, isFavorite: res.isFavorite } : s
                        ),
                      }))
                    );
                  }
                }}
                onSendStickerToChat={async (sticker) => {
                  if (!activeConversationId) return;
                  await handleSendMessage({
                    body: lang === 'ar' && sticker.nameAr ? sticker.nameAr : sticker.name,
                    type: 'voice_sticker',
                    sticker,
                  });
                  setSection('chats');
                  setMobileShowThread(true);
                }}
              />
            </div>
          )}

          {section === 'calls' && (
            <div className="flex-1 min-w-0 h-full">
              <CallsView
                calls={calls}
                conversations={conversations}
                activeCall={activeCall}
                isLiveMode={mode === 'live'}
                lang={lang}
                accentColor={accentColor}
                onStartCall={handleStartCall}
                onEndCall={handleEndCall}
              />
            </div>
          )}

          {section === 'directory' && (
            <div className="flex-1 min-w-0 h-full">
              <DirectoryView
                users={directoryUsers}
                query={directoryQuery}
                loading={directoryLoading}
                lang={lang}
                accentColor={accentColor}
                currentUserId={user.id}
                currentUsername={user.username}
                inviteToken={inviteToken}
                friendRequests={friendRequests}
                recentContacts={recentContacts}
                mutualGroupsByUser={mutualGroupsByUser}
                phoneDiscoveryConsent={phoneDiscoveryConsent}
                onQueryChange={setDirectoryQuery}
                onStartChat={handleStartChat}
                onStartChatByUsername={async (targetUsername) => {
                  const clean = targetUsername.trim().replace(/^@+/, '').toLowerCase();
                  if (!clean) return;
                  let matched = directoryUsers.find((u) => u.username.toLowerCase() === clean);
                  if (!matched && mode === 'live' && idToken) {
                    const res = await searchDirectory(idToken, clean);
                    matched = res.users.find((u) => u.username.toLowerCase() === clean);
                  }
                  if (!matched) {
                    throw new Error(
                      lang === 'ar'
                        ? `لم يتم العثور على المستخدم @${clean}`
                        : `User @${clean} not found.`
                    );
                  }
                  await handleStartChat(matched);
                }}
                onToggleFavorite={async (target) => {
                  const next = !target.isFavorite;
                  setDirectoryUsers((prev) =>
                    prev.map((u) => (u.id === target.id ? { ...u, isFavorite: next } : u))
                  );
                  if (mode === 'live' && idToken) {
                    await updateContactRelation(idToken, target.id, { isFavorite: next });
                  }
                }}
                onToggleBlock={async (target) => {
                  const next = !target.isBlocked;
                  setDirectoryUsers((prev) =>
                    prev.map((u) => (u.id === target.id ? { ...u, isBlocked: next } : u))
                  );
                  if (mode === 'live' && idToken) {
                    await updateContactRelation(idToken, target.id, { isBlocked: next });
                  }
                }}
                onReportUser={async (target, reason) => {
                  if (mode === 'demo') {
                    setSafetyReports((prev) => [
                      {
                        id: Date.now(),
                        reporterId: user.id,
                        targetType: 'user',
                        targetId: String(target.id),
                        reason,
                        details: '',
                        status: 'open',
                        appealNote: '',
                        createdAt: new Date().toISOString(),
                      },
                      ...prev,
                    ]);
                    return;
                  }
                  if (mode === 'live' && idToken) {
                    await submitUserReport(idToken, {
                      reportedUserId: target.id,
                      reason,
                    });
                    const r = await fetchSafetyReportsApi(idToken);
                    setSafetyReports(r.reports);
                  }
                }}
                onSendFriendRequest={async (reqPayload) => {
                  if (mode === 'demo') {
                    const matched = directoryUsers.find(
                      (u) =>
                        u.id === reqPayload.targetUserId ||
                        (reqPayload.username && u.username === reqPayload.username)
                    );
                    const created: FriendRequestItem = {
                      id: Date.now(),
                      senderId: user.id,
                      receiverId: matched?.id ?? 999,
                      senderUsername: user.username,
                      senderDisplayName: user.displayName,
                      senderAvatarUrl: user.avatarUrl,
                      receiverUsername: matched?.username || reqPayload.username || 'contact',
                      receiverDisplayName: matched?.displayName || reqPayload.username || 'Contact',
                      status: 'pending',
                      createdAt: new Date().toISOString(),
                    };
                    setFriendRequests((prev) => [created, ...prev]);
                    return;
                  }
                  if (idToken) {
                    await sendFriendRequestApi(idToken, reqPayload);
                    const ws = await fetchFriendsWorkspaceApi(idToken);
                    setFriendRequests(ws.requests);
                    setRecentContacts(ws.recentContacts);
                  }
                }}
                onDecideFriendRequest={async (reqId, decision) => {
                  if (mode === 'demo') {
                    setFriendRequests((prev) =>
                      prev.map((r) => (r.id === reqId ? { ...r, status: decision } : r))
                    );
                    return;
                  }
                  if (idToken) {
                    await decideFriendRequestApi(idToken, reqId, decision);
                    const [ws, dir] = await Promise.all([
                      fetchFriendsWorkspaceApi(idToken),
                      searchDirectory(idToken, directoryQuery),
                    ]);
                    setFriendRequests(ws.requests);
                    setRecentContacts(ws.recentContacts);
                    setDirectoryUsers(dir.users);
                  }
                }}
                onRemoveContact={async (target) => {
                  setDirectoryUsers((prev) =>
                    prev.map((u) =>
                      u.id === target.id ? { ...u, isContact: false, isFavorite: false } : u
                    )
                  );
                  if (mode === 'live' && idToken) {
                    await removeContactRelationApi(idToken, target.id);
                  }
                }}
                onLoadMutualGroups={async (targetUserId) => {
                  if (mode === 'demo') {
                    const shared = conversations
                      .filter((c) => c.type === 'group')
                      .slice(0, 2)
                      .map((c) => ({ id: c.id, title: c.title, memberCount: c.memberCount ?? 4 }));
                    setMutualGroupsByUser((prev) => ({ ...prev, [targetUserId]: shared }));
                    return;
                  }
                  if (idToken) {
                    const res = await fetchMutualGroupsApi(idToken, targetUserId);
                    setMutualGroupsByUser((prev) => ({
                      ...prev,
                      [targetUserId]: res.mutualGroups,
                    }));
                  }
                }}
              />
            </div>
          )}

          {section === 'media' && (
            <div className="flex-1 min-w-0 h-full">
              <MediaManagerView
                items={mediaLibrary}
                authToken={idToken}
                uploadQuality={uploadQuality}
                loading={mediaLoading}
                lang={lang}
                accentColor={accentColor}
                onChangeUploadQuality={setUploadQuality}
                onClearLocalCache={() => {
                  if (mode === 'live' && idToken) {
                    setMediaLoading(true);
                    fetchMediaLibraryApi(idToken)
                      .then((r) => setMediaLibrary(r.items))
                      .finally(() => setMediaLoading(false));
                  }
                }}
              />
            </div>
          )}

          {section === 'saved' && (
            <div className="flex-1 min-w-0 h-full">
              <SavedVaultView
                notes={savedNotes}
                lang={lang}
                accentColor={accentColor}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
              />
            </div>
          )}

          {section === 'notifications' && (
            <div className="flex-1 min-w-0 h-full">
              <NotificationsView
                notifications={notifications}
                reminders={reminders}
                conversations={conversations}
                prefs={notificationPrefs}
                lang={lang}
                accentColor={accentColor}
                onMarkRead={async (id) => {
                  setNotifications((prev) =>
                    prev.map((n) =>
                      n.id === id ? { ...n, readAt: new Date().toISOString() } : n
                    )
                  );
                  if (mode === 'live' && idToken) {
                    await markNotificationReadApi(idToken, id);
                  }
                }}
                onUpdatePrefs={async (next) => {
                  setNotificationPrefs(next);
                  if (mode === 'live' && idToken) {
                    await saveUserPreferencesApi(idToken, { notificationPrefs: next });
                  }
                }}
              />
            </div>
          )}

          {section === 'privacy' && (
            <div className="flex-1 min-w-0 h-full">
              <PrivacyDashboardView
                privacy={privacy}
                sessions={sessions}
                e2eeFingerprint={e2eeBundle?.fingerprint}
                e2eeDeviceId={e2eeBundle?.deviceId}
                onRotateE2eeKey={handleRotateE2eeKey}
                lang={lang}
                accentColor={accentColor}
                saving={savingPrivacy}
                onSavePrivacy={handleSavePrivacy}
                onRevokeSession={handleRevokeSession}
                hasPinLock={hasPinLock}
                loginHistory={loginHistory}
                backups={backups}
                safetyReports={safetyReports}
                auditLogs={auditLogs}
                crashDiagnosticsOptIn={crashDiagnosticsOptIn}
                healthStatus={healthStatus}
                releaseNotes={releaseNotes}
                onSetPinLock={async (pin) => {
                  if (mode === 'demo') {
                    setDemoPinCode(pin);
                    setHasPinLock(Boolean(pin));
                    return;
                  }
                  if (idToken) {
                    const res = await setOrClearPinLockApi(idToken, pin);
                    setHasPinLock(res.hasPinLock);
                  }
                }}
                onLockNow={() => {
                  if (hasPinLock) setAppLocked(true);
                }}
                onCreateEncryptedBackup={async (passphrase, cadence) => {
                  const snapshotPayload = {
                    exportedAt: new Date().toISOString(),
                    user: { username: user.username, displayName: user.displayName },
                    conversations: conversations.map((c) => ({
                      id: c.id,
                      title: c.title,
                      type: c.type,
                      lastMessagePreview: c.lastMessagePreview,
                    })),
                    messagesByConv,
                    savedNotes,
                  };
                  const totalMessages = Object.values(messagesByConv).reduce(
                    (acc, arr) => acc + arr.length,
                    0
                  );
                  const { cipherPayloadJson, checksumSha256 } = await createEncryptedBackupBlob(
                    snapshotPayload,
                    passphrase
                  );
                  const includesSummary = `${conversations.length} conversations, ${totalMessages} messages, ${savedNotes.length} vault notes`;

                  if (mode === 'demo') {
                    const item: EncryptedBackupItem = {
                      id: Date.now(),
                      cadence,
                      checksumSha256,
                      cipherPayloadJson,
                      includesSummary,
                      messageCount: totalMessages,
                      verifiedAt: new Date().toISOString(),
                      createdAt: new Date().toISOString(),
                    };
                    setBackups((prev) => [item, ...prev]);
                    return;
                  }
                  if (idToken) {
                    const res = await saveEncryptedBackupApi(idToken, {
                      cadence,
                      checksumSha256,
                      cipherPayloadJson,
                      includesSummary,
                      messageCount: totalMessages,
                    });
                    setBackups((prev) => [res.backup, ...prev]);
                  }
                }}
                onVerifyBackup={async (backupId) => {
                  if (mode === 'demo') {
                    const nowIso = new Date().toISOString();
                    setBackups((prev) =>
                      prev.map((b) => (b.id === backupId ? { ...b, verifiedAt: nowIso } : b))
                    );
                    return true;
                  }
                  if (idToken) {
                    const res = await verifyEncryptedBackupApi(idToken, backupId);
                    if (res.verified) {
                      const list = await fetchEncryptedBackupsApi(idToken);
                      setBackups(list.backups);
                    }
                    return res.verified;
                  }
                  return false;
                }}
                onExportAccountData={async () => {
                  const data =
                    mode === 'live' && idToken
                      ? await exportAccountDataApi(idToken)
                      : {
                          exportedAt: new Date().toISOString(),
                          mode: 'demo',
                          user,
                          privacy,
                          conversations,
                          messagesByConv,
                          savedNotes,
                        };
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `chatly-export-${user.username}-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                onDeleteAccount={async () => {
                  if (mode === 'live' && idToken) {
                    await deleteAccountApi(idToken);
                    await signOutFirebase().catch(() => {});
                  }
                  rotateChatlySessionId();
                  hydratedUidRef.current = null;
                  setIdToken(null);
                  setMode('landing');
                }}
                onSubmitSafetyReport={async (repPayload) => {
                  if (mode === 'demo') {
                    setSafetyReports((prev) => [
                      {
                        id: Date.now(),
                        reporterId: user.id,
                        ...repPayload,
                        status: 'open',
                        appealNote: '',
                        createdAt: new Date().toISOString(),
                      },
                      ...prev,
                    ]);
                    return;
                  }
                  if (idToken) {
                    const res = await submitSafetyReportApi(idToken, repPayload);
                    setSafetyReports((prev) => [res.report, ...prev]);
                    const logsRes = await fetchModeratorAuditLogsApi(idToken);
                    setAuditLogs(logsRes.logs);
                  }
                }}
                onAppealSafetyReport={async (reportId, appealNote) => {
                  if (mode === 'demo') {
                    setSafetyReports((prev) =>
                      prev.map((r) =>
                        r.id === reportId
                          ? { ...r, status: 'appealed', appealNote }
                          : r
                      )
                    );
                    return;
                  }
                  if (idToken) {
                    const res = await appealSafetyReportApi(idToken, reportId, appealNote);
                    setSafetyReports((prev) =>
                      prev.map((r) => (r.id === reportId ? res.report : r))
                    );
                    const logsRes = await fetchModeratorAuditLogsApi(idToken);
                    setAuditLogs(logsRes.logs);
                  }
                }}
                onToggleCrashDiagnostics={async (enabled) => {
                  setCrashDiagnosticsOptIn(enabled);
                  if (mode === 'live' && idToken) {
                    await saveUserPreferencesApi(idToken, { crashDiagnosticsOptIn: enabled });
                  }
                }}
              />
            </div>
          )}

          {section === 'profile' && (
            <div className="flex-1 min-w-0 h-full">
              <ProfileSettingsView
                user={user}
                lang={lang}
                themeMode={themeMode}
                accentColor={accentColor}
                accessibilityPrefs={accessibilityPrefs}
                phoneDiscoveryConsent={phoneDiscoveryConsent}
                saving={savingProfile}
                serverError={profileError}
                onSaveProfile={handleSaveProfile}
                onChangeAppearance={(patch) => {
                  if (patch.lang) setLang(patch.lang);
                  if (patch.themeMode) setThemeMode(patch.themeMode);
                  if (patch.accentColor) setAccentColor(patch.accentColor);
                }}
                onUpdateAccessibility={async (next) => {
                  setAccessibilityPrefs(next);
                  if (mode === 'live' && idToken) {
                    await saveUserPreferencesApi(idToken, { accessibilityPrefs: next });
                  }
                }}
                onTogglePhoneDiscovery={async (enabled) => {
                  setPhoneDiscoveryConsent(enabled);
                  if (mode === 'live' && idToken) {
                    await saveUserPreferencesApi(idToken, { phoneDiscoveryConsent: enabled });
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>

      {hasPinLock && appLocked && (
        <PinLockGate
          lang={lang}
          accentColor={accentColor}
          onUnlock={async (pin) => {
            if (mode === 'demo') {
              const ok = demoPinCode ? pin === demoPinCode : true;
              if (ok) setAppLocked(false);
              return ok;
            }
            if (idToken) {
              const res = await verifyPinLockApi(idToken, pin);
              if (res.valid) setAppLocked(false);
              return res.valid;
            }
            return false;
          }}
          onSignOut={handleExitOrSignOut}
        />
      )}

      {/* Mobile "More" Drawer */}
      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/55 flex items-end">
          <div className="w-full rounded-t-3xl bg-[var(--chatly-bg-surface)] border-t border-[var(--chatly-border-strong)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm text-[var(--chatly-text-primary)]">
                {lang === 'ar' ? 'المزيد من الأقسام' : 'More Sections'}
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-[var(--chatly-text-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {secondaryMobileNav.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-xs font-medium ${
                      active
                        ? `${palette.softBg} border-teal-500/40 ${palette.primaryText}`
                        : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-secondary)]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="truncate max-w-full">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (<= 15% mobile viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-14 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)]/95 backdrop-blur-md grid grid-cols-5 items-center"
      >
        {primaryMobileNav.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                if (item.id === 'chats') setMobileShowThread(false);
              }}
              aria-current={active ? 'page' : undefined}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? palette.primaryText : 'text-[var(--chatly-text-muted)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          aria-label={lang === 'ar' ? 'المزيد' : 'More'}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            secondaryMobileNav.some((i) => i.id === section)
              ? palette.primaryText
              : 'text-[var(--chatly-text-muted)]'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span>{lang === 'ar' ? 'المزيد' : 'More'}</span>
        </button>
      </nav>
    </div>
  );
}
