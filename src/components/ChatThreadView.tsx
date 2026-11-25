import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  Mic,
  Paperclip,
  Pause,
  Phone,
  Pin,
  Play,
  Search,
  Send,
  Smile,
  Sparkles,
  Square,
  Star,
  Sticker,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  AccentColor,
  ChatMessage,
  ConversationSummary,
  LanguageCode,
  LocationShareItem,
  ReactionSummary,
  SmartFolder,
  StickerPackItem,
  VoiceStickerItem,
} from '../core/types';
import { EXTENDED_REACTION_EMOJIS } from '../core/reactions';
import { formatCoordinatesDisplay, isLocationShareActive } from '../core/features';
import { ACCENT_PALETTES } from '../core/theme';
import {
  formatBytes,
  formatLocalizedDate,
  formatLocalizedSchedule,
  formatLocalizedTime,
  TRANSLATIONS,
} from '../core/localization';
import { ChatlyAvatar } from './ChatlyAvatar';
import { MessageBubble } from './MessageBubble';
import { AiAssistantPanel } from './AiAssistantPanel';
import { VoiceStickerCard } from './VoiceStickerCard';
import {
  downloadMediaWithProgress,
  getAuthorizedMediaUrl,
  toggleMessageReactionApi,
} from '../services/api';

const COMPOSER_QUICK_EMOJIS = [
  '😀',
  '😊',
  '😂',
  '❤️',
  '👍',
  '🔥',
  '🎉',
  '🙏',
  '👏',
  '🤩',
  '🤝',
  '✨',
  '💡',
  '✅',
  '☕',
  '🚀',
];

interface ChatThreadViewProps {
  conversation: ConversationSummary | null;
  allConversations: ConversationSummary[];
  messages: ChatMessage[];
  hasMoreMessages?: boolean;
  currentUserId: number;
  lang: LanguageCode;
  accentColor: AccentColor;
  sending: boolean;
  isLiveMode: boolean;
  authToken: string | null;
  stickerPacks: StickerPackItem[];
  peerIsTyping: boolean;
  e2eeAvailable: boolean;
  e2eeActive: boolean;
  onToggleE2ee: () => void;
  onBackMobile?: () => void;
  onTypingChange: (isTyping: boolean) => void;
  onDraftChange?: (conversationId: number, draft: string) => void;
  onLoadOlder?: () => void;
  onSendMessage: (payload: {
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
  }) => Promise<void> | void;
  activeLocations?: LocationShareItem[];
  onShareLocation?: (payload: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    isLive: boolean;
    durationMinutes: number;
  }) => Promise<void> | void;
  onStopLocation?: (shareId: number) => Promise<void> | void;
  onToggleReaction: (
    messageId: number,
    emoji: string,
    syncedReactions?: ReactionSummary[]
  ) => void;
  onEditMessage: (messageId: number, newBody: string) => void;
  onDeleteMessage: (messageId: number) => void;
  onForwardMessage: (message: ChatMessage, targetConversationId: number) => void;
  onTogglePin: (messageId: number) => void;
  onToggleStar: (messageId: number) => void;
  onCreateReminder: (messageId: number, remindAt: string, note: string) => void;
  onSaveSticker?: (stickerId: number) => void;
  onStartCall?: (conversationId: number, callType: 'audio' | 'video') => void;
  onUpdateConversationMeta?: (
    conversationId: number,
    patch: {
      pinned?: boolean;
      needsFollowUp?: boolean;
      archived?: boolean;
      snoozedUntil?: string | null;
      customLabel?: string;
      folder?: SmartFolder;
    }
  ) => void;
  threadLoading?: boolean;
  threadError?: string | null;
  onClearThreadError?: () => void;
}

