import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Ban,
  Camera,
  Check,
  Copy,
  Flag,
  Lock,
  MessageSquarePlus,
  QrCode,
  ScanLine,
  Search,
  Star,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AccentColor,
  FriendRequestItem,
  LanguageCode,
  MutualGroupSummary,
  PublicUserSummary,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';
import { formatQrProfileUri, parseQrProfileInput } from '../core/features';
import { ChatlyAvatar } from './ChatlyAvatar';

interface DirectoryViewProps {
  users: PublicUserSummary[];
  query: string;
  loading: boolean;
  lang: LanguageCode;
  accentColor: AccentColor;
  currentUserId?: number;
  currentUsername?: string;
  inviteToken?: string;
  friendRequests?: FriendRequestItem[];
  recentContacts?: PublicUserSummary[];
  mutualGroupsByUser?: Record<number, MutualGroupSummary[]>;
  phoneDiscoveryConsent?: boolean;
  onQueryChange: (q: string) => void;
  onStartChat: (user: PublicUserSummary) => void;
  onStartChatByUsername?: (username: string) => Promise<void> | void;
  onToggleFavorite?: (user: PublicUserSummary) => void;
  onToggleBlock?: (user: PublicUserSummary) => void;
  onReportUser?: (user: PublicUserSummary, reason: string) => void;
  onSendFriendRequest?: (payload: {
    targetUserId?: number;
    username?: string;
    inviteToken?: string;
    phoneNumber?: string;
  }) => Promise<void> | void;
  onDecideFriendRequest?: (
    requestId: number,
    decision: 'accepted' | 'rejected'
  ) => Promise<void> | void;
  onRemoveContact?: (user: PublicUserSummary) => Promise<void> | void;
  onLoadMutualGroups?: (userId: number) => Promise<void> | void;
}

