import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, DeleteRequest, ExportRow, MediaApi, ScanProgress } from '../shared/types'

const mediaApi: MediaApi = {
  selectFolders: () => ipcRenderer.invoke('select-folders'),
  scanFolders: (folders: string[], strictness) => ipcRenderer.invoke('scan-folders', folders, strictness),
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
    ipcRenderer.on('scan-progress', listener)
    return () => ipcRenderer.removeListener('scan-progress', listener)
  },
  exportMarked: (rows: ExportRow[]) => ipcRenderer.invoke('export-marked', rows),
  deleteFiles: (request: DeleteRequest) => ipcRenderer.invoke('delete-files', request),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('mediaApi', mediaApi)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.mediaApi = mediaApi
}
