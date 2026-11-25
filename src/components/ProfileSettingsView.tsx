import { useEffect, useState } from 'react';
import type {
  AccentColor,
  AccessibilityPrefs,
  FontScale,
  LanguageCode,
  ThemeMode,
  UserProfile,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';
import { normalizeUsername, validateProfileForm } from '../core/validation';
import { ChatlyAvatar } from './ChatlyAvatar';

interface ProfileSettingsViewProps {
  user: UserProfile;
  lang: LanguageCode;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  accessibilityPrefs?: AccessibilityPrefs;
  phoneDiscoveryConsent?: boolean;
  saving: boolean;
  serverError: string | null;
  onSaveProfile: (payload: {
    username: string;
    displayName: string;
    bio: string;
    statusText: string;
    preferredLanguage: LanguageCode;
    themeMode: ThemeMode;
    accentColor: AccentColor;
    twoFactorEnabled: boolean;
    phoneNumber: string;
  }) => void;
  onChangeAppearance: (patch: {
    lang?: LanguageCode;
    themeMode?: ThemeMode;
    accentColor?: AccentColor;
  }) => void;
  onUpdateAccessibility?: (next: AccessibilityPrefs) => void;
  onTogglePhoneDiscovery?: (enabled: boolean) => void;
}

export function ProfileSettingsView({
  user,
  lang,
  themeMode,
  accentColor,
  accessibilityPrefs = { fontScale: 'md', highContrast: false, reduceMotion: false },
  phoneDiscoveryConsent = false,
  saving,
  serverError,
  onSaveProfile,
  onChangeAppearance,
  onUpdateAccessibility,
  onTogglePhoneDiscovery,
}: ProfileSettingsViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [statusText, setStatusText] = useState(user.statusText);
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName);
    setUsername(user.username);
    setBio(user.bio);
    setStatusText(user.statusText);
    setPhoneNumber(user.phoneNumber);
    setTwoFactorEnabled(user.twoFactorEnabled);
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateProfileForm({
      username,
      displayName,
      bio,
      statusText,
      phoneNumber,
    });
    if (Object.keys(errs).length > 0) {
      const translated: Record<string, string> = {};
      for (const [k, code] of Object.entries(errs)) {
        if (code) {
          translated[k] =
            t.validationErrors[code as keyof typeof t.validationErrors] || code;
        }
      }
      setFieldErrors(translated);
      return;
    }

    setFieldErrors({});
    onSaveProfile({
      username: normalizeUsername(username),
      displayName: displayName.trim(),
      bio: bio.trim(),
      statusText: statusText.trim() || 'Available',
      preferredLanguage: lang,
      themeMode,
      accentColor,
      twoFactorEnabled,
      phoneNumber: phoneNumber.trim(),
    });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 3000);
  };

  const accentOptions: AccentColor[] = ['teal', 'indigo', 'amber', 'rose'];

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
            {t.profileTitle}
          </h2>
          <p className="text-sm text-[var(--chatly-text-muted)]">{t.profileSubtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 space-y-6 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-[var(--chatly-border)]">
            <ChatlyAvatar src={user.avatarUrl} name={displayName || user.username} size="xl" />
            <div className="min-w-0 space-y-1">
              <div className="font-display font-bold text-lg text-[var(--chatly-text-primary)] truncate">
                {displayName || user.displayName}
              </div>
              <div className="text-xs font-mono text-[var(--chatly-text-muted)] truncate">
                @{normalizeUsername(username || user.username)} · ID #{user.id}
              </div>
              <div className="text-xs text-[var(--chatly-text-secondary)] truncate">
                {user.email}
              </div>
            </div>
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-200"
            >
              {serverError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-display-name"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.displayNameLabel}
              </label>
              <input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {fieldErrors.displayName && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.displayName}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-username"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.usernameLabel}
              </label>
              <input
                id="profile-username"
                type="text"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm font-mono text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {fieldErrors.username && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.username}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-bio"
              className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
            >
              {t.bioLabel}
            </label>
            <textarea
              id="profile-bio"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
            {fieldErrors.bio && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{fieldErrors.bio}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-status"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.statusLabel}
              </label>
              <input
                id="profile-status"
                type="text"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {fieldErrors.statusText && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.statusText}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-phone"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.phoneLabel}
              </label>
              <input
                id="profile-phone"
                type="tel"
                dir="ltr"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+20 100 000 0000"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm font-mono text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              {fieldErrors.phoneNumber && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.phoneNumber}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--chatly-border)] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pref-language"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.languageSettingLabel}
              </label>
              <select
                id="pref-language"
                value={lang}
                onChange={(e) =>
                  onChangeAppearance({ lang: e.target.value as LanguageCode })
                }
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)]"
              >
                <option value="en">English (LTR)</option>
                <option value="ar">العربية (RTL)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pref-theme"
                className="block text-xs font-medium text-[var(--chatly-text-secondary)]"
              >
                {t.themeSettingLabel}
              </label>
              <select
                id="pref-theme"
                value={themeMode}
                onChange={(e) =>
                  onChangeAppearance({ themeMode: e.target.value as ThemeMode })
                }
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)]"
              >
                <option value="light">{t.lightMode}</option>
                <option value="dark">{t.darkMode}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--chatly-text-secondary)]">
                {t.accentSettingLabel}
              </span>
              <div className="flex items-center gap-2 min-h-[42px]">
                {accentOptions.map((opt) => {
                  const optPal = ACCENT_PALETTES[opt];
                  const active = opt === accentColor;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChangeAppearance({ accentColor: opt })}
                      aria-label={lang === 'ar' ? optPal.labelAr : optPal.labelEn}
                      aria-pressed={active}
                      style={{ backgroundColor: optPal.swatchHex }}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        active
                          ? 'ring-2 ring-offset-2 ring-[var(--chatly-text-primary)] ring-offset-[var(--chatly-bg-surface)] scale-105'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--chatly-border)] flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-[var(--chatly-text-primary)]">
                {t.twoFactorLabel}
              </div>
              <p className="text-xs text-[var(--chatly-text-muted)]">{t.twoFactorDesc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={twoFactorEnabled}
              aria-label={t.twoFactorLabel}
              onClick={() => setTwoFactorEnabled((prev) => !prev)}
              className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 ${
                twoFactorEnabled ? palette.primaryBg : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  twoFactorEnabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {onTogglePhoneDiscovery && (
            <div className="pt-4 border-t border-[var(--chatly-border)] flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-[var(--chatly-text-primary)]">
                  {t.phoneDiscoveryLabel}
                </div>
                <p className="text-xs text-[var(--chatly-text-muted)]">
                  {t.phoneDiscoveryDesc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={phoneDiscoveryConsent}
                aria-label={t.phoneDiscoveryLabel}
                onClick={() => onTogglePhoneDiscovery(!phoneDiscoveryConsent)}
                className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 ${
                  phoneDiscoveryConsent ? palette.primaryBg : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                    phoneDiscoveryConsent ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={saving}
              className={`w-full min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-[0_6px_18px_rgba(6,182,212,0.22)] ${palette.primaryBg} ${palette.primaryHover}`}
            >
              {t.saveProfileBtn}
            </button>
            {savedToast && (
              <div className="text-center text-xs text-teal-500 font-medium" role="status">
                {t.profileSavedToast}
              </div>
            )}
          </div>
        </form>

        {/* Accessibility Controls */}
        {onUpdateAccessibility && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-[var(--chatly-text-primary)]">
              {t.accessibilityTitle}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)] block">
                  {t.fontScaleLabel}
                </label>
                <select
                  aria-label={t.fontScaleLabel}
                  value={accessibilityPrefs.fontScale}
                  onChange={(e) =>
                    onUpdateAccessibility({
                      ...accessibilityPrefs,
                      fontScale: e.target.value as FontScale,
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-xs text-[var(--chatly-text-primary)]"
                >
                  <option value="sm">{lang === 'ar' ? 'صغير (14px)' : 'Compact (14px)'}</option>
                  <option value="md">{lang === 'ar' ? 'قياسي (16px)' : 'Standard (16px)'}</option>
                  <option value="lg">{lang === 'ar' ? 'كبير (18px)' : 'Large (18px)'}</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--chatly-text-primary)]">
                <input
                  type="checkbox"
                  checked={accessibilityPrefs.highContrast}
                  onChange={(e) =>
                    onUpdateAccessibility({
                      ...accessibilityPrefs,
                      highContrast: e.target.checked,
                    })
                  }
                />
                <span>{t.highContrastLabel}</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--chatly-text-primary)]">
                <input
                  type="checkbox"
                  checked={accessibilityPrefs.reduceMotion}
                  onChange={(e) =>
                    onUpdateAccessibility({
                      ...accessibilityPrefs,
                      reduceMotion: e.target.checked,
                    })
                  }
                />
                <span>{t.reduceMotionLabel}</span>
              </label>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
