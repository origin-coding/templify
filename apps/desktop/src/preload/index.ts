import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-api';

const api: DesktopApi = {
  formatExamples: (options, perField) =>
    ipcRenderer.invoke('templify:formatExamples', options, perField),
  setRenderDefaults: (defaults) => ipcRenderer.invoke('templify:setRenderDefaults', defaults),
  getSettings: () => ipcRenderer.invoke('templify:getSettings'),
  setLanguage: (language) => ipcRenderer.invoke('templify:setLanguage', language),
  selectTemplate: () => ipcRenderer.invoke('templify:selectTemplate'),
  importRecords: (options, reuse) => ipcRenderer.invoke('templify:importRecords', options, reuse),
  exportExcel: () => ipcRenderer.invoke('templify:exportExcel'),
  openExcelTemplate: () => ipcRenderer.invoke('templify:openExcelTemplate'),
  openDocumentation: () => ipcRenderer.invoke('templify:openDocumentation'),
  validateRecords: (records) => ipcRenderer.invoke('templify:validateRecords', records),
  selectOutput: (mode, format) => ipcRenderer.invoke('templify:selectOutput', mode, format),
  previewOutput: (records, settings, options) =>
    ipcRenderer.invoke('templify:previewOutput', records, settings, options),
  generate: (id) => ipcRenderer.invoke('templify:generate', id),
  openOutput: () => ipcRenderer.invoke('templify:openOutput'),
  openOutputFile: () => ipcRenderer.invoke('templify:openOutputFile'),
  previewPdf: (records, selection, options) =>
    ipcRenderer.invoke('templify:previewPdf', records, selection, options),
  onFontRequest: (callback) => {
    const listener = async (
      _event: Electron.IpcRendererEvent,
      id: number,
      requests: Parameters<typeof callback>[0],
    ) => {
      let fonts: Awaited<ReturnType<typeof callback>> = [];
      try {
        fonts = await callback(requests);
      } catch {
        /* Fall back when local font access fails. */
      }
      ipcRenderer.send('templify:fontResponse', id, fonts);
    };
    ipcRenderer.on('templify:fontRequest', listener);
    return () => ipcRenderer.removeListener('templify:fontRequest', listener);
  },
  resetInput: () => ipcRenderer.invoke('templify:resetInput'),
  invalidateOutput: (preservePdf) => ipcRenderer.invoke('templify:invalidateOutput', preservePdf),
  reset: () => ipcRenderer.invoke('templify:reset'),
  onPhase: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, phase: unknown) => {
      if (typeof phase === 'string') callback(phase);
    };
    ipcRenderer.on('templify:phase', listener);
    return () => ipcRenderer.removeListener('templify:phase', listener);
  },
};

contextBridge.exposeInMainWorld('templify', api);