export function DirectoryView({
  users,
  query,
  loading,
  lang,
  accentColor,
  currentUserId = 0,
  currentUsername = '',
  inviteToken = '',
  friendRequests = [],
  recentContacts = [],
  mutualGroupsByUser = {},
  phoneDiscoveryConsent = false,
  onQueryChange,
  onStartChat,
  onStartChatByUsername,
  onToggleFavorite,
  onToggleBlock,
  onReportUser,
  onSendFriendRequest,
  onDecideFriendRequest,
  onRemoveContact,
  onLoadMutualGroups,
}: DirectoryViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [reportingUser, setReportingUser] = useState<PublicUserSummary | null>(null);
  const [reportReason, setReportReason] = useState('Spam or abuse');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const [qrSvg, setQrSvg] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrFeedback, setQrFeedback] = useState<string | null>(null);
  const [qrFeedbackIsError, setQrFeedbackIsError] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [scanningCamera, setScanningCamera] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const profileUri = currentUsername
    ? formatQrProfileUri(currentUsername, inviteToken || undefined)
    : '';

  useEffect(() => {
    if (!profileUri) return;
    let active = true;
    QRCode.toString(profileUri, { type: 'svg', margin: 1, width: 148 })
      .then((svg) => {
        if (active) setQrSvg(svg);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profileUri]);

  const stopCameraScanner = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanningCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);

  const handleScanOrSubmitQr = useCallback(
    async (rawValue: string, action: 'friend' | 'chat' = 'friend') => {
      const parsed = parseQrProfileInput(rawValue);
      if (!parsed.username && !parsed.inviteToken) {
        setQrFeedbackIsError(true);
        setQrFeedback(
          lang === 'ar'
            ? 'صيغة رمز QR أو @username غير صالحة.'
            : 'Unrecognized QR URI, invite token, or @username.'
        );
        return;
      }

      setQrBusy(true);
      setQrFeedback(null);
      setQrFeedbackIsError(false);

      try {
        if (action === 'chat' && parsed.username) {
          const matchedLocal = users.find(
            (u) => u.username.toLowerCase() === parsed.username?.toLowerCase()
          );
          if (matchedLocal) {
            onStartChat(matchedLocal);
            setShowScannerModal(false);
            stopCameraScanner();
            return;
          }
          if (onStartChatByUsername) {
            await onStartChatByUsername(parsed.username);
            setShowScannerModal(false);
            stopCameraScanner();
            return;
          }
        }

        if (!onSendFriendRequest) {
          throw new Error(
            lang === 'ar'
              ? 'إضافة الأصدقاء غير متاحة حالياً.'
              : 'Friend requests are unavailable right now.'
          );
        }

        await onSendFriendRequest({
          username: parsed.username ?? undefined,
          inviteToken: parsed.inviteToken ?? undefined,
        });
        setQrInput('');
        setQrFeedbackIsError(false);
        setQrFeedback(
          lang === 'ar' ? 'تم إرسال طلب الصداقة.' : 'Friend request sent successfully.'
        );
      } catch (err) {
        setQrFeedbackIsError(true);
        setQrFeedback(
          err instanceof Error ? err.message : 'Unable to process scanned QR code.'
        );
      } finally {
        setQrBusy(false);
      }
    },
    [lang, onSendFriendRequest, onStartChat, onStartChatByUsername, stopCameraScanner, users]
  );

  const startLiveCameraScanner = useCallback(async () => {
    stopCameraScanner();
    setQrFeedback(null);
    setQrFeedbackIsError(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setQrFeedbackIsError(true);
      setQrFeedback(
        lang === 'ar'
          ? 'الكاميرا غير مدعومة في هذا المتصفح — الصق رمز QR أو @username أدناه.'
          : 'Camera API is unavailable here — paste the QR link or @username below.'
      );
      return;
    }

    setScanningCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

      scanTimerRef.current = window.setInterval(async () => {
        const vid = videoRef.current;
        const canvas = canvasRef.current;
        if (!vid || vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) return;

        let detectedValue: string | null = null;

        if (detector) {
          try {
            const results = await detector.detect(vid);
            if (results[0]?.rawValue) {
              detectedValue = results[0].rawValue;
            }
          } catch {
            // Fall back to jsQR below
          }
        }

        if (!detectedValue && canvas) {
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code?.data) {
              detectedValue = code.data;
            }
          }
        }

        if (detectedValue) {
          stopCameraScanner();
          setQrInput(detectedValue);
          await handleScanOrSubmitQr(detectedValue, 'friend');
        }
      }, 180);
    } catch {
      stopCameraScanner();
      setQrFeedbackIsError(true);
      setQrFeedback(
        lang === 'ar'
          ? 'تم رفض إذن الكاميرا أو تعذر تشغيلها. يمكنك لصق الرابط أدناه.'
          : 'Camera permission denied or no camera available. Paste the QR URI or @username below.'
      );
    }
  }, [handleScanOrSubmitQr, lang, stopCameraScanner]);

  const openScannerModal = () => {
    setQrFeedback(null);
    setQrFeedbackIsError(false);
    setShowScannerModal(true);
    window.setTimeout(() => {
      void startLiveCameraScanner();
    }, 60);
  };

  const closeScannerModal = () => {
    stopCameraScanner();
    setShowScannerModal(false);
  };

  const pendingIncoming = friendRequests.filter(
    (r) => r.status === 'pending' && r.receiverId === currentUserId
  );
  const pendingOutgoing = friendRequests.filter(
    (r) => r.status === 'pending' && r.senderId === currentUserId
  );

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
              {t.navDirectory}
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)]">
              {lang === 'ar'
                ? 'تواصل مع الأشخاص عبر @username أو رمز QR دون رفع جهات اتصالك أبداً.'
                : 'Discover people by @username, QR badge, or invite link. Address books are never uploaded without explicit permission.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openScannerModal}
              data-testid="directory-scan-qr-btn"
              className="min-h-[40px] px-4 rounded-xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] text-xs font-semibold text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)] flex items-center gap-1.5 shadow-sm"
            >
              <ScanLine className={`w-4 h-4 ${palette.primaryText}`} />
              <span>{lang === 'ar' ? 'مسح رمز QR' : 'Scan QR Code'}</span>
            </button>

            {profileUri && (
              <button
                type="button"
                onClick={() => setShowQrModal((prev) => !prev)}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm ${palette.primaryBg} ${palette.primaryHover}`}
              >
                <QrCode className="w-4 h-4" />
                <span>{t.qrBadgeTitle}</span>
              </button>
            )}
          </div>
        </div>

        {/* My QR Badge Drawer */}
        {showQrModal && profileUri && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex items-center gap-4">
              {qrSvg && (
                <div
                  className="p-2.5 rounded-2xl bg-white border border-[var(--chatly-border)] shrink-0"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
              <div className="space-y-2 min-w-0">
                <div className="font-display font-bold text-sm text-[var(--chatly-text-primary)]">
                  @{currentUsername}
                </div>
                <p className="text-[11px] font-mono text-[var(--chatly-text-muted)] break-all">
                  {profileUri}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(profileUri).catch(() => {});
                    setCopiedUri(true);
                    window.setTimeout(() => setCopiedUri(false), 1800);
                  }}
                  className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] inline-flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {copiedUri
                      ? lang === 'ar'
                        ? 'تم النسخ'
                        : 'Copied'
                      : lang === 'ar'
                        ? 'نسخ رابط الدعوة'
                        : 'Copy Invite URI'}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-[var(--chatly-text-secondary)] block">
                {t.scanQrLabel}
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleScanOrSubmitQr(qrInput, 'friend');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="chatly://user/@nadia?invite=INV-..."
                  className="flex-1 min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={qrBusy || !qrInput.trim()}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${palette.primaryBg}`}
                >
                  {t.sendFriendReqBtn}
                </button>
              </form>
              <button
                type="button"
                onClick={openScannerModal}
                className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs flex items-center gap-1.5 text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'فتح ماسح الكاميرا' : 'Open Camera Scanner'}</span>
              </button>
              {qrFeedback && (
                <p
                  className={`text-xs ${
                    qrFeedbackIsError
                      ? 'text-rose-600 dark:text-rose-400'
                      : palette.primaryText
                  }`}
                >
                  {qrFeedback}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Dedicated Live Camera QR Scanner Modal */}
        {showScannerModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'ar' ? 'ماسح رمز QR' : 'QR Code Contact Scanner'}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-3xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ScanLine className={`w-5 h-5 ${palette.primaryText}`} />
                  <h3 className="font-display font-bold text-base text-[var(--chatly-text-primary)]">
                    {lang === 'ar' ? 'إضافة جهة اتصال عبر QR' : 'Scan Contact QR Code'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeScannerModal}
                  aria-label={lang === 'ar' ? 'إغلاق الماسح' : 'Close QR scanner'}
                  className="p-1.5 rounded-xl text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative aspect-square max-h-64 w-full rounded-2xl overflow-hidden bg-slate-950 border border-[var(--chatly-border)] flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-teal-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]" />
                {!scanningCamera && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-950/80 text-slate-300 text-xs gap-2">
                    <Camera className="w-7 h-7 text-teal-400" />
                    <span>
                      {lang === 'ar'
                        ? 'اضغط إعادة تشغيل الكاميرا أو الصق رمز QR أدناه'
                        : 'Click Retry Camera or paste a Chatly QR URI below'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void startLiveCameraScanner()}
                  className="min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)] inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>
                    {scanningCamera
                      ? lang === 'ar'
                        ? 'جاري المسح...'
                        : 'Scanning...'
                      : lang === 'ar'
                        ? 'إعادة تشغيل الكاميرا'
                        : 'Retry Camera'}
                  </span>
                </button>
                {scanningCamera && (
                  <button
                    type="button"
                    onClick={stopCameraScanner}
                    className="min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                  >
                    {lang === 'ar' ? 'إيقاف الكاميرا' : 'Stop Camera'}
                  </button>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleScanOrSubmitQr(qrInput, 'friend');
                }}
                className="space-y-2.5 pt-2 border-t border-[var(--chatly-border)]"
              >
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)] block">
                  {t.scanQrLabel}
                </label>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="chatly://user/@nadia?invite=CHATLY-..."
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs font-mono"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={qrBusy || !qrInput.trim()}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
                  >
                    {t.sendFriendReqBtn}
                  </button>
                  <button
                    type="button"
                    disabled={qrBusy || !qrInput.trim()}
                    onClick={() => void handleScanOrSubmitQr(qrInput, 'chat')}
                    className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border-strong)] text-xs font-semibold text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)] disabled:opacity-50"
                  >
                    {t.startChat}
                  </button>
                </div>
              </form>

              {qrFeedback && (
                <p
                  role={qrFeedbackIsError ? 'alert' : 'status'}
                  className={`text-xs rounded-xl px-3 py-2 border ${
                    qrFeedbackIsError
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                      : 'bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300'
                  }`}
                >
                  {qrFeedback}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Incoming / Outgoing Friend Requests */}
        {(pendingIncoming.length > 0 || pendingOutgoing.length > 0) && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-4 space-y-3">
            <h3 className="font-display text-sm font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <UserCheck className={`w-4 h-4 ${palette.primaryText}`} />
              <span>{t.friendRequestsTitle}</span>
            </h3>
            <div className="divide-y divide-[var(--chatly-border)]">
              {pendingIncoming.map((req) => (
                <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ChatlyAvatar src={req.senderAvatarUrl} name={req.senderDisplayName} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--chatly-text-primary)] truncate">
                        {req.senderDisplayName}
                      </div>
                      <div className="text-xs font-mono text-[var(--chatly-text-muted)]">@{req.senderUsername}</div>
                    </div>
                  </div>
                  {onDecideFriendRequest && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDecideFriendRequest(req.id, 'accepted')}
                        className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold text-white flex items-center gap-1 ${palette.primaryBg}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t.acceptBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecideFriendRequest(req.id, 'rejected')}
                        className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-secondary)] flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{t.rejectBtn}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {pendingOutgoing.map((req) => (
                <div key={req.id} className="py-2.5 flex items-center justify-between gap-3 text-xs text-[var(--chatly-text-muted)]">
                  <span>
                    {lang === 'ar' ? 'بانتظار موافقة' : 'Pending request to'}{' '}
                    <strong className="text-[var(--chatly-text-primary)]">
                      @{req.receiverUsername}
                    </strong>
                  </span>
                  <span className="font-mono uppercase">{req.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Contacts Strip */}
        {recentContacts.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--chatly-text-muted)]">
              {t.recentContactsTitle}
            </h3>
            <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {recentContacts.map((rc) => (
                <button
                  key={rc.id}
                  type="button"
                  onClick={() => onStartChat(rc)}
                  className="shrink-0 px-3 py-2 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                >
                  <ChatlyAvatar src={rc.avatarUrl} name={rc.displayName} size="sm" />
                  <div className="text-start">
                    <div className="text-xs font-semibold text-[var(--chatly-text-primary)]">
                      {rc.displayName}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">@{rc.username}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="space-y-2">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[var(--chatly-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t.searchDirectoryPlaceholder}
              aria-label={t.searchDirectoryPlaceholder}
              className="w-full min-h-[46px] ps-10 pe-4 py-2.5 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <p className="text-[11px] text-[var(--chatly-text-muted)]">
            {phoneDiscoveryConsent
              ? lang === 'ar'
                ? 'البحث برقم الهاتف مفعّل بموافقتك لمن سمحوا بذلك.'
                : 'Optional phone-number lookup is enabled with your consent (only matches users who opted in).'
              : lang === 'ar'
                ? 'البحث يعتمد على @username والاسم فقط. يمكنك تفعيل الاكتشاف بالهاتف من إعدادات الحساب.'
                : 'Searching by @username and display name. Enable optional phone discovery in Profile if desired.'}
          </p>
        </div>

        {reportSubmitted && (
          <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-xs text-teal-700 dark:text-teal-200">
            {lang === 'ar' ? 'تم إرسال البلاغ بنجاح.' : 'Report submitted for review.'}
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-20 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] animate-pulse"
              />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-10 text-center text-sm text-[var(--chatly-text-muted)]">
            {t.emptyDirectory}
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
            {users.map((person) => {
              const mutuals = mutualGroupsByUser[person.id];
              return (
                <div key={person.id} className="p-4 sm:p-5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <ChatlyAvatar src={person.avatarUrl} name={person.displayName} size="md" online={person.online} />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--chatly-text-primary)] truncate">
                            {person.displayName}
                          </span>
                          <span className="text-xs font-mono text-[var(--chatly-text-muted)] truncate">
                            @{person.username}
                          </span>
                          {person.hasE2eeKey && (
                            <Lock
                              className={`w-3.5 h-3.5 shrink-0 ${palette.primaryText}`}
                              aria-label="E2EE Ready"
                            />
                          )}
                        </div>
                        {person.bio && (
                          <p className="text-xs text-[var(--chatly-text-secondary)] truncate">
                            {person.bio}
                          </p>
                        )}
                        <p className="text-[11px] text-[var(--chatly-text-muted)]">
                          {person.online ? t.onlineLabel : person.statusText}
                          {person.isBlocked && (
                            <span className="text-rose-500 font-semibold">
                              {' '}
                              · {lang === 'ar' ? 'محظور' : 'Blocked'}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {onSendFriendRequest && !person.isContact && !person.isBlocked && (
                        <button
                          type="button"
                          onClick={() => onSendFriendRequest({ targetUserId: person.id })}
                          title={t.sendFriendReqBtn}
                          aria-label={`${t.sendFriendReqBtn} ${person.displayName}`}
                          className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1 hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t.sendFriendReqBtn}</span>
                        </button>
                      )}

                      {onLoadMutualGroups && (
                        <button
                          type="button"
                          onClick={() => onLoadMutualGroups(person.id)}
                          title={t.mutualGroupsBtn}
                          aria-label={`${t.mutualGroupsBtn} ${person.displayName}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      )}

                      {onToggleFavorite && (
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(person)}
                          aria-label={`Favorite ${person.displayName}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              person.isFavorite
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-[var(--chatly-text-muted)]'
                            }`}
                          />
                        </button>
                      )}

                      {onRemoveContact && person.isContact && (
                        <button
                          type="button"
                          onClick={() => onRemoveContact(person)}
                          title={t.removeContactBtn}
                          aria-label={`${t.removeContactBtn} ${person.displayName}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}

                      {onToggleBlock && (
                        <button
                          type="button"
                          onClick={() => onToggleBlock(person)}
                          aria-label={`${person.isBlocked ? 'Unblock' : 'Block'} ${person.displayName}`}
                          className={`min-h-[38px] min-w-[38px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center hover:bg-[var(--chatly-bg-elevated)] ${
                            person.isBlocked ? 'text-rose-500' : 'text-[var(--chatly-text-muted)]'
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      {onReportUser && (
                        <button
                          type="button"
                          onClick={() => setReportingUser(person)}
                          aria-label={`Report ${person.displayName}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--chatly-border)] flex items-center justify-center text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)]"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={Boolean(person.isBlocked)}
                        onClick={() => onStartChat(person)}
                        className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 ${palette.primaryBg} ${palette.primaryHover}`}
                      >
                        <MessageSquarePlus className="w-4 h-4" />
                        <span>{t.startChat}</span>
                      </button>
                    </div>
                  </div>

                  {mutuals && (
                    <div className="ps-14 text-xs text-[var(--chatly-text-muted)]">
                      {mutuals.length === 0
                        ? lang === 'ar'
                          ? 'لا توجد مجموعات مشتركة.'
                          : 'No mutual groups.'
                        : `${t.mutualGroupsBtn}: ${mutuals.map((g) => g.title).join(', ')}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {reportingUser && onReportUser && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onReportUser(reportingUser, reportReason);
              setReportingUser(null);
              setReportSubmitted(true);
              window.setTimeout(() => setReportSubmitted(false), 2500);
            }}
            className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-3"
          >
            <div className="text-sm font-semibold text-[var(--chatly-text-primary)]">
              {lang === 'ar'
                ? `الإبلاغ عن @${reportingUser.username}`
                : `Report @${reportingUser.username}`}
            </div>
            <input
              type="text"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setReportingUser(null)}
                className="px-3 py-1.5 rounded-xl border border-[var(--chatly-border)] text-xs text-[var(--chatly-text-secondary)]"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium"
              >
                {lang === 'ar' ? 'إرسال البلاغ' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
