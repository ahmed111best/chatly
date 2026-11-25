export type ChatAiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface AiChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface MapsPlaceLink {
  title: string;
  uri: string;
  snippets: string[];
}

export const AI_ROLE_PRESETS = {
  assistant: {
    labelEn: 'Chatly Assistant',
    labelAr: 'مساعد شاتلي',
    instruction:
      'You are Chatly AI, a clear, accurate, and concise messaging assistant. Respond in the user language (Arabic or English) unless asked to translate.',
  },
  translator: {
    labelEn: 'EN ↔ AR Translator',
    labelAr: 'مترجم عربي ↔ إنجليزي',
    instruction:
      'You are a bilingual Arabic/English translator. Translate naturally and accurately, preserving tone and context without unnecessary commentary.',
  },
  summarizer: {
    labelEn: 'Thread Summarizer',
    labelAr: 'ملخّص المحادثات',
    instruction:
      'You summarize conversations into crisp action items, decisions, and key points in bullet form.',
  },
  technical: {
    labelEn: 'Technical Co-Pilot',
    labelAr: 'مساعد تقني',
    instruction:
      'You are a pragmatic senior software engineer helping draft technical explanations, architecture notes, and clear status updates.',
  },
} as const;

export type AiRolePresetKey = keyof typeof AI_ROLE_PRESETS;

export function buildGeminiChatHistory(
  turns: AiChatTurn[],
  maxTurns = 24
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  return turns
    .filter((t) => (t.role === 'user' || t.role === 'model') && t.text.trim().length > 0)
    .slice(-maxTurns)
    .map((t) => ({
      role: t.role,
      parts: [{ text: t.text.trim().slice(0, 6000) }],
    }));
}

interface RawGroundingChunk {
  maps?: {
    uri?: string;
    title?: string;
    placeAnswerSources?: {
      reviewSnippets?: { content?: string; text?: string }[];
    };
  };
}

export function extractMapsGroundingLinks(chunks: unknown): MapsPlaceLink[] {
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const results: MapsPlaceLink[] = [];

  for (const item of chunks as RawGroundingChunk[]) {
    const uri = item?.maps?.uri?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const title = item?.maps?.title?.trim() || 'Google Maps Place';
    const rawSnippets = item?.maps?.placeAnswerSources?.reviewSnippets || [];
    const snippets = rawSnippets
      .map((s) => (s.content || s.text || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    results.push({ title, uri, snippets });
  }

  return results;
}
