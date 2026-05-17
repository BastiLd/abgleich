import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { basename, dirname, extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { buildDuplicateGroups, parseMediaName } from '../shared/matching'
import { defaultSettings, normalizeSettings } from '../shared/settings'
import type { AppSettings, DeleteRequest, DeleteResult, ExportRow, MatchStrictness, MediaFile, ScanProgress, ScanResult } from '../shared/types'

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm'])
const FINGERPRINT_CHUNK_SIZE = 64 * 1024
const SETTINGS_FILE_NAME = 'settings.json'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Media Duplikat Finder',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendProgress(progress: ScanProgress): void {
  mainWindow?.webContents.send('scan-progress', progress)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('de.local.media-duplikat-finder')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers(): void {
  ipcMain.handle('select-folders', async () => {
    const options: OpenDialogOptions = {
      title: 'Ordner mit Filmen oder Serien auswählen',
      properties: ['openDirectory', 'multiSelections']
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('scan-folders', async (_event, folders: string[], strictness?: MatchStrictness): Promise<ScanResult> => {
    return scanFolders(folders, strictness ?? 'smart')
  })

  ipcMain.handle('export-marked', async (_event, rows: ExportRow[]) => {
    const options: SaveDialogOptions = {
      title: 'Markierte Duplikate exportieren',
      defaultPath: 'markierte-duplikate.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return { canceled: true }

    const csv = toCsv(rows)
    await fs.writeFile(result.filePath, csv, 'utf8')
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('delete-files', async (_event, request: DeleteRequest): Promise<DeleteResult> => {
    return deleteFiles(request)
  })

  ipcMain.handle('load-settings', async (): Promise<AppSettings> => {
    return loadSettings()
  })

  ipcMain.handle('save-settings', async (_event, settings: AppSettings): Promise<AppSettings> => {
    return saveSettings(settings)
  })
}

async function scanFolders(folders: string[], strictness: MatchStrictness): Promise<ScanResult> {
  const uniqueFolders = Array.from(new Set(folders.filter(Boolean)))

  sendProgress({
    phase: 'walking',
    message: 'Ordner werden durchsucht...',
    processed: 0
  })

  const discovered: MediaFile[] = []
  let filesScanned = 0

  for (let rootIndex = 0; rootIndex < uniqueFolders.length; rootIndex += 1) {
    const rootPath = uniqueFolders[rootIndex]
    for await (const filePath of walkFiles(rootPath)) {
      filesScanned += 1
      if (filesScanned % 100 === 0) {
        sendProgress({
          phase: 'walking',
          message: `${filesScanned.toLocaleString('de-DE')} Dateien geprüft...`,
          currentPath: filePath,
          processed: filesScanned
        })
      }

      const extension = extname(filePath).toLowerCase()
      if (!VIDEO_EXTENSIONS.has(extension)) continue

      const stat = await fs.stat(filePath)
      const folder = dirname(filePath)
      discovered.push({
        id: createHash('sha1').update(filePath).digest('hex'),
        path: filePath,
        name: basename(filePath),
        folder,
        rootPath,
        rootIndex,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        extension: extension.slice(1),
        parsed: parseMediaName(basename(filePath), folder)
      })
    }
  }

  for (let index = 0; index < discovered.length; index += 1) {
    const file = discovered[index]
    sendProgress({
      phase: 'fingerprinting',
      message: `Schneller Fingerprint ${index + 1} von ${discovered.length}`,
      currentPath: file.path,
      processed: index + 1,
      total: discovered.length
    })

    file.fingerprint = await quickFingerprint(file.path, file.size)
  }

  sendProgress({
    phase: 'matching',
    message: 'Treffergruppen werden berechnet...',
    processed: discovered.length,
    total: discovered.length
  })

  const groups = buildDuplicateGroups(discovered, strictness)

  sendProgress({
    phase: 'done',
    message: `${groups.length.toLocaleString('de-DE')} Treffergruppen gefunden`,
    processed: discovered.length,
    total: discovered.length
  })

  return {
    filesScanned,
    videosFound: discovered.length,
    folders: Array.from(new Set(discovered.map((file) => file.folder))).sort((a, b) => a.localeCompare(b, 'de')),
    extensions: Array.from(new Set(discovered.map((file) => file.extension))).sort((a, b) => a.localeCompare(b, 'de')),
    groups
  }
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath)
    } else if (entry.isFile()) {
      yield fullPath
    }
  }
}

async function quickFingerprint(filePath: string, size: number): Promise<string | undefined> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const hash = createHash('sha1')
      hash.update(String(size))

      const offsets = fingerprintOffsets(size)
      for (const offset of offsets) {
        const length = Math.min(FINGERPRINT_CHUNK_SIZE, size - offset)
        if (length <= 0) continue

        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, offset)
        hash.update(buffer.subarray(0, bytesRead))
      }

      return hash.digest('hex')
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}

function fingerprintOffsets(size: number): number[] {
  if (size <= FINGERPRINT_CHUNK_SIZE * 3) return [0]
  return [0, Math.max(0, Math.floor(size / 2) - Math.floor(FINGERPRINT_CHUNK_SIZE / 2)), Math.max(0, size - FINGERPRINT_CHUNK_SIZE)]
}

async function deleteFiles(request: DeleteRequest): Promise<DeleteResult> {
  const deleted: DeleteResult['deleted'] = []
  const failed: DeleteResult['failed'] = []

  for (const target of request.targets) {
    try {
      if (request.mode === 'permanent') {
        await fs.rm(target.path, { force: false })
      } else {
        await shell.trashItem(target.path)
      }
      deleted.push({ id: target.id, path: target.path })
    } catch (error) {
      failed.push({
        id: target.id,
        path: target.path,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler'
      })
    }
  }

  return { deleted, failed }
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return defaultSettings
  }
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeSettings(settings)
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE_NAME)
}

function toCsv(rows: ExportRow[]): string {
  const header = ['Gruppe', 'Treffer', 'Empfehlung', 'Pfad', 'GrößeBytes', 'GeändertAm']
  const body = rows.map((row) => [
    row.groupTitle,
    confidenceLabel(row.confidence),
    row.recommendation === 'keep' ? 'Behalten' : 'Duplikat',
    row.path,
    String(row.size),
    new Date(row.modifiedAt).toLocaleString('de-DE')
  ])

  return [header, ...body].map((line) => line.map(csvCell).join(';')).join('\n')
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function confidenceLabel(confidence: string): string {
  if (confidence === 'safe') return 'Sicher gleich'
  if (confidence === 'likely') return 'Wahrscheinlich gleich'
  return 'Möglicher Treffer'
}

