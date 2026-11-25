import path from 'path';
import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    title: 'Chatly — شاتلي',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const distIndex = path.join(__dirname, '../../dist/index.html');
  if (!isDev) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://127.0.0.1:3000').catch(() => {
      mainWindow?.loadFile(distIndex);
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com') || url.includes('firebaseapp.com')) {
      return { action: 'allow' };
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

ipcMain.on('chatly:notify', (_event, payload: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: String(payload.title || 'Chatly'),
      body: String(payload.body || ''),
    });
    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    notif.show();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
