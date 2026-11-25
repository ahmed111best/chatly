import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Flag,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type {
  AccentColor,
  AppHealthStatus,
  DeviceSession,
  EncryptedBackupItem,
  LanguageCode,
  LoginHistoryItem,
  ModeratorAuditItem,
  PrivacySettings,
  ReleaseNoteItem,
  SafetyReportItem,
  VisibilityLevel,
} from '../core/types';
import { countRestrictedControls } from '../core/privacy';
import { ACCENT_PALETTES } from '../core/theme';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
  TRANSLATIONS,
} from '../core/localization';
import {
  decryptEncryptedBackupBlob,
  generateRecoveryPhrase,
} from '../core/backupCrypto';
import { validatePinCode } from '../core/features';

interface PrivacyDashboardViewProps {
  privacy: PrivacySettings;
  sessions: DeviceSession[];
  e2eeFingerprint?: string | null;
  e2eeDeviceId?: string | null;
  onRotateE2eeKey?: () => Promise<void> | void;
  lang: LanguageCode;
  accentColor: AccentColor;
  saving: boolean;
  onSavePrivacy: (next: PrivacySettings) => void;
  onRevokeSession: (sessionId: string) => void;
  // Extended security, backup, safety, and reliability props
  hasPinLock?: boolean;
  loginHistory?: LoginHistoryItem[];
  backups?: EncryptedBackupItem[];
  safetyReports?: SafetyReportItem[];
  auditLogs?: ModeratorAuditItem[];
  crashDiagnosticsOptIn?: boolean;
  healthStatus?: AppHealthStatus | null;
  releaseNotes?: ReleaseNoteItem[];
  onSetPinLock?: (pin: string | null) => Promise<void> | void;
  onLockNow?: () => void;
  onCreateEncryptedBackup?: (
    passphrase: string,
    cadence: 'manual' | 'daily' | 'weekly'
  ) => Promise<void> | void;
  onVerifyBackup?: (backupId: number) => Promise<boolean>;
  onExportAccountData?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;
  onSubmitSafetyReport?: (payload: {
    targetType: 'user' | 'group' | 'channel' | 'message';
    targetId: string;
    reason: string;
    details: string;
  }) => Promise<void> | void;
  onAppealSafetyReport?: (reportId: number, appealNote: string) => Promise<void> | void;
  onToggleCrashDiagnostics?: (enabled: boolean) => Promise<void> | void;
}

