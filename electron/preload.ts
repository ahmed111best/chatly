import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('chatlyElectron', {
  isElectron: true,
  notify: (title: string, body: string) => {
    ipcRenderer.send('chatly:notify', { title, body });
  },
  getPlatformInfo: () => ({
    platform: process.platform,
    arch: process.arch,
    appVersion: '2.1.0',
  }),
});
