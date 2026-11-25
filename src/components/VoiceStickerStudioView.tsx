import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Clock,
  DownloadCloud,
  Film,
  Image as ImageIcon,
  Mic,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AccentColor,
  LanguageCode,
  StickerPackItem,
  StickerVisualPreset,
  VoiceStickerItem,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { TRANSLATIONS } from '../core/localization';
import { inferMediaKind, inferMediaMimeType } from '../core/validation';
import { getAuthorizedMediaUrl } from '../services/api';
import { cacheStickerOffline, getCachedStickerIds } from '../services/offlineCache';
import { VoiceStickerCard } from './VoiceStickerCard';

export interface StickerSubmitPayload {
  packId: number;
  name: string;
  nameAr: string;
  category: string;
  kind: 'static' | 'animated' | 'voice_animated';
  visualPreset: StickerVisualPreset;
  visualFile?: Blob | null;
  visualFileName?: string;
  visualMimeType?: string;
  audioFile?: Blob | null;
  audioFileName?: string;
  audioMimeType?: string;
  audioDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  syncOffsetMs: number;
  defaultVolume: number;
  onUploadProgress?: (pct: number) => void;
}

interface VoiceStickerStudioViewProps {
  packs: StickerPackItem[];
  currentUserId: number;
  lang: LanguageCode;
  accentColor: AccentColor;
  authToken: string | null;
  hasActiveChat: boolean;
  onCreatePack: (payload: {
    title: string;
    titleAr: string;
    category: string;
  }) => Promise<StickerPackItem | void>;
  onImportPackByCode?: (shareCode: string) => Promise<void>;
  onCreateSticker: (payload: StickerSubmitPayload) => Promise<VoiceStickerItem | void>;
  onUpdateSticker?: (
    stickerId: number,
    payload: StickerSubmitPayload
  ) => Promise<VoiceStickerItem | void>;
  onDeleteSticker?: (stickerId: number) => Promise<void>;
  onToggleFavorite: (stickerId: number) => void;
  onSendStickerToChat: (sticker: VoiceStickerItem) => void;
}

