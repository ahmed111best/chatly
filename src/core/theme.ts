import type { AccentColor } from './types';

export interface AccentPalette {
  id: AccentColor;
  labelEn: string;
  labelAr: string;
  swatchHex: string;
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  softBg: string;
  ringFocus: string;
  bubbleSelf: string;
}

export const ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  teal: {
    id: 'teal',
    labelEn: 'Chatly Cyan-Teal',
    labelAr: 'تيل سماوي شاتلي',
    swatchHex: '#14B8A6',
    primaryBg: 'bg-gradient-to-r from-[#0D9488] to-[#0891B2] dark:from-[#14B8A6] dark:to-[#06B6D4]',
    primaryHover: 'hover:brightness-110',
    primaryText: 'text-teal-700 dark:text-teal-300',
    softBg: 'bg-teal-500/12 dark:bg-teal-400/15',
    ringFocus: 'focus-visible:ring-teal-500',
    bubbleSelf:
      'bg-gradient-to-br from-[#0D9488] to-[#0E7490] text-white dark:from-[#0F766E] dark:to-[#0E7490] shadow-sm shadow-teal-950/20',
  },
  indigo: {
    id: 'indigo',
    labelEn: 'Royal Indigo',
    labelAr: 'نيلي ملكي',
    swatchHex: '#4F46E5',
    primaryBg: 'bg-indigo-600 dark:bg-indigo-500',
    primaryHover: 'hover:bg-indigo-700 dark:hover:bg-indigo-400',
    primaryText: 'text-indigo-700 dark:text-indigo-300',
    softBg: 'bg-indigo-500/10 dark:bg-indigo-400/15',
    ringFocus: 'focus-visible:ring-indigo-500',
    bubbleSelf: 'bg-indigo-600 text-white dark:bg-indigo-600 shadow-xs',
  },
  amber: {
    id: 'amber',
    labelEn: 'Warm Amber',
    labelAr: 'كهرماني دافئ',
    swatchHex: '#D97706',
    primaryBg: 'bg-amber-600 dark:bg-amber-500',
    primaryHover: 'hover:bg-amber-700 dark:hover:bg-amber-400',
    primaryText: 'text-amber-700 dark:text-amber-300',
    softBg: 'bg-amber-500/10 dark:bg-amber-400/15',
    ringFocus: 'focus-visible:ring-amber-500',
    bubbleSelf: 'bg-amber-700 text-white dark:bg-amber-600 shadow-xs',
  },
  rose: {
    id: 'rose',
    labelEn: 'Crimson Rose',
    labelAr: 'وردي قرمزي',
    swatchHex: '#E11D48',
    primaryBg: 'bg-rose-600 dark:bg-rose-500',
    primaryHover: 'hover:bg-rose-700 dark:hover:bg-rose-400',
    primaryText: 'text-rose-700 dark:text-rose-300',
    softBg: 'bg-rose-500/10 dark:bg-rose-400/15',
    ringFocus: 'focus-visible:ring-rose-500',
    bubbleSelf: 'bg-rose-600 text-white dark:bg-rose-600 shadow-xs',
  },
};
