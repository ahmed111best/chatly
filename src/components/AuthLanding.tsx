import { Globe, Lock, Monitor, Moon, ShieldCheck, Smartphone, Sun, Users } from 'lucide-react';
import type { AccentColor, LanguageCode, ThemeMode } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';
import { ChatlyLogo } from './ChatlyLogo';

interface AuthLandingProps {
  lang: LanguageCode;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  authBusy: boolean;
  authError: string | null;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onSignInWithGoogle: () => void;
  onEnterDemoWorkspace: () => void;
}

export function AuthLanding({
  lang,
  themeMode,
  accentColor,
  authBusy,
  authError,
  onToggleLanguage,
  onToggleTheme,
  onSignInWithGoogle,
  onEnterDemoWorkspace,
}: AuthLandingProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  return (
    <div className="min-h-screen chatly-ocean-backdrop text-[var(--chatly-text-primary)] flex flex-col">
      {/* Clean 3-Zone Top Bar */}
      <header className="w-full border-b border-[var(--chatly-border)] bg-[var(--chatly-bg-sidebar)] text-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <ChatlyLogo accentColor={accentColor} size={32} />
            <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
              {t.brandName}
            </span>
          </div>

          <p className="hidden md:block text-xs text-slate-300 whitespace-nowrap">
            {t.tagline}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLanguage}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-cyan-500/25 text-xs font-medium text-slate-100 hover:bg-[#10283E] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Globe className="w-4 h-4 text-teal-400" />
              <span>{t.languageLabel}</span>
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={themeMode === 'dark' ? t.lightMode : t.darkMode}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-cyan-500/25 text-xs font-medium text-slate-100 hover:bg-[#10283E] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {themeMode === 'dark' ? (
                <Sun className="w-4 h-4 text-teal-400" />
              ) : (
                <Moon className="w-4 h-4 text-teal-400" />
              )}
              <span>{themeMode === 'dark' ? t.lightMode : t.darkMode}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Left Brand Showcase */}
        <section className="lg:col-span-7 space-y-7">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-2xl bg-[#071524] border border-cyan-400/25 shadow-lg shadow-cyan-950/30">
              <ChatlyLogo accentColor={accentColor} size={48} />
            </div>
            <div>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-2xl font-bold tracking-tight text-[var(--chatly-text-primary)]">
                  {t.brandName}
                </span>
                <span className="font-display text-xl font-bold text-teal-600 dark:text-teal-400">
                  {t.brandArabic}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                {t.tagline}
              </p>
            </div>
          </div>

          <h1
            className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[var(--chatly-text-primary)] leading-[1.15]"
            style={{ textWrap: 'balance' }}
          >
            {t.heroTitle}
          </h1>

          <p className="text-base sm:text-lg text-[var(--chatly-text-secondary)] leading-relaxed max-w-2xl">
            {t.heroSubtitle}
          </p>

          <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-[var(--chatly-border)]">
            <div className="space-y-1.5">
              <div className={`flex items-center gap-2 text-sm font-semibold ${palette.primaryText}`}>
                <Users className="w-4 h-4 shrink-0" />
                <span>@username</span>
              </div>
              <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
                {lang === 'ar'
                  ? 'ابحث وتواصل عبر اسم المستخدم دون كشف رقم الهاتف.'
                  : 'Connect by handle without exposing personal phone numbers.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className={`flex items-center gap-2 text-sm font-semibold ${palette.primaryText}`}>
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'تحكم بالخصوصية' : 'Granular Privacy'}</span>
              </div>
              <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
                {lang === 'ar'
                  ? 'ضبط ظهور الاتصال وآخر ظهور وإدارة الأجهزة المتصلة.'
                  : 'Per-field visibility controls and remote device session revocation.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className={`flex items-center gap-2 text-sm font-semibold ${palette.primaryText}`}>
                <Globe className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'عربي RTL + إنجليزي' : 'Bilingual RTL / LTR'}</span>
              </div>
              <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
                {lang === 'ar'
                  ? 'تبديل فوري مع تنسيق محلي للأوقات والأرقام.'
                  : 'Full Arabic RTL and English LTR mirroring with localized dates.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-medium text-[var(--chatly-text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Web</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Windows Desktop</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Android</span>
            </span>
          </div>
        </section>

        {/* Right Ocean Auth Card */}
        <section className="lg:col-span-5">
          <div className="rounded-3xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)]/95 backdrop-blur-md p-6 sm:p-8 shadow-xl shadow-slate-900/10 dark:shadow-cyan-950/30 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <ChatlyLogo accentColor={accentColor} size={52} />
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-[var(--chatly-text-primary)]">
                  {t.authCardTitle}
                </h2>
                <p className="text-sm text-[var(--chatly-text-secondary)] leading-relaxed">
                  {t.authCardSubtitle}
                </p>
              </div>
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-200"
              >
                {authError}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignInWithGoogle}
                className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2.5 shadow-md shadow-teal-900/20 disabled:opacity-60 ${palette.primaryBg} ${palette.primaryHover}`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>{authBusy ? t.signingIn : t.signInWithGoogle}</span>
              </button>

              <button
                type="button"
                disabled={authBusy}
                onClick={onEnterDemoWorkspace}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl font-medium text-sm border border-cyan-500/30 dark:border-cyan-400/30 bg-slate-900/[0.04] dark:bg-white/[0.04] text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)] hover:border-cyan-400/55 transition-all"
              >
                {t.previewDemoWorkspace}
              </button>
            </div>

            <div className="pt-4 border-t border-[var(--chatly-border)] space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--chatly-text-primary)]">
                <Lock className="w-3.5 h-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span>{t.securityNoticeTitle}</span>
              </div>
              <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
                {t.securityNoticeBody}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
