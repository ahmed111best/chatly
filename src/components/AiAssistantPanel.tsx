import { useState } from 'react';
import {
  MapPin,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { AccentColor, ChatMessage, LanguageCode } from '../core/types';
import {
  polishDraftLocal,
  semanticSearchMessagesLocal,
  suggestRepliesLocal,
  summarizeConversationLocal,
} from '../core/localAi';
import { ACCENT_PALETTES } from '../core/theme';

interface AiAssistantPanelProps {
  messages: ChatMessage[];
  currentDraft: string;
  lang: LanguageCode;
  accentColor: AccentColor;
  isLiveMode: boolean;
  authToken: string | null;
  onInsertReply: (text: string) => void;
  onClose: () => void;
}

export function AiAssistantPanel({
  messages,
  currentDraft,
  lang,
  accentColor,
  onInsertReply,
  onClose,
}: AiAssistantPanelProps) {
  const palette = ACCENT_PALETTES[accentColor];
  const [output, setOutput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [mapsQuery, setMapsQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastMessage = [...messages].reverse().find((m) => !m.deletedAt && m.body.trim().length > 0);
  const localReplies = suggestRepliesLocal(lastMessage, lang);

  const handleLocalSummary = () => {
    setErrorMsg(null);
    setOutput(summarizeConversationLocal(messages, lang));
  };

  const handleLocalPolish = () => {
    setErrorMsg(null);
    if (!currentDraft.trim()) {
      setErrorMsg(
        lang === 'ar'
          ? 'اكتب مسودة أولاً في مربع الرسالة لتحسينها.'
          : 'Write a draft in the message box first to polish it.'
      );
      return;
    }
    const polished = polishDraftLocal(currentDraft, lang);
    onInsertReply(polished);
    setOutput(
      lang === 'ar'
        ? `تم تحسين المسودة محلياً: "${polished}"`
        : `Polished draft locally: "${polished}"`
    );
  };

  const handleSemanticSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchResults(semanticSearchMessagesLocal(messages, searchQuery));
  };

  const handleShareMapsLink = (e: React.FormEvent) => {
    e.preventDefault();
    const q = mapsQuery.trim();
    if (!q) return;
    const url = `https://maps.google.com/?q=${encodeURIComponent(q)}`;
    onInsertReply(`${q} — ${url}`);
    setMapsQuery('');
  };

  return (
    <aside className="w-full sm:w-84 border-s border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] flex flex-col h-full shrink-0">
      <div className="px-4 h-14 border-b border-[var(--chatly-border)] flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--chatly-text-primary)]">
          <Sparkles className={`w-4 h-4 ${palette.primaryText}`} />
          <span>{lang === 'ar' ? 'المساعد الذكي المحلي' : 'Smart Thread Tools'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chatly-text-muted)] hover:bg-[var(--chatly-bg-elevated)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <div className="space-y-2">
          <div className="font-semibold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'معالجة محلية على جهازك' : 'On-device private helpers'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLocalSummary}
              className="min-h-[38px] px-3 py-2 rounded-xl border border-[var(--chatly-border)] hover:bg-[var(--chatly-bg-elevated)] font-medium text-[var(--chatly-text-primary)]"
            >
              {lang === 'ar' ? 'تلخيص المحادثة' : 'Summarize chat'}
            </button>
            <button
              type="button"
              onClick={handleLocalPolish}
              className="min-h-[38px] px-3 py-2 rounded-xl border border-[var(--chatly-border)] hover:bg-[var(--chatly-bg-elevated)] font-medium text-[var(--chatly-text-primary)] flex items-center justify-center gap-1"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تحسين المسودة' : 'Polish draft'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'اقتراحات رد سريعة' : 'Suggested quick replies'}
          </div>
          <div className="space-y-1.5">
            {localReplies.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onInsertReply(reply)}
                className="w-full text-start px-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] hover:bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)]"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSemanticSearch} className="space-y-2">
          <div className="font-semibold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'بحث ذكي في المحادثة' : 'Search inside thread'}
          </div>
          <div className="flex gap-1.5">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'كلمات مفتاحية...' : 'Keywords in thread...'}
              className="flex-1 min-h-[36px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
            />
            <button
              type="submit"
              aria-label="Run semantic search"
              className={`min-h-[36px] px-3 rounded-xl text-white ${palette.primaryBg}`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {searchResults.map((m) => (
                <div
                  key={m.id}
                  className="p-2 rounded-lg bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)]"
                >
                  <div className="font-semibold text-[var(--chatly-text-primary)]">
                    {m.senderDisplayName}
                  </div>
                  <div className="text-[var(--chatly-text-secondary)] truncate">{m.body}</div>
                </div>
              ))}
            </div>
          )}
        </form>

        <form onSubmit={handleShareMapsLink} className="space-y-2">
          <div className="font-semibold text-[var(--chatly-text-primary)]">
            {lang === 'ar' ? 'مشاركة رابط مكان' : 'Share a place link'}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={mapsQuery}
              onChange={(e) => setMapsQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'اسم المكان أو العنوان...' : 'Place name or address...'}
              className="flex-1 min-h-[36px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)]"
            />
            <button
              type="submit"
              disabled={!mapsQuery.trim()}
              aria-label="Insert place link"
              className={`min-h-[36px] px-3 rounded-xl text-white disabled:opacity-50 ${palette.primaryBg}`}
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {output && (
          <div className="p-3 rounded-xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] whitespace-pre-wrap text-[var(--chatly-text-primary)] leading-relaxed">
            {output}
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/30">
            {errorMsg}
          </div>
        )}
      </div>
    </aside>
  );
}
