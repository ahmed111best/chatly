import type { ReactionSummary } from './types';

export const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export const EXTENDED_REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '🔥',
  '🎉',
  '👏',
  '✨',
  '💯',
  '🤔',
  '🫡',
  '🥳',
  '🚀',
  '💡',
] as const;

export function toggleReactionInList(
  reactions: ReactionSummary[],
  emoji: string,
  userId: number,
  isCurrentUser: boolean
): ReactionSummary[] {
  const normalized = emoji.trim();
  if (!normalized) return reactions;

  const existingIdx = reactions.findIndex((r) => r.emoji === normalized);
  if (existingIdx === -1) {
    return [
      ...reactions,
      {
        emoji: normalized,
        count: 1,
        reactedByMe: isCurrentUser,
        userIds: [userId],
      },
    ];
  }

  const target = reactions[existingIdx];
  const hasReacted = target.userIds.includes(userId);
  const nextUserIds = hasReacted
    ? target.userIds.filter((id) => id !== userId)
    : [...target.userIds, userId];

  if (nextUserIds.length === 0) {
    return reactions.filter((_, idx) => idx !== existingIdx);
  }

  const next = [...reactions];
  next[existingIdx] = {
    emoji: normalized,
    count: nextUserIds.length,
    reactedByMe: isCurrentUser ? !hasReacted : target.reactedByMe,
    userIds: nextUserIds,
  };
  return next;
}

export function groupRawReactions(
  rows: { emoji: string; userId: number }[],
  currentUserId: number
): ReactionSummary[] {
  const byEmoji = new Map<string, Set<number>>();
  for (const row of rows) {
    let set = byEmoji.get(row.emoji);
    if (!set) {
      set = new Set<number>();
      byEmoji.set(row.emoji, set);
    }
    set.add(row.userId);
  }

  const result: ReactionSummary[] = [];
  for (const [emoji, userIds] of byEmoji.entries()) {
    result.push({
      emoji,
      count: userIds.size,
      reactedByMe: userIds.has(currentUserId),
      userIds: Array.from(userIds),
    });
  }
  return result;
}
