// Minimal ambient declaration allowing `tsc -p electron/tsconfig.json` to type-check
// before installing the desktop `electron` binary locally.
declare module 'electron' {
  export class BrowserWindow {
    static getAllWindows(): BrowserWindow[];
    constructor(options?: Record<string, unknown>);
    loadFile(filePath: string): Promise<void>;
    loadURL(url: string): Promise<void>;
    isMinimized(): boolean;
    restore(): void;
    focus(): void;
    webContents: {
      setWindowOpenHandler(
        handler: (details: { url: string }) => { action: 'allow' | 'deny' }
      ): void;
    };
  }

  export class Notification {
    static isSupported(): boolean;
    constructor(options: { title: string; body: string });
    on(event: string, listener: () => void): this;
    show(): void;
  }

  export const app: {
    isPackaged: boolean;
    whenReady(): Promise<void>;
    on(event: string, listener: () => void): void;
    quit(): void;
  };

  export const ipcMain: {
    on(
      channel: string,
      listener: (event: unknown, payload: { title: string; body: string }) => void
    ): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
  };

  export const ipcRenderer: {
    send(channel: string, ...args: unknown[]): void;
  };
}