export function ChatThreadView({
  conversation,
  allConversations,
  messages,
  hasMoreMessages = false,
  currentUserId,
  lang,
  accentColor,
  sending,
  isLiveMode,
  authToken,
  stickerPacks,
  peerIsTyping,
  e2eeAvailable,
  e2eeActive,
  onToggleE2ee,
  onBackMobile,
  onTypingChange,
  onDraftChange,
  onLoadOlder,
  onSendMessage,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onTogglePin,
  onToggleStar,
  onCreateReminder,
  onSaveSticker,
  onStartCall,
  onUpdateConversationMeta,
  activeLocations = [],
  onShareLocation,
  onStopLocation,
  threadLoading = false,
  threadError = null,
  onClearThreadError,
}: ChatThreadViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [reminderMsg, setReminderMsg] = useState<ChatMessage | null>(null);
  const [reminderTime, setReminderTime] = useState('');
  const [reminderNote, setReminderNote] = useState('');

  const [showSearch, setShowSearch] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [stickerQuery, setStickerQuery] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [showComposerEmoji, setShowComposerEmoji] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLiveMode, setLocationLiveMode] = useState(true);
  const [locationMinutes, setLocationMinutes] = useState(15);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [reactionOverlayMsgId, setReactionOverlayMsgId] = useState<number | null>(null);
  const [customReactionEmoji, setCustomReactionEmoji] = useState('');
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const bubbleLongPressTimerRef = useRef<number | null>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Voice Note MediaRecorder state
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'ready'>('idle');
  const [recordMs, setRecordMs] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const recordedMimeRef = useRef<string>('audio/webm');
  const discardedRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const prevConvIdRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(conversation?.draftBody || '');
    setReplyTarget(null);
    setEditingMsg(null);
    setShowSearch(false);
    setThreadSearch('');
    setShowStickers(false);
    setShowComposerEmoji(false);
    setReactionOverlayMsgId(null);
    setReactionError(null);
    setUploadError(null);

    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    discardedRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((tr) => tr.stop());
      recordStreamRef.current = null;
    }
    setRecordedBlob(null);
    setRecordedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRecordMs(0);
    setRecordingState('idle');
  }, [conversation?.id]);

  useEffect(() => {
    const switchedChat = prevConvIdRef.current !== (conversation?.id ?? null);
    prevConvIdRef.current = conversation?.id ?? null;
    endRef.current?.scrollIntoView({ behavior: switchedChat ? 'auto' : 'smooth' });
  }, [messages.length, conversation?.id]);

  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) window.clearInterval(recordIntervalRef.current);
      if (bubbleLongPressTimerRef.current) window.clearTimeout(bubbleLongPressTimerRef.current);
      discardedRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const cancelBubbleLongPress = () => {
    if (bubbleLongPressTimerRef.current !== null) {
      window.clearTimeout(bubbleLongPressTimerRef.current);
      bubbleLongPressTimerRef.current = null;
    }
    pointerOriginRef.current = null;
  };

  const startBubbleLongPress = (msg: ChatMessage, clientX?: number, clientY?: number) => {
    if (msg.deletedAt) return;
    cancelBubbleLongPress();
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      pointerOriginRef.current = { x: clientX, y: clientY };
    }
    bubbleLongPressTimerRef.current = window.setTimeout(() => {
      setReactionOverlayMsgId(msg.id);
      setReactionError(null);
    }, 450);
  };

  const handlePersistReaction = async (messageId: number, emoji: string) => {
    const trimmed = emoji.trim();
    if (!trimmed || reactionBusy) return;
    setReactionError(null);

    if (isLiveMode && authToken) {
      setReactionBusy(true);
      try {
        const res = await toggleMessageReactionApi(authToken, messageId, trimmed);
        onToggleReaction(messageId, trimmed, res.reactions);
        setReactionOverlayMsgId(null);
        setCustomReactionEmoji('');
      } catch (err) {
        setReactionError(
          err instanceof Error ? err.message : 'Unable to save emoji reaction.'
        );
      } finally {
        setReactionBusy(false);
      }
      return;
    }

    onToggleReaction(messageId, trimmed);
    setReactionOverlayMsgId(null);
    setCustomReactionEmoji('');
  };

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center chatly-thread-wallpaper">
        <div className="w-16 h-16 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex items-center justify-center mb-4 text-teal-500 dark:text-teal-400 shadow-sm">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h2 className="font-display text-lg font-semibold text-[var(--chatly-text-primary)]">
          {t.noConversationSelected}
        </h2>
        <p className="mt-1.5 text-sm text-[var(--chatly-text-muted)] max-w-sm">
          {t.noConversationSubtitle}
        </p>
      </div>
    );
  }

  const handleDraftInput = (next: string) => {
    setDraft(next);
    onDraftChange?.(conversation.id, next);
    onTypingChange(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1400);
  };

  const toLocalDatetimeInput = (date: Date): string => {
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  };

  const resolveValidatedSchedule = (): { iso: string | null; valid: boolean } => {
    if (!scheduledFor) return { iso: null, valid: true };
    const parsed = new Date(scheduledFor);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setScheduleError(t.schedulePastError);
      setShowSchedule(true);
      return { iso: null, valid: false };
    }
    setScheduleError(null);
    return { iso: parsed.toISOString(), valid: true };
  };

  const sendVoiceNote = async () => {
    if (!recordedBlob || recordingState !== 'ready' || sending) return;
    const { iso: isoSchedule, valid } = resolveValidatedSchedule();
    if (!valid) return;

    const mime = recordedBlob.type || recordedMimeRef.current || 'audio/webm';
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    setUploadError(null);
    try {
      await onSendMessage({
        body: draft.trim() || (lang === 'ar' ? 'رسالة صوتية' : 'Voice message'),
        type: 'audio',
        replyToId: replyTarget?.id ?? null,
        scheduledAt: isoSchedule,
        scheduledFor: isoSchedule,
        attachmentFile: {
          file: recordedBlob,
          fileName: `voice-note-${Date.now()}.${ext}`,
          mimeType: mime,
          kind: 'audio',
          durationMs: recordMs,
        },
        onUploadProgress: setUploadPct,
      });
      discardRecording();
      setDraft('');
      onDraftChange?.(conversation.id, '');
      setReplyTarget(null);
      setScheduledFor('');
      setScheduleError(null);
      setShowSchedule(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to send voice note.');
    } finally {
      setUploadPct(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();

    if (editingMsg) {
      if (!text) return;
      onEditMessage(editingMsg.id, text);
      setEditingMsg(null);
      setDraft('');
      return;
    }

    const { iso: isoSchedule, valid } = resolveValidatedSchedule();
    if (!valid) return;

    if (recordedBlob && recordingState === 'ready') {
      await sendVoiceNote();
      return;
    }

    if (!text || sending) return;
    setUploadError(null);
    try {
      await onSendMessage({
        body: text,
        type: 'text',
        replyToId: replyTarget?.id ?? null,
        scheduledAt: isoSchedule,
        scheduledFor: isoSchedule,
      });
      setDraft('');
      onDraftChange?.(conversation.id, '');
      setReplyTarget(null);
      setScheduledFor('');
      setScheduleError(null);
      setShowSchedule(false);
      setShowComposerEmoji(false);
      onTypingChange(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to send message.');
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);

    if (file.size > 15 * 1024 * 1024) {
      setUploadError(lang === 'ar' ? 'الحد الأقصى للملف 15 ميجابايت.' : 'File exceeds 15 MB limit.');
      return;
    }

    const kind: 'image' | 'video' | 'audio' | 'document' = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'document';

    const { iso: isoSchedule, valid } = resolveValidatedSchedule();
    if (!valid) return;

    try {
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      setUploadPct(10);
      await onSendMessage({
        body: draft.trim() || file.name,
        type: kind,
        replyToId: replyTarget?.id ?? null,
        scheduledAt: isoSchedule,
        scheduledFor: isoSchedule,
        attachmentFile: {
          file,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          kind,
        },
        onUploadProgress: setUploadPct,
        abortSignal: controller.signal,
      });
      setDraft('');
      setReplyTarget(null);
      setScheduledFor('');
      setScheduleError(null);
      setShowSchedule(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      uploadAbortRef.current = null;
      setUploadPct(null);
    }
  };

  const handleConfirmLocationShare = () => {
    if (!onShareLocation) return;
    if (!navigator.geolocation) {
      setLocationError(
        lang === 'ar'
          ? 'خدمة تحديد الموقع غير مدعومة في هذا المتصفح.'
          : 'Geolocation API is unavailable in this browser.'
      );
      return;
    }
    setLocationBusy(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await onShareLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: Math.round(pos.coords.accuracy || 15),
            isLive: locationLiveMode,
            durationMinutes: locationLiveMode ? locationMinutes : 15,
          });
          setShowLocationModal(false);
        } catch (err) {
          setLocationError(err instanceof Error ? err.message : 'Failed to share location.');
        } finally {
          setLocationBusy(false);
        }
      },
      (geoErr) => {
        setLocationBusy(false);
        setLocationError(geoErr.message || 'Location permission denied.');
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const pickSupportedAudioMime = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m));
  };

  const startVoiceRecording = async () => {
    setUploadError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setUploadError(
        lang === 'ar'
          ? 'تسجيل الصوت غير مدعوم في هذا المتصفح.'
          : 'Microphone recording (MediaRecorder API) is unavailable in this browser.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mimeChoice = pickSupportedAudioMime();
      const recorder = mimeChoice
        ? new MediaRecorder(stream, { mimeType: mimeChoice, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });

      recordedMimeRef.current = recorder.mimeType || mimeChoice || 'audio/webm';
      recordChunksRef.current = [];
      discardedRef.current = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        if (recordIntervalRef.current) {
          window.clearInterval(recordIntervalRef.current);
          recordIntervalRef.current = null;
        }
        stream.getTracks().forEach((tr) => tr.stop());
        if (recordStreamRef.current === stream) {
          recordStreamRef.current = null;
        }
        if (discardedRef.current) {
          recordChunksRef.current = [];
          return;
        }
        const finalMime = recorder.mimeType || recordedMimeRef.current || 'audio/webm';
        const blob = new Blob(recordChunksRef.current, { type: finalMime });
        if (blob.size > 660_000) {
          setUploadError(
            lang === 'ar'
              ? 'الرسالة الصوتية تتجاوز الحد الأقصى (680 كيلوبايت). سجّل مقطعاً أقصر.'
              : 'Voice note exceeded the 680 KB inline limit. Please record a shorter clip.'
          );
          setRecordingState('idle');
          return;
        }
        setRecordedBlob(blob);
        setRecordedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setRecordingState('ready');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      recordStartRef.current = Date.now();
      setRecordMs(0);
      setRecordingState('recording');
      recordIntervalRef.current = window.setInterval(() => {
        setRecordMs((prev) => {
          const next = prev + 250;
          if (next >= 90_000 && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          return next;
        });
      }, 250);
    } catch {
      setUploadError(
        lang === 'ar'
          ? 'تم رفض إذن الميكروفون أو تعذر تشغيله في هذا المتصفح.'
          : 'Microphone access denied or unavailable in this browser.'
      );
    }
  };

  const pauseOrResumeRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (recordingState === 'recording' && rec.state === 'recording') {
      rec.pause();
      if (recordIntervalRef.current) {
        window.clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
      setRecordingState('paused');
    } else if (recordingState === 'paused' && rec.state === 'paused') {
      rec.resume();
      recordIntervalRef.current = window.setInterval(() => {
        setRecordMs((prev) => {
          const next = prev + 250;
          if (next >= 90_000 && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          return next;
        });
      }, 250);
      setRecordingState('recording');
    }
  };

  const stopVoiceRecording = () => {
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const discardRecording = () => {
    discardedRef.current = true;
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((tr) => tr.stop());
      recordStreamRef.current = null;
    }
    recordChunksRef.current = [];
    setRecordedBlob(null);
    setRecordedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRecordMs(0);
    setRecordingState('idle');
  };

  const handleSendSticker = async (sticker: VoiceStickerItem) => {
    const { iso: isoSchedule, valid } = resolveValidatedSchedule();
    if (!valid) return;
    setShowStickers(false);
    await onSendMessage({
      body: lang === 'ar' && sticker.nameAr ? sticker.nameAr : sticker.name,
      type: 'voice_sticker',
      sticker,
      replyToId: replyTarget?.id ?? null,
      scheduledAt: isoSchedule,
      scheduledFor: isoSchedule,
    });
    setReplyTarget(null);
    setScheduledFor('');
    setScheduleError(null);
    setShowSchedule(false);
  };

  const handleDownloadSharedDoc = async (url: string, fileName: string) => {
    try {
      const blob = await downloadMediaWithProgress(url, authToken);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 800);
    } catch {
      // ignore failed quick download
    }
  };

  const peer = conversation.peer;
  const presenceLine = peerIsTyping
    ? t.typingLabel
    : peer
      ? peer.online
        ? t.onlineLabel
        : peer.lastSeenAt
          ? `${t.lastSeenPrefix} ${formatLocalizedTime(peer.lastSeenAt, lang)}`
          : t.offlineLabel
      : conversation.memberCount
        ? `${conversation.memberCount} ${lang === 'ar' ? 'أعضاء' : 'members'}`
        : '';

  const pinnedMessages = messages.filter((m) => m.pinned && !m.deletedAt);
  const starredMessages = messages.filter((m) => m.starred && !m.deletedAt);
  const sharedMedia = messages.filter(
    (m) =>
      !m.deletedAt &&
      m.attachment &&
      (m.attachment.kind === 'image' || m.attachment.kind === 'video')
  );
  const sharedDocs = messages.filter(
    (m) => !m.deletedAt && m.attachment && m.attachment.kind === 'document'
  );
  const isSnoozed = Boolean(
    conversation.snoozedUntil && new Date(conversation.snoozedUntil).getTime() > Date.now()
  );

  const filteredMessages = threadSearch.trim()
    ? messages.filter((m) =>
        (m.decryptedBody ?? m.body).toLowerCase().includes(threadSearch.trim().toLowerCase())
      )
    : messages;

  const allStickers = stickerPacks.flatMap((p) => p.stickers);
  const filteredStickers = stickerQuery.trim()
    ? allStickers.filter(
        (s) =>
          s.name.toLowerCase().includes(stickerQuery.toLowerCase()) ||
          s.nameAr.includes(stickerQuery) ||
          s.category.toLowerCase().includes(stickerQuery.toLowerCase())
      )
    : allStickers;

  return (
    <div className="flex h-full min-w-0 bg-[var(--chatly-bg-canvas)]">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Thread Header */}
        <div className="px-3 sm:px-6 h-16 border-b border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)]/95 backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {onBackMobile && (
              <button
                type="button"
                onClick={onBackMobile}
                aria-label="Back to conversations"
                className="lg:hidden min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] shrink-0"
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
            )}
            <div className="relative shrink-0">
              <ChatlyAvatar src={peer?.avatarUrl} name={conversation.title} size="sm" />
              {peer?.online && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--chatly-bg-surface)]"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-semibold text-[var(--chatly-text-primary)] truncate">
                {conversation.title}
              </h2>
              <div className="text-xs text-[var(--chatly-text-muted)] flex items-center gap-1.5 truncate">
                {peer && <span className="font-medium truncate">@{peer.username}</span>}
                {peer && presenceLine && <span aria-hidden="true" className="shrink-0">·</span>}
                <span className={`shrink-0 ${peerIsTyping ? palette.primaryText : ''}`}>{presenceLine}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {conversation.type === 'direct' && (
              <button
                type="button"
                onClick={onToggleE2ee}
                disabled={!e2eeAvailable}
                title={
                  e2eeAvailable
                    ? t.e2eeEnabledLabel
                    : lang === 'ar'
                      ? 'الطرف الآخر لم يسجل مفتاح تشفير بعد'
                      : 'Peer has not registered an E2EE device key yet'
                }
                aria-label={e2eeActive && e2eeAvailable ? t.e2eeEnabledLabel : t.e2eeOffLabel}
                aria-pressed={e2eeActive}
                className={`min-h-[34px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  e2eeActive && e2eeAvailable
                    ? `${palette.softBg} border-teal-500/40 ${palette.primaryText}`
                    : 'border-[var(--chatly-border)] text-[var(--chatly-text-muted)] disabled:opacity-50'
                }`}
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span className={showInfoPanel || showAiPanel ? 'hidden 2xl:inline' : 'hidden xl:inline'}>
                  {e2eeActive && e2eeAvailable ? t.e2eeEnabledLabel : t.e2eeOffLabel}
                </span>
              </button>
            )}

            <div className="flex items-center gap-0.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] p-0.5">
              {onStartCall && (
                <>
                  <button
                    type="button"
                    onClick={() => onStartCall(conversation.id, 'audio')}
                    aria-label="Start audio call"
                    className="min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)] transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(conversation.id, 'video')}
                    aria-label="Start video call"
                    className="min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)] transition-colors"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowSearch((prev) => !prev)}
                aria-label="Search messages in thread"
                className={`min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center transition-colors ${
                  showSearch
                    ? `bg-[var(--chatly-bg-elevated)] shadow-2xs ${palette.primaryText}`
                    : 'text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAiPanel((prev) => !prev);
                  setShowInfoPanel(false);
                }}
                aria-label={t.aiAssistLabel}
                className={`min-h-[34px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  showAiPanel
                    ? `bg-[var(--chatly-bg-elevated)] shadow-2xs ${palette.primaryText}`
                    : 'text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden xl:inline">{t.aiAssistLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowInfoPanel((prev) => !prev);
                  setShowAiPanel(false);
                }}
                aria-label={t.infoPanelTitle}
                aria-expanded={showInfoPanel}
                className={`min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center transition-colors ${
                  showInfoPanel
                    ? `bg-[var(--chatly-bg-elevated)] shadow-2xs ${palette.primaryText}`
                    : 'text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
                }`}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Thread Search Bar */}
        {showSearch && (
          <div className="px-4 sm:px-6 py-2.5 border-b border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--chatly-text-muted)] shrink-0" />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder={
                lang === 'ar' ? 'ابحث داخل هذه المحادثة...' : 'Search messages in this chat...'
              }
              className="flex-1 bg-transparent text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none"
            />
            {threadSearch && (
              <button
                type="button"
                onClick={() => setThreadSearch('')}
                aria-label="Clear message search"
                className="text-xs text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Pinned Message Banner */}
        {pinnedMessages.length > 0 && (
          <div className="px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-amber-50/80 dark:bg-amber-950/20 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0 text-amber-900 dark:text-amber-200">
              <Pin className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold">{t.pinnedLabel}:</span>
              <span className="truncate">
                {pinnedMessages[pinnedMessages.length - 1].decryptedBody ??
                  pinnedMessages[pinnedMessages.length - 1].body}
              </span>
            </div>
          </div>
        )}

        {/* Active Live Location Shares */}
        {activeLocations.filter((loc) => isLocationShareActive(loc)).length > 0 && (
          <div className="px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-teal-50/70 dark:bg-teal-950/25 space-y-1.5">
            {activeLocations
              .filter((loc) => isLocationShareActive(loc))
              .map((loc) => (
                <div
                  key={loc.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-teal-900 dark:text-teal-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                    <span className="font-semibold truncate">{loc.senderDisplayName}</span>
                    <span className="font-mono text-[11px]">
                      {formatCoordinatesDisplay(loc.latitude, loc.longitude)} (±{loc.accuracyMeters}m)
                    </span>
                    <a
                      href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-medium"
                    >
                      {lang === 'ar' ? 'خريطة' : 'Map'}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono">
                      {loc.isLive ? t.liveLocationLabel : 'Current'} ·{' '}
                      {formatLocalizedTime(loc.expiresAt, lang)}
                    </span>
                    {loc.userId === currentUserId && onStopLocation && (
                      <button
                        type="button"
                        onClick={() => onStopLocation(loc.id)}
                        className="px-2 py-0.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-semibold"
                      >
                        {t.stopSharingBtn}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 chatly-thread-wallpaper">
          <div className="max-w-4xl mx-auto w-full space-y-4">
            {hasMoreMessages && onLoadOlder && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  className="px-4 py-1.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs font-medium text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                >
                  {t.loadOlderBtn}
                </button>
              </div>
            )}

            {threadLoading && filteredMessages.length === 0 ? (
              <div className="space-y-3 py-8" aria-busy="true">
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`h-14 rounded-2xl bg-[var(--chatly-bg-surface)]/80 border border-[var(--chatly-border)] animate-pulse ${
                      idx % 2 === 0 ? 'ms-auto w-2/3' : 'me-auto w-3/4'
                    }`}
                  />
                ))}
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--chatly-text-muted)]">
                {threadSearch
                  ? lang === 'ar'
                    ? 'لا توجد رسائل مطابقة للبحث.'
                    : 'No messages match your search.'
                  : lang === 'ar'
                    ? 'ابدأ المحادثة بإرسال رسالة أو ملصق صوتي.'
                    : 'Say hello or send a Voice Sticker to start the conversation.'}
              </div>
            ) : (
              filteredMessages.map((msg, idx) => {
                const isSelf = msg.senderId === currentUserId;
                const overlayOpen = reactionOverlayMsgId === msg.id && !msg.deletedAt;

                const scheduledTarget = msg.scheduledAt ?? msg.scheduledFor ?? null;
                const scheduledMs = scheduledTarget ? new Date(scheduledTarget).getTime() : NaN;
                const isFutureScheduled = Boolean(
                  !msg.deletedAt && Number.isFinite(scheduledMs) && scheduledMs > Date.now()
                );

                const msgDateObj = new Date(msg.createdAt);
                const prevDateObj = idx > 0 ? new Date(filteredMessages[idx - 1].createdAt) : null;
                const showDayDivider =
                  !Number.isNaN(msgDateObj.getTime()) &&
                  (!prevDateObj ||
                    msgDateObj.toDateString() !== prevDateObj.toDateString());

                const todayStr = new Date().toDateString();
                const yesterdayStr = new Date(Date.now() - 86_400_000).toDateString();
                const dayLabel =
                  msgDateObj.toDateString() === todayStr
                    ? t.todayLabel
                    : msgDateObj.toDateString() === yesterdayStr
                      ? t.yesterdayLabel
                      : formatLocalizedDate(msg.createdAt, lang);

                return (
                  <div key={msg.clientMessageId || msg.id} className="space-y-2">
                    {showDayDivider && (
                      <div className="flex items-center gap-3 py-1.5" role="separator" aria-label={dayLabel}>
                        <div className="h-px flex-1 bg-[var(--chatly-border)]" />
                        <span className="text-[11px] font-medium text-[var(--chatly-text-muted)] tabular-nums whitespace-nowrap">
                          {dayLabel}
                        </span>
                        <div className="h-px flex-1 bg-[var(--chatly-border)]" />
                      </div>
                    )}

                    <div
                      onPointerDown={(e) => {
                        if (e.button === 0 || e.pointerType !== 'mouse') {
                          startBubbleLongPress(msg, e.clientX, e.clientY);
                        }
                      }}
                      onPointerMove={(e) => {
                        if (pointerOriginRef.current) {
                          const dx = Math.abs(e.clientX - pointerOriginRef.current.x);
                          const dy = Math.abs(e.clientY - pointerOriginRef.current.y);
                          if (dx > 10 || dy > 10) cancelBubbleLongPress();
                        }
                      }}
                      onPointerUp={cancelBubbleLongPress}
                      onPointerCancel={cancelBubbleLongPress}
                      className="relative flex flex-col"
                    >
                      {overlayOpen && (
                        <div
                          role="dialog"
                          aria-label="Emoji reaction picker"
                          className={`z-30 mb-2 w-72 rounded-2xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] p-3 shadow-xl ${
                            isSelf ? 'self-end' : 'self-start'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-[var(--chatly-text-primary)]">
                              {lang === 'ar' ? 'أضف تفاعلاً' : 'Add reaction'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setReactionOverlayMsgId(null)}
                              aria-label="Close emoji picker"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-8 gap-1">
                            {EXTENDED_REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                disabled={reactionBusy}
                                onClick={() => handlePersistReaction(msg.id, emoji)}
                                aria-label={`React with ${emoji}`}
                                className="h-8 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-base transition-transform hover:scale-110 disabled:opacity-50"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handlePersistReaction(msg.id, customReactionEmoji);
                            }}
                            className="mt-2.5 flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={customReactionEmoji}
                              onChange={(e) => setCustomReactionEmoji(e.target.value)}
                              maxLength={8}
                              placeholder={lang === 'ar' ? 'إيموجي مخصص...' : 'Custom emoji...'}
                              aria-label="Custom reaction emoji"
                              className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-xs text-[var(--chatly-text-primary)] focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!customReactionEmoji.trim() || reactionBusy}
                              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-40 ${palette.primaryBg}`}
                            >
                              {lang === 'ar' ? 'إضافة' : 'Add'}
                            </button>
                          </form>

                          {reactionError && (
                            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                              {reactionError}
                            </p>
                          )}
                        </div>
                      )}

                      <MessageBubble
                        message={msg}
                        isSelf={isSelf}
                        isGroup={conversation.type === 'group'}
                        senderAvatarUrl={conversation.type === 'direct' ? peer?.avatarUrl : undefined}
                        lang={lang}
                        accentColor={accentColor}
                        authToken={authToken}
                        hideScheduleIndicator={isFutureScheduled}
                        onToggleReaction={handlePersistReaction}
                        onOpenReactionOverlay={(targetMsg) => {
                          setReactionError(null);
                          setReactionOverlayMsgId((prev) =>
                            prev === targetMsg.id ? null : targetMsg.id
                          );
                        }}
                        onReply={(m) => {
                          setReplyTarget(m);
                          setEditingMsg(null);
                        }}
                        onStartEdit={(m) => {
                          setEditingMsg(m);
                          setReplyTarget(null);
                          setDraft(m.decryptedBody ?? m.body);
                        }}
                        onDeleteMessage={onDeleteMessage}
                        onForwardMessage={(m) => setForwardMsg(m)}
                        onTogglePin={onTogglePin}
                        onToggleStar={onToggleStar}
                        onOpenReminder={(m) => {
                          setReminderMsg(m);
                          const dt = new Date(Date.now() + 3600_000);
                          setReminderTime(dt.toISOString().slice(0, 16));
                          setReminderNote('');
                        }}
                        onOpenImageLightbox={(url, alt) => setLightbox({ url, alt })}
                        onSaveSticker={onSaveSticker}
                      />

                      {isFutureScheduled && scheduledTarget && (
                        <div
                          data-testid={`scheduled-indicator-${msg.id}`}
                          title={`${t.scheduledForLabel} ${formatLocalizedSchedule(scheduledTarget, lang)}`}
                          className={`mt-1 flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-teal-700 dark:text-teal-300 ${
                            isSelf ? 'self-end' : 'self-start'
                          }`}
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>
                            {t.scheduledTag} · {formatLocalizedSchedule(scheduledTarget, lang)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Upload / Thread Error Status Banner */}
        {(uploadPct !== null || uploadError || threadError) && (
          <div
            role={uploadError || threadError ? 'alert' : 'status'}
            className="px-4 py-2 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs flex items-center justify-between gap-3"
          >
            {uploadError || threadError ? (
              <span className="text-rose-600 dark:text-rose-400">
                {uploadError || threadError}
              </span>
            ) : (
              <div className="flex-1 flex items-center gap-3">
                <span className="text-[var(--chatly-text-secondary)]">
                  {lang === 'ar' ? 'جاري الرفع...' : 'Uploading media...'}
                </span>
                <div className="flex-1 h-2 rounded-full bg-[var(--chatly-bg-elevated)] overflow-hidden">
                  <div
                    style={{ width: `${uploadPct ?? 0}%` }}
                    className={`h-full transition-all ${palette.primaryBg}`}
                  />
                </div>
                <span className="font-mono tabular-nums">{uploadPct}%</span>
                <button
                  type="button"
                  onClick={() => uploadAbortRef.current?.abort()}
                  className="px-2 py-0.5 rounded-lg border border-[var(--chatly-border)] text-rose-600 dark:text-rose-400 font-medium"
                >
                  {t.cancelUploadBtn}
                </button>
              </div>
            )}
            {(uploadError || threadError) && (
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => {
                  setUploadError(null);
                  onClearThreadError?.();
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Voice Sticker Picker Drawer */}
        {showStickers && (
          <div className="p-4 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] max-h-72 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between gap-3">
              <input
                type="search"
                value={stickerQuery}
                onChange={(e) => setStickerQuery(e.target.value)}
                placeholder={
                  lang === 'ar' ? 'ابحث في الملصقات الصوتية...' : 'Search Voice Stickers...'
                }
                className="flex-1 min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-xs text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none focus:ring-2 focus:ring-teal-500/35"
              />
              <button
                type="button"
                onClick={() => setShowStickers(false)}
                aria-label="Close sticker drawer"
                className="p-1.5 rounded-lg text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredStickers.map((stk) => (
                <div
                  key={stk.id}
                  className="rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] p-2 space-y-2"
                >
                  <VoiceStickerCard
                    sticker={stk}
                    lang={lang}
                    accentColor={accentColor}
                    authorizedAudioUrl={
                      stk.audioUrl ? getAuthorizedMediaUrl(stk.audioUrl, authToken) : undefined
                    }
                    authorizedVisualUrl={
                      stk.visualUrl ? getAuthorizedMediaUrl(stk.visualUrl, authToken) : undefined
                    }
                    compact
                  />
                  <button
                    type="button"
                    onClick={() => handleSendSticker(stk)}
                    className={`w-full min-h-[32px] rounded-lg text-xs font-medium text-white ${palette.primaryBg} ${palette.primaryHover}`}
                  >
                    {t.sendMessage}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composer Emoji Quick-Insert Drawer */}
        {showComposerEmoji && (
          <div className="px-4 py-2.5 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1">
              {COMPOSER_QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleDraftInput(`${draft}${em}`)}
                  aria-label={`Insert ${em}`}
                  className="w-8 h-8 rounded-lg hover:bg-[var(--chatly-bg-elevated)] text-base flex items-center justify-center"
                >
                  {em}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowComposerEmoji(false)}
              aria-label="Close emoji drawer"
              className="p-1 text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Schedule Message Picker Bar */}
        {showSchedule && (
          <div className="px-3 sm:px-6 py-2.5 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs">
            <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className={`w-4 h-4 shrink-0 ${palette.primaryText}`} />
                <label
                  htmlFor="chatly-schedule-input"
                  className="font-semibold text-[var(--chatly-text-primary)] whitespace-nowrap"
                >
                  {t.scheduleMessageLabel}
                </label>
                <input
                  id="chatly-schedule-input"
                  type="datetime-local"
                  value={scheduledFor}
                  min={toLocalDatetimeInput(new Date(Date.now() + 60_000))}
                  onChange={(e) => {
                    setScheduledFor(e.target.value);
                    setScheduleError(null);
                  }}
                  aria-label={t.scheduleMessageLabel}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] font-mono tabular-nums"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledFor(toLocalDatetimeInput(new Date(Date.now() + 15 * 60_000)));
                      setScheduleError(null);
                    }}
                    className="px-2 py-1 rounded-md border border-[var(--chatly-border)] text-[11px] font-mono text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                  >
                    +15m
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledFor(toLocalDatetimeInput(new Date(Date.now() + 3600_000)));
                      setScheduleError(null);
                    }}
                    className="px-2 py-1 rounded-md border border-[var(--chatly-border)] text-[11px] font-mono text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                  >
                    +1h
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tmr = new Date();
                      tmr.setDate(tmr.getDate() + 1);
                      tmr.setHours(9, 0, 0, 0);
                      setScheduledFor(toLocalDatetimeInput(tmr));
                      setScheduleError(null);
                    }}
                    className="px-2 py-1 rounded-md border border-[var(--chatly-border)] text-[11px] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] whitespace-nowrap"
                  >
                    {lang === 'ar' ? 'غداً ٩ ص' : 'Tomorrow 9:00'}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScheduledFor('');
                  setScheduleError(null);
                  setShowSchedule(false);
                }}
                className="text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)] font-medium whitespace-nowrap"
              >
                {lang === 'ar' ? 'إلغاء الجدولة' : 'Clear schedule'}
              </button>
            </div>
            {scheduleError && (
              <p role="alert" className="max-w-4xl mx-auto mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                {scheduleError}
              </p>
            )}
          </div>
        )}

        {/* Active Schedule Notice */}
        {scheduledFor && !showSchedule && (
          <div className="px-3 sm:px-6 py-1.5 border-t border-[var(--chatly-border)] bg-teal-50/70 dark:bg-teal-950/30 text-xs text-teal-800 dark:text-teal-200">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t.scheduledForLabel} · {formatLocalizedSchedule(scheduledFor, lang)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setScheduledFor('');
                  setScheduleError(null);
                }}
                className="hover:underline font-medium"
              >
                {lang === 'ar' ? 'إلغاء' : 'Clear'}
              </button>
            </div>
          </div>
        )}

        {/* Reply / Edit Context Banner */}
        {(replyTarget || editingMsg) && (
          <div className="px-3 sm:px-6 py-2 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-elevated)] text-xs">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`font-semibold ${palette.primaryText}`}>
                  {editingMsg
                    ? `${t.editAction}:`
                    : `${t.replyAction} · ${replyTarget?.senderDisplayName}`}
                </div>
                <div className="text-[var(--chatly-text-secondary)] truncate">
                  {editingMsg ? editingMsg.body : replyTarget?.body}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyTarget(null);
                  setEditingMsg(null);
                  setDraft('');
                }}
                aria-label="Cancel reply or edit"
                className="p-1 text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Voice Note Recorder Bar */}
        {recordingState !== 'idle' && (
          <div className="px-3 sm:px-6 py-2.5 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs">
            <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    recordingState === 'recording' ? 'bg-rose-500 animate-pulse' : 'bg-teal-500'
                  }`}
                />
                <span className="font-mono tabular-nums font-semibold text-[var(--chatly-text-primary)]">
                  {Math.floor(recordMs / 60_000)}:
                  {String(Math.floor((recordMs % 60_000) / 1000)).padStart(2, '0')}
                </span>
                {recordedUrl && recordingState === 'ready' && (
                  <audio src={recordedUrl} controls className="h-8 max-w-[220px]" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {(recordingState === 'recording' || recordingState === 'paused') && (
                  <>
                    <button
                      type="button"
                      onClick={pauseOrResumeRecording}
                      aria-label={recordingState === 'recording' ? 'Pause recording' : 'Resume recording'}
                      className="min-h-[34px] px-2.5 rounded-lg border border-[var(--chatly-border)] flex items-center gap-1 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      {recordingState === 'recording' ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      aria-label="Stop recording"
                      className="min-h-[34px] px-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium flex items-center gap-1.5"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>{lang === 'ar' ? 'إيقاف' : 'Stop'}</span>
                    </button>
                  </>
                )}
                {recordingState === 'ready' && recordedBlob && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendVoiceNote()}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
                  >
                    <Send className="w-3.5 h-3.5 rtl:rotate-180" />
                    <span>{lang === 'ar' ? 'إرسال الصوتية' : 'Send Voice Note'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={discardRecording}
                  aria-label="Discard voice recording"
                  className="min-h-[34px] px-2.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unified Floating Pill Composer Dock */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3 border-t border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)]/95 backdrop-blur-md shrink-0">
          <form
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto rounded-full border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-input)] focus-within:border-teal-400/70 focus-within:ring-2 focus-within:ring-teal-500/20 ps-2 pe-1.5 py-1 flex items-center gap-1 sm:gap-1.5 transition-all shadow-sm"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handlePickFile}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.zip"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.attachFileLabel}
              title={t.attachFileLabel}
              className="min-h-[36px] min-w-[34px] sm:min-w-[36px] rounded-full flex items-center justify-center text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)] shrink-0 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowStickers((prev) => !prev)}
              aria-label={t.stickerPickerLabel}
              title={t.stickerPickerLabel}
              className={`min-h-[36px] min-w-[34px] sm:min-w-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
                showStickers
                  ? `${palette.softBg} ${palette.primaryText}`
                  : 'text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
              }`}
            >
              <Sticker className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowComposerEmoji((prev) => !prev)}
              aria-label={t.emojiPickerLabel}
              title={t.emojiPickerLabel}
              className={`hidden sm:flex min-h-[36px] min-w-[36px] rounded-full items-center justify-center shrink-0 transition-colors ${
                showComposerEmoji
                  ? `${palette.softBg} ${palette.primaryText}`
                  : 'text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
              }`}
            >
              <Smile className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (recordingState === 'idle') {
                  void startVoiceRecording();
                } else if (recordingState === 'recording' || recordingState === 'paused') {
                  stopVoiceRecording();
                }
              }}
              aria-label={t.recordVoiceLabel}
              title={t.recordVoiceLabel}
              data-testid="record-voice-note-btn"
              className={`min-h-[36px] min-w-[34px] sm:min-w-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
                recordingState !== 'idle'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                  : 'text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowSchedule((prev) => !prev)}
              aria-label={t.scheduleMessageLabel}
              title={t.scheduleMessageLabel}
              className={`flex min-h-[36px] min-w-[34px] sm:min-w-[36px] rounded-full items-center justify-center shrink-0 transition-colors ${
                scheduledFor || showSchedule
                  ? `${palette.softBg} ${palette.primaryText}`
                  : 'text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
              }`}
            >
              <Clock className="w-4 h-4" />
            </button>

            {onShareLocation && (
              <button
                type="button"
                onClick={() => {
                  setLocationError(null);
                  setShowLocationModal(true);
                }}
                aria-label={t.shareLocationBtn}
                title={t.shareLocationBtn}
                className="flex min-h-[36px] min-w-[34px] sm:min-w-[36px] rounded-full items-center justify-center shrink-0 text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)] transition-colors"
              >
                <MapPin className="w-4 h-4" />
              </button>
            )}

            <input
              type="text"
              value={draft}
              onChange={(e) => handleDraftInput(e.target.value)}
              placeholder={t.typeMessagePlaceholder}
              aria-label={t.typeMessagePlaceholder}
              className="flex-1 min-w-0 min-h-[38px] px-2 sm:px-3 py-1 bg-transparent text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none"
            />

            <button
              type="submit"
              disabled={(!draft.trim() && recordingState !== 'ready') || sending}
              aria-label={scheduledFor ? t.scheduleMessageLabel : t.sendMessage}
              title={editingMsg ? t.editAction : scheduledFor ? t.scheduleSendLabel : t.sendMessage}
              className={`min-h-[38px] ${
                editingMsg || scheduledFor ? 'px-3.5 rounded-full gap-1.5' : 'w-10 h-10 rounded-full justify-center'
              } text-sm font-medium text-white transition-all flex items-center disabled:opacity-45 whitespace-nowrap shrink-0 shadow-[0_4px_14px_rgba(6,182,212,0.28)] ${palette.primaryBg} ${palette.primaryHover}`}
            >
              <Send className="w-4 h-4 rtl:rotate-180" />
              {(editingMsg || scheduledFor) && (
                <span className="hidden sm:inline">
                  {editingMsg ? t.editAction : t.scheduleSendLabel}
                </span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Collapsible Contact / Group Info Side Panel */}
      {showInfoPanel && (
        <aside
          aria-label={t.infoPanelTitle}
          className="fixed inset-0 z-40 lg:static lg:z-auto lg:w-80 lg:shrink-0 flex justify-end bg-black/50 lg:bg-transparent"
        >
          <div className="w-full max-w-xs sm:max-w-sm lg:w-80 h-full border-s border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex flex-col overflow-y-auto">
            <div className="h-16 px-4 border-b border-[var(--chatly-border)] flex items-center justify-between shrink-0">
              <h3 className="font-display text-sm font-semibold text-[var(--chatly-text-primary)]">
                {t.infoPanelTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowInfoPanel(false)}
                aria-label="Close conversation info"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Profile Summary */}
              <div className="flex flex-col items-center text-center gap-2.5 pb-5 border-b border-[var(--chatly-border)]">
                <ChatlyAvatar src={peer?.avatarUrl} name={conversation.title} size="xl" />
                <div>
                  <div className="font-display text-base font-bold text-[var(--chatly-text-primary)]">
                    {conversation.title}
                  </div>
                  <div className="text-xs font-mono text-[var(--chatly-text-muted)] mt-0.5">
                    {peer ? `@${peer.username}` : presenceLine}
                  </div>
                </div>
                {(peer?.bio || conversation.description) && (
                  <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
                    {peer?.bio || conversation.description}
                  </p>
                )}
                {conversation.type === 'direct' && (
                  <div className="text-xs text-[var(--chatly-text-muted)] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-teal-500" />
                    <span>{e2eeActive && e2eeAvailable ? t.e2eeEnabledLabel : t.e2eeOffLabel}</span>
                  </div>
                )}
              </div>

              {/* Quick Circular Actions matching reference */}
              {onUpdateConversationMeta && (
                <div className="grid grid-cols-3 gap-3 pb-5 border-b border-[var(--chatly-border)]">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConversationMeta(conversation.id, { pinned: !conversation.pinned })
                    }
                    className="flex flex-col items-center gap-1.5 text-xs font-medium group"
                  >
                    <span
                      className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${
                        conversation.pinned
                          ? `${palette.softBg} border-teal-500/50 ${palette.primaryText}`
                          : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-secondary)] group-hover:bg-[var(--chatly-bg-elevated)]'
                      }`}
                    >
                      <Pin className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] text-[var(--chatly-text-secondary)]">
                      {conversation.pinned ? t.unpinAction : t.pinAction}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConversationMeta(conversation.id, {
                        snoozedUntil: isSnoozed
                          ? null
                          : new Date(Date.now() + 3600_000).toISOString(),
                      })
                    }
                    className="flex flex-col items-center gap-1.5 text-xs font-medium group"
                  >
                    <span
                      className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${
                        isSnoozed
                          ? `${palette.softBg} border-teal-500/50 ${palette.primaryText}`
                          : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-secondary)] group-hover:bg-[var(--chatly-bg-elevated)]'
                      }`}
                    >
                      <BellOff className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] text-[var(--chatly-text-secondary)]">
                      {lang === 'ar' ? (isSnoozed ? 'إلغاء الكتم' : 'كتم') : isSnoozed ? 'Unmute' : 'Mute'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConversationMeta(conversation.id, {
                        archived: !conversation.archived,
                      })
                    }
                    className="flex flex-col items-center gap-1.5 text-xs font-medium group"
                  >
                    <span
                      className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${
                        conversation.archived
                          ? `${palette.softBg} border-teal-500/50 ${palette.primaryText}`
                          : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-secondary)] group-hover:bg-[var(--chatly-bg-elevated)]'
                      }`}
                    >
                      <Archive className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] text-[var(--chatly-text-secondary)]">
                      {lang === 'ar' ? 'أرشفة' : 'Archive'}
                    </span>
                  </button>
                </div>
              )}

              {/* Shared Media */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--chatly-text-primary)]">
                  <span>{t.sharedMediaTitle}</span>
                  <span className="font-mono tabular-nums text-[var(--chatly-text-muted)]">
                    {sharedMedia.length}
                  </span>
                </div>
                {sharedMedia.length === 0 ? (
                  <p className="text-xs text-[var(--chatly-text-muted)]">{t.noSharedMedia}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {sharedMedia.slice(0, 6).map((item) => {
                      const url = getAuthorizedMediaUrl(item.attachment!.url, authToken);
                      return item.attachment!.kind === 'image' ? (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setLightbox({ url, alt: item.attachment!.fileName })}
                          className="aspect-square rounded-xl overflow-hidden border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)]"
                        >
                          <img src={url} alt={item.attachment!.fileName} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <video
                          key={item.id}
                          src={url}
                          preload="metadata"
                          className="aspect-square rounded-xl object-cover bg-black border border-[var(--chatly-border)]"
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Shared Documents */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--chatly-text-primary)]">
                  <span>{t.sharedDocsTitle}</span>
                  <span className="font-mono tabular-nums text-[var(--chatly-text-muted)]">
                    {sharedDocs.length}
                  </span>
                </div>
                {sharedDocs.length === 0 ? (
                  <p className="text-xs text-[var(--chatly-text-muted)]">{t.noSharedDocs}</p>
                ) : (
                  <div className="space-y-1.5">
                    {sharedDocs.slice(0, 5).map((docMsg) => (
                      <div
                        key={docMsg.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[var(--chatly-text-primary)] truncate">
                              {docMsg.attachment!.fileName}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-[var(--chatly-text-muted)]">
                              {formatBytes(docMsg.attachment!.sizeBytes)}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadSharedDoc(docMsg.attachment!.url, docMsg.attachment!.fileName)
                          }
                          aria-label={`Download ${docMsg.attachment!.fileName}`}
                          className="p-1.5 rounded-lg text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Starred Messages */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--chatly-text-primary)]">
                  <span>{t.starredMessagesTitle}</span>
                  <span className="font-mono tabular-nums text-[var(--chatly-text-muted)]">
                    {starredMessages.length}
                  </span>
                </div>
                {starredMessages.length === 0 ? (
                  <p className="text-xs text-[var(--chatly-text-muted)]">{t.noStarredMessages}</p>
                ) : (
                  <div className="space-y-1.5">
                    {starredMessages.slice(0, 5).map((sm) => (
                      <div
                        key={sm.id}
                        className="p-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-[var(--chatly-text-muted)]">
                          <span className="font-medium text-[var(--chatly-text-secondary)] truncate">
                            {sm.senderDisplayName}
                          </span>
                          <Star className="w-3 h-3 fill-amber-400 text-amber-500 shrink-0" />
                        </div>
                        <p className="text-[var(--chatly-text-primary)] line-clamp-2">
                          {sm.decryptedBody ?? sm.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Local-First AI Assistant Side Panel */}
      {showAiPanel && (
        <AiAssistantPanel
          messages={messages}
          currentDraft={draft}
          lang={lang}
          accentColor={accentColor}
          isLiveMode={isLiveMode}
          authToken={authToken}
          onInsertReply={(text) => setDraft(text)}
          onClose={() => setShowAiPanel(false)}
        />
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--chatly-bg-surface)] border border-[var(--chatly-border-strong)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-[var(--chatly-text-primary)]">
                {t.forwardAction}
              </h3>
              <button type="button" onClick={() => setForwardMsg(null)}>
                <X className="w-4 h-4 text-[var(--chatly-text-muted)]" />
              </button>
            </div>
            <div className="divide-y divide-[var(--chatly-border)] max-h-60 overflow-y-auto">
              {allConversations
                .filter((c) => c.id !== conversation.id)
                .map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => {
                      onForwardMessage(forwardMsg, target.id);
                      setForwardMsg(null);
                    }}
                    className="w-full py-3 px-2 text-start text-sm hover:bg-[var(--chatly-bg-elevated)] rounded-xl flex items-center justify-between"
                  >
                    <span className="font-medium text-[var(--chatly-text-primary)] truncate">
                      {target.title}
                    </span>
                    <Send className="w-3.5 h-3.5 text-[var(--chatly-text-muted)]" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Message Reminder Modal */}
      {reminderMsg && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!reminderTime) return;
              onCreateReminder(
                reminderMsg.id,
                new Date(reminderTime).toISOString(),
                reminderNote
              );
              setReminderMsg(null);
            }}
            className="w-full max-w-sm rounded-2xl bg-[var(--chatly-bg-surface)] border border-[var(--chatly-border-strong)] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-[var(--chatly-text-primary)] flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span>{t.remindAction}</span>
              </h3>
              <button type="button" onClick={() => setReminderMsg(null)}>
                <X className="w-4 h-4 text-[var(--chatly-text-muted)]" />
              </button>
            </div>
            <p className="text-xs text-[var(--chatly-text-muted)] line-clamp-2">
              “{reminderMsg.body}”
            </p>
            <input
              type="datetime-local"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              required
              className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)]"
            />
            <input
              type="text"
              value={reminderNote}
              onChange={(e) => setReminderNote(e.target.value)}
              placeholder={lang === 'ar' ? 'ملاحظة التذكير...' : 'Reminder note...'}
              className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)]"
            />
            <button
              type="submit"
              className={`w-full min-h-[42px] rounded-xl text-sm font-medium text-white ${palette.primaryBg} ${palette.primaryHover}`}
            >
              {lang === 'ar' ? 'حفظ التذكير' : 'Set Reminder'}
            </button>
          </form>
        </div>
      )}

      {/* Live Location Consent Modal */}
      {showLocationModal && onShareLocation && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--chatly-bg-surface)] border border-[var(--chatly-border-strong)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-[var(--chatly-text-primary)] flex items-center gap-2">
                <MapPin className={`w-4 h-4 ${palette.primaryText}`} />
                <span>{t.shareLocationBtn}</span>
              </h3>
              <button type="button" onClick={() => setShowLocationModal(false)}>
                <X className="w-4 h-4 text-[var(--chatly-text-muted)]" />
              </button>
            </div>
            <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
              {lang === 'ar'
                ? 'يتطلب هذا الخيار إذن الموقع من جهازك ويمكنك إيقاف المشاركة في أي لحظة.'
                : 'Location sharing requires explicit browser/device geolocation permission and can be stopped immediately at any time.'}
            </p>
            <div className="space-y-2 text-xs text-[var(--chatly-text-primary)]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!locationLiveMode}
                  onChange={() => setLocationLiveMode(false)}
                />
                <span>{lang === 'ar' ? 'مشاركة موقعي الحالي (مرة واحدة)' : 'Share Current Location (One-time)'}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={locationLiveMode}
                  onChange={() => setLocationLiveMode(true)}
                />
                <span>{t.liveLocationLabel}</span>
              </label>
              {locationLiveMode && (
                <select
                  value={locationMinutes}
                  onChange={(e) => setLocationMinutes(Number(e.target.value))}
                  className="w-full min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={480}>8 hours</option>
                </select>
              )}
            </div>
            {locationError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{locationError}</p>
            )}
            <button
              type="button"
              disabled={locationBusy}
              onClick={handleConfirmLocationShare}
              className={`w-full min-h-[40px] rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${palette.primaryBg}`}
            >
              {locationBusy
                ? lang === 'ar'
                  ? 'جاري تحديد الموقع...'
                  : 'Requesting location...'
                : t.shareLocationBtn}
            </button>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close image preview"
            className="absolute top-4 end-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-3xl max-h-[85vh] flex flex-col items-center gap-2">
            <img
              src={lightbox.url}
              alt={lightbox.alt}
              className="max-h-[78vh] rounded-xl object-contain"
            />
            <div className="text-xs text-white/80 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{lightbox.alt}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
