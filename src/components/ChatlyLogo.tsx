import type { AccentColor } from '../core/types';
import { ACCENT_PALETTES } from '../core/theme';

interface ChatlyLogoProps {
  accentColor?: AccentColor;
  size?: number;
}

export function ChatlyLogo({ accentColor = 'teal', size = 34 }: ChatlyLogoProps) {
  const hex = ACCENT_PALETTES[accentColor].swatchHex;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="chatly-logo-grad" x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor={hex} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="#071524" />
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="37.5"
        rx="10.75"
        stroke="url(#chatly-logo-grad)"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />
      <path
        d="M9.5 18.2C9.5 13.45 14.2 9.6 20 9.6C25.8 9.6 30.5 13.45 30.5 18.2C30.5 22.95 25.8 26.8 20 26.8C18.35 26.8 16.78 26.48 15.38 25.92L10.9 28.9C10.32 29.28 9.56 28.82 9.65 28.13L10.22 23.62C9.75 22.02 9.5 20.16 9.5 18.2Z"
        fill={hex}
        fillOpacity="0.16"
        stroke="url(#chatly-logo-grad)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="15.4" cy="18.2" r="1.75" fill="#E0F2FE" />
      <circle cx="20" cy="18.2" r="1.75" fill="#E0F2FE" />
      <circle cx="24.6" cy="18.2" r="1.75" fill="#E0F2FE" />
    </svg>
  );
}
