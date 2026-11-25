import { useState } from 'react';
import { Archive, BellOff, Flag, MoreVertical, Pin, Plus, Search, Star, Tag } from 'lucide-react';
import type {
  AccentColor,
  ConversationSummary,
  LanguageCode,
  SmartFolder,
  StoryItem,
  UserProfile,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedNumber, formatLocalizedTime, TRANSLATIONS } from '../core/localization';
import { ChatlyAvatar } from './ChatlyAvatar';

interface ConversationListPaneProps {
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  currentUser?: UserProfile;
  stories?: StoryItem[];
  typingByConv?: Record<number, boolean>;
  searchQuery: string;
  activeFolder: SmartFolder;
  lang: LanguageCode;
  accentColor: AccentColor;
  onSearchChange: (q: string) => void;
  onFolderChange: (folder: SmartFolder) => void;
  onSelectConversation: (id: number) => void;
  onNewChat?: () => void;
  onOpenStories?: () => void;
  onUpdateConversationMeta?: (
    conversationId: number,
    patch: {
      pinned?: boolean;
      needsFollowUp?: boolean;
      archived?: boolean;
      snoozedUntil?: string | null;
      customLabel?: string;
      folder?: SmartFolder;
    }
  ) => void;
}

export function ConversationListPane({
  conversations,
  activeConversationId,
  currentUser,
  stories = [],
  typingByConv,
  searchQuery,
  activeFolder,
  lang,
  accentColor,
  onSearchChange,
  onFolderChange,
  onSelectConversation,
  onNewChat,
  onOpenStories,
  onUpdateConversationMeta,
}: ConversationListPaneProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const folders: { id: SmartFolder; label: string }[] = [
    { id: 'all', label: t.folderAll },
    { id: 'unread', label: t.folderUnread },
    { id: 'favorites', label: t.folderFavorites },
    { id: 'work', label: t.folderWork },
    { id: 'family', label: t.folderFamily },
    { id: 'followup', label: t.folderFollowup },
    { id: 'archived', label: t.folderArchived },
  ];

  const filtered = conversations.filter((conv) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      conv.title.toLowerCase().includes(q) ||
      (conv.peer?.username.toLowerCase().includes(q) ?? false) ||
      (conv.customLabel?.toLowerCase().includes(q) ?? false) ||
      conv.lastMessagePreview.toLowerCase().includes(q);

    if (!matchesQuery) return false;
    if (activeFolder === 'archived') return Boolean(conv.archived);
    if (conv.archived) return false;
    if (activeFolder === 'all') return true;
    if (activeFolder === 'unread') return conv.unreadCount > 0;
    if (activeFolder === 'favorites') {
      return conv.folder === 'favorites' || Boolean(conv.peer?.isFavorite);
    }
    if (activeFolder === 'followup') return conv.needsFollowUp || conv.folder === 'followup';
    return conv.folder === activeFolder;
  });

  return (
    <div className="flex flex-col h-full bg-[var(--chatly-bg-surface)] border-e border-[var(--chatly-border)]">
      <div className="p-4 border-b border-[var(--chatly-border)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {currentUser && (
              <div className="relative shrink-0 lg:hidden">
                <ChatlyAvatar src={currentUser.avatarUrl} name={currentUser.displayName} size="sm" />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--chatly-bg-surface)]"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-base font-bold text-[var(--chatly-text-primary)] truncate">
                {t.navChats}
              </h1>
              <p className="text-[11px] tabular-nums text-[var(--chatly-text-muted)] truncate">
                {formatLocalizedNumber(filtered.length, lang)}{' '}
                {lang === 'ar' ? 'محادثة' : 'conversations'}
              </p>
            </div>
          </div>

          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className={`lg:hidden min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all shadow-sm ${palette.primaryBg} ${palette.primaryHover}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.newChatBtn}</span>
            </button>
          )}
        </div>

        <div className="relative">
          <Search
            className="w-4 h-4 text-[var(--chatly-text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.searchChatsPlaceholder}
            aria-label={t.searchChatsPlaceholder}
            className="w-full min-h-[40px] ps-9 pe-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>

        {/* Mobile / Compact Stories Quick Strip */}
        {onOpenStories && (
          <div className="flex lg:hidden items-center gap-3 overflow-x-auto no-scrollbar pt-1">
            {currentUser && (
              <button
                type="button"
                onClick={onOpenStories}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div className="p-0.5 rounded-full border-2 border-dashed border-teal-500/70">
                  <ChatlyAvatar src={currentUser.avatarUrl} name={currentUser.displayName} size="sm" />
                </div>
                <span className="text-[10px] font-medium text-[var(--chatly-text-secondary)] max-w-[52px] truncate">
                  {lang === 'ar' ? 'قصتي' : 'My Story'}
                </span>
              </button>
            )}
            {stories.slice(0, 5).map((story) => (
              <button
                key={story.id}
                type="button"
                onClick={onOpenStories}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  className={`p-0.5 rounded-full border-2 ${
                    story.viewedByMe ? 'border-slate-500/40' : 'border-teal-400'
                  }`}
                >
                  <ChatlyAvatar src={story.avatarUrl} name={story.displayName} size="sm" />
                </div>
                <span className="text-[10px] font-medium text-[var(--chatly-text-secondary)] max-w-[52px] truncate">
                  {story.displayName.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          role="tablist"
          aria-label="Smart folders"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)]"
        >
          {folders.map((folder) => {
            const active = activeFolder === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFolderChange(folder.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[var(--chatly-bg-elevated)] text-[var(--chatly-text-primary)] shadow-2xs ring-1 ring-teal-500/25'
                    : 'text-[var(--chatly-text-secondary)] hover:text-[var(--chatly-text-primary)]'
                }`}
              >
                {folder.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-[var(--chatly-text-secondary)]">{t.emptySearch}</p>
            {onNewChat && (
              <button
                type="button"
                onClick={onNewChat}
                className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-medium text-white ${palette.primaryBg} ${palette.primaryHover}`}
              >
                {t.newChatBtn}
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isSnoozed = Boolean(
              conv.snoozedUntil && new Date(conv.snoozedUntil).getTime() > Date.now()
            );
            const isTyping = Boolean(typingByConv?.[conv.id]);
            const isOnline = Boolean(conv.peer?.online);

            return (
              <div key={conv.id} className="relative px-2">
                <div
                  className={`flex items-start gap-2.5 px-3 py-3 rounded-2xl transition-colors min-h-[68px] ${
                    isActive
                      ? 'bg-teal-500/12 dark:bg-teal-500/15 ring-1 ring-teal-500/35'
                      : 'hover:bg-[var(--chatly-bg-elevated)]/65'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className="flex-1 min-w-0 flex items-start gap-3 text-start"
                  >
                    <div className="relative shrink-0">
                      <ChatlyAvatar src={conv.peer?.avatarUrl} name={conv.title} size="md" />
                      {isOnline && (
                        <span
                          title={t.onlineLabel}
                          aria-label={t.onlineLabel}
                          className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--chatly-bg-surface)]"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[var(--chatly-text-primary)] truncate">
                          {conv.title}
                        </span>
                        <span className="text-[11px] tabular-nums text-[var(--chatly-text-muted)] shrink-0">
                          {formatLocalizedTime(conv.lastMessageAt, lang)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[var(--chatly-text-secondary)] truncate flex-1">
                          {isTyping ? (
                            <span className={`font-medium ${palette.primaryText}`}>
                              {t.typingLabel}
                            </span>
                          ) : conv.draftBody ? (
                            <span className="text-rose-600 dark:text-rose-400 font-medium">
                              {lang === 'ar' ? 'مسودة: ' : 'Draft: '}
                              {conv.draftBody}
                            </span>
                          ) : (
                            conv.lastMessagePreview || `@${conv.peer?.username || 'chat'}`
                          )}
                        </p>

                        {conv.unreadCount > 0 && (
                          <span
                            className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums text-white flex items-center justify-center shrink-0 ${palette.primaryBg}`}
                          >
                            {formatLocalizedNumber(conv.unreadCount, lang)}
                          </span>
                        )}
                      </div>

                      {(conv.pinned ||
                        conv.needsFollowUp ||
                        conv.customLabel ||
                        conv.folder === 'favorites' ||
                        conv.peer?.isFavorite ||
                        isSnoozed) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--chatly-text-muted)]">
                          {conv.pinned && (
                            <span className="inline-flex items-center gap-1">
                              <Pin className="w-3 h-3" />
                              <span>{t.pinnedLabel}</span>
                            </span>
                          )}
                          {(conv.folder === 'favorites' || conv.peer?.isFavorite) && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              {conv.pinned && <span aria-hidden="true">·</span>}
                              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                              <span>{t.folderFavorites}</span>
                            </span>
                          )}
                          {conv.needsFollowUp && (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              · {t.followUpBadge}
                            </span>
                          )}
                          {conv.customLabel && (
                            <span className="text-[var(--chatly-text-secondary)]">
                              · {conv.customLabel}
                            </span>
                          )}
                          {isSnoozed && (
                            <span className="inline-flex items-center gap-1">
                              · <BellOff className="w-3 h-3" />
                              <span>{lang === 'ar' ? 'مكتوم' : 'Muted'}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  {onUpdateConversationMeta && (
                    <button
                      type="button"
                      onClick={() =>
                        setMenuOpenId((prev) => (prev === conv.id ? null : conv.id))
                      }
                      aria-label={`Manage ${conv.title}`}
                      className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)] shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {menuOpenId === conv.id && onUpdateConversationMeta && (
                  <div className="absolute end-3 top-12 z-20 w-48 rounded-xl border border-[var(--chatly-border-strong)] bg-[var(--chatly-bg-surface)] py-1.5 shadow-xl text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, { pinned: !conv.pinned });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>{conv.pinned ? t.unpinAction : t.pinAction}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, {
                          folder: conv.folder === 'favorites' ? 'all' : 'favorites',
                        });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Star className="w-3.5 h-3.5" />
                      <span>
                        {conv.folder === 'favorites'
                          ? lang === 'ar'
                            ? 'إزالة من المفضلة'
                            : 'Remove favorite'
                          : t.folderFavorites}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, {
                          needsFollowUp: !conv.needsFollowUp,
                          folder: !conv.needsFollowUp ? 'followup' : 'all',
                        });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>{t.followUpBadge}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, {
                          folder: conv.folder === 'work' ? 'family' : 'work',
                        });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'ar'
                          ? `نقل إلى ${conv.folder === 'work' ? t.folderFamily : t.folderWork}`
                          : `Move to ${conv.folder === 'work' ? t.folderFamily : t.folderWork}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, {
                          snoozedUntil: isSnoozed
                            ? null
                            : new Date(Date.now() + 3600_000).toISOString(),
                        });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      <span>
                        {isSnoozed
                          ? lang === 'ar'
                            ? 'إلغاء كتم الإشعارات'
                            : 'Unmute'
                          : lang === 'ar'
                            ? 'كتم ساعة'
                            : 'Mute 1h'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConversationMeta(conv.id, { archived: !conv.archived });
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>
                        {conv.archived
                          ? lang === 'ar'
                            ? 'إلغاء الأرشفة'
                            : 'Unarchive'
                          : lang === 'ar'
                            ? 'أرشفة'
                            : 'Archive'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