export function PrivacyDashboardView({
  privacy,
  sessions,
  e2eeFingerprint,
  e2eeDeviceId,
  onRotateE2eeKey,
  lang,
  accentColor,
  saving,
  onSavePrivacy,
  onRevokeSession,
  hasPinLock = false,
  loginHistory = [],
  backups = [],
  safetyReports = [],
  auditLogs = [],
  crashDiagnosticsOptIn = false,
  healthStatus = null,
  releaseNotes = [],
  onSetPinLock,
  onLockNow,
  onCreateEncryptedBackup,
  onVerifyBackup,
  onExportAccountData,
  onDeleteAccount,
  onSubmitSafetyReport,
  onAppealSafetyReport,
  onToggleCrashDiagnostics,
}: PrivacyDashboardViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [draft, setDraft] = useState<PrivacySettings>(privacy);
  const [savedToast, setSavedToast] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);

  // Encrypted backup state
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [backupCadence, setBackupCadence] = useState<'manual' | 'daily' | 'weekly'>('manual');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatusMsg, setBackupStatusMsg] = useState<string | null>(null);
  const [decryptedPreview, setDecryptedPreview] = useState<string | null>(null);

  // PIN lock state
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  // Safety report state
  const [reportTargetType, setReportTargetType] = useState<'user' | 'group' | 'channel' | 'message'>('user');
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [appealDrafts, setAppealDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    setDraft(privacy);
  }, [privacy]);

  const counts = countRestrictedControls(draft);

  const visibilityRows: {
    key: keyof Pick<
      PrivacySettings,
      | 'onlineStatusVisibility'
      | 'lastSeenVisibility'
      | 'profilePhotoVisibility'
      | 'bioVisibility'
      | 'statusUpdatesVisibility'
      | 'contactInfoVisibility'
    >;
    label: string;
  }[] = [
    { key: 'onlineStatusVisibility', label: t.onlineStatusVisibility },
    { key: 'lastSeenVisibility', label: t.lastSeenVisibility },
    { key: 'profilePhotoVisibility', label: t.profilePhotoVisibility },
    { key: 'bioVisibility', label: t.bioVisibility },
    { key: 'statusUpdatesVisibility', label: t.statusUpdatesVisibility },
    { key: 'contactInfoVisibility', label: t.contactInfoVisibility },
  ];

  const booleanRows: {
    key: keyof Pick<
      PrivacySettings,
      'readReceiptsEnabled' | 'typingIndicatorsEnabled' | 'biometricLockEnabled'
    >;
    label: string;
    desc: string;
  }[] = [
    { key: 'readReceiptsEnabled', label: t.readReceiptsLabel, desc: t.readReceiptsDesc },
    {
      key: 'typingIndicatorsEnabled',
      label: t.typingIndicatorsLabel,
      desc: t.typingIndicatorsDesc,
    },
    { key: 'biometricLockEnabled', label: t.biometricLockLabel, desc: t.biometricLockDesc },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePrivacy(draft);
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 3000);
  };

  const handleCreateBackup = async () => {
    if (!onCreateEncryptedBackup) return;
    const phrase = recoveryPhrase.trim() || generateRecoveryPhrase();
    if (!recoveryPhrase.trim()) setRecoveryPhrase(phrase);
    setBackupBusy(true);
    setBackupStatusMsg(null);
    try {
      await onCreateEncryptedBackup(phrase, backupCadence);
      setBackupStatusMsg(
        lang === 'ar'
          ? 'تم تشفير النسخة الاحتياطية محلياً وحفظ التشفير فقط.'
          : 'Encrypted backup created locally (AES-256-GCM) and ciphertext stored.'
      );
    } catch (err) {
      setBackupStatusMsg(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDecryptPreview = async (item: EncryptedBackupItem) => {
    const phrase = recoveryPhrase.trim();
    if (!phrase) {
      setBackupStatusMsg(
        lang === 'ar'
          ? 'أدخل عبارة الاسترداد أعلاه لفك التشفير محلياً.'
          : 'Enter your recovery phrase above to decrypt and preview locally.'
      );
      return;
    }
    try {
      const payload = await decryptEncryptedBackupBlob(
        item.cipherPayloadJson,
        phrase,
        item.checksumSha256
      );
      setDecryptedPreview(JSON.stringify(payload, null, 2).slice(0, 1200));
      setBackupStatusMsg(
        lang === 'ar' ? 'تم فك التشفير والتحقق بنجاح.' : 'Backup decrypted & verified locally.'
      );
    } catch (err) {
      setBackupStatusMsg(err instanceof Error ? err.message : 'Decryption failed.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
              {t.privacyTitle}
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)]">{t.privacySubtitle}</p>
          </div>
          <div className="text-xs font-mono tabular-nums text-[var(--chatly-text-secondary)]">
            {formatLocalizedNumber(counts.restrictedCount, lang)} /{' '}
            {formatLocalizedNumber(counts.totalCount, lang)} {t.restrictedSummary}
          </div>
        </div>

        {/* Visibility & Toggle Preferences */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]"
        >
          {visibilityRows.map((row) => (
            <div
              key={row.key}
              className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <label
                htmlFor={`privacy-${row.key}`}
                className="text-sm font-medium text-[var(--chatly-text-primary)]"
              >
                {row.label}
              </label>
              <select
                id={`privacy-${row.key}`}
                value={draft[row.key]}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    [row.key]: e.target.value as VisibilityLevel,
                  }))
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                <option value="everyone">{t.visibilityEveryone}</option>
                <option value="contacts">{t.visibilityContacts}</option>
                <option value="nobody">{t.visibilityNobody}</option>
              </select>
            </div>
          ))}

          {booleanRows.map((row) => {
            const checked = draft[row.key];
            return (
              <div
                key={row.key}
                className="p-4 sm:px-6 flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-[var(--chatly-text-primary)]">
                    {row.label}
                  </div>
                  <p className="text-xs text-[var(--chatly-text-muted)]">{row.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={row.label}
                  onClick={() => setDraft((prev) => ({ ...prev, [row.key]: !checked }))}
                  className={`w-12 h-7 rounded-full transition-colors p-1 shrink-0 ${
                    checked ? palette.primaryBg : 'bg-[var(--chatly-border-strong)]'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}

          <div className="p-4 sm:px-6 flex items-center justify-between gap-4">
            <span className={`text-xs font-medium ${palette.primaryText}`} role="status">
              {savedToast ? t.privacySavedToast : ''}
            </span>
            <button
              type="submit"
              disabled={saving}
              className={`min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
            >
              {t.savePrivacyBtn}
            </button>
          </div>
        </form>

        {/* WebCrypto E2EE Device Key Management */}
        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <KeyRound className={`w-5 h-5 ${palette.primaryText}`} />
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--chatly-text-primary)]">
                  {lang === 'ar'
                    ? 'مفاتيح التشفير التام (ECDH P-256 + AES-256-GCM)'
                    : 'Device E2EE Keypair (ECDH P-256 + AES-256-GCM)'}
                </h3>
                <p className="text-xs text-[var(--chatly-text-muted)]">
                  {lang === 'ar'
                    ? 'يُحفظ المفتاح الخاص داخل IndexedDB على هذا الجهاز فقط ولا يغادره أبداً.'
                    : 'Private key is stored locally in IndexedDB on this device and never sent to the server.'}
                </p>
              </div>
            </div>

            {onRotateE2eeKey && (
              <button
                type="button"
                disabled={rotatingKey}
                onClick={async () => {
                  setRotatingKey(true);
                  try {
                    await onRotateE2eeKey();
                  } finally {
                    setRotatingKey(false);
                  }
                }}
                className="min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotatingKey ? 'animate-spin' : ''}`} />
                <span>{lang === 'ar' ? 'تدوير المفتاح' : 'Rotate Key'}</span>
              </button>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] text-xs font-mono space-y-1">
            <div className="text-[var(--chatly-text-secondary)]">
              Device ID: {e2eeDeviceId || 'Initializing...'}
            </div>
            <div className="text-[var(--chatly-text-primary)] break-all">
              Fingerprint: {e2eeFingerprint || 'Unavailable'}
            </div>
          </div>
        </section>

        {/* Encrypted Backup & Restore */}
        {onCreateEncryptedBackup && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-base font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
                <DatabaseBackup className={`w-5 h-5 ${palette.primaryText}`} />
                <span>{t.encryptedBackupTitle}</span>
              </h3>
              <p className="text-xs text-[var(--chatly-text-muted)]">
                {t.encryptedBackupSubtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {lang === 'ar' ? 'عبارة الاسترداد / كلمة المرور' : 'Recovery Phrase or Passphrase'}
                </label>
                <input
                  type="text"
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  placeholder="12-word recovery phrase..."
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {t.backupCadenceLabel}
                </label>
                <select
                  value={backupCadence}
                  onChange={(e) =>
                    setBackupCadence(e.target.value as 'manual' | 'daily' | 'weekly')
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                >
                  <option value="manual">Manual</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRecoveryPhrase(generateRecoveryPhrase())}
                className="min-h-[38px] px-3.5 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
              >
                {t.generatePhraseBtn}
              </button>
              <button
                type="button"
                disabled={backupBusy}
                onClick={handleCreateBackup}
                className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${palette.primaryBg}`}
              >
                {t.createBackupBtn}
              </button>
            </div>

            {backupStatusMsg && (
              <p className={`text-xs ${palette.primaryText}`}>{backupStatusMsg}</p>
            )}

            {backups.length > 0 && (
              <div className="divide-y divide-[var(--chatly-border)] border-t border-[var(--chatly-border)] pt-2">
                {backups.map((b) => (
                  <div key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-[var(--chatly-text-primary)]">
                        {b.includesSummary} · {b.cadence.toUpperCase()}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                        SHA-256: {b.checksumSha256.slice(0, 16)}… ·{' '}
                        {formatLocalizedDate(b.createdAt, lang)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onVerifyBackup && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onVerifyBackup(b.id);
                            setBackupStatusMsg(
                              ok
                                ? 'SHA-256 checksum verified on server.'
                                : 'Checksum mismatch!'
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--chatly-border)] text-xs text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          {t.verifyBackupBtn}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDecryptPreview(b)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--chatly-border)] text-xs text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
                      >
                        {t.restorePreviewBtn}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {decryptedPreview && (
              <pre className="p-3 rounded-xl bg-[#06111C] border border-[var(--chatly-border)] text-cyan-300 text-[11px] font-mono overflow-x-auto max-h-44">
                {decryptedPreview}
              </pre>
            )}
          </section>
        )}

        {/* App PIN Lock & Login History */}
        {onSetPinLock && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
                  <Lock className={`w-4 h-4 ${palette.primaryText}`} />
                  <span>{t.pinLockTitle}</span>
                </h3>
                <p className="text-xs text-[var(--chatly-text-muted)]">{t.pinLockSubtitle}</p>
              </div>
              {hasPinLock && onLockNow && (
                <button
                  type="button"
                  onClick={onLockNow}
                  className="min-h-[36px] px-3.5 rounded-xl border border-[var(--chatly-border)] text-xs font-semibold text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
                >
                  {t.lockNowBtn}
                </button>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const err = validatePinCode(pinInput);
                if (err) {
                  setPinMsg(err);
                  return;
                }
                await onSetPinLock(pinInput.trim());
                setPinInput('');
                setPinMsg(lang === 'ar' ? 'تم تفعيل قفل PIN.' : 'Security PIN updated.');
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="4–8 digits..."
                className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs font-mono"
              />
              <button
                type="submit"
                className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold text-white ${palette.primaryBg}`}
              >
                {t.setPinBtn}
              </button>
              {hasPinLock && (
                <button
                  type="button"
                  onClick={async () => {
                    await onSetPinLock(null);
                    setPinMsg(lang === 'ar' ? 'تم تعطيل قفل PIN.' : 'PIN lock disabled.');
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs text-rose-500 hover:bg-rose-500/10"
                >
                  {t.clearPinBtn}
                </button>
              )}
            </form>
            {pinMsg && <p className={`text-xs ${palette.primaryText}`}>{pinMsg}</p>}
          </section>
        )}

        {/* Active Sessions */}
        <section className="space-y-3">
          <div>
            <h3 className="font-display text-lg font-bold text-[var(--chatly-text-primary)]">
              {t.sessionsTitle}
            </h3>
            <p className="text-sm text-[var(--chatly-text-secondary)]">{t.sessionsSubtitle}</p>
          </div>

          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-4 sm:px-6 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--chatly-bg-input)] flex items-center justify-center text-[var(--chatly-text-secondary)] shrink-0">
                    {sess.platform === 'android' ? (
                      <Smartphone className="w-5 h-5" />
                    ) : (
                      <Laptop className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--chatly-text-primary)] truncate">
                        {sess.deviceName}
                      </span>
                      {sess.isCurrent && (
                        <span className={`text-xs font-medium ${palette.primaryText}`}>
                          · {t.currentDeviceTag}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--chatly-text-muted)] flex items-center gap-2 font-mono tabular-nums">
                      <span className="uppercase">{sess.platform}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatLocalizedDate(sess.lastActiveAt, lang)}{' '}
                        {formatLocalizedTime(sess.lastActiveAt, lang)}
                      </span>
                    </div>
                  </div>
                </div>

                {!sess.isCurrent && (
                  <button
                    type="button"
                    disabled={Boolean(sess.revokedAt)}
                    onClick={() => onRevokeSession(sess.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-rose-500 hover:bg-rose-500/10 disabled:opacity-90 disabled:text-[var(--chatly-text-muted)] disabled:hover:bg-transparent whitespace-nowrap shrink-0"
                  >
                    {sess.revokedAt ? t.revokedLabel : t.revokeSessionBtn}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Login History */}
        {loginHistory.length > 0 && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-3">
            <h3 className="font-display text-base font-bold text-[var(--chatly-text-primary)]">
              {t.loginHistoryTitle}
            </h3>
            <div className="divide-y divide-[var(--chatly-border)] text-xs">
              {loginHistory.slice(0, 8).map((ev) => (
                <div key={ev.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--chatly-text-primary)]">
                      {ev.deviceName}{' '}
                      {ev.suspiciousFlag && (
                        <span className="text-rose-500">· Suspicious</span>
                      )}
                      {ev.isNewDevice && !ev.suspiciousFlag && (
                        <span className="text-amber-500">· New device</span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                      {ev.platform} · {formatLocalizedDate(ev.createdAt, lang)}{' '}
                      {formatLocalizedTime(ev.createdAt, lang)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Safety Reports, Appeals & Audit Log */}
        {onSubmitSafetyReport && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <Flag className={`w-4 h-4 ${palette.primaryText}`} />
              <span>{t.safetyCenterTitle}</span>
            </h3>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!reportTargetId.trim() || !reportReason.trim()) return;
                await onSubmitSafetyReport({
                  targetType: reportTargetType,
                  targetId: reportTargetId.trim(),
                  reason: reportReason.trim(),
                  details: reportDetails.trim(),
                });
                setReportTargetId('');
                setReportReason('');
                setReportDetails('');
              }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            >
              <select
                value={reportTargetType}
                onChange={(e) =>
                  setReportTargetType(
                    e.target.value as 'user' | 'group' | 'channel' | 'message'
                  )
                }
                className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              >
                <option value="user">User</option>
                <option value="group">Group</option>
                <option value="channel">Channel</option>
                <option value="message">Message</option>
              </select>
              <input
                type="text"
                value={reportTargetId}
                onChange={(e) => setReportTargetId(e.target.value)}
                placeholder="@handle or ID"
                className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              />
              <input
                type="text"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Reason (spam, abuse...)"
                className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              />
              <input
                type="text"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Optional non-encrypted context details..."
                className="sm:col-span-2 min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              />
              <button
                type="submit"
                className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold text-white ${palette.primaryBg}`}
              >
                {t.submitReportBtn}
              </button>
            </form>

            {safetyReports.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--chatly-border)]">
                {safetyReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-3 rounded-xl bg-[var(--chatly-bg-input)] text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--chatly-text-primary)]">
                        [{rep.targetType}] {rep.targetId} — {rep.reason}
                      </span>
                      <span className="font-mono uppercase text-[var(--chatly-text-muted)]">{rep.status}</span>
                    </div>
                    {rep.status !== 'appealed' && onAppealSafetyReport && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={appealDrafts[rep.id] || ''}
                          onChange={(e) =>
                            setAppealDrafts((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          placeholder="Appeal note..."
                          className="flex-1 px-2.5 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const note = (appealDrafts[rep.id] || '').trim();
                            if (note.length >= 3) onAppealSafetyReport(rep.id, note);
                          }}
                          className="px-3 py-1 rounded-lg border border-[var(--chatly-border)] font-medium text-[var(--chatly-text-primary)]"
                        >
                          {t.appealBtn}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {auditLogs.length > 0 && (
              <div className="pt-2 border-t border-[var(--chatly-border)] space-y-1.5">
                <div className="text-xs font-semibold text-[var(--chatly-text-secondary)]">
                  {lang === 'ar'
                    ? 'سجل التدقيق الأمني (بدون أي نص مشفر)'
                    : 'Moderation & Safety Audit Trail (Zero E2EE Plaintext)'}
                </div>
                {auditLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="text-[11px] font-mono text-[var(--chatly-text-muted)] flex items-center justify-between"
                  >
                    <span>
                      {log.action} · {log.scopeType}:{log.scopeId} ({log.metadataSummary})
                    </span>
                    <span>{formatLocalizedTime(log.createdAt, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Data Export & Account Deletion */}
        {(onExportAccountData || onDeleteAccount) && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {onExportAccountData && (
                <button
                  type="button"
                  onClick={onExportAccountData}
                  className="min-h-[40px] px-4 rounded-xl border border-[var(--chatly-border)] text-xs font-semibold text-[var(--chatly-text-primary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.dataExportBtn}</span>
                </button>
              )}
              {onDeleteAccount && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm((prev) => !prev)}
                  className="min-h-[40px] px-4 rounded-xl border border-rose-500/30 text-xs font-semibold text-rose-500 flex items-center gap-1.5 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t.deleteAccountBtn}</span>
                </button>
              )}
            </div>

            {showDeleteConfirm && onDeleteAccount && (
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 space-y-3">
                <div className="text-xs text-rose-600 dark:text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'ar'
                      ? 'اكتب DELETE للتأكيد النهائي على حذف الحساب وجميع بياناتك.'
                      : 'Type DELETE to permanently delete your Chatly account and stored records.'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={deleteText}
                    onChange={(e) => setDeleteText(e.target.value)}
                    placeholder="DELETE"
                    className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={deleteText.trim() !== 'DELETE'}
                    onClick={onDeleteAccount}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    {t.deleteAccountBtn}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Reliability, Diagnostics & Release Notes */}
        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 sm:px-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <Activity className={`w-4 h-4 ${palette.primaryText}`} />
              <span>{t.reliabilityTitle}</span>
            </h3>
            {healthStatus && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-mono ${palette.primaryText}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                v{healthStatus.version} · DB {healthStatus.dbStatus.toUpperCase()} (
                {healthStatus.dbLatencyMs}ms)
              </span>
            )}
          </div>

          {onToggleCrashDiagnostics && (
            <label className="flex items-center gap-2 text-xs text-[var(--chatly-text-secondary)]">
              <input
                type="checkbox"
                checked={crashDiagnosticsOptIn}
                onChange={(e) => onToggleCrashDiagnostics(e.target.checked)}
              />
              <span>{t.crashDiagnosticsLabel}</span>
            </label>
          )}

          {releaseNotes.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[var(--chatly-border)]">
              {releaseNotes.map((rn) => (
                <div key={rn.version} className="space-y-1">
                  <div className="text-xs font-mono font-semibold text-[var(--chatly-text-primary)]">
                    v{rn.version} — {rn.date}
                  </div>
                  <ul className="list-disc ps-5 text-xs text-[var(--chatly-text-secondary)] space-y-0.5">
                    {(lang === 'ar' ? rn.highlightsAr : rn.highlightsEn).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 flex items-start gap-3.5">
          <Shield className={`w-5 h-5 shrink-0 mt-0.5 ${palette.primaryText}`} />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              <span>{t.securityNoticeTitle}</span>
            </h3>
            <p className="text-xs text-[var(--chatly-text-secondary)] leading-relaxed">
              {t.securityNoticeBody}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
