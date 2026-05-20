import { describe, expect, it } from 'vitest'
import { removeDeletedFilesFromResult } from './resultState'
import type { ScanResult } from './types'

const result: ScanResult = {
  filesScanned: 3,
  videosFound: 3,
  folders: ['A', 'B'],
  allFolders: ['A', 'B'],
  extensions: ['mkv'],
  emptyFolderGroups: [],
  groups: [
    {
      id: 'g1',
      confidence: 'safe',
      score: 98,
      title: 'Film',
      reason: ['Test'],
      keepId: 'keep',
      files: [
        {
          id: 'keep',
          path: 'A/film.mkv',
          name: 'film.mkv',
          folder: 'A',
          rootPath: 'A',
          rootIndex: 0,
          size: 100,
          modifiedAt: 1,
          extension: 'mkv',
          parsed: {
            originalBaseName: 'film',
            normalizedTitle: 'Film',
            comparableTitle: 'film',
            qualityRank: 0
          },
          recommendation: 'keep'
        },
        {
          id: 'dup',
          path: 'B/film.mkv',
          name: 'film.mkv',
          folder: 'B',
          rootPath: 'B',
          rootIndex: 1,
          size: 90,
          modifiedAt: 1,
          extension: 'mkv',
          parsed: {
            originalBaseName: 'film',
            normalizedTitle: 'Film',
            comparableTitle: 'film',
            qualityRank: 0
          },
          recommendation: 'duplicate'
        }
      ]
    }
  ]
}

describe('removeDeletedFilesFromResult', () => {
  it('entfernt gelöschte Dateien aus Treffergruppen', () => {
    const next = removeDeletedFilesFromResult(result, new Set(['dup']))

    expect(next.videosFound).toBe(2)
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0].files.map((file) => file.id)).toEqual(['keep'])
    expect(next.folders).toEqual(['A'])
  })
})
