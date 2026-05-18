import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderPlus,
  History,
  Image,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { defaultSettings } from '../../shared/settings'
import { removeDeletedFilesFromResult } from '../../shared/resultState'
import { normalizeFolderName, similarity } from '../../shared/matching'
import type {
  AppSettings,
  DeleteMode,
  DeleteTarget,
  FolderCandidate,
  FolderCandidateGroup,
  DuplicateFile,
  DuplicateGroup,
  ExcludedFile,
  ExcludedMatch,
  ExportRow,
  MascotKind,
  MatchConfidence,
  MatchStrictness,
  ScanProgress,
  ScanResult
} from '../../shared/types'

type FilterMode = 'folder' | 'video' | 'custom'
type ResultTab = MatchConfidence | 'all' | 'noVideoFolders'
type VisibleGroup = Omit<DuplicateGroup, 'files'> & { files: DuplicateFile[] }
type DeleteModalState = { targets: DeleteTarget[]; title: string } | null
type SeriesBucket = {
  key: string
  title: string
  seasons: Array<{ season: number; groups: VisibleGroup[] }>
}

const TABS: Array<{ value: ResultTab; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'safe', label: 'Sicher gleich' },
  { value: 'likely', label: 'Wahrscheinlich gleich' },
  { value: 'possible', label: 'Mögliche Treffer' },
  { value: 'noVideoFolders', label: 'Ordner ohne Videos' }
]

