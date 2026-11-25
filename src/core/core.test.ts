import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername,
  validateUsername,
  validateProfileForm,
} from './validation';
import {
  canViewerSeeField,
  projectPublicUserSummary,
  countRestrictedControls,
} from './privacy';
import {
  getTextDirection,
  formatLocalizedNumber,
} from './localization';
import { toggleReactionInList, groupRawReactions } from './reactions';
import {
  generateDeviceKeyPair,
  exportKeyJwk,
  encryptMessageText,
  decryptMessageText,
  parseE2eeEnvelope,
} from './e2ee';
import {
  summarizeConversationLocal,
  suggestRepliesLocal,
  semanticSearchMessagesLocal,
} from './localAi';
import type { ChatMessage, PrivacySettings, UserProfile } from './types';

test('username normalization and validation enforce Chatly rules', () => {
  assert.equal(normalizeUsername('  @Nadia.Arch '), 'nadia.arch');
  assert.equal(validateUsername('nadia.arch'), null);
  assert.equal(validateUsername('ab'), 'usernameLength');
  assert.equal(validateUsername('admin'), 'usernameReserved');
  assert.equal(validateUsername('.nadia'), 'usernameEdgeDot');
  assert.equal(validateUsername('nadia..arch'), 'usernameRepeatedPunctuation');
  assert.equal(validateUsername('Nadia!'), 'usernameChars');
});

test('validateProfileForm checks all fields and allows optional blank phone', () => {
  const valid = validateProfileForm({
    username: 'tarek_ux',
    displayName: 'Tarek Haddad',
    bio: 'Product designer',
    statusText: 'Available',
    phoneNumber: '',
  });
  assert.deepEqual(valid, {});

  const invalid = validateProfileForm({
    username: 'x',
    displayName: 'T',
    bio: 'a'.repeat(181),
    statusText: 's'.repeat(61),
    phoneNumber: '123',
  });
  assert.equal(invalid.username, 'usernameLength');
  assert.equal(invalid.displayName, 'displayNameTooShort');
  assert.equal(invalid.bio, 'bioTooLong');
  assert.equal(invalid.statusText, 'statusTooLong');
  assert.equal(invalid.phoneNumber, 'phoneInvalid');
});

test('privacy projection hides restricted fields for non-contacts', () => {
  const user: UserProfile = {
    id: 10,
    uid: 'u-10',
    email: 'secret@example.com',
    username: 'maya.audio',
    displayName: 'Maya Lin',
    bio: 'Acoustic engineer',
    statusText: 'In studio',
    avatarUrl: '/avatar.jpg',
    preferredLanguage: 'en',
    themeMode: 'dark',
    accentColor: 'teal',
    emailVerified: true,
    twoFactorEnabled: true,
    phoneNumber: '+15551234567',
    phoneVerified: false,
    lastSeenAt: '2026-11-23T10:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const privacy: PrivacySettings = {
    onlineStatusVisibility: 'contacts',
    lastSeenVisibility: 'nobody',
    profilePhotoVisibility: 'contacts',
    bioVisibility: 'everyone',
    statusUpdatesVisibility: 'contacts',
    contactInfoVisibility: 'nobody',
    readReceiptsEnabled: false,
    typingIndicatorsEnabled: true,
    biometricLockEnabled: true,
  };

  assert.equal(canViewerSeeField('nobody', true, false), true);
  assert.equal(canViewerSeeField('contacts', false, false), false);
  assert.equal(canViewerSeeField('contacts', false, true), true);

  const strangerView = projectPublicUserSummary(user, privacy, {
    isSelf: false,
    isContact: false,
    isOnline: true,
  });
  assert.equal(strangerView.avatarUrl, '');
  assert.equal(strangerView.online, false);
  assert.equal(strangerView.lastSeenAt, null);
  assert.equal(strangerView.bio, 'Acoustic engineer');

  const contactView = projectPublicUserSummary(user, privacy, {
    isSelf: false,
    isContact: true,
    isOnline: true,
  });
  assert.equal(contactView.avatarUrl, '/avatar.jpg');
  assert.equal(contactView.online, true);
  assert.equal(contactView.lastSeenAt, null);

  const counts = countRestrictedControls(privacy);
  assert.equal(counts.restrictedCount, 7);
  assert.equal(counts.totalCount, 9);
});

