import type { DuplicateGroup, ScanResult } from './types'

export function removeDeletedFilesFromResult(result: ScanResult, deletedIds: Set<string>): ScanResult {
  const groups: DuplicateGroup[] = result.groups
    .map((group) => ({
      ...group,
      files: group.files.filter((file) => !deletedIds.has(file.id))
    }))
    .filter((group) => group.files.length > 0)

  const folders = Array.from(new Set(groups.flatMap((group) => group.files.map((file) => file.folder)))).sort((a, b) => a.localeCompare(b, 'de'))
  const extensions = Array.from(new Set(groups.flatMap((group) => group.files.map((file) => file.extension)))).sort((a, b) => a.localeCompare(b, 'de'))

  return {
    ...result,
    videosFound: Math.max(0, result.videosFound - deletedIds.size),
    folders,
    extensions,
    groups
  }
}
