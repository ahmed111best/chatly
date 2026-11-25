import { useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Copy,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  AccentColor,
  ConversationSummary,
  GroupEventItem,
  GroupJoinRequestItem,
  GroupMemberItem,
  GroupPollItem,
  GroupTaskItem,
  LanguageCode,
  MediaAttachmentMeta,
  PublicUserSummary,
} from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';
import { formatLocalizedDate, formatLocalizedTime } from '../core/localization';
import { getAuthorizedMediaUrl } from '../services/api';

interface GroupsViewProps {
  groups: ConversationSummary[];
  contacts: PublicUserSummary[];
  activeGroupId: number | null;
  members: GroupMemberItem[];
  joinRequests: GroupJoinRequestItem[];
  polls: GroupPollItem[];
  events: GroupEventItem[];
  tasks: GroupTaskItem[];
  mediaGallery: MediaAttachmentMeta[];
  lang: LanguageCode;
  accentColor: AccentColor;
  authToken: string | null;
  onSelectGroup: (groupId: number) => void;
  onOpenGroupChat: (groupId: number) => void;
  onCreateGroup: (payload: {
    title: string;
    description: string;
    approvalRequired: boolean;
    announcementsOnly: boolean;
    memberIds: number[];
  }) => Promise<void>;
  onJoinByInviteCode: (inviteCode: string) => Promise<string>;
  onCreatePoll: (groupId: number, question: string, options: string[]) => Promise<void>;
  onVotePoll: (pollId: number, optionIndex: number) => Promise<void>;
  onCreateEvent: (
    groupId: number,
    payload: { title: string; description: string; location: string; startsAt: string }
  ) => Promise<void>;
  onCreateTask: (groupId: number, title: string) => Promise<void>;
  onToggleTask: (taskId: number) => Promise<void>;
  onDecideJoinRequest: (groupId: number, reqId: number, decision: 'approved' | 'rejected') => Promise<void>;
  onUpdateMemberRole: (
    groupId: number,
    targetUserId: number,
    action: 'promote' | 'demote' | 'remove'
  ) => Promise<void>;
}