test('RTL direction and localized number formatting work for EN and AR', () => {
  assert.equal(getTextDirection('en'), 'ltr');
  assert.equal(getTextDirection('ar'), 'rtl');
  assert.equal(formatLocalizedNumber(42, 'en'), '42');
  assert.ok(formatLocalizedNumber(42, 'ar').length > 0);
});

test('reactions toggle and grouping support multiple emojis per user', () => {
  let list = toggleReactionInList([], '❤️', 1, true);
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 1);
  assert.equal(list[0].reactedByMe, true);

  list = toggleReactionInList(list, '🔥', 1, true);
  assert.equal(list.length, 2);

  list = toggleReactionInList(list, '❤️', 2, false);
  assert.equal(list[0].count, 2);
  assert.equal(list[0].reactedByMe, true);

  list = toggleReactionInList(list, '❤️', 1, true);
  assert.equal(list[0].count, 1);
  assert.equal(list[0].reactedByMe, false);

  const grouped = groupRawReactions(
    [
      { emoji: '👍', userId: 1 },
      { emoji: '👍', userId: 2 },
      { emoji: '😂', userId: 3 },
    ],
    2
  );
  assert.equal(grouped[0].count, 2);
  assert.equal(grouped[0].reactedByMe, true);
  assert.equal(grouped[1].reactedByMe, false);
});

test('WebCrypto ECDH + AES-256-GCM E2EE encrypts, decrypts, and rejects tampering', async () => {
  const alice = await generateDeviceKeyPair();
  const bob = await generateDeviceKeyPair();
  const alicePubJwk = await exportKeyJwk(alice.publicKey);
  const bobPubJwk = await exportKeyJwk(bob.publicKey);

  const envelopeJson = await encryptMessageText({
    plaintext: 'Confidential Arabic/English message — رسالة سرية',
    myPrivateKey: alice.privateKey,
    myPublicKeyJwk: alicePubJwk,
    recipientPublicKeyJwk: bobPubJwk,
  });

  const parsed = parseE2eeEnvelope(envelopeJson);
  assert.ok(parsed);
  assert.equal(parsed.alg, 'ECDH-P256-HKDF-AES256GCM');
  assert.ok(!envelopeJson.includes('Confidential'));

  const decrypted = await decryptMessageText({
    envelopeJson,
    myPrivateKey: bob.privateKey,
  });
  assert.equal(decrypted.verified, true);
  assert.equal(decrypted.plaintext, 'Confidential Arabic/English message — رسالة سرية');

  // Tamper ciphertext and expect decryption rejection
  const tampered = JSON.parse(envelopeJson);
  tampered.ct = 'AAAA' + tampered.ct.slice(4);
  await assert.rejects(() =>
    decryptMessageText({
      envelopeJson: JSON.stringify(tampered),
      myPrivateKey: bob.privateKey,
    })
  );
});

test('local AI helpers summarize, suggest replies, and search without external APIs', () => {
  const msgs: ChatMessage[] = [
    {
      id: 1,
      clientMessageId: 'c1',
      conversationId: 1,
      senderId: 2,
      senderUsername: 'nadia',
      senderDisplayName: 'Nadia',
      type: 'text',
      body: 'Should we test WebRTC calling and Voice Stickers today?',
      replyToId: null,
      reactions: [],
      createdAt: '2026-11-23T10:00:00.000Z',
    },
  ];
  const summary = summarizeConversationLocal(msgs, 'en');
  assert.ok(summary.includes('Nadia'));

  const replies = suggestRepliesLocal(msgs[0], 'en');
  assert.ok(replies.length >= 2);

  const found = semanticSearchMessagesLocal(msgs, 'Voice Stickers');
  assert.equal(found.length, 1);
});

import { extractBearerToken, formatFirebaseAuthError } from './authHelpers';
import { buildGeminiChatHistory, extractMapsGroundingLinks } from './aiHelpers';