export function VoiceStickerStudioView({
  packs,
  currentUserId,
  lang,
  accentColor,
  authToken,
  hasActiveChat,
  onCreatePack,
  onImportPackByCode,
  onCreateSticker,
  onUpdateSticker,
  onDeleteSticker,
  onToggleFavorite,
  onSendStickerToChat,
}: VoiceStickerStudioViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'recent' | 'favorites' | 'animated' | 'voice' | 'create'>('all');
  const [cachedIds, setCachedIds] = useState<number[]>(() => getCachedStickerIds());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [importingPack, setImportingPack] = useState(false);

  // Pack Creator
  const [showNewPack, setShowNewPack] = useState(false);
  const [packTitle, setPackTitle] = useState('');
  const [packTitleAr, setPackTitleAr] = useState('');

  // Sticker Creator / Editor State
  const [editingSticker, setEditingSticker] = useState<VoiceStickerItem | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<number>(packs[0]?.id ?? 0);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [category, setCategory] = useState('greetings');
  const [kind, setKind] = useState<'static' | 'animated' | 'voice_animated'>('voice_animated');
  const [visualPreset, setVisualPreset] = useState<StickerVisualPreset>('pulse_ring');
  const [visualBlob, setVisualBlob] = useState<Blob | null>(null);
  const [visualName, setVisualName] = useState('');
  const [visualMime, setVisualMime] = useState('');
  const [visualPreviewUrl, setVisualPreviewUrl] = useState<string | null>(null);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState('');
  const [audioMime, setAudioMime] = useState('');
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(1800);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(1800);
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);
  const [defaultVolume, setDefaultVolume] = useState(85);
  const [recording, setRecording] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const visualObjectUrlRef = useRef<string | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (packs.length > 0 && !packs.some((p) => p.id === selectedPackId)) {
      setSelectedPackId(packs[0].id);
    }
  }, [packs, selectedPackId]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (visualObjectUrlRef.current) URL.revokeObjectURL(visualObjectUrlRef.current);
      if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
    };
  }, []);

  const resetCreatorForm = () => {
    setEditingSticker(null);
    setName('');
    setNameAr('');
    setCategory('greetings');
    setKind('voice_animated');
    setVisualPreset('pulse_ring');
    if (visualObjectUrlRef.current) {
      URL.revokeObjectURL(visualObjectUrlRef.current);
      visualObjectUrlRef.current = null;
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
    setVisualBlob(null);
    setVisualName('');
    setVisualMime('');
    setVisualPreviewUrl(null);
    setAudioBlob(null);
    setAudioName('');
    setAudioMime('');
    setAudioPreviewUrl(null);
    setAudioDurationMs(1800);
    setTrimStartMs(0);
    setTrimEndMs(1800);
    setSyncOffsetMs(0);
    setDefaultVolume(85);
    setUploadPct(null);
    setCreatorError(null);
  };

  const handleStartEdit = (stk: VoiceStickerItem) => {
    resetCreatorForm();
    setEditingSticker(stk);
    setSelectedPackId(stk.packId);
    setName(stk.name);
    setNameAr(stk.nameAr);
    setCategory(stk.category || 'greetings');
    setKind(stk.kind);
    setVisualPreset(stk.visualPreset);
    setVisualMime(stk.visualMimeType || '');
    setVisualPreviewUrl(
      stk.visualUrl ? getAuthorizedMediaUrl(stk.visualUrl, authToken) : null
    );
    setAudioPreviewUrl(
      stk.audioUrl ? getAuthorizedMediaUrl(stk.audioUrl, authToken) : null
    );
    setAudioDurationMs(stk.audioDurationMs || 1800);
    setTrimStartMs(stk.trimStartMs || 0);
    setTrimEndMs(stk.trimEndMs || stk.audioDurationMs || 1800);
    setSyncOffsetMs(stk.syncOffsetMs || 0);
    setDefaultVolume(stk.defaultVolume ?? 85);
    setStatusBanner(null);
    setTab('create');
  };

  const handleToggleRecord = async () => {
    setCreatorError(null);
    if (recording && recorderRef.current) {
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      recorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const dur = Math.max(500, Date.now() - recordStartRef.current);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
        const url = URL.createObjectURL(blob);
        audioObjectUrlRef.current = url;
        setAudioBlob(blob);
        setAudioName(`sticker-voice-${Date.now()}.webm`);
        setAudioMime(blob.type || 'audio/webm');
        setAudioPreviewUrl(url);
        setAudioDurationMs(dur);
        setTrimStartMs(0);
        setTrimEndMs(dur);
        setKind('voice_animated');
      };
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecordElapsedMs(0);
      rec.start();
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordElapsedMs(Date.now() - recordStartRef.current);
      }, 200);
    } catch {
      setCreatorError(
        lang === 'ar'
          ? 'تعذر فتح الميكروفون. يمكنك استيراد ملف صوتي بدلاً من ذلك.'
          : 'Microphone unavailable in this browser. You can import an audio file instead.'
      );
    }
  };

  const handlePickAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCreatorError(null);
    if (file.size === 0) {
      setCreatorError(lang === 'ar' ? 'ملف الصوت فارغ.' : 'Audio file is empty.');
      return;
    }
    const inferredMime = inferMediaMimeType(file.name, file.type);
    if (!inferredMime.startsWith('audio/')) {
      setCreatorError(
        lang === 'ar' ? 'يرجى اختيار ملف صوتي صالح.' : 'Please select a valid audio file.'
      );
      return;
    }
    if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    audioObjectUrlRef.current = url;
    setAudioBlob(file);
    setAudioName(file.name);
    setAudioMime(inferredMime);
    setAudioPreviewUrl(url);
    setKind('voice_animated');
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const dur = Math.max(500, Math.round((probe.duration || 2) * 1000));
      setAudioDurationMs(dur);
      setTrimStartMs(0);
      setTrimEndMs(dur);
    };
  };

  const handlePickVisualFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'image' | 'animation'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCreatorError(null);
    if (file.size === 0) {
      setCreatorError(lang === 'ar' ? 'الملف المختار فارغ.' : 'Selected visual file is empty.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setCreatorError(
        lang === 'ar' ? 'حجم الملف يتجاوز 15 ميجابايت.' : 'Visual file exceeds 15 MB limit.'
      );
      return;
    }
    const mime = inferMediaMimeType(file.name, file.type);
    const detectedKind = inferMediaKind(mime, file.name);
    if (detectedKind !== 'image' && detectedKind !== 'video') {
      setCreatorError(
        lang === 'ar'
          ? 'صيغة غير مدعومة. اختر صورة أو رسماً متحركاً (PNG/GIF/WebP/APNG/WebM/MP4).'
          : 'Unsupported file format. Choose an image or animation (PNG/GIF/WebP/APNG/WebM/MP4).'
      );
      return;
    }

    if (visualObjectUrlRef.current) URL.revokeObjectURL(visualObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    visualObjectUrlRef.current = url;
    setVisualPreset('custom_image');
    setVisualBlob(file);
    setVisualName(file.name);
    setVisualMime(mime);
    setVisualPreviewUrl(url);
    if (mode === 'animation' && kind === 'static') {
      setKind('animated');
    }
  };

  const handleSaveSticker = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatorError(null);
    setStatusBanner(null);

    if (!name.trim()) {
      setCreatorError(lang === 'ar' ? 'يرجى إدخال اسم الملصق.' : 'Sticker name is required.');
      return;
    }
    if (kind !== 'static' && trimEndMs > 0 && trimStartMs >= trimEndMs) {
      setCreatorError(
        lang === 'ar'
          ? 'نقطة البداية يجب أن تسبق نقطة النهاية.'
          : 'Trim start must be earlier than trim end.'
      );
      return;
    }

    setSaving(true);
    setUploadPct(visualBlob || audioBlob ? 12 : null);

    const payload: StickerSubmitPayload = {
      packId: selectedPackId || packs[0]?.id || 0,
      name: name.trim(),
      nameAr: nameAr.trim() || name.trim(),
      category,
      kind,
      visualPreset,
      visualFile: visualBlob,
      visualFileName: visualName,
      visualMimeType: visualMime,
      audioFile: audioBlob,
      audioFileName: audioName,
      audioMimeType: audioMime,
      audioDurationMs,
      trimStartMs,
      trimEndMs,
      syncOffsetMs,
      defaultVolume,
      onUploadProgress: (pct) => setUploadPct(pct),
    };

    try {
      if (editingSticker && onUpdateSticker) {
        await onUpdateSticker(editingSticker.id, payload);
        setStatusBanner(
          lang === 'ar'
            ? `تم تحديث الملصق "${payload.name}" وحفظه بنجاح.`
            : `Sticker "${payload.name}" updated and saved.`
        );
      } else {
        await onCreateSticker(payload);
        setStatusBanner(
          lang === 'ar'
            ? `تم حفظ الملصق "${payload.name}" في مكتبتك.`
            : `Sticker "${payload.name}" saved to your library.`
        );
      }
      resetCreatorForm();
      setTab('all');
    } catch (err) {
      setCreatorError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
            ? 'فشل حفظ الملصق.'
            : 'Failed to save sticker.'
      );
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  };

  const handleCreatePackSubmit = async () => {
    if (!packTitle.trim()) return;
    const created = await onCreatePack({
      title: packTitle.trim(),
      titleAr: packTitleAr.trim() || packTitle.trim(),
      category: 'custom',
    });
    if (created && 'id' in created) {
      setSelectedPackId(created.id);
    }
    setPackTitle('');
    setPackTitleAr('');
    setShowNewPack(false);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCode.trim() || !onImportPackByCode) return;
    setImportingPack(true);
    setCreatorError(null);
    try {
      await onImportPackByCode(importCode.trim());
      setImportCode('');
      setStatusBanner(
        lang === 'ar' ? 'تم استيراد حزمة الملصقات.' : 'Sticker pack imported to your library.'
      );
    } catch (err) {
      setCreatorError(err instanceof Error ? err.message : 'Failed to import sticker pack.');
    } finally {
      setImportingPack(false);
    }
  };

  const handleCacheOffline = async (sticker: VoiceStickerItem) => {
    const urls = [
      sticker.audioUrl ? getAuthorizedMediaUrl(sticker.audioUrl, authToken) : '',
      sticker.visualUrl ? getAuthorizedMediaUrl(sticker.visualUrl, authToken) : '',
    ].filter(Boolean);
    await cacheStickerOffline({ stickerId: sticker.id, urls });
    setCachedIds(getCachedStickerIds());
  };

  const filteredPacks = packs
    .map((pack) => {
      const q = query.trim().toLowerCase();
      const stickers = pack.stickers.filter((s) => {
        if (tab === 'favorites' && !s.isFavorite) return false;
        if (tab === 'animated' && s.kind === 'static') return false;
        if (tab === 'voice' && s.kind !== 'voice_animated') return false;
        if (tab === 'recent' && s.usageCount === 0 && !s.createdAt) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.nameAr.includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      });
      return { ...pack, stickers };
    })
    .filter((p) => p.stickers.length > 0 || (!query && tab === 'all'));

  const previewSticker: VoiceStickerItem = {
    id: editingSticker?.id ?? 0,
    packId: selectedPackId,
    creatorId: currentUserId,
    name: name.trim() || (lang === 'ar' ? 'معاينة الملصق الصوتي' : 'Voice Sticker Preview'),
    nameAr: nameAr.trim() || name.trim() || 'معاينة الملصق الصوتي',
    category,
    kind,
    visualPreset,
    visualUrl: visualPreviewUrl,
    visualMimeType: visualMime || null,
    audioUrl: audioPreviewUrl,
    audioDurationMs,
    trimStartMs,
    trimEndMs,
    syncOffsetMs,
    defaultVolume,
    usageCount: 0,
    isFavorite: false,
    toneHz: [440, 554.37, 659.25],
  };

  const studioTabs: { id: typeof tab; label: string }[] = [
    { id: 'all', label: lang === 'ar' ? 'حزمي' : 'My Packs' },
    { id: 'recent', label: lang === 'ar' ? 'الأحدث' : 'Recent' },
    { id: 'favorites', label: t.folderFavorites },
    { id: 'animated', label: lang === 'ar' ? 'متحركة' : 'Animated' },
    { id: 'voice', label: lang === 'ar' ? 'صوتية' : 'Voice' },
    {
      id: 'create',
      label: editingSticker
        ? lang === 'ar'
          ? 'تعديل الملصق'
          : 'Edit Sticker'
        : lang === 'ar'
          ? '+ إنشاء ملصق'
          : '+ Create Sticker',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)] flex items-center gap-2.5">
              <Sparkles className={`w-5 h-5 ${palette.primaryText}`} />
              <span>{lang === 'ar' ? 'استوديو الملصقات الصوتية' : 'Voice Sticker Studio'}</span>
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)] mt-0.5">
              {lang === 'ar'
                ? 'ارفع صوراً أو رسوماً متحركة، سجّل صوتك مع قص الصوت وتعديل المزامنة، واحفظ ملصقاتك.'
                : 'Upload images or animations, record or import audio with trim & sync, and build reusable packs.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--chatly-bg-surface)] p-1.5 rounded-2xl border border-[var(--chatly-border)]">
            {studioTabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'create' && !editingSticker) {
                      setStatusBanner(null);
                    }
                    setTab(item.id);
                  }}
                  className={`min-h-[34px] px-3.5 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? `${palette.primaryBg} text-white shadow-sm`
                      : 'text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)] hover:text-[var(--chatly-text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {statusBanner && (
          <div
            role="status"
            className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-xs font-medium text-teal-700 dark:text-teal-200 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button type="button" onClick={() => setStatusBanner(null)} aria-label="Dismiss notice">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {tab === 'create' ? (
          <div className="grid lg:grid-cols-5 gap-6">
            <form
              onSubmit={handleSaveSticker}
              className="lg:col-span-3 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-semibold text-base text-[var(--chatly-text-primary)]">
                  {editingSticker
                    ? lang === 'ar'
                      ? `تعديل: ${editingSticker.name}`
                      : `Editing: ${editingSticker.name}`
                    : lang === 'ar'
                      ? 'إنشاء ملصق جديد'
                      : 'Create New Sticker'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewPack((prev) => !prev)}
                  className={`text-xs font-semibold ${palette.primaryText}`}
                >
                  {lang === 'ar' ? '+ حزمة جديدة' : '+ New Pack'}
                </button>
              </div>

              {showNewPack && (
                <div className="p-3 rounded-2xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={packTitle}
                    onChange={(e) => setPackTitle(e.target.value)}
                    placeholder={lang === 'ar' ? 'اسم الحزمة (EN)' : 'Pack title (EN)'}
                    className="flex-1 min-w-[140px] min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] text-xs"
                  />
                  <input
                    type="text"
                    value={packTitleAr}
                    onChange={(e) => setPackTitleAr(e.target.value)}
                    placeholder={lang === 'ar' ? 'اسم الحزمة (AR)' : 'Pack title (AR)'}
                    className="flex-1 min-w-[140px] min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCreatePackSubmit}
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-medium text-white ${palette.primaryBg}`}
                  >
                    {lang === 'ar' ? 'إنشاء' : 'Create'}
                  </button>
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                    {lang === 'ar' ? 'الحزمة' : 'Pack'}
                  </label>
                  <select
                    value={selectedPackId}
                    onChange={(e) => setSelectedPackId(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
                  >
                    {packs.length === 0 ? (
                      <option value={0}>{lang === 'ar' ? 'ملصقاتي (تلقائي)' : 'My Stickers (Auto)'}</option>
                    ) : (
                      packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {lang === 'ar' && p.titleAr ? p.titleAr : p.title}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                    {lang === 'ar' ? 'النوع' : 'Sticker Type'}
                  </label>
                  <select
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as 'static' | 'animated' | 'voice_animated')
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
                  >
                    <option value="voice_animated">
                      {lang === 'ar' ? 'صوتي + متحرك' : 'Voice + Animated'}
                    </option>
                    <option value="animated">
                      {lang === 'ar' ? 'ملصق متحرك' : 'Animated Sticker'}
                    </option>
                    <option value="static">{lang === 'ar' ? 'ملصق ثابت' : 'Static Sticker'}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                    {lang === 'ar' ? 'التصنيف' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
                  >
                    <option value="greetings">{lang === 'ar' ? 'تحيات' : 'Greetings'}</option>
                    <option value="reactions">{lang === 'ar' ? 'تفاعلات' : 'Reactions'}</option>
                    <option value="celebrate">{lang === 'ar' ? 'احتفال' : 'Celebration'}</option>
                    <option value="work">{lang === 'ar' ? 'العمل' : 'Work'}</option>
                    <option value="custom">{lang === 'ar' ? 'مخصص' : 'Custom'}</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="sticker-name-en"
                    className="text-xs font-medium text-[var(--chatly-text-secondary)]"
                  >
                    {lang === 'ar' ? 'اسم الملصق (EN) *' : 'Sticker Name *'}
                  </label>
                  <input
                    id="sticker-name-en"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={lang === 'ar' ? 'أدخل اسم الملصق...' : 'Enter sticker name...'}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="sticker-name-ar"
                    className="text-xs font-medium text-[var(--chatly-text-secondary)]"
                  >
                    {lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name (Optional)'}
                  </label>
                  <input
                    id="sticker-name-ar"
                    type="text"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder={lang === 'ar' ? 'الاسم بالعربية...' : 'Arabic sticker label...'}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {lang === 'ar' ? 'صورة أو رسم متحرك للملصق' : 'Visual Asset (Image, GIF, WebP, or Video Animation)'}
                </label>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <select
                    value={visualPreset}
                    onChange={(e) => setVisualPreset(e.target.value as StickerVisualPreset)}
                    aria-label="Visual preset"
                    className="min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                  >
                    <option value="pulse_ring">Pulse Ring</option>
                    <option value="wave_bars">Wave Bars</option>
                    <option value="prism_burst">Prism Burst</option>
                    <option value="orbit_spark">Orbit Spark</option>
                    <option value="custom_image">Custom Media</option>
                  </select>

                  <label className="min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer hover:bg-[var(--chatly-bg-elevated)]">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'رفع صورة' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
                      onChange={(e) => handlePickVisualFile(e, 'image')}
                      className="hidden"
                    />
                  </label>

                  <label className="min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer hover:bg-[var(--chatly-bg-elevated)]">
                    <Film className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'رفع حركة' : 'Upload Animation'}</span>
                    <input
                      type="file"
                      accept=".gif,.webp,.apng,.webm,.mp4,video/mp4,video/webm,image/gif,image/webp"
                      onChange={(e) => handlePickVisualFile(e, 'animation')}
                      className="hidden"
                    />
                  </label>
                </div>
                {visualName && (
                  <p className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                    {visualName} ({visualMime || 'image'})
                  </p>
                )}
              </div>

              {kind !== 'static' && (
                <div className="p-4 rounded-2xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleRecord}
                      className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium text-white flex items-center gap-1.5 ${
                        recording ? 'bg-rose-600' : palette.primaryBg
                      }`}
                    >
                      {recording ? (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Mic className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {recording
                          ? lang === 'ar'
                            ? `إيقاف (${(recordElapsedMs / 1000).toFixed(1)}ث)`
                            : `Stop (${(recordElapsedMs / 1000).toFixed(1)}s)`
                          : lang === 'ar'
                            ? 'تسجيل صوت'
                            : 'Record Voice'}
                      </span>
                    </button>

                    <label className="min-h-[38px] px-3.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:bg-[var(--chatly-bg-elevated)]">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'استيراد ملف صوتي' : 'Import Audio'}</span>
                      <input
                        type="file"
                        accept=".mp3,.wav,.ogg,.m4a,.webm,audio/*"
                        onChange={handlePickAudioFile}
                        className="hidden"
                      />
                    </label>

                    {audioName && (
                      <span className="text-[11px] font-mono text-[var(--chatly-text-muted)] flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{audioName}</span>
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-[var(--chatly-text-secondary)] font-mono">
                        Trim Start: {trimStartMs} ms
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(400, audioDurationMs - 300)}
                        step={50}
                        value={trimStartMs}
                        onChange={(e) => setTrimStartMs(Number(e.target.value))}
                        className="w-full accent-teal-500"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[var(--chatly-text-secondary)] font-mono">
                        Trim End: {trimEndMs} ms
                      </span>
                      <input
                        type="range"
                        min={Math.min(audioDurationMs, trimStartMs + 300)}
                        max={audioDurationMs}
                        step={50}
                        value={trimEndMs}
                        onChange={(e) => setTrimEndMs(Number(e.target.value))}
                        className="w-full accent-teal-500"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[var(--chatly-text-secondary)] font-mono">
                        Sync Offset: {syncOffsetMs} ms
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        step={50}
                        value={syncOffsetMs}
                        onChange={(e) => setSyncOffsetMs(Number(e.target.value))}
                        className="w-full accent-teal-500"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[var(--chatly-text-secondary)] font-mono">
                        Default Volume: {defaultVolume}%
                      </span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={defaultVolume}
                        onChange={(e) => setDefaultVolume(Number(e.target.value))}
                        className="w-full accent-teal-500"
                      />
                    </label>
                  </div>
                </div>
              )}

              {uploadPct !== null && (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[var(--chatly-text-secondary)]">
                    <span>{lang === 'ar' ? 'جاري رفع وسائط الملصق...' : 'Uploading sticker assets...'}</span>
                    <span className="font-mono">{uploadPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--chatly-bg-input)] overflow-hidden">
                    <div
                      style={{ width: `${uploadPct}%` }}
                      className={`h-full transition-all ${palette.primaryBg}`}
                    />
                  </div>
                </div>
              )}

              {creatorError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-300"
                >
                  {creatorError}
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    resetCreatorForm();
                    setTab('all');
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold text-white disabled:opacity-50 shadow-md ${palette.primaryBg} ${palette.primaryHover}`}
                >
                  {saving
                    ? lang === 'ar'
                      ? 'جاري الحفظ...'
                      : 'Saving Sticker...'
                    : editingSticker
                      ? lang === 'ar'
                        ? 'تحديث الملصق'
                        : 'Update Sticker'
                      : lang === 'ar'
                        ? 'حفظ الملصق'
                        : 'Save Sticker'}
                </button>
              </div>
            </form>

            <div className="lg:col-span-2 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--chatly-text-muted)]">
                {lang === 'ar' ? 'معاينة حية (تشغيل يدوي)' : 'Interactive Live Preview'}
              </div>
              <VoiceStickerCard
                sticker={previewSticker}
                lang={lang}
                accentColor={accentColor}
                authorizedAudioUrl={audioPreviewUrl || undefined}
                authorizedVisualUrl={visualPreviewUrl || undefined}
              />
              <p className="text-xs text-[var(--chatly-text-muted)] leading-relaxed">
                {lang === 'ar'
                  ? 'لن يتم حفظ الملصق إلا عند الضغط على زر حفظ الملصق. اضغط تشغيل لمعاينة الصوت والحركة.'
                  : 'Stickers are persisted to Cloud Firestore only when you click Save Sticker. Press Play to test audio and animation.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--chatly-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    lang === 'ar'
                      ? 'ابحث في الملصقات أو التصنيفات...'
                      : 'Search stickers or categories...'
                  }
                  className="w-full min-h-[44px] ps-10 pe-4 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              {onImportPackByCode && (
                <form onSubmit={handleImportSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={importCode}
                    onChange={(e) => setImportCode(e.target.value)}
                    placeholder={lang === 'ar' ? 'رمز استيراد الحزمة (CH-...)' : 'Pack share code (CH-...)'}
                    className="min-h-[44px] px-3.5 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-xs font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!importCode.trim() || importingPack}
                    className={`min-h-[44px] px-4 rounded-2xl text-xs font-semibold text-white disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
                  >
                    {lang === 'ar' ? 'استيراد' : 'Import'}
                  </button>
                </form>
              )}
            </div>

            {filteredPacks.length === 0 ? (
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-10 text-center space-y-3">
                <p className="text-sm text-[var(--chatly-text-secondary)]">
                  {lang === 'ar'
                    ? 'لا توجد ملصقات مطابقة في هذا العرض. أنشئ أول ملصق صوتي أو متحرك الآن!'
                    : 'No stickers in this view yet. Create your first custom sticker in the studio.'}
                </p>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-1.5 ${palette.primaryBg} ${palette.primaryHover}`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'إنشاء ملصق' : 'Create Sticker'}</span>
                </button>
              </div>
            ) : (
              filteredPacks.map((pack) => (
                <section
                  key={pack.id}
                  className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display font-bold text-base text-[var(--chatly-text-primary)]">
                        {lang === 'ar' && pack.titleAr ? pack.titleAr : pack.title}
                      </h3>
                      <div className="text-xs text-[var(--chatly-text-muted)] font-mono">
                        {pack.category} · {pack.shareCode} · {pack.stickers.length}{' '}
                        {lang === 'ar' ? 'ملصقات' : 'stickers'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPackId(pack.id);
                          setTab('create');
                        }}
                        className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إضافة ملصق' : 'Add sticker'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(pack.shareCode).catch(() => {});
                          setCopiedCode(pack.shareCode);
                          window.setTimeout(() => setCopiedCode(null), 1500);
                        }}
                        className="min-h-[34px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-secondary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
                      >
                        {copiedCode === pack.shareCode ? (
                          <Check className="w-3.5 h-3.5 text-teal-500" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {copiedCode === pack.shareCode
                            ? lang === 'ar'
                              ? 'تم النسخ'
                              : 'Copied'
                            : lang === 'ar'
                              ? 'مشاركة الحزمة'
                              : 'Share code'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {pack.stickers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--chatly-border)] p-6 text-center text-xs text-[var(--chatly-text-muted)]">
                      {lang === 'ar'
                        ? 'هذه الحزمة فارغة حالياً. اضغط "إضافة ملصق" لإنشاء ملصقك الأول.'
                        : 'This pack is empty. Click "Add sticker" to create your first custom sticker.'}
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pack.stickers.map((stk) => {
                        const isCached = cachedIds.includes(stk.id);
                        const isOwner = stk.creatorId === currentUserId;
                        return (
                          <div key={stk.id} className="space-y-2">
                            <VoiceStickerCard
                              sticker={stk}
                              lang={lang}
                              accentColor={accentColor}
                              authorizedAudioUrl={
                                stk.audioUrl
                                  ? getAuthorizedMediaUrl(stk.audioUrl, authToken)
                                  : undefined
                              }
                              authorizedVisualUrl={
                                stk.visualUrl
                                  ? getAuthorizedMediaUrl(stk.visualUrl, authToken)
                                  : undefined
                              }
                              onToggleFavorite={onToggleFavorite}
                              onEdit={isOwner && onUpdateSticker ? handleStartEdit : undefined}
                              onDelete={
                                isOwner && onDeleteSticker
                                  ? (id) => {
                                      onDeleteSticker(id);
                                    }
                                  : undefined
                              }
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!hasActiveChat}
                                onClick={() => onSendStickerToChat(stk)}
                                className={`flex-1 min-h-[34px] rounded-xl text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-40 ${palette.primaryBg} ${palette.primaryHover}`}
                              >
                                <Send className="w-3.5 h-3.5 rtl:rotate-180" />
                                <span>{lang === 'ar' ? 'إرسال للمحادثة' : 'Send to Chat'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCacheOffline(stk)}
                                aria-label="Cache sticker offline"
                                className={`min-h-[34px] px-2.5 rounded-xl border text-xs flex items-center gap-1 ${
                                  isCached
                                    ? `${palette.softBg} border-cyan-500/40 ${palette.primaryText}`
                                    : 'border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]'
                                }`}
                              >
                                <DownloadCloud className="w-3.5 h-3.5" />
                                <span>{isCached ? 'Cached' : 'Offline'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
