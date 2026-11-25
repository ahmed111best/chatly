const CACHE_NAME = 'chatly-voice-stickers-v1';
const INDEX_KEY = 'chatly_cached_sticker_ids';

export function getCachedStickerIds(): number[] {
  try {
    const raw = window.sessionStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export async function cacheStickerOffline(params: {
  stickerId: number;
  urls: string[];
}): Promise<boolean> {
  try {
    if ('caches' in window && params.urls.length > 0) {
      const cache = await window.caches.open(CACHE_NAME);
      for (const u of params.urls) {
        if (!u) continue;
        try {
          const resp = await fetch(u);
          if (resp.ok) {
            await cache.put(u, resp.clone());
          }
        } catch {
          // Skip unavailable URL
        }
      }
    }
    const existing = new Set(getCachedStickerIds());
    existing.add(params.stickerId);
    window.sessionStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(existing)));
    return true;
  } catch {
    return false;
  }
}

export async function getCachedAssetObjectUrl(url: string): Promise<string | null> {
  try {
    if (!('caches' in window) || !url) return null;
    const cache = await window.caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (!match) return null;
    const blob = await match.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