function App(): JSX.Element {
  const [folders, setFolders] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<ResultTab>('all')
  const [filterMode, setFilterMode] = useState<FilterMode>('folder')
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set())
  const [folderPanelOpen, setFolderPanelOpen] = useState(false)
  const [folderFilterOpen, setFolderFilterOpen] = useState(false)
  const [customPanelOpen, setCustomPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [excludedOpen, setExcludedOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [folderMatchTab, setFolderMatchTab] = useState<MatchConfidence | 'all'>('all')
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [progress, setProgress] = useState<ScanProgress>({
    phase: 'idle',
    message: 'Bereit',
    processed: 0
  })
  const [result, setResult] = useState<ScanResult | null>(null)
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)

  useEffect(() => {
    void window.mediaApi.loadSettings().then(setSettings)
    return window.mediaApi.onScanProgress((next) => setProgress(next))
  }, [])

  const availableFolders = result?.folders ?? []
  const availableExtensions = result?.extensions ?? []
  const excludedIds = useMemo(() => new Set(settings.excludedMatches.map((match) => match.id)), [settings.excludedMatches])
  const excludedFileIds = useMemo(() => new Set(settings.excludedFiles.map((file) => file.id)), [settings.excludedFiles])
  const animationClass = animationClassName(settings)

  const visibleGroups = useMemo<VisibleGroup[]>(() => {
    if (!result) return []
    if (activeTab === 'noVideoFolders') return []

    const confidenceFiltered = activeTab === 'all' ? result.groups : result.groups.filter((group) => group.confidence === activeTab)

    return confidenceFiltered
      .filter((group) => !excludedIds.has(group.id))
      .map((group) => ({
        ...group,
        files: group.files.filter((file) => selectedFolders.has(file.folder) && selectedExtensions.has(file.extension) && !excludedFileIds.has(file.id))
      }))
      .filter((group) => group.files.length > 1)
  }, [activeTab, excludedFileIds, excludedIds, result, selectedExtensions, selectedFolders])

  const { seriesBuckets, standaloneGroups } = useMemo(() => splitSeriesGroups(visibleGroups), [visibleGroups])
  const emptyFolderGroups = useMemo(() => {
    if (!result) return []
    if (activeTab !== 'noVideoFolders') return []
    return (folderMatchTab === 'all' ? result.emptyFolderGroups : result.emptyFolderGroups.filter((group) => group.confidence === folderMatchTab)).filter((group) => !excludedIds.has(group.id))
  }, [activeTab, excludedIds, folderMatchTab, result])

  const markedTargets = useMemo<DeleteTarget[]>(() => {
    return visibleGroups.flatMap((group) =>
      group.files
        .filter((file) => markedIds.has(file.id))
        .map((file) => ({ id: file.id, path: file.path, name: file.name, size: file.size }))
    )
  }, [markedIds, visibleGroups])

  const markedRows = useMemo<ExportRow[]>(() => {
    if (!result) return []

    return visibleGroups.flatMap((group) =>
      group.files
        .filter((file) => markedIds.has(file.id))
        .map((file) => ({
          groupTitle: group.title,
          confidence: group.confidence,
          recommendation: file.recommendation,
          path: file.path,
          size: file.size,
          modifiedAt: file.modifiedAt
        }))
    )
  }, [markedIds, result, visibleGroups])

  async function selectFolders(): Promise<void> {
    const selected = await window.mediaApi.selectFolders()
    if (selected.length === 0) return

    setFolders((current) => Array.from(new Set([...current, ...selected])))
    clearScan()
  }

  function clearScan(): void {
    setResult(null)
    setMarkedIds(new Set())
    setSelectedFolders(new Set())
    setSelectedExtensions(new Set())
    setExportPath(null)
    setDeleteNotice(null)
    setFolderPanelOpen(false)
    setFolderFilterOpen(false)
    setCustomPanelOpen(false)
  }

  function removeFolder(path: string): void {
    setFolders((current) => current.filter((folder) => folder !== path))
    clearScan()
  }

  async function startScan(): Promise<void> {
    if (folders.length < 2 || isScanning) return

    setIsScanning(true)
    setError(null)
    clearScan()

    try {
      const nextResult = await window.mediaApi.scanFolders(folders, settings.matchStrictness)
      setResult(nextResult)
      setSelectedFolders(new Set(nextResult.folders))
      setSelectedExtensions(new Set(nextResult.extensions))
      setMarkedIds(new Set(nextResult.groups.flatMap((group) => group.files.filter((file) => file.recommendation === 'duplicate').map((file) => file.id))))
      setFolderPanelOpen(false)
      setFolderFilterOpen(false)
      setCustomPanelOpen(false)
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Scan fehlgeschlagen')
      setProgress({
        phase: 'error',
        message: 'Scan fehlgeschlagen',
        processed: 0
      })
    } finally {
      setIsScanning(false)
    }
  }

  async function exportMarked(): Promise<void> {
    if (markedRows.length === 0) return
    const exportResult = await window.mediaApi.exportMarked(markedRows)
    if (!exportResult.canceled && exportResult.filePath) setExportPath(exportResult.filePath)
  }

  function requestDelete(targets: DeleteTarget[], title: string): void {
    if (targets.length === 0) return
    setDeleteConfirmed(false)
    setDeleteModal({ targets, title })
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteModal || !deleteConfirmed || isDeleting) return

    setIsDeleting(true)
    setError(null)
    try {
      const deleteResult = await window.mediaApi.deleteFiles({
        mode: settings.deleteMode,
        targets: deleteModal.targets
      })

      if (deleteResult.deleted.length > 0) {
        const deletedIds = new Set(deleteResult.deleted.filter((item) => item.kind === 'file').map((file) => file.id))
        const deletedFolderPaths = new Set(deleteResult.deleted.filter((item) => item.kind === 'folder').map((file) => file.path))
        setResult((current) => (current ? removeDeletedFilesFromResult(current, deletedIds, deletedFolderPaths) : current))
        setMarkedIds((current) => {
          const next = new Set(current)
          for (const id of deletedIds) next.delete(id)
          return next
        })
        const nextHistory = [...deleteResult.deleted, ...settings.deleteHistory].slice(0, 100)
        await updateSettings({ ...settings, deleteHistory: nextHistory })
        setDeleteNotice(`${deleteResult.deleted.length} Element(e) entfernt. Du kannst jetzt optional neu scannen.`)
      }

      if (deleteResult.failed.length > 0) {
        setError(`${deleteResult.failed.length} Datei(en) konnten nicht gelöscht werden. Erste Meldung: ${deleteResult.failed[0].error}`)
      }

      setDeleteModal(null)
      setDeleteConfirmed(false)
    } finally {
      setIsDeleting(false)
    }
  }

  function toggleMarked(id: string): void {
    setMarkedIds((current) => toggleSetValue(current, id))
  }

  function toggleFolder(folder: string): void {
    setSelectedFolders((current) => toggleSetValue(current, folder))
  }

  function toggleExtension(extension: string): void {
    setSelectedExtensions((current) => toggleSetValue(current, extension))
  }

  function setAllFolders(enabled: boolean): void {
    setSelectedFolders(enabled ? new Set(availableFolders) : new Set())
  }

  function setAllExtensions(enabled: boolean): void {
    setSelectedExtensions(enabled ? new Set(availableExtensions) : new Set())
  }

  async function updateSettings(next: AppSettings): Promise<void> {
    const saved = await window.mediaApi.saveSettings(next)
    setSettings(saved)
  }

  async function excludeGroup(group: VisibleGroup): Promise<void> {
    const nextMatch: ExcludedMatch = {
      id: group.id,
      title: group.title,
      filePaths: group.files.map((file) => file.path),
      createdAt: Date.now()
    }
    await updateSettings({
      ...settings,
      excludedMatches: [...settings.excludedMatches.filter((match) => match.id !== group.id), nextMatch]
    })
  }

  async function restoreExcluded(id: string): Promise<void> {
    await updateSettings({
      ...settings,
      excludedMatches: settings.excludedMatches.filter((match) => match.id !== id)
    })
  }

  async function excludeFile(group: VisibleGroup, file: DuplicateFile): Promise<void> {
    const nextFile: ExcludedFile = {
      id: file.id,
      name: file.name,
      path: file.path,
      groupTitle: group.title,
      createdAt: Date.now()
    }
    setMarkedIds((current) => {
      const next = new Set(current)
      next.delete(file.id)
      return next
    })
    await updateSettings({
      ...settings,
      excludedFiles: [...settings.excludedFiles.filter((item) => item.id !== file.id), nextFile]
    })
  }

  async function restoreExcludedFile(id: string): Promise<void> {
    await updateSettings({
      ...settings,
      excludedFiles: settings.excludedFiles.filter((file) => file.id !== id)
    })
  }

  async function excludeFolderGroup(group: FolderCandidateGroup): Promise<void> {
    const nextMatch: ExcludedMatch = {
      id: group.id,
      title: `Ordner ohne Videos: ${group.title}`,
      filePaths: group.folders.map((folder) => folder.path),
      createdAt: Date.now()
    }
    await updateSettings({
      ...settings,
      excludedMatches: [...settings.excludedMatches.filter((match) => match.id !== group.id), nextMatch]
    })
  }

  const progressPercent = progress.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : isScanning ? 14 : 0

  return (
    <main className={`app-shell ${animationClass}`}>
      <section className="top-bar">
        <div className="brand-block">
          <span className="app-mark">
            <Film size={24} />
          </span>
          <div>
            <h1>Media Duplikat Finder</h1>
            <p>Findet doppelte Filme und Serienfolgen, ohne Dateien zu löschen oder zu verändern.</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="button secondary" onClick={() => setExcludedOpen(true)}>
            <EyeOff size={18} />
            Ausgeschlossen
            {settings.excludedMatches.length + settings.excludedFiles.length > 0 && <span className="button-count">{settings.excludedMatches.length + settings.excludedFiles.length}</span>}
          </button>
          <button className="button secondary" onClick={() => setHistoryOpen(true)}>
            <History size={18} />
            Zuletzt gelöscht
            {settings.deleteHistory.length > 0 && <span className="button-count">{settings.deleteHistory.length}</span>}
          </button>
          <button className="button secondary" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
            Einstellungen
          </button>
          <button className="button secondary" onClick={selectFolders} disabled={isScanning || isDeleting}>
            <FolderPlus size={18} />
            Ordner wählen
          </button>
          <button className="button primary" onClick={startScan} disabled={folders.length < 2 || isScanning || isDeleting}>
            {isScanning ? <RefreshCw className="spin" size={18} /> : <Play size={18} />}
            Scan starten
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <Mascot kind={settings.mascot} />

          <button className="panel-toggle" onClick={() => setFolderPanelOpen((open) => !open)} aria-expanded={folderPanelOpen}>
            <span>
              {folderPanelOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              Ordner
            </span>
            <strong>{folders.length}</strong>
          </button>

          <div className={folderPanelOpen ? 'folder-drawer open' : 'folder-drawer'}>
            {folders.length === 0 ? (
              <div className="empty-state">Wähle mindestens zwei Ordner mit Filmen oder Serien aus.</div>
            ) : (
              <ol className="folder-list">
                {folders.map((folder, index) => (
                  <li key={folder}>
                    <Folder size={18} />
                    <div>
                      <span className="folder-role">{index === 0 ? 'Bevorzugt behalten' : `Quelle ${index + 1}`}</span>
                      <strong title={folder}>{folder}</strong>
                    </div>
                    <button className="icon-button" onClick={() => removeFolder(folder)} disabled={isScanning || isDeleting} title="Ordner entfernen">
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="progress-panel">
            <div className="section-heading">
              <h2>Status</h2>
              <span>{phaseLabel(progress.phase)}</span>
            </div>
            <div className={isScanning ? 'progress-track active' : 'progress-track'}>
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p>{progress.message}</p>
            {progress.currentPath && <small title={progress.currentPath}>{progress.currentPath}</small>}
          </div>
        </aside>

        <section className="results">
          <div className="summary-band">
            <SummaryItem label="Dateien geprüft" value={result?.filesScanned ?? 0} />
            <SummaryItem label="Videos gefunden" value={result?.videosFound ?? 0} />
            <SummaryItem label="Treffergruppen" value={visibleGroups.length} />
            <SummaryItem label="Markiert" value={markedTargets.length} />
          </div>

          <section className="filter-strip">
            <div className="filter-mode" role="tablist" aria-label="Anzeige filtern">
              <ModeButton icon={<Folder size={17} />} label="Ordner" active={filterMode === 'folder'} onClick={() => setFilterMode('folder')} />
              <ModeButton icon={<Film size={17} />} label="Video" active={filterMode === 'video'} onClick={() => setFilterMode('video')} />
              <ModeButton icon={<SlidersHorizontal size={17} />} label="Selbst" active={filterMode === 'custom'} onClick={() => setFilterMode('custom')} />
            </div>

            <FilterPanel
              mode={filterMode}
              folders={availableFolders}
              extensions={availableExtensions}
              selectedFolders={selectedFolders}
              selectedExtensions={selectedExtensions}
              folderPanelOpen={filterMode === 'folder' ? folderFilterOpen : customPanelOpen}
              onTogglePanel={() => (filterMode === 'folder' ? setFolderFilterOpen((open) => !open) : setCustomPanelOpen((open) => !open))}
              onToggleFolder={toggleFolder}
              onToggleExtension={toggleExtension}
              onSetAllFolders={setAllFolders}
              onSetAllExtensions={setAllExtensions}
            />
          </section>

          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="Treffer filtern">
              {TABS.map((tab) => (
                <button key={tab.value} className={activeTab === tab.value ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab.value)} role="tab" aria-selected={activeTab === tab.value}>
                  {tab.label}
                  <span>
                    {tab.value === 'noVideoFolders'
                      ? result?.emptyFolderGroups.filter((group) => !excludedIds.has(group.id)).length ?? 0
                      : countForTab(result?.groups.filter((group) => !excludedIds.has(group.id)) ?? [], tab.value)}
                  </span>
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              <button className="button danger" onClick={() => requestDelete(markedTargets, 'Markierte Dateien löschen')} disabled={markedTargets.length === 0 || isScanning || isDeleting}>
                <Trash2 size={18} />
                Markierte löschen
              </button>
              <button className="button secondary" onClick={exportMarked} disabled={markedRows.length === 0 || isScanning || isDeleting}>
                <Download size={18} />
                Export CSV
              </button>
            </div>
          </div>

          {error && <div className="alert error">{error}</div>}
          {exportPath && <div className="alert success">Export gespeichert: {exportPath}</div>}
          {deleteNotice && (
            <div className="alert success action-alert">
              <span>{deleteNotice}</span>
              <button onClick={startScan} disabled={isScanning || folders.length < 2}>
                <RotateCcw size={16} />
                Neu scannen
              </button>
              <button onClick={() => setDeleteNotice(null)}>Ablehnen</button>
            </div>
          )}

          {!result ? (
            <div className="welcome">
              <ShieldCheck size={44} />
              <h2>Bereit für den ersten Scan</h2>
              <p>Die App scannt rekursiv Videodateien, vergleicht Namen und Teil-Fingerprints und zeigt danach Behalten-Vorschläge an.</p>
            </div>
          ) : visibleGroups.length === 0 && emptyFolderGroups.length === 0 ? (
            <div className="welcome">
              <Check size={44} />
              <h2>Keine Treffer in dieser Ansicht</h2>
              <p>Ändere die Filterauswahl, stelle die Treffer-Strenge um oder prüfe ausgeschlossene Treffer.</p>
            </div>
          ) : (
            <div className="group-list">
              {visibleGroups.length > 0 && seriesBuckets.map((bucket, index) => (
                <SeriesView
                  key={bucket.key}
                  bucket={bucket}
                  markedIds={markedIds}
                  onToggleMarked={toggleMarked}
                  onDeleteOne={(file) => requestDelete([{ id: file.id, path: file.path, name: file.name, size: file.size }], 'Datei löschen')}
                  onDeleteFolders={(targets) => requestDelete(targets, 'Ordner löschen')}
                  onExcludeGroup={excludeGroup}
                  onExcludeFile={excludeFile}
                  index={index}
                />
              ))}
              {visibleGroups.length > 0 && standaloneGroups.map((group, index) => (
                <DuplicateGroupView
                  key={group.id}
                  group={group}
                  markedIds={markedIds}
                  onToggleMarked={toggleMarked}
                  onDeleteOne={(file) => requestDelete([{ id: file.id, path: file.path, name: file.name, size: file.size }], 'Datei löschen')}
                  onDeleteFolders={(targets) => requestDelete(targets, 'Ordner löschen')}
                  onExcludeFile={(file) => excludeFile(group, file)}
                  onExclude={() => excludeGroup(group)}
                  index={seriesBuckets.length + index}
                />
              ))}
              {activeTab === 'noVideoFolders' && (
                <NoVideoFolderSection
                  groups={emptyFolderGroups}
                  allGroups={result.emptyFolderGroups.filter((group) => !excludedIds.has(group.id))}
                  activeTab={folderMatchTab}
                  onTabChange={setFolderMatchTab}
                  onDelete={(targets) => requestDelete(targets, 'Ordner ohne Videos löschen')}
                  onExclude={excludeFolderGroup}
                />
              )}
            </div>
          )}
        </section>
      </section>

      {settingsOpen && <SettingsModal settings={settings} onSave={updateSettings} onClose={() => setSettingsOpen(false)} />}
      {excludedOpen && <ExcludedModal2 excludedMatches={settings.excludedMatches} excludedFiles={settings.excludedFiles} onRestoreMatch={restoreExcluded} onRestoreFile={restoreExcludedFile} onClose={() => setExcludedOpen(false)} />}
      {historyOpen && <DeleteHistoryModal history={settings.deleteHistory} onClose={() => setHistoryOpen(false)} />}
      {deleteModal && (
        <DeleteConfirmModal
          state={deleteModal}
          mode={settings.deleteMode}
          confirmed={deleteConfirmed}
          isDeleting={isDeleting}
          onConfirmChange={setDeleteConfirmed}
          onCancel={() => setDeleteModal(null)}
          onDelete={confirmDelete}
        />
      )}
    </main>
  )
}

function ModeButton({ icon, label, active, onClick }: { icon: JSX.Element; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className={active ? 'mode-button active' : 'mode-button'} onClick={onClick} role="tab" aria-selected={active}>
      {icon}
      {label}
    </button>
  )
}

function FilterPanel({
  mode,
  folders,
  extensions,
  selectedFolders,
  selectedExtensions,
  folderPanelOpen,
  onTogglePanel,
  onToggleFolder,
  onToggleExtension,
  onSetAllFolders,
  onSetAllExtensions
}: {
  mode: FilterMode
  folders: string[]
  extensions: string[]
  selectedFolders: Set<string>
  selectedExtensions: Set<string>
  folderPanelOpen: boolean
  onTogglePanel: () => void
  onToggleFolder: (folder: string) => void
  onToggleExtension: (extension: string) => void
  onSetAllFolders: (enabled: boolean) => void
  onSetAllExtensions: (enabled: boolean) => void
}): JSX.Element {
  if (mode === 'video') {
    return (
      <div className="quick-filter">
        <span>Videotypen</span>
        {extensions.length === 0 ? <small>Noch kein Scan</small> : extensions.map((extension) => <Pill key={extension} label={`.${extension}`} active />)}
      </div>
    )
  }

  const showCustom = mode === 'custom'

  return (
    <div className="filter-panel">
      <button className="filter-panel-head" onClick={onTogglePanel} aria-expanded={folderPanelOpen}>
        <span>
          {folderPanelOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          {showCustom ? 'Alles Erkannte selbst auswählen' : 'Ordner anzeigen'}
        </span>
        <strong>
          {selectedFolders.size}/{folders.length} Ordner · {selectedExtensions.size}/{extensions.length} Typen
        </strong>
      </button>

      <div className={folderPanelOpen ? 'filter-drawer open' : 'filter-drawer'}>
        {folders.length === 0 ? (
          <div className="empty-state compact">Nach dem Scan erscheinen hier alle erkannten Ordner und Video-Typen.</div>
        ) : (
          <>
            <CheckList title="Ordner" items={folders} selected={selectedFolders} renderLabel={(folder) => folder} onToggle={onToggleFolder} onAll={onSetAllFolders} />
            {showCustom && <CheckList title="Video-Typen" items={extensions} selected={selectedExtensions} renderLabel={(extension) => `.${extension}`} onToggle={onToggleExtension} onAll={onSetAllExtensions} />}
          </>
        )}
      </div>
    </div>
  )
}

function CheckList({
  title,
  items,
  selected,
  renderLabel,
  onToggle,
  onAll
}: {
  title: string
  items: string[]
  selected: Set<string>
  renderLabel: (value: string) => string
  onToggle: (value: string) => void
  onAll: (enabled: boolean) => void
}): JSX.Element {
  return (
    <section className="check-list">
      <header>
        <h3>{title}</h3>
        <div>
          <button onClick={() => onAll(true)}>Alle</button>
          <button onClick={() => onAll(false)}>Keine</button>
        </div>
      </header>
      <div className="check-grid">
        {items.map((item) => (
          <label key={item} className={selected.has(item) ? 'check-chip active' : 'check-chip'}>
            <input type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)} />
            <span title={renderLabel(item)}>{renderLabel(item)}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

function SummaryItem({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="summary-item">
      <strong>{value.toLocaleString('de-DE')}</strong>
      <span>{label}</span>
    </div>
  )
}

function NoVideoFolderSection({
  groups,
  allGroups,
  activeTab,
  onTabChange,
  onDelete,
  onExclude
}: {
  groups: FolderCandidateGroup[]
  allGroups: FolderCandidateGroup[]
  activeTab: MatchConfidence | 'all'
  onTabChange: (tab: MatchConfidence | 'all') => void
  onDelete: (targets: DeleteTarget[]) => void
  onExclude: (group: FolderCandidateGroup) => void
}): JSX.Element {
  return (
    <section className="empty-folder-section">
      <header>
        <div>
          <h2>Ordner ohne Videos</h2>
          <p>Ordnergruppen, in denen keine Videodateien erkannt wurden. Inhalte können trotzdem andere Dateien enthalten.</p>
        </div>
      </header>
      <div className="folder-tabs">
        {[
          { value: 'all' as const, label: 'Alle' },
          { value: 'safe' as const, label: 'Super sicher' },
          { value: 'likely' as const, label: 'Sicher' },
          { value: 'possible' as const, label: 'Unsicher' }
        ].map((tab) => (
          <button key={tab.value} className={activeTab === tab.value ? 'tab active' : 'tab'} onClick={() => onTabChange(tab.value)}>
            {tab.label}
            <span>{folderCountForTab(allGroups, tab.value)}</span>
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <div className="empty-state compact">Keine Ordner in dieser Sicherheitsstufe.</div>
      ) : (
        <div className="empty-folder-list">
          {groups.map((group) => (
            <NoVideoFolderGroup key={group.id} group={group} onDelete={onDelete} onExclude={onExclude} />
          ))}
        </div>
      )}
    </section>
  )
}

function NoVideoFolderGroup({ group, onDelete, onExclude }: { group: FolderCandidateGroup; onDelete: (targets: DeleteTarget[]) => void; onExclude: (group: FolderCandidateGroup) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.folders.filter((folder) => folder.recommendation === 'delete').map((folder) => folder.id)))
  const targets = group.folders.filter((folder) => selected.has(folder.id)).map(folderToDeleteTarget)

  return (
    <article className="empty-folder-group">
      <button className="folder-group-header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        <div>
          <h3>{group.title}</h3>
          <p>{group.reason.join(' · ')}</p>
        </div>
        <div className={`confidence ${group.confidence}`}>
          {folderConfidenceLabel(group.confidence)}
          <strong>{group.score}%</strong>
        </div>
      </button>
      <div className={open ? 'folder-candidate-list open' : 'folder-candidate-list'}>
        {group.folders.map((folder) => (
          <label key={folder.id} className={selected.has(folder.id) ? 'folder-candidate-row active' : 'folder-candidate-row'}>
            <input type="checkbox" checked={selected.has(folder.id)} onChange={() => setSelected((current) => toggleSetValue(current, folder.id))} />
            <span className={folder.recommendation === 'keep' ? 'folder-keep-badge' : 'folder-delete-badge'}>{folder.recommendation === 'keep' ? 'Behalten' : 'Löschen'}</span>
            <div>
              <strong>{folder.name}</strong>
              <small>
                {folder.fileCount} Datei(en), kein Video · {formatBytes(folder.size)}
              </small>
              <em>{folder.path}</em>
            </div>
          </label>
        ))}
        <button className="button danger folder-delete-button" onClick={() => onDelete(targets)} disabled={targets.length === 0}>
          <Trash2 size={16} />
          Ausgewählte Ordner löschen
        </button>
        <button className="button secondary folder-exclude-button" onClick={() => onExclude(group)}>
          <EyeOff size={16} />
          Falsch erkannt
        </button>
      </div>
    </article>
  )
}

function SeriesView({
  bucket,
  markedIds,
  onToggleMarked,
  onDeleteOne,
  onDeleteFolders,
  onExcludeGroup,
  onExcludeFile,
  index
}: {
  bucket: SeriesBucket
  markedIds: Set<string>
  onToggleMarked: (id: string) => void
  onDeleteOne: (file: DuplicateFile) => void
  onDeleteFolders: (targets: DeleteTarget[]) => void
  onExcludeGroup: (group: VisibleGroup) => void
  onExcludeFile: (group: VisibleGroup, file: DuplicateFile) => void
  index: number
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const totalEpisodes = bucket.seasons.reduce((sum, season) => sum + season.groups.length, 0)
  const totalFiles = bucket.seasons.reduce((sum, season) => sum + season.groups.reduce((fileSum, group) => fileSum + group.files.length, 0), 0)

  return (
    <article className="series-group" style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}>
      <button className="series-header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</span>
        <div>
          <h3>{bucket.title}</h3>
          <p>
            {bucket.seasons.length} Staffel(n) · {totalEpisodes} Folge(n) · {totalFiles} Datei(en)
          </p>
        </div>
      </button>
      <div className={open ? 'season-list open' : 'season-list'}>
        {bucket.seasons.map((season) => (
          <SeasonView
            key={`${bucket.key}-${season.season}`}
            season={season.season}
            groups={season.groups}
            markedIds={markedIds}
            onToggleMarked={onToggleMarked}
            onDeleteOne={onDeleteOne}
            onDeleteFolders={onDeleteFolders}
            onExcludeGroup={onExcludeGroup}
            onExcludeFile={onExcludeFile}
          />
        ))}
      </div>
    </article>
  )
}

function SeasonView({
  season,
  groups,
  markedIds,
  onToggleMarked,
  onDeleteOne,
  onDeleteFolders,
  onExcludeGroup,
  onExcludeFile
}: {
  season: number
  groups: VisibleGroup[]
  markedIds: Set<string>
  onToggleMarked: (id: string) => void
  onDeleteOne: (file: DuplicateFile) => void
  onDeleteFolders: (targets: DeleteTarget[]) => void
  onExcludeGroup: (group: VisibleGroup) => void
  onExcludeFile: (group: VisibleGroup, file: DuplicateFile) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <section className="season-group">
      <button className="season-header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        <strong>Staffel {season.toString().padStart(2, '0')}</strong>
        <small>{groups.length} Folge(n)</small>
      </button>
      <div className={open ? 'episode-list open' : 'episode-list'}>
        {groups.map((group, index) => (
          <DuplicateGroupView
            key={group.id}
            group={group}
            markedIds={markedIds}
            onToggleMarked={onToggleMarked}
            onDeleteOne={onDeleteOne}
            onDeleteFolders={onDeleteFolders}
            onExcludeFile={(file) => onExcludeFile(group, file)}
            onExclude={() => onExcludeGroup(group)}
            index={index}
          />
        ))}
      </div>
    </section>
  )
}

function DuplicateGroupView({
  group,
  markedIds,
  onToggleMarked,
  onDeleteOne,
  onDeleteFolders,
  onExcludeFile,
  onExclude,
  index
}: {
  group: VisibleGroup
  markedIds: Set<string>
  onToggleMarked: (id: string) => void
  onDeleteOne: (file: DuplicateFile) => void
  onDeleteFolders: (targets: DeleteTarget[]) => void
  onExcludeFile: (file: DuplicateFile) => void
  onExclude: () => void
  index: number
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [showFullPaths, setShowFullPaths] = useState(false)
  const [showFolderTargets, setShowFolderTargets] = useState(false)
  const folderTargets = useMemo(() => buildMediaFolderTargets(group), [group])
  const [selectedFolderTargets, setSelectedFolderTargets] = useState<Set<string>>(() => new Set(folderTargets.filter((target) => target.autoSelected).map((target) => target.id)))
  const selectedFolderDeleteTargets = folderTargets.filter((target) => selectedFolderTargets.has(target.id)).map((target) => target.target)

  function toggleFolderTarget(id: string): void {
    setSelectedFolderTargets((current) => toggleSetValue(current, id))
  }

  return (
    <article className="group" style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}>
      <button className="group-header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="group-title">
          {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <div>
            <h3>{group.title}</h3>
            <p>{group.reason.join(' · ')}</p>
          </div>
        </div>
        <div className={`confidence ${group.confidence}`}>
          {confidenceLabel(group.confidence)}
          <strong>{group.score}%</strong>
        </div>
      </button>

      <div className={open ? 'file-table open' : 'file-table'}>
        <div className="group-actions">
          <button onClick={() => setShowFullPaths((value) => !value)}>
            {showFullPaths ? <EyeOff size={16} /> : <Eye size={16} />}
            {showFullPaths ? 'Pfade einklappen' : 'Ganze Pfade anzeigen'}
          </button>
          <button onClick={() => setShowFolderTargets((value) => !value)} disabled={folderTargets.length === 0}>
            <Folder size={16} />
            Ordner löschen
          </button>
          <button onClick={onExclude}>
            <EyeOff size={16} />
            Falsch erkannt
          </button>
        </div>

        {showFolderTargets && (
          <div className="folder-delete-panel">
            <div>
              <strong>Ordner zu diesem Treffer</strong>
              <span>Automatisch angehakt, wenn der Ordnername gut zur Datei oder Gruppe passt. Du kannst alles ändern.</span>
            </div>
            {folderTargets.length === 0 ? (
              <p>Kein sicherer Unterordner gefunden. Quellordner werden hier nicht vorgeschlagen.</p>
            ) : (
              <>
                <div className="folder-delete-list">
                  {folderTargets.map((item) => (
                    <label key={item.id} className={selectedFolderTargets.has(item.id) ? 'folder-delete-row active' : 'folder-delete-row'}>
                      <input type="checkbox" checked={selectedFolderTargets.has(item.id)} onChange={() => toggleFolderTarget(item.id)} />
                      <span>
                        <strong>{item.target.name}</strong>
                        <small>{item.reason}</small>
                        <em>{item.target.path}</em>
                      </span>
                    </label>
                  ))}
                </div>
                <button className="button danger folder-delete-button" onClick={() => onDeleteFolders(selectedFolderDeleteTargets)} disabled={selectedFolderDeleteTargets.length === 0}>
                  <Trash2 size={16} />
                  Ausgewählte Ordner löschen
                </button>
              </>
            )}
          </div>
        )}

        {group.files.map((file) => (
          <div key={file.id} className={file.recommendation === 'keep' ? 'file-row keep' : 'file-row duplicate'}>
            <VideoThumbnail file={file} />
            <div className={showFullPaths ? 'file-main full-path' : 'file-main'}>
              <strong title={file.name}>{file.name}</strong>
              <span title={file.path}>{file.path}</span>
            </div>
            <div className="file-meta">
              <span>{formatBytes(file.size)}</span>
              <span>{file.parsed.qualityLabel ?? 'Qualität unbekannt'}</span>
              <span>{new Date(file.modifiedAt).toLocaleDateString('de-DE')}</span>
            </div>
            <div className="file-action">
              <label className="mark-toggle" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={markedIds.has(file.id)} onChange={() => onToggleMarked(file.id)} />
                Markieren
              </label>
              <button className="mini-danger" onClick={() => onDeleteOne(file)} title="Diese Datei löschen">
                <Trash2 size={15} />
                Löschen
              </button>
              <button className="mini-secondary" onClick={() => onExcludeFile(file)} title="Diese Datei als falsch erkannt ausblenden">
                <EyeOff size={15} />
                Falsch
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function VideoThumbnail({ file }: { file: DuplicateFile }): JSX.Element {
  const [src, setSrc] = useState<string | undefined>()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let canceled = false
    setLoaded(false)
    void window.mediaApi.getVideoThumbnail(file.path).then((thumbnail) => {
      if (canceled) return
      setSrc(thumbnail)
      setLoaded(true)
    })
    return () => {
      canceled = true
    }
  }, [file.path])

  return (
    <div className="video-thumb">
      {src ? (
        <img src={src} alt="" />
      ) : (
        <div className={loaded ? 'thumb-fallback ready' : 'thumb-fallback'}>
          {loaded ? <Film size={24} /> : <Image size={24} />}
          <span>.{file.extension}</span>
        </div>
      )}
    </div>
  )
}

function SettingsModal({ settings, onSave, onClose }: { settings: AppSettings; onSave: (settings: AppSettings) => Promise<void>; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState(settings)

  async function saveAndClose(): Promise<void> {
    await onSave(draft)
    onClose()
  }

  function setDeleteMode(deleteMode: DeleteMode): void {
    setDraft((current) => ({ ...current, deleteMode }))
  }

  function setMascot(mascot: MascotKind): void {
    setDraft((current) => ({ ...current, mascot }))
  }

  function setMatchStrictness(matchStrictness: MatchStrictness): void {
    setDraft((current) => ({ ...current, matchStrictness }))
  }

  function toggleAnimation(key: keyof AppSettings['animations']): void {
    setDraft((current) => ({
      ...current,
      animations: {
        ...current.animations,
        [key]: !current.animations[key]
      }
    }))
  }

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal">
        <header className="modal-header">
          <div>
            <h2>Einstellungen</h2>
            <p>Löschmodus, Treffer-Strenge, Maskottchen und Animationen werden lokal gespeichert.</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-grid">
          <section className="settings-block">
            <h3>Löschen</h3>
            <label className="radio-card">
              <input type="radio" checked={draft.deleteMode === 'trash'} onChange={() => setDeleteMode('trash')} />
              <span>Windows-Papierkorb</span>
              <small>Sicherer Standard, normalerweise wiederherstellbar.</small>
            </label>
            <label className="radio-card danger-choice">
              <input type="radio" checked={draft.deleteMode === 'permanent'} onChange={() => setDeleteMode('permanent')} />
              <span>Endgültig löschen</span>
              <small>Riskanter Modus. Das Bestätigungsfenster bleibt Pflicht.</small>
            </label>
          </section>

          <section className="settings-block">
            <h3>Maskottchen</h3>
            <div className="mascot-picker">
              <MascotOption kind="detective" label="Detektiv-Lupe" selected={draft.mascot === 'detective'} onClick={() => setMascot('detective')} />
              <MascotOption kind="robot" label="Film-Roboter" selected={draft.mascot === 'robot'} onClick={() => setMascot('robot')} />
              <MascotOption kind="folder" label="Ordner-Helfer" selected={draft.mascot === 'folder'} onClick={() => setMascot('folder')} />
            </div>
          </section>

          <section className="settings-block">
            <h3>Animationen</h3>
            <Toggle label="Maskottchen" checked={draft.animations.mascot} onChange={() => toggleAnimation('mascot')} />
            <Toggle label="Karten und Listen" checked={draft.animations.cards} onChange={() => toggleAnimation('cards')} />
            <Toggle label="Fenster und Bestätigung" checked={draft.animations.modals} onChange={() => toggleAnimation('modals')} />
            <Toggle label="Fortschritt" checked={draft.animations.progress} onChange={() => toggleAnimation('progress')} />
          </section>

          <section className="settings-block">
            <h3>Treffer-Strenge</h3>
            <label className="radio-card">
              <input type="radio" checked={draft.matchStrictness === 'strict'} onChange={() => setMatchStrictness('strict')} />
              <span>Streng</span>
              <small>Weniger falsche Treffer, aber übersieht mehr.</small>
            </label>
            <label className="radio-card">
              <input type="radio" checked={draft.matchStrictness === 'smart'} onChange={() => setMatchStrictness('smart')} />
              <span>Sicher + smart</span>
              <small>Empfohlene Balance.</small>
            </label>
            <label className="radio-card">
              <input type="radio" checked={draft.matchStrictness === 'loose'} onChange={() => setMatchStrictness('loose')} />
              <span>Locker</span>
              <small>Findet mehr mögliche Treffer.</small>
            </label>
          </section>
        </div>

        <footer className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" onClick={saveAndClose}>
            Speichern
          </button>
        </footer>
      </section>
    </div>
  )
}

function ExcludedModal2({
  excludedMatches,
  excludedFiles,
  onRestoreMatch,
  onRestoreFile,
  onClose
}: {
  excludedMatches: ExcludedMatch[]
  excludedFiles: ExcludedFile[]
  onRestoreMatch: (id: string) => void
  onRestoreFile: (id: string) => void
  onClose: () => void
}): JSX.Element {
  const hasItems = excludedMatches.length > 0 || excludedFiles.length > 0

  return (
    <div className="modal-backdrop">
      <section className="modal excluded-modal">
        <header className="modal-header">
          <div>
            <h2>Ausgeschlossene Treffer</h2>
            <p>Gruppen und einzelne Dateien bleiben ausgeblendet, bis du sie wiederherstellst.</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="excluded-list readable">
          {!hasItems ? (
            <div className="empty-state compact">Noch keine falsch erkannten Treffer ausgeschlossen.</div>
          ) : (
            <>
              {excludedMatches.length > 0 && <h3>Ausgeschlossene Gruppen</h3>}
              {excludedMatches.map((match) => (
                <article key={match.id} className="excluded-item">
                  <div>
                    <strong>{match.title}</strong>
                    <span>{match.filePaths.length} Datei(en) · {new Date(match.createdAt).toLocaleString('de-DE')}</span>
                    <ul>
                      {match.filePaths.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </div>
                  <button className="button secondary" onClick={() => onRestoreMatch(match.id)}>
                    <Undo2 size={16} />
                    Wieder anzeigen
                  </button>
                </article>
              ))}
              {excludedFiles.length > 0 && <h3>Ausgeschlossene Dateien</h3>}
              {excludedFiles.map((file) => (
                <article key={file.id} className="excluded-item">
                  <div>
                    <strong>{file.name}</strong>
                    <span>{file.groupTitle} · {new Date(file.createdAt).toLocaleString('de-DE')}</span>
                    <ul>
                      <li>{file.path}</li>
                    </ul>
                  </div>
                  <button className="button secondary" onClick={() => onRestoreFile(file.id)}>
                    <Undo2 size={16} />
                    Wieder anzeigen
                  </button>
                </article>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function DeleteHistoryModal({ history, onClose }: { history: AppSettings['deleteHistory']; onClose: () => void }): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="modal history-modal">
        <header className="modal-header">
          <div>
            <h2>Zuletzt gelöscht</h2>
            <p>Lokaler Verlauf der letzten Löschaktionen. Papierkorb-Einträge sind normalerweise wiederherstellbar.</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="history-list">
          {history.length === 0 ? (
            <div className="empty-state compact">Noch nichts über diese App gelöscht.</div>
          ) : (
            history.map((item) => (
              <article key={`${item.id}-${item.deletedAt}`} className="history-item">
                <div className={item.kind === 'folder' ? 'history-kind folder' : 'history-kind file'}>{item.kind === 'folder' ? <Folder size={18} /> : <Film size={18} />}</div>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.kind === 'folder' ? 'Ordner' : 'Datei'} · {item.mode === 'trash' ? 'Papierkorb' : 'Endgültig'} · {new Date(item.deletedAt).toLocaleString('de-DE')}
                  </span>
                  <small>{item.path}</small>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function DeleteConfirmModal({
  state,
  mode,
  confirmed,
  isDeleting,
  onConfirmChange,
  onCancel,
  onDelete
}: {
  state: Exclude<DeleteModalState, null>
  mode: DeleteMode
  confirmed: boolean
  isDeleting: boolean
  onConfirmChange: (confirmed: boolean) => void
  onCancel: () => void
  onDelete: () => void
}): JSX.Element {
  const totalSize = state.targets.filter((target) => (target.kind ?? 'file') === 'file').reduce((sum, target) => sum + target.size, 0)
  const folderCount = state.targets.filter((target) => target.kind === 'folder').length
  const fileCount = state.targets.length - folderCount

  return (
    <div className="modal-backdrop">
      <section className="modal delete-modal">
        <header className="modal-header danger-header">
          <div>
            <h2>{state.title}</h2>
            <p>
              {fileCount} Datei(en), {folderCount} Ordner · {formatBytes(totalSize)} · {mode === 'trash' ? 'Papierkorb' : 'endgültig löschen'}
            </p>
          </div>
          <AlertTriangle size={34} />
        </header>

        <div className="delete-preview full">
          {state.targets.map((target) => (
            <div key={target.id}>
              <strong>{target.kind === 'folder' ? 'Ordner: ' : 'Datei: '}{target.name}</strong>
              <span>{target.path}</span>
            </div>
          ))}
        </div>

        <label className="confirm-check">
          <input type="checkbox" checked={confirmed} onChange={(event) => onConfirmChange(event.currentTarget.checked)} />
          Ich habe geprüft, dass genau diese Dateien gelöscht werden sollen.
        </label>

        <footer className="modal-actions">
          <button className="button secondary" onClick={onCancel} disabled={isDeleting}>
            Abbrechen
          </button>
          <button className="button danger" onClick={onDelete} disabled={!confirmed || isDeleting}>
            {isDeleting ? <RefreshCw className="spin" size={18} /> : <Trash2 size={18} />}
            {mode === 'trash' ? 'In Papierkorb' : 'Endgültig löschen'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function MascotOption({ kind, label, selected, onClick }: { kind: MascotKind; label: string; selected: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className={selected ? 'mascot-option active' : 'mascot-option'} onClick={onClick}>
      <Mascot kind={kind} compact />
      <span>{label}</span>
    </button>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }): JSX.Element {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  )
}

function Mascot({ kind, compact = false }: { kind: MascotKind; compact?: boolean }): JSX.Element {
  return (
    <div className={compact ? `mascot compact ${kind}` : `mascot ${kind}`} aria-hidden="true">
      {kind === 'detective' && (
        <>
          <div className="mascot-head">
            <span className="eye left" />
            <span className="eye right" />
            <span className="smile" />
          </div>
          <span className="hat" />
          <span className="magnifier">
            <span className="lens" />
            <span className="handle" />
          </span>
        </>
      )}
      {kind === 'robot' && (
        <>
          <div className="robot-body">
            <span className="eye left" />
            <span className="eye right" />
            <span className="smile" />
            <span className="robot-cheek left" />
            <span className="robot-cheek right" />
          </div>
          <span className="antenna" />
          <span className="film-strip" />
          <span className="robot-arm left" />
          <span className="robot-arm right" />
        </>
      )}
      {kind === 'folder' && (
        <>
          <div className="folder-body">
            <span className="eye left" />
            <span className="eye right" />
            <span className="smile" />
            <span className="folder-paper" />
          </div>
          <span className="folder-tab" />
          <span className="spark one" />
          <span className="spark two" />
        </>
      )}
    </div>
  )
}

function Pill({ label, active }: { label: string; active: boolean }): JSX.Element {
  return <span className={active ? 'pill active' : 'pill'}>{label}</span>
}

function countForTab(groups: DuplicateGroup[], tab: MatchConfidence | 'all'): number {
  if (tab === 'all') return groups.length
  return groups.filter((group) => group.confidence === tab).length
}

function confidenceLabel(confidence: MatchConfidence): string {
  if (confidence === 'safe') return 'Sicher gleich'
  if (confidence === 'likely') return 'Wahrscheinlich gleich'
  return 'Möglicher Treffer'
}

function phaseLabel(phase: ScanProgress['phase']): string {
  if (phase === 'walking') return 'Suchen'
  if (phase === 'fingerprinting') return 'Prüfen'
  if (phase === 'matching') return 'Vergleichen'
  if (phase === 'done') return 'Fertig'
  if (phase === 'error') return 'Fehler'
  return 'Bereit'
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function animationClassName(settings: AppSettings): string {
  return [
    settings.animations.mascot ? '' : 'no-mascot-animation',
    settings.animations.cards ? '' : 'no-card-animation',
    settings.animations.modals ? '' : 'no-modal-animation',
    settings.animations.progress ? '' : 'no-progress-animation'
  ]
    .filter(Boolean)
    .join(' ')
}

function splitSeriesGroups(groups: VisibleGroup[]): { seriesBuckets: SeriesBucket[]; standaloneGroups: VisibleGroup[] } {
  const buckets = new Map<string, SeriesBucket>()
  const standaloneGroups: VisibleGroup[] = []

  for (const group of groups) {
    const firstFile = group.files[0]
    const season = firstFile?.parsed.season
    const seriesTitle = firstFile?.parsed.seriesTitle

    if (!season || !seriesTitle) {
      standaloneGroups.push(group)
      continue
    }

    const key = seriesTitle.toLowerCase()
    const bucket = buckets.get(key) ?? { key, title: seriesTitle, seasons: [] }
    let seasonBucket = bucket.seasons.find((item) => item.season === season)
    if (!seasonBucket) {
      seasonBucket = { season, groups: [] }
      bucket.seasons.push(seasonBucket)
    }
    seasonBucket.groups.push(group)
    buckets.set(key, bucket)
  }

  const seriesBuckets = [...buckets.values()].map((bucket) => ({
    ...bucket,
    seasons: bucket.seasons
      .map((season) => ({
        ...season,
        groups: season.groups.sort((a, b) => (a.files[0]?.parsed.episode ?? 0) - (b.files[0]?.parsed.episode ?? 0) || a.title.localeCompare(b.title, 'de'))
      }))
      .sort((a, b) => a.season - b.season)
  }))

  return {
    seriesBuckets: seriesBuckets.sort((a, b) => a.title.localeCompare(b.title, 'de')),
    standaloneGroups
  }
}

function buildMediaFolderTargets(group: VisibleGroup): Array<{ id: string; target: DeleteTarget; autoSelected: boolean; reason: string }> {
  const targets = new Map<string, { id: string; target: DeleteTarget; autoSelected: boolean; reason: string }>()
  for (const file of group.files) {
    if (normalizePath(file.folder) === normalizePath(file.rootPath)) continue

    const folderName = basenameFromPath(file.folder)
    const folderText = normalizeFolderName(folderName)
    const titleScore = Math.max(
      similarity(folderText, normalizeFolderName(group.title)),
      similarity(folderText, file.parsed.comparableTitle),
      similarity(folderText, file.parsed.seriesTitle ? normalizeFolderName(file.parsed.seriesTitle) : '')
    )
    const autoSelected = titleScore >= 0.72
    const id = `folder:${file.folder}`
    const existing = targets.get(id)
    const item = {
      id,
      target: {
        id,
        path: file.folder,
        name: folderName,
        size: 0,
        kind: 'folder' as const
      },
      autoSelected,
      reason: autoSelected ? `Automatisch angehakt · Namensähnlichkeit ${Math.round(titleScore * 100)}%` : `Manuell wählbar · Namensähnlichkeit ${Math.round(titleScore * 100)}%`
    }
    if (!existing || (item.autoSelected && !existing.autoSelected)) targets.set(id, item)
  }
  return [...targets.values()].sort((a, b) => Number(b.autoSelected) - Number(a.autoSelected) || a.target.path.localeCompare(b.target.path, 'de'))
}

function folderToDeleteTarget(folder: FolderCandidate): DeleteTarget {
  return {
    id: folder.id,
    path: folder.path,
    name: folder.name,
    size: folder.size,
    kind: 'folder'
  }
}

function folderCountForTab(groups: FolderCandidateGroup[], tab: MatchConfidence | 'all'): number {
  if (tab === 'all') return groups.length
  return groups.filter((group) => group.confidence === tab).length
}

function folderConfidenceLabel(confidence: MatchConfidence): string {
  if (confidence === 'safe') return 'Super sicher'
  if (confidence === 'likely') return 'Sicher'
  return 'Unsicher'
}

function basenameFromPath(path: string): string {
  return path.replace(/[\\/]+$/g, '').split(/[\\/]/).pop() ?? path
}

function normalizePath(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase()
}

export default App

