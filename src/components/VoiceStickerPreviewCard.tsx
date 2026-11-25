import { useEffect, useRef, useState } from 'react';
import { Play, Square, Volume2 } from 'lucide-react';
import type { AccentColor, LanguageCode } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';

interface VoiceStickerPreviewCardProps {
  title: string;
  titleAr: string;
  durationMs: number;
  toneHz: number[];
  lang: LanguageCode;
  accentColor: AccentColor;
}

export function VoiceStickerPreviewCard({
  title,
  titleAr,
  durationMs,
  toneHz,
  lang,
  accentColor,
}: VoiceStickerPreviewCardProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const stopPlayback = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setPlaying(false);
  };

  const handleTogglePlay = () => {
    if (playing) {
      stopPlayback();
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const stepSec = Math.max(0.2, durationMs / 1000 / Math.max(1, toneHz.length));
      toneHz.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * stepSec);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * stepSec);
        gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + idx * stepSec + 0.04);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + (idx + 1) * stepSec
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * stepSec);
        osc.stop(ctx.currentTime + (idx + 1) * stepSec);
      });

      setPlaying(true);
      timerRef.current = window.setTimeout(() => {
        stopPlayback();
      }, durationMs);
    } catch {
      setPlaying(false);
    }
  };

  const bars = [14, 24, 18, 30, 22, 28, 16, 26, 20, 12];
  const durationLabel = `0:${String(Math.max(1, Math.round(durationMs / 1000))).padStart(2, '0')}`;

  return (
    <div className="mt-2 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] p-3 max-w-xs">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--chatly-text-muted)] mb-2">
        <span className="flex items-center gap-1.5 font-medium text-[var(--chatly-text-primary)]">
          <Volume2 className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'ar' ? titleAr : title}</span>
        </span>
        <span className="font-mono tabular-nums">{durationLabel}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={playing ? t.pauseVoiceSticker : t.playVoiceSticker}
          className={`min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-white transition-colors ${palette.primaryBg} ${palette.primaryHover}`}
        >
          {playing ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </button>

        <div className="flex items-center gap-1 h-8 flex-1" aria-hidden="true">
          {bars.map((height, idx) => (
            <span
              key={idx}
              style={{ height: `${height}px` }}
              className={`w-1.5 rounded-full transition-transform duration-150 ${
                playing
                  ? `${palette.primaryBg} scale-y-110`
                  : 'bg-[var(--chatly-border-strong)]'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-[var(--chatly-text-muted)]">
        {t.voiceStickerPreviewTitle}
      </p>
    </div>
  );
}
