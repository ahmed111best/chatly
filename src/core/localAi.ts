import type { ChatMessage, LanguageCode } from './types';

export function summarizeConversationLocal(
  messages: ChatMessage[],
  lang: LanguageCode
): string {
  const textMsgs = messages.filter((m) => !m.deletedAt && m.body.trim().length > 0);
  if (textMsgs.length === 0) {
    return lang === 'ar'
      ? 'لا توجد رسائل نصية لتلخيصها بعد.'
      : 'No text messages available to summarize yet.';
  }

  const recent = textMsgs.slice(-6);
  const speakers = Array.from(new Set(recent.map((m) => m.senderDisplayName)));
  const highlights = recent
    .filter((m) => m.body.length > 16)
    .slice(-3)
    .map((m) => `• ${m.senderDisplayName}: ${m.body.slice(0, 110)}${m.body.length > 110 ? '…' : ''}`);

  if (lang === 'ar') {
    return [
      `ملخص محلي (${textMsgs.length} رسالة · المشاركون: ${speakers.join('، ')})`,
      ...(highlights.length > 0 ? highlights : [`• آخر رسالة: ${recent[recent.length - 1].body}`]),
    ].join('\n');
  }

  return [
    `Local summary (${textMsgs.length} messages · Participants: ${speakers.join(', ')})`,
    ...(highlights.length > 0 ? highlights : [`• Latest: ${recent[recent.length - 1].body}`]),
  ].join('\n');
}

export function suggestRepliesLocal(
  lastMessage: ChatMessage | undefined,
  lang: LanguageCode
): string[] {
  if (!lastMessage) {
    return lang === 'ar'
      ? ['مرحباً! كيف تسير الأمور؟', 'هل لديك وقت لمراجعة سريعة اليوم؟']
      : ['Hi! How are things going?', 'Do you have a moment to sync today?'];
  }

  const body = lastMessage.body.toLowerCase();
  const isQuestion = body.includes('?') || body.includes('؟');

  if (isQuestion) {
    return lang === 'ar'
      ? ['نعم، يناسبني ذلك تماماً.', 'سأراجع التفاصيل وأرد عليك خلال دقائق.', 'هل نحدد موعداً غداً؟']
      : ['Yes, that works well for me.', 'Let me double-check and get back to you shortly.', 'Can we schedule this for tomorrow?'];
  }

  return lang === 'ar'
    ? ['شكراً لك، وصلت الفكرة!', 'ممتاز، لنبدأ التنفيذ.', 'سأحفظ هذا للمتابعة.']
    : ['Thanks, got it!', 'Sounds great — let us proceed.', 'Noted, I will follow up on this.'];
}

export function semanticSearchMessagesLocal(
  messages: ChatMessage[],
  query: string
): ChatMessage[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return [];

  return messages
    .map((msg) => {
      const haystack = `${msg.body} ${msg.senderDisplayName} ${msg.senderUsername}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (haystack.includes(tok)) score += 1;
      }
      return { msg, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.msg);
}

export function polishDraftLocal(draft: string, lang: LanguageCode): string {
  const cleaned = draft.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (lang === 'en' && !/[.!?]$/.test(capitalized)) {
    return `${capitalized}.`;
  }
  return capitalized;
}
