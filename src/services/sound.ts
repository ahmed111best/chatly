import type { NotificationSoundId } from '../core/types';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playNotificationSound(soundId: NotificationSoundId): void {
  if (soundId === 'none') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const presets: Record<Exclude<NotificationSoundId, 'none'>, number[]> = {
    chime: [587.33, 880],
    pulse: [523.25, 659.25, 783.99],
    soft_bell: [440, 659.25],
  };

  const notes = presets[soundId] ?? presets.chime;
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = soundId === 'pulse' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.09);

    gain.gain.setValueAtTime(0.001, now + idx * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.09 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + idx * 0.09);
    osc.stop(now + idx * 0.09 + 0.26);
  });
}
