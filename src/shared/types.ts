export type MatchConfidence = 'safe' | 'likely' | 'possible'

export type ScanPhase = 'idle' | 'walking' | 'fingerprinting' | 'matching' | 'done' | 'error'

export type DeleteMode = 'trash' | 'permanent'

export type MascotKind = 'detective' | 'robot' | 'folder'

export type MatchStrictness = 'smart' | 'strict' | 'loose'

export interface AnimationSettings {
  mascot: boolean
  cards: boolean
  modals: boolean
  progress: boolean
}

export interface AppSettings {
  deleteMode: DeleteMode
  mascot: MascotKind
  matchStrictness: MatchStrictness
  animations: AnimationSettings
  excludedMatches: ExcludedMatch[]
  excludedFiles: ExcludedFile[]
  deleteHistory: DeletedHistoryEntry[]
}

export interface ExcludedMatch {
  id: string
  title: string
  filePaths: string[]
  createdAt: number
}

export interface ExcludedFile {
  id: string
  name: string
  path: string
  groupTitle: string
  createdAt: number
}

export interface ParsedMediaName {
  originalBaseName: string
  normalizedTitle: string
  comparableTitle: string
  seriesTitle?: string
  year?: number
  season?: number
  episode?: number
  episodeKey?: string
  qualityLabel?: string
  qualityRank: number
}

export interface MediaFile {
  id: string
  path: string
  name: string
  folder: string
  rootPath: string
  rootIndex: number
  size: number
  modifiedAt: number
  extension: string
  fingerprint?: string
  parsed: ParsedMediaName
}

export interface DuplicateFile extends MediaFile {
  recommendation: 'keep' | 'duplicate'
}

export interface DuplicateGroup {
  id: string
  confidence: MatchConfidence
  score: number
  title: string
  reason: string[]
  keepId: string
  files: DuplicateFile[]
}

export interface FolderCandidate {
  id: string
  path: string
  name: string
  parentPath: string
  rootPath: string
  rootIndex: number
  fileCount: number
  videoCount: number
  size: number
  modifiedAt: number
  recommendation: 'keep' | 'delete'
}

export interface FolderCandidateGroup {
  id: string
  confidence: MatchConfidence
  score: number
  title: string
  reason: string[]
  keepId: string
  folders: FolderCandidate[]
}

export interface ScanProgress {
  phase: ScanPhase
  message: string
  currentPath?: string
  processed: number
  total?: number
}

export interface ScanResult {
  filesScanned: number
  videosFound: number
  folders: string[]
  extensions: string[]
  groups: DuplicateGroup[]
  emptyFolderGroups: FolderCandidateGroup[]
}

export interface ExportRow {
  groupTitle: string
  confidence: MatchConfidence
  recommendation: 'keep' | 'duplicate'
  path: string
  size: number
  modifiedAt: number
}

export interface DeleteTarget {
  id: string
  path: string
  name: string
  size: number
  kind?: 'file' | 'folder'
}

export interface DeleteRequest {
  mode: DeleteMode
  targets: DeleteTarget[]
}

export interface DeletedFile {
  id: string
  path: string
  name: string
  size: number
  kind: 'file' | 'folder'
  mode: DeleteMode
  deletedAt: number
}

export interface DeleteFailure {
  id: string
  path: string
  error: string
}

export interface DeleteResult {
  deleted: DeletedFile[]
  failed: DeleteFailure[]
}

export interface DeletedHistoryEntry extends DeletedFile {}

export interface MediaApi {
  selectFolders: () => Promise<string[]>
  scanFolders: (folders: string[], strictness?: MatchStrictness) => Promise<ScanResult>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  exportMarked: (rows: ExportRow[]) => Promise<{ canceled: boolean; filePath?: string }>
  deleteFiles: (request: DeleteRequest) => Promise<DeleteResult>
  getVideoThumbnail: (path: string) => Promise<string | undefined>
  loadSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<AppSettings>
}
