import type { LanguageCode } from './types';

export function extractBearerToken(
  authHeader?: string | null,
  bodyToken?: string | null
): string | null {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const trimmed = authHeader.slice(7).trim();
    if (trimmed) return trimmed;
  }
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }
  return null;
}

export function formatFirebaseAuthError(error: unknown, lang: LanguageCode): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const normalized = `${code} ${message}`.toLowerCase();

  if (normalized.includes('auth/popup-blocked')) {
    return lang === 'ar'
      ? 'حظر المتصفح نافذة تسجيل الدخول المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.'
      : 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
  }

  if (
    normalized.includes('auth/popup-closed-by-user') ||
    normalized.includes('auth/cancelled-popup-request')
  ) {
    return lang === 'ar'
      ? 'تم إغلاق نافذة تسجيل الدخول قبل إتمام المصادقة.'
      : 'Google sign-in popup was closed before completing authentication.';
  }

  if (normalized.includes('auth/unauthorized-domain')) {
    return lang === 'ar'
      ? 'هذا النطاق غير مضاف في قائمة النطاقات المصرح بها في إعدادات Firebase Authentication.'
      : 'This domain is not authorized in Firebase Authentication settings. Add the app hostname under Firebase Console > Authentication > Authorized domains.';
  }

  if (normalized.includes('auth/network-request-failed')) {
    return lang === 'ar'
      ? 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت وأعد المحاولة.'
      : 'Network error while contacting Google authentication. Check your connection and try again.';
  }

  if (normalized.includes('session revoked')) {
    return lang === 'ar'
      ? 'تم إنهاء هذه الجلسة عن بُعد من جهاز آخر. سجّل الدخول مجدداً.'
      : 'This device session was revoked remotely. Please sign in again.';
  }

  if (normalized.includes('invalid token') || normalized.includes('unauthorized')) {
    return lang === 'ar'
      ? 'تعذر التحقق من جلسة Firebase Auth. يرجى تسجيل الدخول مرة أخرى.'
      : 'Firebase Auth could not verify your Google session. Please sign in again.';
  }

  return (
    message ||
    (lang === 'ar'
      ? 'حدث خطأ غير متوقع أثناء تسجيل الدخول عبر Google.'
      : 'An unexpected error occurred during Google sign-in.')
  );
}
