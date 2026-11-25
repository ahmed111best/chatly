import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  ShieldAlert,
  Sliders,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import type { AccentColor, CallRecordItem, ConversationSummary, LanguageCode } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedDate, formatLocalizedTime } from '../core/localization';
import { getWebRtcIceServers } from '../core/config';
import { auth } from '../lib/firebase';
import {
  addWebRtcIceCandidateDoc,
  publishWebRtcOffer,
  subscribeWebRtcCallSignaling,
  updateCallStatusDoc,
} from '../services/firestoreService';
import { ChatlyAvatar } from './ChatlyAvatar';

interface CallsViewProps {
  calls: CallRecordItem[];
  conversations: ConversationSummary[];
  activeCall: {
    callId: number | null;
    conversationId: number;
    peerUserId: number | null;
    peerName: string;
    callType: 'audio' | 'video' | 'group';
    direction: 'outgoing' | 'incoming';
    incomingOffer?: RTCSessionDescriptionInit;
  } | null;
  isLiveMode?: boolean;
  lang: LanguageCode;
  accentColor: AccentColor;
  onStartCall: (conversationId: number, callType: 'audio' | 'video') => void;
  onEndCall: (callId: number | null, status: 'ended' | 'declined') => void;
}

export function CallsView({
  calls,
  conversations,
  activeCall,
  isLiveMode = false,
  lang,
  accentColor,
  onStartCall,
  onEndCall,
}: CallsViewProps) {
  const palette = ACCENT_PALETTES[accentColor];
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [echoCancel, setEchoCancel] = useState(true);
  const [noiseSuppress, setNoiseSuppress] = useState(true);
  const [iceState, setIceState] = useState<string>('idle');
  const [networkQuality, setNetworkQuality] = useState<string>('Checking');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
        setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
        setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      })
      .catch(() => {});
  }, []);

  const cleanupPeerConnection = () => {
    localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setScreenSharing(false);
    setIceState('idle');
    setNetworkQuality('Idle');
  };

  useEffect(() => {
    if (!activeCall) {
      setCallSeconds(0);
      cleanupPeerConnection();
      return;
    }

    setCallSeconds(0);
    const callTimer = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);

    let cancelled = false;
    let statsTimer: number | null = null;
    let unsubSignaling: (() => void) | null = null;

    async function initWebRtc() {
      setMediaError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
            echoCancellation: echoCancel,
            noiseSuppression: noiseSuppress,
          },
          video:
            activeCall!.callType === 'video'
              ? { deviceId: selectedCamId ? { exact: selectedCamId } : undefined }
              : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const iceServers = getWebRtcIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (ev) => {
          if (remoteVideoRef.current && ev.streams[0]) {
            remoteVideoRef.current.srcObject = ev.streams[0];
            const el = remoteVideoRef.current as HTMLVideoElement & {
              setSinkId?: (id: string) => Promise<void>;
            };
            if (selectedSpeakerId && el.setSinkId) {
              el.setSinkId(selectedSpeakerId).catch(() => {});
            }
          }
        };

        pc.oniceconnectionstatechange = () => {
          setIceState(pc.iceConnectionState);
        };

        statsTimer = window.setInterval(async () => {
          if (!pcRef.current) return;
          try {
            const report = await pcRef.current.getStats();
            let rttMs: number | null = null;
            report.forEach((stat) => {
              if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                if (typeof stat.currentRoundTripTime === 'number') {
                  rttMs = Math.round(stat.currentRoundTripTime * 1000);
                }
              }
            });
            if (rttMs !== null) {
              setNetworkQuality(rttMs < 120 ? `Good (${rttMs}ms)` : `Fair (${rttMs}ms)`);
            }
          } catch {
            // ignore stats error
          }
        }, 2000);

        pc.onicecandidate = (ev) => {
          if (ev.candidate && isLiveMode && activeCall?.callId) {
            void addWebRtcIceCandidateDoc(activeCall.callId, ev.candidate.toJSON());
          }
        };

        if (isLiveMode && activeCall?.callId && auth.currentUser) {
          unsubSignaling = subscribeWebRtcCallSignaling(
            auth.currentUser.uid,
            activeCall.callId,
            {
              onAnswerSdp: async (answer) => {
                if (pcRef.current && !pcRef.current.currentRemoteDescription) {
                  await pcRef.current
                    .setRemoteDescription(new RTCSessionDescription(answer))
                    .catch(() => {});
                }
              },
              onRemoteIceCandidate: async (candidate) => {
                if (pcRef.current) {
                  await pcRef.current
                    .addIceCandidate(new RTCIceCandidate(candidate))
                    .catch(() => {});
                }
              },
              onCallStatus: (status) => {
                if (status === 'ended' || status === 'declined' || status === 'missed') {
                  cleanupPeerConnection();
                }
              },
              onError: (err) => {
                setMediaError(err.message || 'Signaling connection error.');
              },
            }
          );
        }

        if (activeCall!.direction === 'outgoing') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (isLiveMode && activeCall?.callId) {
            await publishWebRtcOffer(activeCall.callId, offer);
          }
        } else if (activeCall!.direction === 'incoming' && activeCall!.incomingOffer) {
          await pc.setRemoteDescription(new RTCSessionDescription(activeCall!.incomingOffer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (isLiveMode && activeCall?.callId) {
            await updateCallStatusDoc(activeCall.callId, 'active', JSON.stringify(answer));
          }
        }
      } catch (err) {
        setMediaError(
          err instanceof Error
            ? err.message
            : 'Camera or microphone unavailable for WebRTC session.'
        );
      }
    }

    void initWebRtc();
    return () => {
      cancelled = true;
      window.clearInterval(callTimer);
      if (statsTimer) window.clearInterval(statsTimer);
      unsubSignaling?.();
      cleanupPeerConnection();
    };
  }, [activeCall, isLiveMode, selectedMicId, selectedCamId, selectedSpeakerId, echoCancel, noiseSuppress]);

  const toggleMic = () => {
    const next = !micMuted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  };

  const toggleCam = () => {
    const next = !camOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setCamOff(next);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack && pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        await sender?.replaceTrack(camTrack);
      }
      setScreenSharing(false);
      return;
    }
    try {
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = disp;
      const screenTrack = disp.getVideoTracks()[0];
      if (screenTrack && pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          pcRef.current.addTrack(screenTrack, disp);
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = disp;
      }
      screenTrack.onended = () => {
        setScreenSharing(false);
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      };
      setScreenSharing(true);
    } catch {
      setMediaError(lang === 'ar' ? 'تم إلغاء مشاركة الشاشة.' : 'Screen sharing cancelled.');
    }
  };

  const directPeers = conversations.filter((c) => c.type === 'direct' && c.peer);
  const activePeerAvatar = activeCall
    ? conversations.find((c) => c.id === activeCall.conversationId)?.peer?.avatarUrl
    : undefined;
  const formattedCallDuration = [
    String(Math.floor(callSeconds / 3600)).padStart(2, '0'),
    String(Math.floor((callSeconds % 3600) / 60)).padStart(2, '0'),
    String(callSeconds % 60).padStart(2, '0'),
  ].join(':');

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'المكالمات الصوتية والمرئية' : 'Voice & Video Calls (WebRTC)'}
          </h2>
          <p className="text-sm text-[var(--chatly-text-muted)]">
            {lang === 'ar'
              ? 'إشارات WebRTC لحظية عبر Firestore مع إلغاء الصدى والضوضاء واختيار الأجهزة ومشاركة الشاشة.'
              : 'Real-time WebRTC signaling via Cloud Firestore with device selection, echo/noise filtering, and screen sharing.'}
          </p>
        </div>

        {/* Device & Audio Processing Controls */}
        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--chatly-text-secondary)]">
            <Sliders className={`w-4 h-4 ${palette.primaryText}`} />
            <span>{lang === 'ar' ? 'إعدادات الصوت والكاميرا' : 'Audio & Video Device Preferences'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <select
              aria-label="Microphone device"
              value={selectedMicId}
              onChange={(e) => setSelectedMicId(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
            >
              <option value="">{lang === 'ar' ? 'الميكروفون الافتراضي' : 'Default Microphone'}</option>
              {audioInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
            <select
              aria-label="Camera device"
              value={selectedCamId}
              onChange={(e) => setSelectedCamId(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
            >
              <option value="">{lang === 'ar' ? 'الكاميرا الافتراضية' : 'Default Camera'}</option>
              {videoInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <select
              aria-label="Speaker output device"
              value={selectedSpeakerId}
              onChange={(e) => setSelectedSpeakerId(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
            >
              <option value="">{lang === 'ar' ? 'السماعة الافتراضية' : 'Default Speaker'}</option>
              {audioOutputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Speaker ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-[var(--chatly-text-secondary)]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={echoCancel}
                onChange={(e) => setEchoCancel(e.target.checked)}
              />
              <span>{lang === 'ar' ? 'إلغاء الصدى' : 'Echo cancellation'}</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={noiseSuppress}
                onChange={(e) => setNoiseSuppress(e.target.checked)}
              />
              <span>{lang === 'ar' ? 'عزل الضوضاء' : 'Noise suppression'}</span>
            </label>
          </div>
        </section>

        {/* Active WebRTC Call Surface */}
        {activeCall && (
          <div className="rounded-3xl border border-cyan-500/20 chatly-ocean-backdrop bg-[#06131F] text-white p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-teal-500/20 blur-md" aria-hidden="true" />
                <ChatlyAvatar src={activePeerAvatar} name={activeCall.peerName} size="xl" />
              </div>
              <div>
                <div className="font-display text-xl font-bold text-white">{activeCall.peerName}</div>
                <div className="text-sm font-mono tabular-nums text-teal-300 mt-1">
                  {formattedCallDuration}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-mono mt-1">
                  <Wifi className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    {activeCall.callType.toUpperCase()} · ICE: {iceState} · {networkQuality}
                  </span>
                </div>
              </div>
            </div>

            {iceState === 'disconnected' && (
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-700 text-xs text-amber-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? 'جاري محاولة إعادة الاتصال...'
                    : 'Connection interrupted — attempting ICE recovery...'}
                </span>
              </div>
            )}

            {mediaError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-200 text-center">
                {mediaError}
              </div>
            )}

            {activeCall.callType === 'video' && (
              <div className="grid sm:grid-cols-2 gap-3">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-48 rounded-2xl bg-[#0B1B2B] border border-white/10 object-cover"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-48 rounded-2xl bg-[#0B1B2B] border border-white/10 object-cover"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={micMuted ? 'Unmute' : 'Mute'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors border ${
                  micMuted
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-white/10 hover:bg-white/18 border-white/15 text-white'
                }`}
              >
                {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {activeCall.callType === 'video' && (
                <button
                  type="button"
                  onClick={toggleCam}
                  aria-label={camOff ? 'Turn camera on' : 'Turn camera off'}
                  title={camOff ? 'Camera On' : 'Camera Off'}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors border ${
                    camOff
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-white/10 hover:bg-white/18 border-white/15 text-white'
                  }`}
                >
                  {camOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  cleanupPeerConnection();
                  onEndCall(activeCall.callId, 'ended');
                }}
                aria-label={lang === 'ar' ? 'إنهاء المكالمة' : 'Hang up'}
                title={lang === 'ar' ? 'إنهاء المكالمة' : 'Hang up'}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-[0_6px_20px_rgba(225,29,72,0.45)] transition-transform hover:scale-105"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={toggleScreenShare}
                aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
                title={screenSharing ? 'Stop Share' : 'Share Screen'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors border ${
                  screenSharing
                    ? 'bg-teal-600 border-teal-400 text-white'
                    : 'bg-white/10 hover:bg-white/18 border-white/15 text-white'
                }`}
              >
                <MonitorUp className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Quick Call Launchers */}
        {directPeers.length > 0 && (
          <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-3">
            <h3 className="font-semibold text-sm text-[var(--chatly-text-primary)]">
              {lang === 'ar' ? 'بدء مكالمة جديدة' : 'Start a Call'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {directPeers.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ChatlyAvatar src={c.peer?.avatarUrl} name={c.title} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--chatly-text-primary)] truncate">
                        {c.title}
                      </div>
                      <div className="text-xs font-mono text-[var(--chatly-text-muted)]">
                        @{c.peer?.username}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onStartCall(c.id, 'audio')}
                      aria-label={`Audio call ${c.title}`}
                      className={`min-h-[36px] min-w-[36px] rounded-full text-white flex items-center justify-center ${palette.primaryBg}`}
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(c.id, 'video')}
                      aria-label={`Video call ${c.title}`}
                      className="min-h-[36px] min-w-[36px] rounded-full border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] flex items-center justify-center hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Call History */}
        <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
          {calls.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--chatly-text-muted)]">
              {lang === 'ar' ? 'لا يوجد سجل مكالمات بعد.' : 'No call history yet.'}
            </div>
          ) : (
            calls.map((call) => (
              <div key={call.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] flex items-center justify-center">
                    {call.callType === 'video' ? (
                      <Video className="w-4 h-4 text-teal-500" />
                    ) : (
                      <Phone className="w-4 h-4 text-teal-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--chatly-text-primary)]">
                      {call.peerDisplayName}
                    </div>
                    <div className="text-xs text-[var(--chatly-text-muted)] font-mono tabular-nums">
                      @{call.peerUsername} · {formatLocalizedDate(call.startedAt, lang)}{' '}
                      {formatLocalizedTime(call.startedAt, lang)}
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-mono uppercase ${
                    call.status === 'missed'
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-[var(--chatly-text-muted)]'
                  }`}
                >
                  {call.status}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
