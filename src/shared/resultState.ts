import type { DuplicateGroup, ScanResult } from './types'

export function removeDeletedFilesFromResult(result: ScanResult, deletedIds: Set<string>, deletedFolderPaths = new Set<string>()): ScanResult {
  const groups: DuplicateGroup[] = result.groups
    .map((group) => ({
      ...group,
      files: group.files.filter((file) => !deletedIds.has(file.id) && !isInsideDeletedFolder(file.path, deletedFolderPaths))
    }))
    .filter((group) => group.files.length > 0)

  const folders = Array.from(new Set(groups.flatMap((group) => group.files.map((file) => file.folder)))).sort((a, b) => a.localeCompare(b, 'de'))
  const extensions = Array.from(new Set(groups.flatMap((group) => group.files.map((file) => file.extension)))).sort((a, b) => a.localeCompare(b, 'de'))
  const deletedFileCount = result.groups.flatMap((group) => group.files).filter((file) => deletedIds.has(file.id) || isInsideDeletedFolder(file.path, deletedFolderPaths)).length
  const emptyFolderGroups = result.emptyFolderGroups
    .map((group) => ({
      ...group,
      folders: group.folders.filter((folder) => !deletedIds.has(folder.id) && !isInsideDeletedFolder(folder.path, deletedFolderPaths))
    }))
    .filter((group) => group.folders.length > 0)

  return {
    ...result,
    videosFound: Math.max(0, result.videosFound - deletedFileCount),
    folders,
    extensions,
    groups,
    emptyFolderGroups
  }
}

function isInsideDeletedFolder(path: string, deletedFolderPaths: Set<string>): boolean {
  const normalized = normalizePath(path)
  for (const folderPath of deletedFolderPaths) {
    const folder = normalizePath(folderPath)
    if (normalized === folder || normalized.startsWith(`${folder}\\`)) return true
  }
  return false
}

function normalizePath(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase()
}
