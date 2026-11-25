import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  Forward,
  Lock,
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Reply,
  SmilePlus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { AccentColor, ChatMessage, LanguageCode } from '../core/types';
import { DEFAULT_REACTION_EMOJIS, EXTENDED_REACTION_EMOJIS } from '../core/reactions';
import { ACCENT_PALETTES } from '../core/theme';
import {
  formatBytes,
  formatLocalizedNumber,
  formatLocalizedTime,
  TRANSLATIONS,
} from '../core/localization';
import { downloadMediaWithProgress, getAuthorizedMediaUrl } from '../services/api';
import { ChatlyAvatar } from './ChatlyAvatar';
import { VoiceStickerPreviewCard } from './VoiceStickerPreviewCard';
import { VoiceStickerCard } from './VoiceStickerCard';

const WAVEFORM_BARS = [35, 62, 48, 88, 70, 42, 95, 76, 54, 86, 64, 44, 78, 90, 52, 68, 40, 58, 74, 46];

function AudioWaveformPlayer({
  src,
  durationMs,
  isSelf,
}: {
  src: string;
  durationMs?: number;
  isSelf: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(
    Math.max(0, Math.round((durationMs || 0) / 1000))
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (el.duration && Number.isFinite(el.duration)) {
        setProgress(el.currentTime / el.duration);
        setElapsedSec(Math.round(el.currentTime));
      }
    };
    const onLoaded = () => {
      if (el.duration && Number.isFinite(el.duration)) {
        setElapsedSec(Math.round(el.duration));
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const formattedTime = `0:${String(elapsedSec).padStart(2, '0')}`;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 min-w-[215px] ${
        isSelf
          ? 'bg-black/15 text-white'
          : 'bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] text-[var(--chatly-text-primary)]'
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
          isSelf
            ? 'bg-white text-teal-800'
            : 'bg-teal-500 text-white'
        }`}
      >
        {playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ms-0.5" />
        )}
      </button>

      <div className="flex-1 flex items-center gap-[3px] h-7" aria-hidden="true">
        {WAVEFORM_BARS.map((pct, idx) => {
          const lit = idx / WAVEFORM_BARS.length <= progress;
          return (
            <span
              key={idx}
              style={{ height: `${Math.max(22, pct)}%` }}
              className={`w-[3px] rounded-full transition-colors ${
                lit
                  ? isSelf
                    ? 'bg-white'
                    : 'bg-teal-400'
                  : isSelf
                    ? 'bg-white/40'
                    : 'bg-teal-500/35'
              }`}
            />
          );
        })}
      </div>

      <span className="text-[11px] font-mono tabular-nums opacity-90 shrink-0">
        {formattedTime}
      </span>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  isSelf: boolean;
  isGroup: boolean;
  senderAvatarUrl?: string;
  lang: LanguageCode;
  accentColor: AccentColor;
  authToken: string | null;
  onToggleReaction: (messageId: number, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
  onDeleteMessage: (messageId: number) => void;
  onForwardMessage: (message: ChatMessage) => void;
  onTogglePin: (messageId: number) => void;
  onToggleStar: (messageId: number) => void;
  onOpenReminder: (message: ChatMessage) => void;
  onOpenImageLightbox: (url: string, alt: string) => void;
  onSaveSticker?: (stickerId: number) => void;
  onOpenReactionOverlay?: (message: ChatMessage) => void;
  hideScheduleIndicator?: boolean;
}

export function MessageBubble({
  message,
  isSelf,
  isGroup,
  senderAvatarUrl,
  lang,
  accentColor,
  authToken,
  onToggleReaction,
  onReply,
  onStartEdit,
  onDeleteMessage,
  onForwardMessage,
  onTogglePin,
  onToggleStar,
  onOpenReminder,
  onOpenImageLightbox,
  onSaveSticker,
  onOpenReactionOverlay,
  hideScheduleIndicator = false,
}: MessageBubbleProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = () => {
    if (message.deletedAt) return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      if (onOpenReactionOverlay) {
        onOpenReactionOverlay(message);
      } else {
        setShowEmojiPicker(true);
      }
    }, 450);
  };

  const handleTouchEndOrMove = () => {
    clearLongPress();
  };

  const handleSelectEmoji = (emoji: string) => {
    const trimmed = emoji.trim();
    if (!trimmed) return;
    onToggleReaction(message.id, trimmed);
    setShowEmojiPicker(false);
    setCustomEmoji('');
  };

  const handleDownloadAttachment = async () => {
    if (!message.attachment) return;
    try {
      setDownloadPct(5);
      const blob = await downloadMediaWithProgress(
        message.attachment.url,
        authToken,
        (pct) => setDownloadPct(pct)
      );
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = message.attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objUrl);
        setDownloadPct(null);
      }, 800);
    } catch {
      setDownloadPct(null);
    }
  };

  const handleCopyBody = () => {
    const text = message.decryptedBody ?? message.body;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setShowActionsMenu(false);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const displayBody = message.deletedAt
    ? t.deletedMessageLabel
    : message.decryptedBody ?? message.body;

  const authorizedMediaUrl = message.attachment
    ? getAuthorizedMediaUrl(message.attachment.url, authToken)
    : '';

  const effectiveSchedule = message.scheduledAt ?? message.scheduledFor ?? null;
  const isPendingSchedule = Boolean(
    effectiveSchedule && (!message.deliveredAt || new Date(effectiveSchedule).getTime() > Date.now())
  );

  return (
    <div
      data-testid={`message-row-${message.id}`}
      className={`group relative flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
    >
      {/* Floating Hover / Touch Reaction & Action Trigger Bar */}
      {!message.deletedAt && (
        <div
          className={`flex items-center gap-1 mb-1 transition-opacity ${
            showEmojiPicker || showActionsMenu
              ? 'opacity-100'
              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
          }`}
        >
          <div className="flex items-center gap-0.5 rounded-xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] px-1.5 py-1 shadow-md">
            {DEFAULT_REACTION_EMOJIS.slice(0, 4).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                aria-label={`${t.reactAction} ${emoji}`}
                className="w-7 h-7 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-sm transition-transform hover:scale-110"
              >
                {emoji}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                if (onOpenReactionOverlay) {
                  onOpenReactionOverlay(message);
                } else {
                  setShowEmojiPicker((prev) => !prev);
                }
                setShowActionsMenu(false);
              }}
              aria-label="Open emoji reaction picker"
              aria-expanded={showEmojiPicker}
              className="w-7 h-7 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-[var(--chatly-text-secondary)]"
            >
              <SmilePlus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label={t.replyAction}
              className="w-7 h-7 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-[var(--chatly-text-secondary)]"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowActionsMenu((prev) => !prev);
                setShowEmojiPicker(false);
              }}
              aria-label="More message actions"
              aria-expanded={showActionsMenu}
              className="w-7 h-7 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-[var(--chatly-text-secondary)]"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Emoji Picker Overlay */}
      {showEmojiPicker && !message.deletedAt && (
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
              onClick={() => setShowEmojiPicker(false)}
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
                onClick={() => handleSelectEmoji(emoji)}
                aria-label={`React with ${emoji}`}
                className="h-8 rounded-lg hover:bg-[var(--chatly-bg-elevated)] flex items-center justify-center text-base transition-transform hover:scale-110"
              >
                {emoji}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSelectEmoji(customEmoji);
            }}
            className="mt-2.5 flex items-center gap-1.5"
          >
            <input
              type="text"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              maxLength={8}
              placeholder={lang === 'ar' ? 'إيموجي مخصص...' : 'Custom emoji...'}
              aria-label="Custom reaction emoji"
              className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-xs text-[var(--chatly-text-primary)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!customEmoji.trim()}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-40 ${palette.primaryBg}`}
            >
              {lang === 'ar' ? 'إضافة' : 'Add'}
            </button>
          </form>
        </div>
      )}

      {/* Message Context Actions Menu */}
      {showActionsMenu && !message.deletedAt && (
        <div
          role="menu"
          className={`z-30 mb-2 w-48 rounded-xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] py-1.5 shadow-xl text-xs ${
            isSelf ? 'self-end' : 'self-start'
          }`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onReply(message);
              setShowActionsMenu(false);
            }}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Reply className="w-3.5 h-3.5" />
            <span>{t.replyAction}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onForwardMessage(message);
              setShowActionsMenu(false);
            }}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Forward className="w-3.5 h-3.5" />
            <span>{t.forwardAction}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePin(message.id);
              setShowActionsMenu(false);
            }}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Pin className="w-3.5 h-3.5" />
            <span>{message.pinned ? t.unpinAction : t.pinAction}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleStar(message.id);
              setShowActionsMenu(false);
            }}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Star className={`w-3.5 h-3.5 ${message.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
            <span>{t.starAction}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenReminder(message);
              setShowActionsMenu(false);
            }}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{t.remindAction}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleCopyBody}
            className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : t.copyAction}</span>
          </button>

          {isSelf && message.type === 'text' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onStartEdit(message);
                setShowActionsMenu(false);
              }}
              className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t.editAction}</span>
            </button>
          )}

          {isSelf && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDeleteMessage(message.id);
                setShowActionsMenu(false);
              }}
              className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-rose-500/15 text-rose-600 dark:text-rose-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.deleteAction}</span>
            </button>
          )}
        </div>
      )}

      {/* Main Message Row (with peer circular avatar for incoming messages) */}
      <div className={`flex items-end gap-2 max-w-[92%] sm:max-w-lg ${isSelf ? 'flex-row-reverse' : ''}`}>
        {!isSelf && !message.deletedAt && (
          <div className="mb-0.5 hidden sm:block shrink-0">
            <ChatlyAvatar src={senderAvatarUrl} name={message.senderDisplayName} size="xs" />
          </div>
        )}

        <div
          data-testid={`message-bubble-${message.id}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEndOrMove}
          onTouchMove={handleTouchEndOrMove}
          onDoubleClick={() => {
            if (!message.deletedAt) {
              if (onOpenReactionOverlay) {
                onOpenReactionOverlay(message);
              } else {
                setShowEmojiPicker((prev) => !prev);
              }
            }
          }}
          className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed select-text transition-shadow ${
            message.deletedAt
              ? 'border border-dashed border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)]/70 text-[var(--chatly-text-muted)] italic'
              : isSelf
                ? `${palette.bubbleSelf} rounded-ee-xs`
                : 'bg-[var(--chatly-bg-bubble-in)] text-[var(--chatly-text-primary)] border border-[var(--chatly-border)] rounded-es-xs shadow-xs'
          }`}
        >
          {/* Group sender name */}
          {isGroup && !isSelf && !message.deletedAt && (
            <div className={`text-[11px] font-semibold mb-1 ${palette.primaryText}`}>
              {message.senderDisplayName}
            </div>
          )}

          {/* Forwarded line */}
          {message.forwardedFromId && !message.deletedAt && (
            <div className="text-[11px] opacity-75 flex items-center gap-1 mb-1">
              <Forward className="w-3 h-3" />
              <span>{lang === 'ar' ? 'رسالة مُعاد توجيهها' : 'Forwarded'}</span>
            </div>
          )}

          {/* Reply quote */}
          {message.replyPreview && !message.deletedAt && (
            <div
              className={`mb-2 rounded-xl px-2.5 py-1.5 text-xs border ${
                isSelf
                  ? 'bg-black/18 border-white/25 text-white/95'
                  : 'bg-[var(--chatly-bg-input)] border-[var(--chatly-border)] text-[var(--chatly-text-secondary)]'
              }`}
            >
              <div className="font-semibold truncate">{message.replyPreview.senderDisplayName}</div>
              <div className="truncate opacity-85">{message.replyPreview.body}</div>
            </div>
          )}

          {/* Attachment Media */}
          {!message.deletedAt && message.attachment && (
            <div className="mb-2 space-y-1.5">
              {message.attachment.kind === 'image' && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenImageLightbox(authorizedMediaUrl, message.attachment!.fileName)
                  }
                  className="block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 max-w-xs"
                >
                  <img
                    src={authorizedMediaUrl}
                    alt={message.attachment.fileName}
                    className="max-h-64 w-full object-cover"
                  />
                </button>
              )}

              {message.attachment.kind === 'video' && (
                <video
                  src={authorizedMediaUrl}
                  controls
                  preload="metadata"
                  className="rounded-xl max-h-64 max-w-xs bg-black"
                />
              )}

              {message.attachment.kind === 'audio' && (
                <AudioWaveformPlayer
                  src={authorizedMediaUrl}
                  durationMs={message.attachment.durationMs}
                  isSelf={isSelf}
                />
              )}

              {message.attachment.kind === 'document' && (
                <div
                  className={`rounded-xl p-2.5 flex items-center justify-between gap-3 border ${
                    isSelf
                      ? 'bg-black/15 border-white/20 text-white'
                      : 'bg-[var(--chatly-bg-input)] border-[var(--chatly-border)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">
                        {message.attachment.fileName}
                      </div>
                      <div className="text-[11px] opacity-75 font-mono">
                        {formatBytes(message.attachment.sizeBytes)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadAttachment}
                    aria-label={`Download ${message.attachment.fileName}`}
                    className="min-h-[34px] px-2.5 rounded-lg bg-white/20 hover:bg-white/30 flex items-center gap-1 text-xs font-medium shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadPct !== null && <span className="font-mono">{downloadPct}%</span>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Message Text */}
          {displayBody && (
            <p className="whitespace-pre-wrap break-words">{displayBody}</p>
          )}

          {/* Built-in Demo Voice Sticker Preview */}
          {!message.deletedAt &&
            message.type === 'voice_sticker_preview' &&
            message.stickerMeta && (
              <VoiceStickerPreviewCard
                title={message.stickerMeta.title}
                titleAr={message.stickerMeta.titleAr}
                durationMs={message.stickerMeta.durationMs}
                toneHz={message.stickerMeta.toneHz}
                lang={lang}
                accentColor={accentColor}
              />
            )}

          {/* Full Persistent Voice Sticker */}
          {!message.deletedAt && message.type === 'voice_sticker' && message.sticker && (
            <div className="mt-2">
              <VoiceStickerCard
                sticker={message.sticker}
                lang={lang}
                accentColor={accentColor}
                authorizedAudioUrl={
                  message.sticker.audioUrl
                    ? getAuthorizedMediaUrl(message.sticker.audioUrl, authToken)
                    : undefined
                }
                authorizedVisualUrl={
                  message.sticker.visualUrl
                    ? getAuthorizedMediaUrl(message.sticker.visualUrl, authToken)
                    : undefined
                }
                onToggleFavorite={onSaveSticker}
                compact
              />
            </div>
          )}

          {/* Footer metadata: scheduled indicator, E2EE, pinned, starred, edited, time, read receipts */}
          <div
            className={`mt-1.5 flex flex-wrap items-center justify-end gap-1.5 text-[11px] tabular-nums ${
              message.deletedAt
                ? 'text-[var(--chatly-text-muted)]'
                : isSelf
                  ? 'text-white/85'
                  : 'text-[var(--chatly-text-muted)]'
            }`}
          >
            {!hideScheduleIndicator && isPendingSchedule && effectiveSchedule && !message.deletedAt && (
              <span
                className="inline-flex items-center gap-1"
                title={`${t.scheduledForLabel} ${formatLocalizedTime(effectiveSchedule, lang)}`}
              >
                <Clock className="w-3 h-3" />
                <span>
                  {t.scheduledTag} · {formatLocalizedTime(effectiveSchedule, lang)}
                </span>
              </span>
            )}
            {message.e2eeVerified && (
              <span title={t.e2eeEnabledLabel} className="inline-flex items-center">
                <Lock className="w-3 h-3" aria-label={t.e2eeEnabledLabel} />
              </span>
            )}
            {message.pinned && (
              <Pin className="w-3 h-3" aria-label={t.pinnedLabel} />
            )}
            {message.starred && (
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-label={t.starAction} />
            )}
            {message.editedAt && !message.deletedAt && <span>{t.editedLabel}</span>}
            <span>{formatLocalizedTime(message.createdAt, lang)}</span>
            {isSelf && !message.deletedAt && (
              <span aria-label={message.readAt ? 'Read' : 'Sent'}>
                {message.readAt ? (
                  <CheckCheck className="w-3.5 h-3.5 inline text-cyan-200" />
                ) : (
                  <Check className="w-3.5 h-3.5 inline" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reactions Bar Below Message Body */}
      {!message.deletedAt && message.reactions && message.reactions.length > 0 && (
        <div
          data-testid={`message-reactions-${message.id}`}
          className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${
            isSelf ? 'justify-end' : 'justify-start sm:ps-9'
          }`}
        >
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              onClick={() => onToggleReaction(message.id, reaction.emoji)}
              aria-pressed={reaction.reactedByMe}
              aria-label={`Toggle reaction ${reaction.emoji} (${reaction.count})`}
              className={`min-h-[28px] px-2 py-0.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                reaction.reactedByMe
                  ? `${palette.softBg} border-teal-500/45 ${palette.primaryText} font-semibold`
                  : 'bg-[var(--chatly-bg-surface)] border-[var(--chatly-border)] text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]'
              }`}
            >
              <span>{reaction.emoji}</span>
              <span className="font-mono tabular-nums text-[11px]">
                {formatLocalizedNumber(reaction.count, lang)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
