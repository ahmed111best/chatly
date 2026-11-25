import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Copy,
  Eye,
  KeyRound,
  Megaphone,
  Pin,
  Plus,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  AccentColor,
  ChannelMemberItem,
  ChannelPostItem,
  ChannelRole,
  ChannelSummary,
  LanguageCode,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
  TRANSLATIONS,
} from '../core/localization';
import { validateChannelInput } from '../core/features';
import { ChatlyAvatar } from './ChatlyAvatar';

interface ChannelsViewProps {
  channels: ChannelSummary[];
  selectedChannelId: number | null;
  posts: ChannelPostItem[];
  members: ChannelMemberItem[];
  loading: boolean;
  lang: LanguageCode;
  accentColor: AccentColor;
  onSelectChannel: (channelId: number) => void;
  onCreateChannel: (payload: {
    title: string;
    handle: string;
    description: string;
    isPublic: boolean;
  }) => Promise<void> | void;
  onJoinByCode: (inviteCode: string) => Promise<void> | void;
  onToggleSubscribe: (channelId: number) => Promise<void> | void;
  onPublishPost: (channelId: number, body: string, pinned: boolean) => Promise<void> | void;
  onTogglePinPost: (channelId: number, postId: number) => Promise<void> | void;
  onReactPost: (channelId: number, postId: number, emoji: string) => Promise<void> | void;
  onIncrementView: (channelId: number, postId: number) => void;
  onUpdateMemberRole: (
    channelId: number,
    targetUserId: number,
    role: Exclude<ChannelRole, 'owner'>
  ) => Promise<void> | void;
}

const POST_EMOJIS = ['👍', '❤️', '🚀', '🔥', '👏', '🔒'];