test('authHelpers extract bearer tokens and localize Firebase auth errors', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken(undefined, '  fallback_tok  '), 'fallback_tok');
  assert.equal(extractBearerToken('Basic xyz'), null);

  const popupMsg = formatFirebaseAuthError({ code: 'auth/popup-blocked' }, 'en');
  assert.ok(popupMsg.toLowerCase().includes('popup'));
  const domainMsgAr = formatFirebaseAuthError({ code: 'auth/unauthorized-domain' }, 'ar');
  assert.ok(domainMsgAr.includes('Firebase'));
});

test('aiHelpers sanitize multi-turn history and extract Google Maps grounding links', () => {
  const history = buildGeminiChatHistory([
    { role: 'user', text: '  Hello  ' },
    { role: 'model', text: '   ' },
    { role: 'model', text: 'Hi there!' },
  ]);
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], { role: 'user', parts: [{ text: 'Hello' }] });
  assert.deepEqual(history[1], { role: 'model', parts: [{ text: 'Hi there!' }] });

  const places = extractMapsGroundingLinks([
    {
      maps: {
        uri: 'https://maps.google.com/?cid=123',
        title: 'Blue Bottle Coffee',
        placeAnswerSources: {
          reviewSnippets: [{ content: 'Great espresso and quiet seating.' }],
        },
      },
    },
    {
      maps: {
        uri: 'https://maps.google.com/?cid=123',
        title: 'Duplicate should be deduped',
      },
    },
  ]);
  assert.equal(places.length, 1);
  assert.equal(places[0].title, 'Blue Bottle Coffee');
  assert.equal(places[0].snippets[0], 'Great espresso and quiet seating.');
});

import {
  inferMediaKind,
  inferMediaMimeType,
  validateScheduledTimestamp,
  validateStickerInput,
} from './validation';

test('sticker validation, media MIME inference, and scheduledAt checks behave accurately', () => {
  assert.equal(inferMediaMimeType('wave.webp', ''), 'image/webp');
  assert.equal(inferMediaMimeType('clip.webm', 'application/octet-stream'), 'video/webm');
  assert.equal(inferMediaKind('', 'anim.mp4'), 'video');
  assert.equal(inferMediaKind('', 'sticker.gif'), 'image');
  assert.equal(inferMediaKind('', 'voice.m4a'), 'audio');

  assert.equal(validateStickerInput({ name: '  ' }), 'Sticker name is required.');
  assert.equal(
    validateStickerInput({ name: 'Hello', trimStartMs: 1200, trimEndMs: 800 }),
    'Trim start must be earlier than trim end.'
  );
  assert.equal(
    validateStickerInput({ name: 'Greeting', trimStartMs: 100, trimEndMs: 1600, defaultVolume: 85 }),
    null
  );

  assert.deepEqual(validateScheduledTimestamp(null), { valid: true, date: null });
  const bad = validateScheduledTimestamp('not-a-date');
  assert.equal(bad.valid, false);
  const past = validateScheduledTimestamp('2020-01-01T00:00:00.000Z', {
    requireFuture: true,
    nowMs: Date.parse('2026-11-23T12:00:00.000Z'),
  });
  assert.equal(past.valid, false);
  const future = validateScheduledTimestamp('2026-11-23T12:05:00.000Z', {
    requireFuture: true,
    nowMs: Date.parse('2026-11-23T12:00:00.000Z'),
  });
  assert.equal(future.valid, true);
  assert.ok(future.date instanceof Date);
});

import {
  createEncryptedBackupBlob,
  decryptEncryptedBackupBlob,
  generateRecoveryPhrase,
} from './backupCrypto';
import {
  computeStorageSummary,
  formatCoordinatesDisplay,
  formatNotificationPreview,
  formatQrProfileUri,
  getRootFontSizePx,
  isLocationShareActive,
  isWithinQuietHours,
  parseQrProfileInput,
  shouldSuppressNotification,
  validateChannelInput,
  validatePinCode,
} from './features';

