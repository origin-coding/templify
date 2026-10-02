import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { DocumentWorkflow } from './document-workflow';
import type { DesktopApi } from '../shared/desktop-api';
import { SettingsStore } from './settings';
import { systemLocale } from '../shared/settings';
import { diagnostic } from './document-workflow';
import {
  createNodePdfConverter,
  type PdfFontData,
  type PdfFontRequest,
} from '@templify/node-output';
import { en, zh } from '../shared/messages';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
let workflow = new DocumentWorkflow();
let appSettings: SettingsStore;
let fontRequestSequence = 0;
const fontRequests = new Map<
  number,
  { sender: Electron.WebContents; resolve: (fonts: readonly PdfFontData[]) => void }
>();

async function requestLocalFonts(
  requests: readonly PdfFontRequest[],
): Promise<readonly PdfFontData[]> {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return [];
  const id = ++fontRequestSequence;
  return new Promise((resolve) => {
    const finish = (fonts: readonly PdfFontData[]) => {
      clearTimeout(timer);
      fontRequests.delete(id);
      resolve(fonts);
    };
    const timer = setTimeout(() => finish([]), 15_000);
    fontRequests.set(id, { sender: window.webContents, resolve: finish });
    window.webContents.send('templify:fontRequest', id, requests);
  });
}

function createWindow(): BrowserWindow {
  workflow = new DocumentWorkflow(() => appSettings.locale, {
    pdfConverter: createNodePdfConverter({
      localFonts: requestLocalFonts,
      onDownload: () =>
        mainWindow?.webContents.send(
          'templify:phase',
          (appSettings.locale === 'zh-CN' ? zh : en).downloadFonts,
        ),
    }),
  });
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
  // Chromium forwards local-fonts even though Electron 42's declaration omits it.
  window.webContents.session.setPermissionCheckHandler(
    (sender, permission) => String(permission) === 'local-fonts' && sender === window.webContents,
  );
  window.webContents.session.setPermissionRequestHandler((sender, permission, callback) =>
    callback(String(permission) === 'local-fonts' && sender === window.webContents),
  );
  window.once('closed', () => {
    for (const pending of fontRequests.values())
      if (pending.sender === window.webContents) pending.resolve([]);
    void workflow.reset();
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
  ipcMain.on('templify:fontResponse', (event, id: unknown, fonts: unknown) => {
    if (typeof id !== 'number') return;
    const pending = fontRequests.get(id);
    if (!pending || pending.sender !== event.sender) return;
    const valid =
      Array.isArray(fonts) &&
      fonts.length <= 128 &&
      fonts.every(
        (font: unknown) =>
          typeof font === 'object' &&
          font !== null &&
          typeof (font as PdfFontData).family === 'string' &&
          typeof (font as PdfFontData).bold === 'boolean' &&
          typeof (font as PdfFontData).italic === 'boolean' &&
          (font as PdfFontData).bytes instanceof Uint8Array &&
          (font as PdfFontData).bytes.byteLength <= 64 * 1024 * 1024,
      );
    pending.resolve(valid ? (fonts as PdfFontData[]) : []);
  });
  const handlers: {
    [K in keyof Omit<DesktopApi, 'onPhase' | 'onFontRequest'>]: (
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
    selectOutput: (window, mode, format) => workflow.selectOutput(window, mode, format),
    previewOutput: (_window, records, settings) => workflow.previewOutput(records, settings),
    generate: (window, id) => workflow.generate(window, id),
    openOutput: () => workflow.openOutput(),
    openOutputFile: () => workflow.openOutputFile(),
    previewPdf: (_window, records, selection) => workflow.previewPdf(records, selection),
    resetInput: () => workflow.resetInput(),
    invalidateOutput: (_window, preservePdf) => workflow.invalidateOutput(preservePdf),
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
