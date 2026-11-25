import { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Film,
  HardDrive,
  Image as ImageIcon,
  Music,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AccentColor,
  LanguageCode,
  MediaInventoryItem,
  MediaQualityPreset,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import {
  formatBytes,
  formatLocalizedDate,
  formatLocalizedNumber,
  TRANSLATIONS,
} from '../core/localization';
import { computeStorageSummary } from '../core/features';
import { downloadMediaWithProgress, getAuthorizedMediaUrl } from '../services/api';

interface MediaManagerViewProps {
  items: MediaInventoryItem[];
  authToken: string | null;
  uploadQuality: MediaQualityPreset;
  loading: boolean;
  lang: LanguageCode;
  accentColor: AccentColor;
  onChangeUploadQuality: (preset: MediaQualityPreset) => void;
  onClearLocalCache: () => void;
}

export function MediaManagerView({
  items,
  authToken,
  uploadQuality,
  loading,
  lang,
  accentColor,
  onChangeUploadQuality,
  onClearLocalCache,
}: MediaManagerViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [category, setCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'largest'>('newest');
  const [downloadPct, setDownloadPct] = useState<Record<string, number>>({});
  const [cacheNotice, setCacheNotice] = useState(false);

  const summary = useMemo(() => computeStorageSummary(items), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (category !== 'all' && item.kind !== category) return false;
        if (q && !item.fileName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'largest') return b.sizeBytes - a.sizeBytes;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [items, category, search, sortBy]);

  const handleDownload = async (item: MediaInventoryItem) => {
    if (!item.url) return;
    try {
      setDownloadPct((prev) => ({ ...prev, [item.id]: 1 }));
      const blob = await downloadMediaWithProgress(item.url, authToken, (pct) => {
        setDownloadPct((prev) => ({ ...prev, [item.id]: pct }));
      });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = item.fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      window.setTimeout(() => {
        setDownloadPct((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }, 1200);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <HardDrive className={`w-6 h-6 ${palette.primaryText}`} />
              <span>{t.mediaManagerTitle}</span>
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)]">{t.mediaManagerSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              onClearLocalCache();
              setCacheNotice(true);
              window.setTimeout(() => setCacheNotice(false), 3000);
            }}
            className="min-h-[40px] px-4 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs font-semibold text-rose-500 flex items-center gap-1.5 hover:bg-rose-500/10"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t.clearLocalCacheBtn}</span>
          </button>
        </div>

        {cacheNotice && (
          <div
            role="status"
            className="p-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 text-xs text-teal-700 dark:text-teal-200"
          >
            {t.cacheClearedToast}
          </div>
        )}

        {/* Storage Usage Breakdown & Upload Quality */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-3 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--chatly-text-secondary)]">
                {lang === 'ar' ? 'إجمالي التخزين المستخدم' : 'Total Media Footprint'}
              </span>
              <span className="font-mono text-sm font-bold text-[var(--chatly-text-primary)]">
                {formatBytes(summary.totalBytes)} ({formatLocalizedNumber(items.length, lang)})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(
                [
                  ['image', ImageIcon, lang === 'ar' ? 'صور' : 'Images'],
                  ['video', Film, lang === 'ar' ? 'فيديو' : 'Videos'],
                  ['audio', Music, lang === 'ar' ? 'صوتيات' : 'Audio'],
                  ['document', FileText, lang === 'ar' ? 'مستندات' : 'Docs'],
                ] as const
              ).map(([kind, Icon, label]) => (
                <div
                  key={kind}
                  className="p-2.5 rounded-2xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)]"
                >
                  <div className="flex items-center gap-1.5 text-[var(--chatly-text-muted)]">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </div>
                  <div className="mt-1 font-mono font-semibold text-[var(--chatly-text-primary)]">
                    {formatBytes(summary.byKind[kind].bytes)}
                  </div>
                  <div className="text-[11px] text-[var(--chatly-text-muted)]">
                    {formatLocalizedNumber(summary.byKind[kind].count, lang)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-4 space-y-2.5">
            <label
              htmlFor="media-upload-quality"
              className="block text-xs font-semibold text-[var(--chatly-text-secondary)]"
            >
              {t.uploadQualityLabel}
            </label>
            <select
              id="media-upload-quality"
              value={uploadQuality}
              onChange={(e) => onChangeUploadQuality(e.target.value as MediaQualityPreset)}
              className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)]"
            >
              <option value="original">{lang === 'ar' ? 'أصلية (بدون ضغط)' : 'Original (Uncompressed)'}</option>
              <option value="balanced">{lang === 'ar' ? 'متوازنة (جودة عالية)' : 'Balanced (Smart Optimization)'}</option>
              <option value="compact">{lang === 'ar' ? 'موفرة للبيانات' : 'Compact (Data Saver)'}</option>
            </select>
            <p className="text-[11px] text-[var(--chatly-text-muted)]">
              {lang === 'ar'
                ? 'ينطبق هذا الخيار على الصور المرفوعة لاحقاً عبر متصفحك.'
                : 'Applies to subsequent image uploads to balance clarity and bandwidth.'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'image', 'video', 'audio', 'document'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setCategory(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ${
                  category === tab
                    ? `${palette.primaryBg} text-white`
                    : 'bg-[var(--chatly-bg-surface)] border border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-[var(--chatly-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث في الملفات...' : 'Search files...'}
                className="w-full min-h-[38px] ps-9 pe-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-xs"
              />
            </div>
            <select
              aria-label="Sort media"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'largest')}
              className="min-h-[38px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-[var(--chatly-text-primary)] text-xs"
            >
              <option value="newest">{lang === 'ar' ? 'الأحدث' : 'Newest'}</option>
              <option value="largest">{lang === 'ar' ? 'الأكبر حجماً' : 'Largest'}</option>
            </select>
          </div>
        </div>

        {/* Inventory */}
        {loading && items.length === 0 ? (
          <div className="h-36 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-10 text-center text-sm text-[var(--chatly-text-muted)]">
            {lang === 'ar' ? 'لا توجد ملفات مطابقة.' : 'No media items match this filter.'}
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
            {filtered.map((item) => {
              const pct = downloadPct[item.id];
              const authorizedUrl = getAuthorizedMediaUrl(item.url, authToken);
              return (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.kind === 'image' && authorizedUrl ? (
                      <img
                        src={authorizedUrl}
                        alt={item.fileName}
                        className="w-11 h-11 rounded-xl object-cover border border-[var(--chatly-border)] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-[var(--chatly-bg-input)] flex items-center justify-center text-[var(--chatly-text-muted)] shrink-0">
                        {item.kind === 'video' ? (
                          <Film className="w-5 h-5" />
                        ) : item.kind === 'audio' ? (
                          <Music className="w-5 h-5" />
                        ) : (
                          <FileText className="w-5 h-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--chatly-text-primary)] truncate">
                        {item.fileName}
                      </div>
                      <div className="text-xs font-mono text-[var(--chatly-text-muted)] flex items-center gap-2">
                        <span className="uppercase">{item.kind}</span>
                        <span>·</span>
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>·</span>
                        <span>{formatLocalizedDate(item.createdAt, lang)}</span>
                      </div>
                    </div>
                  </div>

                  {item.url && (
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)] shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{pct !== undefined ? `${pct}%` : lang === 'ar' ? 'تنزيل' : 'Download'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