test('encrypted backup crypto encrypts, verifies checksum, decrypts, and rejects wrong passphrase or tampering', async () => {
  const phrase = generateRecoveryPhrase(12);
  assert.equal(phrase.split(' ').length, 12);

  const payload = {
    conversations: [{ id: 1, title: 'Nadia' }],
    messages: [{ id: 9, body: 'Private encrypted backup message — رسالة محفوظة' }],
  };

  const { cipherPayloadJson, checksumSha256 } = await createEncryptedBackupBlob(payload, phrase);
  assert.equal(checksumSha256.length, 64);
  assert.ok(!cipherPayloadJson.includes('Private encrypted backup message'));

  const decrypted = await decryptEncryptedBackupBlob<typeof payload>(
    cipherPayloadJson,
    phrase,
    checksumSha256
  );
  assert.deepEqual(decrypted, payload);

  await assert.rejects(() =>
    decryptEncryptedBackupBlob(cipherPayloadJson, 'wrong passphrase words', checksumSha256)
  );

  await assert.rejects(() =>
    decryptEncryptedBackupBlob(cipherPayloadJson, phrase, '0'.repeat(64))
  );
});

test('notification quiet hours, suppression, and lock-screen previews behave accurately', () => {
  const night = new Date('2026-11-24T23:30:00');
  const morning = new Date('2026-11-24T06:15:00');
  const noon = new Date('2026-11-24T12:00:00');

  assert.equal(isWithinQuietHours(night, '22:00', '07:00'), true);
  assert.equal(isWithinQuietHours(morning, '22:00', '07:00'), true);
  assert.equal(isWithinQuietHours(noon, '22:00', '07:00'), false);

  const prefs = {
    soundId: 'chime' as const,
    dndEnabled: false,
    quietHoursEnabled: true,
    quietStart: '22:00',
    quietEnd: '07:00',
    lockScreenPreview: 'name_only' as const,
    mutedConversationIds: [202],
  };

  assert.equal(shouldSuppressNotification(prefs, 201, night), true);
  assert.equal(shouldSuppressNotification(prefs, 202, noon), true);
  assert.equal(shouldSuppressNotification(prefs, 201, noon), false);

  assert.deepEqual(formatNotificationPreview(prefs, 'Nadia', 'Secret text'), {
    title: 'Nadia',
    body: 'Sent you a message',
  });
  assert.deepEqual(
    formatNotificationPreview({ ...prefs, lockScreenPreview: 'hidden' }, 'Nadia', 'Secret text'),
    {
      title: 'Chatly',
      body: 'New message received',
    }
  );
});

test('QR profile URI formatting/parsing, channel validation, PIN checks, locations, and storage summary', () => {
  const uri = formatQrProfileUri('@Nadia.Arch', 'INV-9988');
  assert.equal(uri, 'chatly://user/@nadia.arch?invite=INV-9988');
  assert.deepEqual(parseQrProfileInput(uri), {
    username: 'nadia.arch',
    inviteToken: 'INV-9988',
  });
  assert.deepEqual(parseQrProfileInput('@tarek.ux'), {
    username: 'tarek.ux',
    inviteToken: null,
  });

  assert.equal(validateChannelInput({ title: 'A', handle: 'ch' }) !== null, true);
  assert.equal(
    validateChannelInput({ title: 'Chatly Dispatch', handle: '@chatly_news' }),
    null
  );

  assert.equal(validatePinCode('123') !== null, true);
  assert.equal(validatePinCode('123456'), null);
  assert.equal(getRootFontSizePx('lg'), '18px');

  const now = Date.parse('2026-11-24T12:00:00.000Z');
  assert.equal(
    isLocationShareActive({ expiresAt: '2026-11-24T12:30:00.000Z', stoppedAt: null }, now),
    true
  );
  assert.equal(
    isLocationShareActive(
      { expiresAt: '2026-11-24T12:30:00.000Z', stoppedAt: '2026-11-24T12:05:00.000Z' },
      now
    ),
    false
  );
  assert.ok(formatCoordinatesDisplay(30.04442, 31.23571).includes('N'));

  const summary = computeStorageSummary([
    {
      id: '1',
      kind: 'image',
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 1000,
      url: '/1',
      durationMs: 0,
      conversationId: 1,
      uploaderId: 1,
      createdAt: '2026-11-24T00:00:00.000Z',
    },
    {
      id: '2',
      kind: 'audio',
      fileName: 'b.webm',
      mimeType: 'audio/webm',
      sizeBytes: 500,
      url: '/2',
      durationMs: 1000,
      conversationId: 1,
      uploaderId: 1,
      createdAt: '2026-11-24T00:00:00.000Z',
    },
  ]);
  assert.equal(summary.totalBytes, 1500);
  assert.equal(summary.byKind.image.count, 1);
  assert.equal(summary.byKind.audio.bytes, 500);
});

