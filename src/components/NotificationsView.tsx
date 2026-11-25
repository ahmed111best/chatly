import { Bell, BellOff, Check, Clock, Info, Volume2 } from 'lucide-react';
import type {
  AccentColor,
  ConversationSummary,
  LanguageCode,
  LockScreenPreviewMode,
  MessageReminderItem,
  NotificationItem,
  NotificationPrefs,
  NotificationSoundId,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedDate, formatLocalizedTime, TRANSLATIONS } from '../core/localization';
import { playNotificationSound } from '../services/sound';

const DEFAULT_PREFS: NotificationPrefs = {
  soundId: 'chime',
  dndEnabled: false,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  lockScreenPreview: 'full',
  mutedConversationIds: [],
};

interface NotificationsViewProps {
  notifications: NotificationItem[];
  reminders: MessageReminderItem[];
  conversations?: ConversationSummary[];
  prefs?: NotificationPrefs;
  lang: LanguageCode;
  accentColor: AccentColor;
  onMarkRead: (id: number) => void;
  onUpdatePrefs?: (next: NotificationPrefs) => void;
}

export function NotificationsView({
  notifications,
  reminders,
  conversations = [],
  prefs = DEFAULT_PREFS,
  lang,
  accentColor,
  onMarkRead,
  onUpdatePrefs,
}: NotificationsViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const toggleMutedConv = (convId: number) => {
    if (!onUpdatePrefs) return;
    const exists = prefs.mutedConversationIds.includes(convId);
    onUpdatePrefs({
      ...prefs,
      mutedConversationIds: exists
        ? prefs.mutedConversationIds.filter((id) => id !== convId)
        : [...prefs.mutedConversationIds, convId],
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'التنبيهات وإدارة الإشعارات' : 'Notifications & Schedule Controls'}
          </h2>
          <p className="text-sm text-[var(--chatly-text-secondary)]">
            {lang === 'ar'
              ? 'خصص النغمات وساعات الهدوء ومعاينة شاشة القفل وكتم المحادثات.'
              : 'Configure custom alert sounds, Quiet Hours, Do Not Disturb, lock-screen privacy, and per-conversation mutes.'}
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 flex items-start gap-3 text-xs text-[var(--chatly-text-secondary)]">
          <Info className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {lang === 'ar'
              ? 'تعمل التنبيهات الصوتية وإشعارات سطح المكتب والمتصفح لحظياً عندما يكون التطبيق مفتوحاً. أما إشعارات الدفع عندما يكون الهاتف مغلقاً أو مقفلاً فتتطلب Firebase Cloud Messaging (FCM) مع Cloud Functions (خطة Blaze) وملف google-services.json للأندرويد.'
              : 'In-app sound alerts and desktop/browser notifications trigger in real time while Chatly is open. Background or lock-screen push notifications when closed are not enabled yet—they require Firebase Cloud Messaging (FCM), a Cloud Functions trigger (Firebase Blaze plan), and Android google-services.json / Web Push VAPID keys.'}
          </p>
        </div>

        {/* Advanced Notification Preferences */}
        {onUpdatePrefs && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4">
            <h3 className="font-display font-bold text-sm text-[var(--chatly-text-primary)] flex items-center gap-2">
              <Volume2 className={`w-4 h-4 ${palette.primaryText}`} />
              <span>{t.notifSoundsTitle}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)] block">
                  {lang === 'ar' ? 'نغمة التنبيه' : 'Notification sound'}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={prefs.soundId}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        soundId: e.target.value as NotificationSoundId,
                      })
                    }
                    className="flex-1 min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                  >
                    <option value="chime">Crystal Chime</option>
                    <option value="pulse">Acoustic Pulse</option>
                    <option value="soft_bell">Soft Bell</option>
                    <option value="none">Silent</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => playNotificationSound(prefs.soundId)}
                    className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
                  >
                    {t.testSoundBtn}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)] block">
                  {t.lockPreviewLabel}
                </label>
                <select
                  value={prefs.lockScreenPreview}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      lockScreenPreview: e.target.value as LockScreenPreviewMode,
                    })
                  }
                  className="w-full min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                >
                  <option value="full">{lang === 'ar' ? 'الاسم والمحتوى' : 'Sender & message'}</option>
                  <option value="name_only">{lang === 'ar' ? 'الاسم فقط' : 'Sender name only'}</option>
                  <option value="hidden">{lang === 'ar' ? 'إخفاء التفاصيل' : 'Hide content'}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--chatly-border)]">
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--chatly-text-primary)]">
                <input
                  type="checkbox"
                  checked={prefs.dndEnabled}
                  onChange={(e) => onUpdatePrefs({ ...prefs, dndEnabled: e.target.checked })}
                />
                <span>{t.dndLabel}</span>
              </label>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 font-medium text-[var(--chatly-text-primary)]">
                  <input
                    type="checkbox"
                    checked={prefs.quietHoursEnabled}
                    onChange={(e) =>
                      onUpdatePrefs({ ...prefs, quietHoursEnabled: e.target.checked })
                    }
                  />
                  <span>{t.quietHoursLabel}</span>
                </label>
                <input
                  type="time"
                  value={prefs.quietStart}
                  onChange={(e) => onUpdatePrefs({ ...prefs, quietStart: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] font-mono"
                />
                <span>–</span>
                <input
                  type="time"
                  value={prefs.quietEnd}
                  onChange={(e) => onUpdatePrefs({ ...prefs, quietEnd: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] font-mono"
                />
              </div>
            </div>

            {conversations.length > 0 && (
              <div className="pt-2 border-t border-[var(--chatly-border)] space-y-2">
                <div className="text-xs font-semibold text-[var(--chatly-text-secondary)]">
                  {lang === 'ar' ? 'تفضيلات كل محادثة / مجموعة' : 'Per-Conversation Mute Controls'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {conversations.slice(0, 10).map((c) => {
                    const muted = prefs.mutedConversationIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleMutedConv(c.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
                          muted
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                            : 'border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]'
                        }`}
                      >
                        {muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                        <span className="truncate max-w-[140px]">{c.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--chatly-text-muted)]">
              {lang === 'ar' ? 'لا توجد تنبيهات جديدة.' : 'No notifications right now.'}
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      n.readAt ? 'bg-[var(--chatly-bg-input)] text-[var(--chatly-text-muted)]' : `${palette.softBg} ${palette.primaryText}`
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-[var(--chatly-text-primary)]">
                      {n.title}
                    </div>
                    <p className="text-xs text-[var(--chatly-text-secondary)]">{n.body}</p>
                    <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                      {formatLocalizedDate(n.createdAt, lang)} {formatLocalizedTime(n.createdAt, lang)}
                    </div>
                  </div>
                </div>

                {!n.readAt && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1 hover:bg-[var(--chatly-bg-elevated)] shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'مقروء' : 'Mark read'}</span>
                  </button>
                )}
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-display font-bold text-base text-[var(--chatly-text-primary)] flex items-center gap-2">
            <Clock className={`w-4 h-4 ${palette.primaryText}`} />
            <span>{lang === 'ar' ? 'تذكيرات الرسائل المجدولة' : 'Message Reminders'}</span>
          </h3>
          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
            {reminders.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--chatly-text-muted)]">
                {lang === 'ar' ? 'لا توجد تذكيرات مجدولة.' : 'No message reminders scheduled.'}
              </div>
            ) : (
              reminders.map((rem) => (
                <div key={rem.id} className="p-4 space-y-1">
                  <div className="text-sm font-medium text-[var(--chatly-text-primary)]">
                    {rem.note || rem.messageBody}
                  </div>
                  <div className="text-xs text-[var(--chatly-text-secondary)] truncate">
                    “{rem.messageBody}”
                  </div>
                  <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                    {formatLocalizedDate(rem.remindAt, lang)} {formatLocalizedTime(rem.remindAt, lang)} ·{' '}
                    {rem.triggered ? 'Triggered' : 'Scheduled'}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
