import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { generateDocument, selectTemplate } from './document-workflow';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 760,
    minHeight: 580,
    title: 'Templify',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow = window;
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  const rendererUrl = process.env.TEMPLIFY_RENDERER_URL;
  if (rendererUrl) void window.loadURL(rendererUrl);
  else void window.loadFile(path.join(currentDirectory, '../renderer/index.html'));
  return window;
}

function trustedWindow(sender: Electron.WebContents): BrowserWindow {
  if (!mainWindow || sender !== mainWindow.webContents)
    throw new Error('Unexpected renderer process.');
  return mainWindow;
}

app.whenReady().then(() => {
  ipcMain.handle('templify:select-template', (event) =>
    selectTemplate(trustedWindow(event.sender)),
  );
  ipcMain.handle('templify:generate-document', (event, record: unknown, overwrite: unknown) =>
    generateDocument(
      trustedWindow(event.sender),
      record as Readonly<Record<string, unknown>>,
      overwrite as boolean,
    ),
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
