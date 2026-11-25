import { useState } from 'react';

interface ChatlyAvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  online?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function ChatlyAvatar({
  src,
  name,
  size = 'md',
  shape = 'circle',
  online,
}: ChatlyAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeCls = SIZE_CLASSES[size];
  const radiusCls = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const dotCls = size === 'xs' || size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  const avatarEl =
    src && !failed ? (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeCls} ${radiusCls} object-cover shrink-0 border border-slate-200/90 dark:border-cyan-400/25 bg-slate-100 dark:bg-[#10263B]`}
      />
    ) : (
      <div
        aria-hidden="true"
        className={`${sizeCls} ${radiusCls} shrink-0 flex items-center justify-center font-semibold tracking-tight bg-gradient-to-br from-teal-500/20 to-cyan-500/20 text-teal-800 dark:text-cyan-200 border border-teal-500/25 dark:border-cyan-400/25`}
      >
        {getInitials(name)}
      </div>
    );

  if (online) {
    return (
      <div className="relative inline-flex shrink-0">
        {avatarEl}
        <span
          aria-hidden="true"
          className={`absolute bottom-0 end-0 ${dotCls} rounded-full bg-emerald-400 ring-2 ring-[var(--chatly-bg-surface)]`}
        />
      </div>
    );
  }

  return avatarEl;
}
