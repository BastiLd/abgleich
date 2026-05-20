import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from './settings'

describe('settings defaults', () => {
  it('liefert sichere Defaults', () => {
    expect(defaultSettings.deleteMode).toBe('trash')
    expect(defaultSettings.mascot).toBe('detective')
    expect(defaultSettings.matchStrictness).toBe('smart')
    expect(defaultSettings.animations).toEqual({
      mascot: true,
      cards: true,
      modals: true,
      progress: true
    })
    expect(defaultSettings.recentFolders).toEqual([])
    expect(defaultSettings.excludedMatches).toEqual([])
    expect(defaultSettings.excludedFiles).toEqual([])
    expect(defaultSettings.deleteHistory).toEqual([])
  })

  it('normalisiert kaputte gespeicherte Werte', () => {
    expect(normalizeSettings({ deleteMode: 'wild', mascot: 'unknown', animations: { mascot: false } })).toEqual({
      ...defaultSettings,
      animations: {
        ...defaultSettings.animations,
        mascot: false
      },
      excludedMatches: [],
      excludedFiles: [],
      deleteHistory: []
    })
  })
})