export function ChannelsView({
  channels,
  selectedChannelId,
  posts,
  members,
  loading,
  lang,
  accentColor,
  onSelectChannel,
  onCreateChannel,
  onJoinByCode,
  onToggleSubscribe,
  onPublishPost,
  onTogglePinPost,
  onReactPost,
  onIncrementView,
  onUpdateMemberRole,
}: ChannelsViewProps) {
  const t = TRANSLATIONS[lang];
  const palette = ACCENT_PALETTES[accentColor];

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [postBody, setPostBody] = useState('');
  const [pinNewPost, setPinNewPost] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'members'>('feed');

  const selected = channels.find((c) => c.id === selectedChannelId) ?? channels[0] ?? null;
  const canBroadcast =
    selected?.myRole === 'owner' ||
    selected?.myRole === 'admin' ||
    selected?.myRole === 'moderator';
  const canManageRoles = selected?.myRole === 'owner' || selected?.myRole === 'admin';

  useEffect(() => {
    if (selected && posts.length > 0) {
      onIncrementView(selected.id, posts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateChannelInput({ title, handle, description });
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    await onCreateChannel({
      title: title.trim(),
      handle: handle.trim().replace(/^@+/, '').toLowerCase(),
      description: description.trim(),
      isPublic,
    });
    setTitle('');
    setHandle('');
    setDescription('');
    setShowCreate(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)] flex items-center gap-2">
              <Radio className={`w-6 h-6 ${palette.primaryText}`} />
              <span>{t.channelsTitle}</span>
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)]">{t.channelsSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm ${palette.primaryBg} ${palette.primaryHover}`}
          >
            <Plus className="w-4 h-4" />
            <span>{t.createChannelBtn}</span>
          </button>
        </div>

        {/* Join by invite code */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!inviteCode.trim()) return;
            await onJoinByCode(inviteCode.trim());
            setInviteCode('');
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative flex-1 min-w-[220px]">
            <KeyRound className="w-4 h-4 text-[var(--chatly-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={t.joinByCodePlaceholder}
              className="w-full min-h-[42px] ps-10 pe-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-sm text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[42px] px-4 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-xs font-semibold text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
          >
            {t.joinChannelBtn}
          </button>
        </form>

        {showCreate && (
          <form
            onSubmit={handleCreateSubmit}
            className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4 shadow-sm"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {t.channelTitleLabel}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={lang === 'ar' ? 'أخبار التطوير' : 'Product Dispatch'}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {t.channelHandleLabel}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="product_updates"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                {t.channelDescLabel}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--chatly-text-secondary)]">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-[var(--chatly-border)]"
              />
              <span>{t.channelPublicLabel}</span>
            </label>
            {formError && <p className="text-xs text-rose-500">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3.5 py-2 rounded-xl border border-[var(--chatly-border)] text-xs text-[var(--chatly-text-secondary)]"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${palette.primaryBg}`}
              >
                {t.createChannelBtn}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Channel list */}
          <div className="lg:col-span-4 space-y-2.5">
            {loading && channels.length === 0 ? (
              <div className="h-32 rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] animate-pulse" />
            ) : channels.length === 0 ? (
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 text-center text-xs text-[var(--chatly-text-muted)]">
                {lang === 'ar' ? 'لا توجد قنوات بعد.' : 'No channels yet. Create one to start broadcasting.'}
              </div>
            ) : (
              channels.map((ch) => {
                const isActive = selected?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className={`w-full text-start p-4 rounded-2xl border transition-colors ${
                      isActive
                        ? `border-cyan-500/60 bg-[var(--chatly-bg-surface)] ring-1 ring-cyan-500/30`
                        : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] hover:bg-[var(--chatly-bg-elevated)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[var(--chatly-text-primary)] truncate">
                            {ch.title}
                          </span>
                          {ch.verified && (
                            <BadgeCheck className={`w-4 h-4 shrink-0 ${palette.primaryText}`} />
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--chatly-text-muted)]">
                          @{ch.handle}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--chatly-text-muted)] shrink-0">
                        {formatLocalizedNumber(ch.subscriberCount, lang)}
                      </span>
                    </div>
                    {ch.description && (
                      <p className="mt-1.5 text-xs text-[var(--chatly-text-secondary)] line-clamp-2">
                        {ch.description}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Channel feed / details */}
          <div className="lg:col-span-8">
            {!selected ? (
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-10 text-center text-sm text-[var(--chatly-text-muted)]">
                {lang === 'ar' ? 'اختر قناة لعرض البث.' : 'Select a channel to view broadcasts.'}
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] overflow-hidden">
                <div className="p-5 border-b border-[var(--chatly-border)] flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-lg text-[var(--chatly-text-primary)] truncate">
                        {selected.title}
                      </h3>
                      {selected.verified && (
                        <BadgeCheck className={`w-4 h-4 ${palette.primaryText}`} />
                      )}
                      {selected.myRole && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--chatly-bg-input)] text-[var(--chatly-text-secondary)] uppercase">
                          {selected.myRole}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--chatly-text-muted)]">
                      @{selected.handle} · {formatLocalizedNumber(selected.subscriberCount, lang)}{' '}
                      {t.subscribersLabel} · Invite: <code className="font-mono">{selected.inviteCode}</code>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selected.inviteCode).catch(() => {});
                        setCopiedCode(true);
                        window.setTimeout(() => setCopiedCode(false), 1800);
                      }}
                      className="min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] text-xs font-medium text-[var(--chatly-text-primary)] flex items-center gap-1.5 hover:bg-[var(--chatly-bg-elevated)]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedCode ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : selected.inviteCode}</span>
                    </button>
                    {selected.myRole !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => onToggleSubscribe(selected.id)}
                        className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold ${
                          selected.joined
                            ? 'border border-[var(--chatly-border)] text-[var(--chatly-text-secondary)]'
                            : `${palette.primaryBg} text-white`
                        }`}
                      >
                        {selected.joined ? t.subscribedBtn : t.subscribeBtn}
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-5 py-2.5 border-b border-[var(--chatly-border)] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('feed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                      activeTab === 'feed'
                        ? `${palette.softBg} ${palette.primaryText}`
                        : 'text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]'
                    }`}
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'البث' : 'Broadcasts'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                      activeTab === 'members'
                        ? `${palette.softBg} ${palette.primaryText}`
                        : 'text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'المشتركون والأدوار' : 'Members & Roles'}</span>
                  </button>
                </div>

                {activeTab === 'feed' ? (
                  <div className="p-5 space-y-5">
                    {canBroadcast && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!postBody.trim()) return;
                          await onPublishPost(selected.id, postBody.trim(), pinNewPost);
                          setPostBody('');
                          setPinNewPost(false);
                        }}
                        className="rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] p-3.5 space-y-3"
                      >
                        <textarea
                          rows={2}
                          value={postBody}
                          onChange={(e) => setPostBody(e.target.value)}
                          placeholder={t.publishBroadcastPlaceholder}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] text-sm text-[var(--chatly-text-primary)]"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-[var(--chatly-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={pinNewPost}
                              onChange={(e) => setPinNewPost(e.target.checked)}
                            />
                            <span>{t.pinAction}</span>
                          </label>
                          <button
                            type="submit"
                            className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold text-white ${palette.primaryBg}`}
                          >
                            {t.publishBroadcastBtn}
                          </button>
                        </div>
                      </form>
                    )}

                    {posts.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[var(--chatly-text-muted)]">
                        {lang === 'ar' ? 'لا توجد منشورات بعد.' : 'No channel broadcasts published yet.'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {posts.map((post) => (
                          <article
                            key={post.id}
                            className={`p-4 rounded-2xl border ${
                              post.pinned
                                ? 'border-cyan-500/40 bg-cyan-500/5'
                                : 'border-[var(--chatly-border)] bg-[var(--chatly-bg-input)]'
                            } space-y-3`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs text-[var(--chatly-text-muted)]">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[var(--chatly-text-primary)]">
                                  {post.authorDisplayName}
                                </span>
                                {post.pinned && (
                                  <span className={`inline-flex items-center gap-1 font-medium ${palette.primaryText}`}>
                                    <Pin className="w-3 h-3" />
                                    {t.pinnedLabel}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 font-mono text-[11px]">
                                <span className="inline-flex items-center gap-1">
                                  <Eye className="w-3.5 h-3.5" />
                                  {formatLocalizedNumber(post.viewCount, lang)}
                                </span>
                                <span>
                                  {formatLocalizedDate(post.createdAt, lang)}{' '}
                                  {formatLocalizedTime(post.createdAt, lang)}
                                </span>
                                {canBroadcast && (
                                  <button
                                    type="button"
                                    onClick={() => onTogglePinPost(selected.id, post.id)}
                                    className="text-[var(--chatly-text-muted)] hover:text-[var(--chatly-text-primary)]"
                                    title={post.pinned ? t.unpinAction : t.pinAction}
                                  >
                                    <Pin className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-sm text-[var(--chatly-text-primary)] whitespace-pre-wrap leading-relaxed">
                              {post.body}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {POST_EMOJIS.map((em) => {
                                const existing = post.reactions.find((r) => r.emoji === em);
                                return (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => onReactPost(selected.id, post.id, em)}
                                    className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                                      existing?.reactedByMe
                                        ? 'border-cyan-500/50 bg-cyan-500/15 text-[var(--chatly-text-primary)]'
                                        : 'border-[var(--chatly-border)] hover:bg-[var(--chatly-bg-elevated)]'
                                    }`}
                                  >
                                    <span>{em}</span>
                                    {existing && existing.count > 0 && (
                                      <span className="font-mono text-[11px]">
                                        {formatLocalizedNumber(existing.count, lang)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--chatly-border)]">
                    {members.map((mem) => (
                      <div key={mem.userId} className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <ChatlyAvatar src={mem.avatarUrl} name={mem.displayName} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--chatly-text-primary)] truncate">
                              {mem.displayName}
                            </div>
                            <div className="text-xs font-mono text-[var(--chatly-text-muted)] truncate">
                              @{mem.username} · {mem.role}
                            </div>
                          </div>
                        </div>
                        {canManageRoles && mem.role !== 'owner' && (
                          <select
                            aria-label={`Role for ${mem.username}`}
                            value={mem.role}
                            onChange={(e) =>
                              onUpdateMemberRole(
                                selected.id,
                                mem.userId,
                                e.target.value as Exclude<ChannelRole, 'owner'>
                              )
                            }
                            className="min-h-[34px] px-2.5 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                          >
                            <option value="subscriber">Subscriber</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                        {!canManageRoles && (
                          <span className="text-xs font-mono text-[var(--chatly-text-muted)] flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {mem.role}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
