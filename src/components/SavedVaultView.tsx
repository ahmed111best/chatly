import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import type { AccentColor, LanguageCode, SavedNoteItem } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedDate, TRANSLATIONS } from '../core/localization';

interface SavedVaultViewProps {
  notes: SavedNoteItem[];
  lang: LanguageCode;
  accentColor: AccentColor;
  onAddNote: (input: { category: 'note' | 'link' | 'snippet'; title: string; content: string }) => void;
  onDeleteNote: (id: number) => void;
}

export function SavedVaultView({
  notes,
  lang,
  accentColor,
  onAddNote,
  onDeleteNote,
}: SavedVaultViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [category, setCategory] = useState<'note' | 'link' | 'snippet'>('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onAddNote({ category, title: title.trim(), content: content.trim() });
    setTitle('');
    setContent('');
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-6 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
            {t.savedVaultTitle}
          </h2>
          <p className="text-sm text-[var(--chatly-text-secondary)]">{t.savedVaultSubtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label htmlFor="saved-note-title" className="sr-only">
                {t.addNoteTitlePlaceholder}
              </label>
              <input
                id="saved-note-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.addNoteTitlePlaceholder}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>

            <div>
              <label htmlFor="saved-note-cat" className="sr-only">
                Category
              </label>
              <select
                id="saved-note-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as 'note' | 'link' | 'snippet')}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                <option value="note">{lang === 'ar' ? 'ملاحظة' : 'Note'}</option>
                <option value="link">{lang === 'ar' ? 'رابط' : 'Link'}</option>
                <option value="snippet">{lang === 'ar' ? 'مقتطف' : 'Snippet'}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="saved-note-content" className="sr-only">
              {t.addNoteContentPlaceholder}
            </label>
            <textarea
              id="saved-note-content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.addNoteContentPlaceholder}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!title.trim() || !content.trim()}
              className={`min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${palette.primaryBg} ${palette.primaryHover}`}
            >
              {t.saveNoteBtn}
            </button>
          </div>
        </form>

        <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] divide-y divide-[var(--chatly-border)]">
          {notes.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--chatly-text-muted)]">
              <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-60" />
              <p>
                {lang === 'ar'
                  ? 'لا توجد ملاحظات محفوظة بعد.'
                  : 'No saved notes yet.'}
              </p>
            </div>
          ) : (
            notes.map((item) => (
              <div key={item.id} className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[var(--chatly-text-muted)]">
                    <span className="capitalize font-medium">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatLocalizedDate(item.createdAt, lang)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-[var(--chatly-text-primary)]">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--chatly-text-secondary)] whitespace-pre-wrap break-words">
                    {item.content}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteNote(item.id)}
                  aria-label={`${t.deleteNoteBtn} '${item.title}'`}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--chatly-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
