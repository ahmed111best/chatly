import firebaseConfigJson from '../../firebase-applet-config.json';

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export function normalizeBaseUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function resolveApiUrl(path: string, baseUrlOverride?: string): string {
  const cleanPath = String(path || '').trim();
  if (
    !cleanPath ||
    cleanPath.startsWith('http://') ||
    cleanPath.startsWith('https://') ||
    cleanPath.startsWith('blob:') ||
    cleanPath.startsWith('data:')
  ) {
    return cleanPath;
  }
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  const baseUrl = normalizeBaseUrl(baseUrlOverride);
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function resolveWsUrl(
  path = '/ws',
  params?: Record<string, string | undefined>,
  options?: {
    wsBaseUrl?: string;
    apiBaseUrl?: string;
    locationProtocol?: string;
    locationHost?: string;
  }
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const explicitWs = normalizeBaseUrl(options?.wsBaseUrl);
  const explicitApi = normalizeBaseUrl(options?.apiBaseUrl);

  let baseWs = explicitWs;
  if (!baseWs && explicitApi) {
    if (explicitApi.startsWith('https://')) {
      baseWs = `wss://${explicitApi.slice('https://'.length)}`;
    } else if (explicitApi.startsWith('http://')) {
      baseWs = `ws://${explicitApi.slice('http://'.length)}`;
    } else if (explicitApi.startsWith('wss://') || explicitApi.startsWith('ws://')) {
      baseWs = explicitApi;
    }
  }

  if (!baseWs) {
    const protocol =
      options?.locationProtocol ??
      (typeof window !== 'undefined' ? window.location.protocol : '');
    const host =
      options?.locationHost ??
      (typeof window !== 'undefined' ? window.location.host : '');

    if ((protocol === 'http:' || protocol === 'https:') && host) {
      baseWs = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}`;
    }
  }

  if (!baseWs) {
    return '';
  }

  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        search.set(key, value);
      }
    }
  }
  const query = search.toString();
  return `${baseWs}${normalizedPath}${query ? `?${query}` : ''}`;
}

export function getWebRtcIceServers(): RTCIceServer[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
}

export function getClientFirebaseConfig(
  fallback: FirebaseClientConfig = firebaseConfigJson
): FirebaseClientConfig {
  return { ...fallback };
}