import {
  getClientFirebaseConfig,
  getWebRtcIceServers,
  normalizeBaseUrl,
  resolveApiUrl,
  resolveWsUrl,
} from './config';

test('config helpers resolve URLs, STUN servers, and Firebase config without environment variables', () => {
  assert.equal(normalizeBaseUrl(' https://api.chatly.app/ '), 'https://api.chatly.app');
  assert.equal(resolveApiUrl('/health', ''), '/health');
  assert.equal(
    resolveApiUrl('assets/icon.png', 'https://cdn.chatly.app/'),
    'https://cdn.chatly.app/assets/icon.png'
  );
  assert.equal(
    resolveApiUrl('https://cdn.example.com/file.png', 'https://cdn.chatly.app'),
    'https://cdn.example.com/file.png'
  );

  assert.equal(
    resolveWsUrl(
      '/ws',
      { token: 'abc' },
      { locationProtocol: 'https:', locationHost: 'chatly.example.com' }
    ),
    'wss://chatly.example.com/ws?token=abc'
  );
  assert.equal(
    resolveWsUrl('/ws', { token: 'abc' }, { locationProtocol: 'file:', locationHost: '' }),
    ''
  );

  const ice = getWebRtcIceServers();
  assert.equal(ice.length, 2);
  assert.equal(ice[0].urls, 'stun:stun.l.google.com:19302');

  const fb = getClientFirebaseConfig({
    projectId: 'default-proj',
    appId: 'default-app',
    apiKey: 'default-key',
    authDomain: 'default.firebaseapp.com',
    firestoreDatabaseId: 'ai-studio-chatly',
  });
  assert.equal(fb.projectId, 'default-proj');
  assert.equal(fb.firestoreDatabaseId, 'ai-studio-chatly');
});

import { buildDirectConversationId, sortAndDedupeMessages } from './chatHelpers';

test('buildDirectConversationId is deterministic across participant order and handles long UIDs safely', () => {
  const id1 = buildDirectConversationId('uid_bob_99', 'uid_alice_11');
  const id2 = buildDirectConversationId('uid_alice_11', 'uid_bob_99');
  assert.equal(id1, id2);
  assert.equal(id1, 'direct_uid_alice_11_uid_bob_99');

  const longA = 'a'.repeat(80) + '1';
  const longB = 'a'.repeat(80) + '2';
  const longC = 'a'.repeat(80) + '3';
  const longId1 = buildDirectConversationId(longA, longB);
  const longId2 = buildDirectConversationId(longA, longC);
  assert.ok(longId1.length <= 120);
  assert.notEqual(longId1, longId2);
});

test('sortAndDedupeMessages orders chronologically and merges duplicate clientMessageIds', () => {
  const base: Omit<ChatMessage, 'id' | 'clientMessageId' | 'body' | 'createdAt'> = {
    conversationId: 10,
    senderId: 1,
    senderUsername: 'alice',
    senderDisplayName: 'Alice',
    type: 'text',
    replyToId: null,
    reactions: [],
  };

  const ordered = sortAndDedupeMessages([
    { ...base, id: 2, clientMessageId: 'c2', body: 'Second', createdAt: '2026-11-25T10:00:05.000Z' },
    { ...base, id: 1, clientMessageId: 'c1', body: 'First optimistic', createdAt: '2026-11-25T10:00:01.000Z' },
    { ...base, id: 99, clientMessageId: 'c1', body: 'First server', createdAt: '2026-11-25T10:00:01.200Z', deliveredAt: '2026-11-25T10:00:01.200Z' },
  ]);

  assert.equal(ordered.length, 2);
  assert.equal(ordered[0].body, 'First server');
  assert.equal(ordered[0].deliveredAt, '2026-11-25T10:00:01.200Z');
  assert.equal(ordered[1].body, 'Second');
});


