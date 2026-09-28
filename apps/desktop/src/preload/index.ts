import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-api';

const api: DesktopApi = {
  selectTemplate: () => ipcRenderer.invoke('templify:select-template'),
  generateDocument: (record, overwrite) =>
    ipcRenderer.invoke('templify:generate-document', record, overwrite),
};

contextBridge.exposeInMainWorld('templify', api);
