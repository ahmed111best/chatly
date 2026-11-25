import { useState } from 'react';
import { Eye, Plus, Upload, X } from 'lucide-react';
import type { AccentColor, LanguageCode, StoryItem } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedTime } from '../core/localization';
import { getAuthorizedMediaUrl } from '../services/api';
import { ChatlyAvatar } from './ChatlyAvatar';

interface StoriesViewProps {
  stories: StoryItem[];
  lang: LanguageCode;
  accentColor: AccentColor;
  authToken: string | null;
  onCreateStory: (payload: {
    kind: 'text' | 'image' | 'video';
    textContent: string;
    backgroundHex: string;
    mediaFile?: Blob | null;
    mediaFileName?: string;
    mediaMimeType?: string;
    audience: 'everyone' | 'contacts';
    expiresInHours: number;
  }) => Promise<void>;
  onViewStory: (storyId: number) => void;
  onReactStory: (storyId: number, emoji: string) => void;
}

const STORY_COLORS = ['#0D9488', '#4F46E5', '#D97706', '#E11D48', '#1E293B'];

export function StoriesView({
  stories,
  lang,
  accentColor,
  authToken,
  onCreateStory,
  onViewStory,
  onReactStory,
}: StoriesViewProps) {
  const palette = ACCENT_PALETTES[accentColor];
  const [textContent, setTextContent] = useState('');
  const [backgroundHex, setBackgroundHex] = useState(STORY_COLORS[0]);
  const [audience, setAudience] = useState<'everyone' | 'contacts'>('contacts');
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);

  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim() && !mediaFile) return;
    setPosting(true);
    try {
      const kind: 'text' | 'image' | 'video' = mediaFile
        ? mediaFile.type.startsWith('video/')
          ? 'video'
          : 'image'
        : 'text';
      await onCreateStory({
        kind,
        textContent: textContent.trim(),
        backgroundHex,
        mediaFile,
        mediaFileName: mediaFile?.name,
        mediaMimeType: mediaFile?.type,
        audience,
        expiresInHours,
      });
      setTextContent('');
      setMediaFile(null);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-6 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'القصص والحالات' : 'Stories & Status'}
          </h2>
          <p className="text-sm text-[var(--chatly-text-secondary)]">
            {lang === 'ar'
              ? 'شارك تحديثات نصية أو صوراً أو فيديو مؤقتاً مع تحكم كامل في الجمهور ومدة الصلاحية.'
              : 'Share expiring text, image, or video updates with audience visibility and reaction tracking.'}
          </p>
        </div>

        <form
          onSubmit={handlePost}
          className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4 shadow-sm"
        >
          <textarea
            rows={2}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder={
              lang === 'ar' ? 'اكتب تحديث حالة أو قصة جديدة...' : 'Share a status update or story...'
            }
            className="w-full px-3.5 py-2.5 rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {STORY_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setBackgroundHex(hex)}
                  aria-label={`Select color ${hex}`}
                  style={{ backgroundColor: hex }}
                  className={`w-6 h-6 rounded-full ${
                    backgroundHex === hex ? 'ring-2 ring-offset-2 ring-cyan-400' : ''
                  }`}
                />
              ))}

              <label className="ms-2 min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-[var(--chatly-text-primary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:bg-[var(--chatly-bg-elevated)]">
                <Upload className="w-3.5 h-3.5" />
                <span>{mediaFile ? mediaFile.name : lang === 'ar' ? 'صورة / فيديو' : 'Image / Video'}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as 'everyone' | 'contacts')}
                className="min-h-[36px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              >
                <option value="contacts">{lang === 'ar' ? 'جهات الاتصال' : 'Contacts'}</option>
                <option value="everyone">{lang === 'ar' ? 'الجميع' : 'Everyone'}</option>
              </select>

              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
                className="min-h-[36px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
              >
                <option value={6}>6h</option>
                <option value={12}>12h</option>
                <option value={24}>24h</option>
                <option value={48}>48h</option>
              </select>

              <button
                type="submit"
                disabled={posting || (!textContent.trim() && !mediaFile)}
                className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
              >
                <Plus className="w-4 h-4" />
                <span>{lang === 'ar' ? 'نشر القصة' : 'Post Story'}</span>
              </button>
            </div>
          </div>
        </form>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => {
                setActiveStory(story);
                onViewStory(story.id);
              }}
              className="text-start rounded-3xl overflow-hidden border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] hover:shadow-md transition-all"
            >
              <div
                style={{ backgroundColor: story.backgroundHex }}
                className="h-44 p-4 flex items-center justify-center text-white relative overflow-hidden"
              >
                {story.mediaUrl && story.kind === 'image' ? (
                  <img
                    src={getAuthorizedMediaUrl(story.mediaUrl, authToken)}
                    alt={story.displayName}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <p className="text-sm font-medium text-center line-clamp-4">{story.textContent}</p>
                )}
              </div>
              <div className="p-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ChatlyAvatar src={story.avatarUrl} name={story.displayName} size="sm" />
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-[var(--chatly-text-primary)] truncate">
                      {story.displayName}
                    </div>
                    <div className="text-[11px] text-[var(--chatly-text-muted)] font-mono">
                      {formatLocalizedTime(story.createdAt, lang)} · {story.audience}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-[var(--chatly-text-muted)] flex items-center gap-1 font-mono">
                  <Eye className="w-3.5 h-3.5" />
                  {story.viewCount}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Interactive Story Viewer Modal */}
        {activeStory && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl overflow-hidden bg-[#0B1B2B] text-white border border-[var(--chatly-border)] shadow-2xl">
              <div className="p-4 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <ChatlyAvatar src={activeStory.avatarUrl} name={activeStory.displayName} size="sm" />
                  <div>
                    <div className="text-sm font-semibold">{activeStory.displayName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      @{activeStory.username} · {formatLocalizedTime(activeStory.createdAt, lang)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStory(null)}
                  aria-label="Close story viewer"
                  className="p-1.5 rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                style={{ backgroundColor: activeStory.backgroundHex }}
                className="min-h-[280px] p-6 flex flex-col items-center justify-center text-center"
              >
                {activeStory.mediaUrl && activeStory.kind === 'image' && (
                  <img
                    src={getAuthorizedMediaUrl(activeStory.mediaUrl, authToken)}
                    alt={activeStory.displayName}
                    className="max-h-72 rounded-xl object-contain mb-3"
                  />
                )}
                {activeStory.mediaUrl && activeStory.kind === 'video' && (
                  <video
                    src={getAuthorizedMediaUrl(activeStory.mediaUrl, authToken)}
                    controls
                    className="max-h-72 rounded-xl mb-3"
                  />
                )}
                {activeStory.textContent && (
                  <p className="text-base font-medium leading-relaxed">{activeStory.textContent}</p>
                )}
              </div>

              <div className="p-4 flex items-center justify-between gap-2 bg-[#06111C]">
                <div className="flex items-center gap-1.5">
                  {['❤️', '🔥', '👏', '😮'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onReactStory(activeStory.id, emoji)}
                      className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {activeStory.viewCount} {lang === 'ar' ? 'مشاهدة' : 'views'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