export function GroupsView({
  groups,
  contacts,
  activeGroupId,
  members,
  joinRequests,
  polls,
  events,
  tasks,
  mediaGallery,
  lang,
  accentColor,
  authToken,
  onSelectGroup,
  onOpenGroupChat,
  onCreateGroup,
  onJoinByInviteCode,
  onCreatePoll,
  onVotePoll,
  onCreateEvent,
  onCreateTask,
  onToggleTask,
  onDecideJoinRequest,
  onUpdateMemberRole,
}: GroupsViewProps) {
  const palette = ACCENT_PALETTES[accentColor];
  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0] || null;

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [announcementsOnly, setAnnouncementsOnly] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Yes, No, Discuss later');

  const [eventTitle, setEventTitle] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateGroup({
      title: title.trim(),
      description: description.trim(),
      approvalRequired,
      announcementsOnly,
      memberIds: selectedMembers,
    });
    setTitle('');
    setDescription('');
    setSelectedMembers([]);
    setShowCreate(false);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    const msg = await onJoinByInviteCode(inviteCodeInput.trim());
    setInviteFeedback(msg);
    setInviteCodeInput('');
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--chatly-bg-canvas)] p-6 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[var(--chatly-text-primary)]">
              {lang === 'ar' ? 'المجموعات والمجتمعات' : 'Groups & Communities'}
            </h2>
            <p className="text-sm text-[var(--chatly-text-secondary)]">
              {lang === 'ar'
                ? 'أدر المجموعات والاستطلاعات والفعاليات والمهام المشتركة وروابط الدعوة.'
                : 'Manage groups, polls, events, shared tasks, member permissions, and invite links.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm ${palette.primaryBg} ${palette.primaryHover}`}
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'ar' ? 'مجموعة جديدة' : 'New Group'}</span>
          </button>
        </div>

        {/* Join by Invite Code */}
        <form
          onSubmit={handleJoinSubmit}
          className="rounded-2xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'أدخل رمز الدعوة للانضمام (مثال: CHATLY-CORE)'
                : 'Enter invite code to join (e.g. CHATLY-CORE)'
            }
            className="flex-1 min-w-[200px] min-h-[40px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
          />
          <button
            type="submit"
            className="min-h-[40px] px-4 rounded-xl border border-[var(--chatly-border)] text-xs font-semibold text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
          >
            {lang === 'ar' ? 'انضمام' : 'Join Group'}
          </button>
          {inviteFeedback && (
            <span className={`text-xs font-medium ${palette.primaryText}`}>{inviteFeedback}</span>
          )}
        </form>

        {/* Create Group Form */}
        {showCreate && (
          <form
            onSubmit={handleCreateSubmit}
            className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 space-y-4 shadow-sm"
          >
            <h3 className="font-display font-semibold text-base text-[var(--chatly-text-primary)]">
              {lang === 'ar' ? 'إنشاء مجموعة جديدة' : 'Create a New Group'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={lang === 'ar' ? 'اسم المجموعة' : 'Group title'}
                className="min-h-[42px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={lang === 'ar' ? 'وصف المجموعة' : 'Group description'}
                className="min-h-[42px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] placeholder:text-[var(--chatly-text-muted)] text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-[var(--chatly-text-secondary)]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approvalRequired}
                  onChange={(e) => setApprovalRequired(e.target.checked)}
                />
                <span>
                  {lang === 'ar' ? 'طلب موافقة المشرف للانضمام' : 'Require admin approval to join'}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={announcementsOnly}
                  onChange={(e) => setAnnouncementsOnly(e.target.checked)}
                />
                <span>
                  {lang === 'ar' ? 'إعلانات المشرفين فقط' : 'Announcements only (admins post)'}
                </span>
              </label>
            </div>

            {contacts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[var(--chatly-text-secondary)]">
                  {lang === 'ar' ? 'إضافة أعضاء:' : 'Add members:'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c) => {
                    const checked = selectedMembers.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelectedMembers((prev) =>
                            checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs ${
                          checked
                            ? `${palette.softBg} border-cyan-500/40 ${palette.primaryText} font-semibold`
                            : 'border-[var(--chatly-border)] text-[var(--chatly-text-secondary)] hover:bg-[var(--chatly-bg-elevated)]'
                        }`}
                      >
                        {c.displayName} (@{c.username})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              className={`min-h-[42px] px-5 rounded-xl text-sm font-medium text-white ${palette.primaryBg} ${palette.primaryHover}`}
            >
              {lang === 'ar' ? 'إنشاء المجموعة' : 'Create Group'}
            </button>
          </form>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Group List */}
          <div className="space-y-2">
            {groups.length === 0 ? (
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-6 text-center text-sm text-[var(--chatly-text-muted)]">
                {lang === 'ar' ? 'لا توجد مجموعات بعد.' : 'No groups yet. Create or join one above.'}
              </div>
            ) : (
              groups.map((grp) => {
                const selected = activeGroup?.id === grp.id;
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => onSelectGroup(grp.id)}
                    className={`w-full text-start p-4 rounded-2xl border transition-colors ${
                      selected
                        ? `${palette.softBg} border-cyan-500/50`
                        : 'bg-[var(--chatly-bg-surface)] border-[var(--chatly-border)] hover:bg-[var(--chatly-bg-elevated)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[var(--chatly-text-primary)] truncate">
                        {grp.title}
                      </span>
                      <span className="text-xs font-mono text-[var(--chatly-text-muted)]">
                        {grp.memberCount || 1}
                      </span>
                    </div>
                    {grp.description && (
                      <p className="mt-1 text-xs text-[var(--chatly-text-secondary)] line-clamp-2">
                        {grp.description}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Active Group Collaboration Workspace */}
          {activeGroup && (
            <div className="lg:col-span-2 space-y-5">
              <div className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-[var(--chatly-text-primary)]">
                    {activeGroup.title}
                  </h3>
                  <div className="text-xs text-[var(--chatly-text-muted)] flex items-center gap-2 font-mono">
                    {activeGroup.inviteCode && <span>Invite: {activeGroup.inviteCode}</span>}
                    {activeGroup.inviteCode && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeGroup.inviteCode || '').catch(() => {});
                          setCopiedInvite(true);
                          window.setTimeout(() => setCopiedInvite(false), 1500);
                        }}
                        className="inline-flex items-center gap-1 underline"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedInvite ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenGroupChat(activeGroup.id)}
                  className={`min-h-[38px] px-4 rounded-xl text-xs font-medium text-white flex items-center gap-1.5 ${palette.primaryBg} ${palette.primaryHover}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'فتح المحادثة' : 'Open Group Chat'}</span>
                </button>
              </div>

              {/* Polls */}
              <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-[var(--chatly-text-primary)]">
                  <BarChart3 className={`w-4 h-4 ${palette.primaryText}`} />
                  <span>{lang === 'ar' ? 'استطلاعات المجموعة' : 'Group Polls'}</span>
                </h4>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const opts = pollOptionsText
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (!pollQuestion.trim() || opts.length < 2) return;
                    await onCreatePoll(activeGroup.id, pollQuestion.trim(), opts);
                    setPollQuestion('');
                  }}
                  className="grid sm:grid-cols-3 gap-2"
                >
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder={lang === 'ar' ? 'سؤال الاستطلاع...' : 'Poll question...'}
                    className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                  />
                  <input
                    type="text"
                    value={pollOptionsText}
                    onChange={(e) => setPollOptionsText(e.target.value)}
                    placeholder="Option 1, Option 2..."
                    className="min-h-[38px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                  />
                  <button
                    type="submit"
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-medium text-white ${palette.primaryBg}`}
                  >
                    {lang === 'ar' ? 'نشر استطلاع' : 'Create Poll'}
                  </button>
                </form>

                <div className="space-y-3">
                  {polls.map((poll) => {
                    const totalVotes = poll.options.reduce((acc, o) => acc + o.votes, 0);
                    return (
                      <div
                        key={poll.id}
                        className="p-3.5 rounded-2xl bg-[var(--chatly-bg-input)] border border-[var(--chatly-border)] space-y-2"
                      >
                        <div className="font-semibold text-xs text-[var(--chatly-text-primary)]">
                          {poll.question}
                        </div>
                        <div className="space-y-1.5">
                          {poll.options.map((opt) => {
                            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                            return (
                              <button
                                key={opt.index}
                                type="button"
                                onClick={() => onVotePoll(poll.id, opt.index)}
                                className={`w-full text-start p-2 rounded-xl border text-xs transition-colors ${
                                  opt.votedByMe
                                    ? `${palette.softBg} border-cyan-500/40 font-semibold`
                                    : 'bg-[var(--chatly-bg-surface)] border-[var(--chatly-border)]'
                                }`}
                              >
                                <div className="flex justify-between mb-1">
                                  <span className="text-[var(--chatly-text-primary)]">{opt.label}</span>
                                  <span className="font-mono tabular-nums text-[var(--chatly-text-secondary)]">
                                    {opt.votes} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--chatly-bg-elevated)] overflow-hidden">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className={`h-full ${palette.primaryBg}`}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Events & Shared Tasks */}
              <div className="grid sm:grid-cols-2 gap-5">
                <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-[var(--chatly-text-primary)]">
                    <Calendar className={`w-4 h-4 ${palette.primaryText}`} />
                    <span>{lang === 'ar' ? 'الفعاليات' : 'Events'}</span>
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!eventTitle.trim() || !eventStartsAt) return;
                      await onCreateEvent(activeGroup.id, {
                        title: eventTitle.trim(),
                        description: '',
                        location: eventLocation.trim() || 'Online',
                        startsAt: new Date(eventStartsAt).toISOString(),
                      });
                      setEventTitle('');
                      setEventLocation('');
                    }}
                    className="space-y-2"
                  >
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder={lang === 'ar' ? 'عنوان الفعالية' : 'Event title'}
                      className="w-full min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                    />
                    <input
                      type="text"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder={lang === 'ar' ? 'المكان / الرابط' : 'Location'}
                      className="w-full min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                    />
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={eventStartsAt}
                        onChange={(e) => setEventStartsAt(e.target.value)}
                        className="flex-1 min-h-[36px] px-2 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                      />
                      <button
                        type="submit"
                        className={`min-h-[36px] px-3 rounded-xl text-xs font-medium text-white ${palette.primaryBg}`}
                      >
                        {lang === 'ar' ? 'إضافة' : 'Add'}
                      </button>
                    </div>
                  </form>
                  <div className="space-y-2">
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-xl bg-[var(--chatly-bg-input)] text-xs space-y-0.5"
                      >
                        <div className="font-semibold text-[var(--chatly-text-primary)]">
                          {ev.title}
                        </div>
                        <div className="text-[var(--chatly-text-muted)]">
                          {ev.location} · {formatLocalizedDate(ev.startsAt, lang)}{' '}
                          {formatLocalizedTime(ev.startsAt, lang)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-[var(--chatly-text-primary)]">
                    <CheckSquare className={`w-4 h-4 ${palette.primaryText}`} />
                    <span>{lang === 'ar' ? 'المهام المشتركة' : 'Shared Tasks'}</span>
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!taskTitle.trim()) return;
                      await onCreateTask(activeGroup.id, taskTitle.trim());
                      setTaskTitle('');
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder={lang === 'ar' ? 'أضف مهمة...' : 'New shared task...'}
                      className="flex-1 min-h-[36px] px-3 rounded-xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-input)] text-[var(--chatly-text-primary)] text-xs"
                    />
                    <button
                      type="submit"
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-medium text-white ${palette.primaryBg}`}
                    >
                      {lang === 'ar' ? 'إضافة' : 'Add'}
                    </button>
                  </form>
                  <div className="space-y-1.5">
                    {tasks.map((tk) => (
                      <label
                        key={tk.id}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--chatly-bg-elevated)] text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={tk.completed}
                          onChange={() => onToggleTask(tk.id)}
                        />
                        <span
                          className={
                            tk.completed
                              ? 'line-through text-[var(--chatly-text-muted)]'
                              : 'text-[var(--chatly-text-primary)]'
                          }
                        >
                          {tk.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              {/* Members & Join Requests */}
              <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-[var(--chatly-text-primary)]">
                  <Users className={`w-4 h-4 ${palette.primaryText}`} />
                  <span>{lang === 'ar' ? 'الأعضاء والصلاحيات' : 'Members & Permissions'}</span>
                </h4>

                {joinRequests.length > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-200">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'طلبات الانضمام' : 'Pending Join Requests'}</span>
                    </div>
                    {joinRequests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--chatly-text-primary)]">
                          {req.displayName} (@{req.username})
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onDecideJoinRequest(activeGroup.id, req.id, 'approved')
                            }
                            className="px-2.5 py-1 rounded-lg bg-teal-600 text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDecideJoinRequest(activeGroup.id, req.id, 'rejected')
                            }
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="divide-y divide-[var(--chatly-border)]">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[var(--chatly-text-muted)]" />
                        <span className="font-medium text-[var(--chatly-text-primary)]">
                          {m.displayName}
                        </span>
                        <span className="font-mono text-[var(--chatly-text-muted)]">@{m.username}</span>
                        <span className={`font-mono uppercase text-[10px] ${palette.primaryText}`}>
                          · {m.role}
                        </span>
                      </div>
                      {activeGroup.myRole === 'owner' && m.role !== 'owner' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMemberRole(
                                activeGroup.id,
                                m.userId,
                                m.role === 'admin' ? 'demote' : 'promote'
                              )
                            }
                            className="px-2 py-1 rounded-lg border border-[var(--chatly-border)] text-[var(--chatly-text-primary)] hover:bg-[var(--chatly-bg-elevated)]"
                          >
                            {m.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMemberRole(activeGroup.id, m.userId, 'remove')
                            }
                            className="px-2 py-1 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Group Media Gallery */}
              {mediaGallery.length > 0 && (
                <section className="rounded-3xl border border-[var(--chatly-border)] bg-[var(--chatly-bg-surface)] p-5 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-[var(--chatly-text-primary)]">
                    <ImageIcon className={`w-4 h-4 ${palette.primaryText}`} />
                    <span>{lang === 'ar' ? 'معرض وسائط المجموعة' : 'Group Media Gallery'}</span>
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {mediaGallery
                      .filter((m) => m.kind === 'image')
                      .map((m) => (
                        <img
                          key={m.id}
                          src={getAuthorizedMediaUrl(m.url, authToken)}
                          alt={m.fileName}
                          className="h-24 w-full object-cover rounded-xl border border-[var(--chatly-border)]"
                        />
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
