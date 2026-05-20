import type { AppSettings } from './types'

export const defaultSettings: AppSettings = {
  deleteMode: 'trash',
  mascot: 'detective',
  matchStrictness: 'smart',
  animations: {
    mascot: true,
    cards: true,
    modals: true,
    progress: true
  },
  recentFolders: [],
  excludedMatches: [],
  excludedFiles: [],
  deleteHistory: []
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return defaultSettings

  const input = value as Partial<AppSettings>
  const animations: Partial<AppSettings['animations']> = input.animations && typeof input.animations === 'object' ? input.animations : {}

  return {
    deleteMode: input.deleteMode === 'permanent' ? 'permanent' : 'trash',
    mascot: input.mascot === 'robot' || input.mascot === 'folder' ? input.mascot : 'detective',
    matchStrictness: input.matchStrictness === 'strict' || input.matchStrictness === 'loose' ? input.matchStrictness : 'smart',
    animations: {
      mascot: typeof animations.mascot === 'boolean' ? animations.mascot : defaultSettings.animations.mascot,
      cards: typeof animations.cards === 'boolean' ? animations.cards : defaultSettings.animations.cards,
      modals: typeof animations.modals === 'boolean' ? animations.modals : defaultSettings.animations.modals,
      progress: typeof animations.progress === 'boolean' ? animations.progress : defaultSettings.animations.progress
    },
    recentFolders: Array.isArray(input.recentFolders)
      ? input.recentFolders.filter((folder): folder is string => typeof folder === 'string' && folder.trim().length > 0).slice(0, 20)
      : [],
    excludedMatches: Array.isArray(input.excludedMatches)
      ? input.excludedMatches
          .filter((item) => item && typeof item === 'object')
          .map((item) => item as Partial<AppSettings['excludedMatches'][number]>)
          .filter((item) => typeof item.id === 'string' && typeof item.title === 'string' && Array.isArray(item.filePaths))
          .map((item) => ({
            id: item.id as string,
            title: item.title as string,
            filePaths: (item.filePaths as unknown[]).filter((path): path is string => typeof path === 'string'),
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
          }))
      : [],
    excludedFiles: Array.isArray(input.excludedFiles)
      ? input.excludedFiles
          .filter((item) => item && typeof item === 'object')
          .map((item) => item as Partial<AppSettings['excludedFiles'][number]>)
          .filter((item) => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.path === 'string')
          .map((item) => ({
            id: item.id as string,
            name: item.name as string,
            path: item.path as string,
            groupTitle: typeof item.groupTitle === 'string' ? item.groupTitle : 'Unbekannte Gruppe',
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
          }))
      : [],
    deleteHistory: Array.isArray(input.deleteHistory)
      ? input.deleteHistory
          .filter((item) => item && typeof item === 'object')
          .map((item) => item as Partial<AppSettings['deleteHistory'][number]>)
          .filter((item) => typeof item.id === 'string' && typeof item.path === 'string' && typeof item.name === 'string')
          .map((item) => ({
            id: item.id as string,
            path: item.path as string,
            name: item.name as string,
            size: typeof item.size === 'number' ? item.size : 0,
            kind: item.kind === 'folder' ? ('folder' as const) : ('file' as const),
            mode: item.mode === 'permanent' ? ('permanent' as const) : ('trash' as const),
            deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now()
          }))
          .slice(0, 100)
      : []
  }
}
