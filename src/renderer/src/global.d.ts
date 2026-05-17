import type { ElectronAPI } from '@electron-toolkit/preload'
import type { MediaApi } from '../../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    mediaApi: MediaApi
  }
}
