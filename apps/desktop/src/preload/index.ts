import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-api';

const api: DesktopApi = {
  getSettings: () => ipcRenderer.invoke('templify:getSettings'),
  setLanguage: (language) => ipcRenderer.invoke('templify:setLanguage', language),
  selectTemplate: () => ipcRenderer.invoke('templify:selectTemplate'),
  importRecords: (options, reuse) => ipcRenderer.invoke('templify:importRecords', options, reuse),
  exportExcel: () => ipcRenderer.invoke('templify:exportExcel'),
  openExcelTemplate: () => ipcRenderer.invoke('templify:openExcelTemplate'),
  openDocumentation: () => ipcRenderer.invoke('templify:openDocumentation'),
  validateRecords: (records) => ipcRenderer.invoke('templify:validateRecords', records),
  selectOutput: (mode) => ipcRenderer.invoke('templify:selectOutput', mode),
  previewOutput: (records, settings) =>
    ipcRenderer.invoke('templify:previewOutput', records, settings),
  generate: (id) => ipcRenderer.invoke('templify:generate', id),
  openOutput: () => ipcRenderer.invoke('templify:openOutput'),
  resetInput: () => ipcRenderer.invoke('templify:resetInput'),
  invalidateOutput: () => ipcRenderer.invoke('templify:invalidateOutput'),
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
