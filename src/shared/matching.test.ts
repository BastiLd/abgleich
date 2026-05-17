import { describe, expect, it } from 'vitest'
import { buildDuplicateGroups, parseMediaName } from './matching'
import type { MediaFile } from './types'

function file(name: string, size: number, rootIndex = 0, fingerprint?: string): MediaFile {
  return {
    id: `${rootIndex}-${name}`,
    path: `D:/Root${rootIndex}/${name}`,
    name,
    folder: `D:/Root${rootIndex}`,
    rootPath: `D:/Root${rootIndex}`,
    rootIndex,
    size,
    modifiedAt: 1700000000000 + rootIndex,
    extension: name.split('.').pop() ?? '',
    fingerprint,
    parsed: parseMediaName(name)
  }
}

describe('parseMediaName', () => {
  it('normalisiert typische Filmtitel', () => {
    const parsed = parseMediaName('Film.Name.2020.German.1080p.WEB-DL.x265.mkv')

    expect(parsed.comparableTitle).toBe('film name')
    expect(parsed.year).toBe(2020)
    expect(parsed.qualityLabel).toBe('1080p')
  })

  it('erkennt deutsche Serienfolgen', () => {
    const parsed = parseMediaName('Meine Serie Staffel 2 Folge 11 720p.mkv')

    expect(parsed.comparableTitle).toBe('meine serie')
    expect(parsed.episodeKey).toBe('S02E11')
  })

  it('erkennt Qualität auch aus dem Ordnerpfad', () => {
    const parsed = parseMediaName('Film.mkv', 'D:/Movies/Film (2020)/2160p 4K BluRay')

    expect(parsed.qualityLabel).toBe('2160p/4K')
    expect(parsed.year).toBe(2020)
  })
})

describe('buildDuplicateGroups', () => {
  it('findet fast gleiche Filme', () => {
    const groups = buildDuplicateGroups([
      file('Film.Name.2020.1080p.mkv', 4_000_000_000, 0, 'same'),
      file('Film Name (2020) German WEB-DL.mkv', 3_950_000_000, 1, 'same')
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('safe')
    expect(groups[0].files[0].recommendation).toBe('keep')
  })

  it('vermischt unterschiedliche Serienfolgen nicht', () => {
    const groups = buildDuplicateGroups([
      file('Serie.S01E01.1080p.mkv', 2_000_000_000, 0),
      file('Serie.S01E02.1080p.mkv', 2_010_000_000, 1)
    ])

    expect(groups).toHaveLength(0)
  })

  it('hält ähnliche aber verschiedene Filme auseinander', () => {
    const groups = buildDuplicateGroups([
      file('The Thing 1982 1080p.mkv', 3_000_000_000, 0),
      file('The Thing 2011 1080p.mkv', 3_100_000_000, 1)
    ])

    expect(groups).toHaveLength(0)
  })
})
