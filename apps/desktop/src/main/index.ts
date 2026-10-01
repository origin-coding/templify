import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { DocumentWorkflow } from './document-workflow';
import type { DesktopApi } from '../shared/desktop-api';
import { SettingsStore } from './settings';
import { systemLocale } from '../shared/settings';
import { diagnostic } from './document-workflow';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
let workflow = new DocumentWorkflow();
let appSettings: SettingsStore;

function createWindow(): BrowserWindow {
  workflow = new DocumentWorkflow(() => appSettings.locale);
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  appSettings = new SettingsStore(
    path.join(app.getPath('userData'), 'settings', 'settings.json'),
    systemLocale(app.getPreferredSystemLanguages()),
  );
  await appSettings.load();
  const handlers: {
    [K in keyof Omit<DesktopApi, 'onPhase'>]: (
      window: BrowserWindow,
      ...args: Parameters<DesktopApi[K]>
    ) => ReturnType<DesktopApi[K]>;
  } = {
    getSettings: async () => appSettings.get(),
    setLanguage: async (_window, language) => {
      try {
        await appSettings.set(language);
        return { status: 'ok', value: appSettings.get(), warnings: [] };
      } catch {
        const issue = diagnostic('settings', { code: 'SettingsSaveFailed' });
        return { status: 'error', issue, issues: [issue], warnings: [] };
      }
    },
    selectTemplate: (window) => workflow.selectTemplate(window),
    importRecords: (window, options, reuse) => workflow.importRecords(window, options, reuse),
    exportExcel: (window) => workflow.exportExcel(window),
    openExcelTemplate: () => workflow.openExcelTemplate(),
    openDocumentation: () => workflow.openDocumentation(),
    validateRecords: (_window, records) => workflow.validateRecords(records),
    selectOutput: (window, mode) => workflow.selectOutput(window, mode),
    previewOutput: (_window, records, settings) => workflow.previewOutput(records, settings),
    generate: (window, id) => workflow.generate(window, id),
    openOutput: () => workflow.openOutput(),
    resetInput: () => workflow.resetInput(),
    invalidateOutput: () => workflow.invalidateOutput(),
    reset: () => workflow.reset(),
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`templify:${name}`, (event, ...args: unknown[]) =>
      (handler as (window: BrowserWindow, ...args: unknown[]) => unknown)(
        trustedWindow(event.sender),
        ...args,
      ),
    );
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
