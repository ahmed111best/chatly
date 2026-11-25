import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { AccentColor, LanguageCode } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';

interface PinLockGateProps {
  lang: LanguageCode;
  accentColor: AccentColor;
  onUnlock: (pin: string) => Promise<boolean>;
  onSignOut?: () => void;
}

export function PinLockGate({ lang, accentColor, onUnlock, onSignOut }: PinLockGateProps) {
  const palette = ACCENT_PALETTES[accentColor];
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const ok = await onUnlock(pin.trim());
      if (!ok) {
        setError(lang === 'ar' ? 'رمز PIN غير صحيح.' : 'Incorrect security PIN.');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050F19]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--chatly-border)] bg-[#0B1B2B] text-white p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className={`w-12 h-12 rounded-2xl ${palette.primaryBg} flex items-center justify-center text-white shadow-lg shadow-cyan-500/20`}>
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-display text-xl font-bold">
            {lang === 'ar' ? 'شاتلي مقفل برمز PIN' : 'Chatly App Lock'}
          </h2>
          <p className="text-xs text-[#9CB8CE]">
            {lang === 'ar'
              ? 'أدخل رمز الأمان المكوّن من 4 إلى 8 أرقام للمتابعة.'
              : 'Enter your 4–8 digit security PIN to unlock this session.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound className="w-4 h-4 text-[#6B8CA6] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              aria-label="Security PIN"
              className="w-full min-h-[46px] ps-10 pe-4 rounded-xl border border-[var(--chatly-border)] bg-[#071420] text-center font-mono text-lg tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-400 text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={checking || !pin.trim()}
            className={`w-full min-h-[44px] rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{lang === 'ar' ? 'فتح التطبيق' : 'Unlock Chatly'}</span>
          </button>
        </form>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="w-full text-center text-xs text-[#9CB8CE] hover:text-white py-1"
          >
            {lang === 'ar' ? 'تسجيل الخروج' : 'Sign out instead'}
          </button>
        )}
      </div>
    </div>
  );
}
