import { useEffect, useRef, useState } from 'react';
import { Bookmark, Edit3, Play, RotateCcw, Square, Trash2, Volume2 } from 'lucide-react';
import type { AccentColor, LanguageCode, VoiceStickerItem } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';

interface VoiceStickerCardProps {
  sticker: VoiceStickerItem;
  lang: LanguageCode;
  accentColor: AccentColor;
  authorizedAudioUrl?: string;
  authorizedVisualUrl?: string;
  onToggleFavorite?: (stickerId: number) => void;
  onEdit?: (sticker: VoiceStickerItem) => void;
  onDelete?: (stickerId: number) => void;
  compact?: boolean;
}

export function VoiceStickerCard({
  sticker,
  lang,
  accentColor,
  authorizedAudioUrl,
  authorizedVisualUrl,
  onToggleFavorite,
  onEdit,
  onDelete,
  compact = false,
}: VoiceStickerCardProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(sticker.defaultVolume ?? 85);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setVolume(sticker.defaultVolume ?? 85);
  }, [sticker.defaultVolume, sticker.id]);

  const effectiveDurationMs = Math.max(
    400,
    (sticker.trimEndMs > sticker.trimStartMs
      ? sticker.trimEndMs - sticker.trimStartMs
      : sticker.audioDurationMs) || 1200
  );

  const isVideoVisual = Boolean(
    sticker.visualMimeType?.startsWith('video/') ||
      (authorizedVisualUrl && /\.(mp4|webm)(\?|$)/i.test(authorizedVisualUrl))
  );

  const hasAudioTrack = Boolean(
    sticker.kind === 'voice_animated' ||
      authorizedAudioUrl ||
      (sticker.toneHz && sticker.toneHz.length > 0)
  );

  const stopPlayback = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      if (Number.isFinite(audioRef.current.duration)) {
        audioRef.current.currentTime = (sticker.trimStartMs || 0) / 1000;
      }
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);

  const startPlayback = () => {
    stopPlayback();

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    const startAudio = () => {
      if (authorizedAudioUrl) {
        const audio = new Audio(authorizedAudioUrl);
        audioRef.current = audio;
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        const trimSec = Math.max(0, (sticker.trimStartMs || 0) / 1000);

        const beginPlay = () => {
          if (trimSec > 0 && Number.isFinite(audio.duration) && trimSec < audio.duration) {
            audio.currentTime = trimSec;
          }
          audio.play().catch(() => stopPlayback());
        };

        if (audio.readyState >= 1) {
          beginPlay();
        } else {
          audio.onloadedmetadata = beginPlay;
        }
        audio.onended = () => stopPlayback();
        audio.onerror = () => stopPlayback();
        setPlaying(true);
        timerRef.current = window.setTimeout(() => {
          stopPlayback();
        }, effectiveDurationMs + 150);
        return;
      }

      if (!hasAudioTrack) {
        setPlaying(true);
        timerRef.current = window.setTimeout(() => {
          stopPlayback();
        }, effectiveDurationMs);
        return;
      }

      const tones =
        sticker.toneHz && sticker.toneHz.length > 0 ? sticker.toneHz : [523.25, 659.25, 783.99];
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const stepSec = Math.max(0.18, effectiveDurationMs / 1000 / tones.length);
        const gainLevel = Math.max(0.01, (volume / 100) * 0.12);

        tones.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * stepSec);
          gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * stepSec);
          gain.gain.exponentialRampToValueAtTime(gainLevel, ctx.currentTime + idx * stepSec + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (idx + 1) * stepSec);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * stepSec);
          osc.stop(ctx.currentTime + (idx + 1) * stepSec);
        });
        setPlaying(true);
        timerRef.current = window.setTimeout(() => {
          stopPlayback();
        }, effectiveDurationMs);
      } catch {
        setPlaying(false);
      }
    };

    const offset = Math.max(0, sticker.syncOffsetMs || 0);
    if (offset > 0) {
      setPlaying(true);
      timerRef.current = window.setTimeout(startAudio, offset);
    } else {
      startAudio();
    }
  };

  const handleTogglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const title = lang === 'ar' && sticker.nameAr ? sticker.nameAr : sticker.name;
  const durationLabel = `0:${String(Math.max(1, Math.round(effectiveDurationMs / 1000))).padStart(2, '0')}`;
  const kindLabel =
    sticker.kind === 'voice_animated'
      ? lang === 'ar'
        ? 'ملصق صوتي'
        : 'Voice Sticker'
      : sticker.kind === 'animated'
        ? lang === 'ar'
          ? 'متحرك'
          : 'Animated'
        : lang === 'ar'
          ? 'ثابت'
          : 'Static';

  return (
    <div
      className={`rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] ${
        compact ? 'p-3 max-w-xs' : 'p-4'
      } space-y-3 shadow-sm transition-colors hover:border-[var(--chatly-border-strong)]`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`relative w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-[var(--chatly-border)] ${palette.softBg}`}
          >
            {authorizedVisualUrl ? (
              isVideoVisual ? (
                <video
                  ref={videoRef}
                  src={authorizedVisualUrl}
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={authorizedVisualUrl}
                  alt={title}
                  className={`w-full h-full object-cover ${playing ? 'scale-105 transition-transform' : ''}`}
                />
              )
            ) : sticker.visualPreset === 'prism_burst' ? (
              <svg viewBox="0 0 40 40" className={`w-8 h-8 ${palette.primaryText} ${playing ? 'animate-spin' : ''}`}>
                <polygon
                  points="20,4 34,20 20,36 6,20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <circle cx="20" cy="20" r="5" fill="currentColor" />
              </svg>
            ) : sticker.visualPreset === 'orbit_spark' ? (
              <svg viewBox="0 0 40 40" className={`w-8 h-8 ${palette.primaryText} ${playing ? 'animate-bounce' : ''}`}>
                <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" />
                <circle cx="20" cy="20" r="4.5" fill="currentColor" />
              </svg>
            ) : sticker.visualPreset === 'wave_bars' ? (
              <div className="flex items-end gap-0.5 h-6">
                {[10, 18, 24, 14, 20].map((h, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${h}px` }}
                    className={`w-1 rounded-full ${palette.primaryBg} ${playing ? 'animate-pulse' : 'opacity-80'}`}
                  />
                ))}
              </div>
            ) : (
              <svg viewBox="0 0 40 40" className={`w-8 h-8 ${palette.primaryText} ${playing ? 'animate-ping' : ''}`}>
                <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
                <circle cx="20" cy="20" r="7" fill="currentColor" />
              </svg>
            )}

            {hasAudioTrack && (
              <span
                title={lang === 'ar' ? 'يحتوي على صوت' : 'Audio enabled'}
                className="absolute bottom-0.5 end-0.5 w-4 h-4 rounded-md bg-[#06111C]/85 text-cyan-300 flex items-center justify-center"
              >
                <Volume2 className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--chatly-text-primary)] truncate">
              {title}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[var(--chatly-text-muted)]">
              {kindLabel}
              {hasAudioTrack ? ` · ${durationLabel}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(sticker)}
              aria-label={lang === 'ar' ? `تعديل ${title}` : `Edit ${title}`}
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(sticker.id)}
              aria-label={lang === 'ar' ? `حذف ${title}` : `Delete ${title}`}
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:text-rose-500 hover:bg-rose-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(sticker.id)}
              aria-label={t.saveStickerLabel}
              className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center border border-[var(--chatly-border)] ${
                sticker.isFavorite
                  ? `${palette.softBg} ${palette.primaryText}`
                  : 'text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${sticker.isFavorite ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {sticker.kind !== 'static' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={playing ? t.pauseVoiceSticker : t.playVoiceSticker}
            className={`min-h-[36px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-white transition-all shadow-sm ${palette.primaryBg} ${palette.primaryHover}`}
          >
            {playing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{playing ? t.pauseVoiceSticker : t.playVoiceSticker}</span>
          </button>

          <button
            type="button"
            onClick={startPlayback}
            aria-label={t.replayVoiceSticker}
            className="min-h-[36px] min-w-[36px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {hasAudioTrack && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Volume2 className="w-3.5 h-3.5 text-[var(--chatly-text-muted)] shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                aria-label="Sticker playback volume"
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
