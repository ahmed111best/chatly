export interface ElectronBridge {
  isElectron?: boolean;
  notify?: (title: string, body: string) => void;
  getPlatformInfo?: () => { platform: string; arch: string };
}

export function getRuntimePlatform(): 'web' | 'windows' | 'android' {
  if (typeof window === 'undefined') return 'web';
  const w = window as unknown as {
    chatlyElectron?: ElectronBridge;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (w.chatlyElectron?.isElectron) return 'windows';
  if (w.Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}

export async function triggerDesktopOrBrowserNotification(
  title: string,
  body: string
): Promise<void> {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { chatlyElectron?: ElectronBridge };
  if (w.chatlyElectron?.notify) {
    w.chatlyElectron.notify(title, body);
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {
      // Ignore browser notification restrictions
    }
  }
}
