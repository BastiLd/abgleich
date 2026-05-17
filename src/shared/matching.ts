import type { DuplicateGroup, MatchConfidence, MatchStrictness, MediaFile, ParsedMediaName } from './types'

const CLUTTER_WORDS = new Set([
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '576p',
  '540p',
  '480p',
  'uhd',
  '4k',
  '2k',
  'hdr',
  'hdr10',
  'hdr10plus',
  'dv',
  'dolby',
  'vision',
  'bluray',
  'blu',
  'ray',
  'bdrip',
  'brrip',
  'web',
  'dl',
  'webdl',
  'web-dl',
  'webrip',
  'hdtv',
  'hdrip',
  'dvdrip',
  'remux',
  'x264',
  'x265',
  'h264',
  'h265',
  'hevc',
  'avc',
  'aac',
  'ac3',
  'eac3',
  'dts',
  'truehd',
  'atmos',
  '10bit',
  '8bit',
  'german',
  'deutsch',
  'english',
  'englisch',
  'multi',
  'dual',
  'dubbed',
  'subbed',
  'proper',
  'repack',
  'internal'
])

const QUALITY_PATTERNS: Array<[RegExp, string, number]> = [
  [/(^|[^a-z0-9])(2160p|4k|uhd|ultra\s*hd)([^a-z0-9]|$)/i, '2160p/4K', 4],
  [/(^|[^a-z0-9])(1440p|2k)([^a-z0-9]|$)/i, '1440p', 3.5],
  [/(^|[^a-z0-9])1080p([^a-z0-9]|$)/i, '1080p', 3],
  [/(^|[^a-z0-9])720p([^a-z0-9]|$)/i, '720p', 2],
  [/(^|[^a-z0-9])(576p|540p|480p|dvd|sd)([^a-z0-9]|$)/i, 'SD', 1]
]

export function parseMediaName(fileName: string, context = ''): ParsedMediaName {
  const originalBaseName = fileName.replace(/\.[^.]+$/, '')
  const clean = normalizeMediaText(originalBaseName)
  const contextClean = normalizeMediaText(`${originalBaseName} ${context}`)
  const quality = detectQuality(contextClean)
  const episode = detectEpisode(contextClean) ?? detectEpisode(clean)
  const year = detectYear(contextClean) ?? detectYear(clean)
  const seriesTitle = episode ? extractSeriesTitle(clean) : undefined

  let comparable = clean
    .replace(/\bs\d{1,2}\s*e\d{1,3}\b/gi, ' ')
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, ' ')
    .replace(/\bstaffel\s*\d{1,2}\s*folge\s*\d{1,3}\b/gi, ' ')
    .replace(/\bseason\s*\d{1,2}\s*episode\s*\d{1,3}\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{3,4}p\b/gi, ' ')

  const words = comparable
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !CLUTTER_WORDS.has(word))
    .filter((word) => !/^\d+$/.test(word))

  comparable = words.join(' ').replace(/\s+/g, ' ').trim()

  return {
    originalBaseName,
    normalizedTitle: titleCase(comparable || clean),
    comparableTitle: comparable || clean,
    seriesTitle,
    year,
    season: episode?.season,
    episode: episode?.episode,
    episodeKey: episode ? `S${pad2(episode.season)}E${pad2(episode.episode)}` : undefined,
    qualityLabel: quality?.[1],
    qualityRank: quality?.[2] ?? 0
  }
}

function extractSeriesTitle(text: string): string | undefined {
  const episodeMatch = text.match(/\b(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}\s*x\s*\d{1,3}|staffel\s*\d{1,2}\s*folge\s*\d{1,3}|season\s*\d{1,2}\s*episode\s*\d{1,3})\b/i)
  if (!episodeMatch || episodeMatch.index === undefined) return undefined

  const prefix = text.slice(0, episodeMatch.index).replace(/\b(19|20)\d{2}\b/g, ' ')
  const words = prefix
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !CLUTTER_WORDS.has(word))
    .filter((word) => !/^\d+$/.test(word))

  const title = words.join(' ').trim()
  return title ? titleCase(title) : undefined
}

export function buildDuplicateGroups(files: MediaFile[], strictness: MatchStrictness = 'smart'): DuplicateGroup[] {
  const parent = new Map<string, string>()
  const edgeReasons = new Map<string, { confidence: MatchConfidence; score: number; reason: string[] }>()

  for (const file of files) parent.set(file.id, file.id)

  for (const [leftIndex, rightIndex] of candidatePairs(files)) {
    const match = compareMedia(files[leftIndex], files[rightIndex], strictness)
    if (!match) continue

    union(parent, files[leftIndex].id, files[rightIndex].id)
    edgeReasons.set(edgeKey(files[leftIndex].id, files[rightIndex].id), match)
  }

  const grouped = new Map<string, MediaFile[]>()
  for (const file of files) {
    const root = find(parent, file.id)
    const bucket = grouped.get(root) ?? []
    bucket.push(file)
    grouped.set(root, bucket)
  }

  const result: DuplicateGroup[] = []
  for (const groupFiles of grouped.values()) {
    if (groupFiles.length < 2) continue

    const pairMatches = collectPairMatches(groupFiles, edgeReasons)
    if (pairMatches.length === 0) continue

    const score = Math.round(pairMatches.reduce((sum, item) => sum + item.score, 0) / pairMatches.length)
    const confidence = confidenceFromScore(score)
    const keep = chooseKeepFile(groupFiles)
    const reason = Array.from(new Set(pairMatches.flatMap((item) => item.reason))).slice(0, 4)
    const title = bestGroupTitle(groupFiles)

    result.push({
      id: groupFiles.map((file) => file.id).sort().join('|'),
      confidence,
      score,
      title,
      reason,
      keepId: keep.id,
      files: groupFiles
        .slice()
        .sort(sortByRecommendation(keep.id))
        .map((file) => ({
          ...file,
          recommendation: file.id === keep.id ? 'keep' : 'duplicate'
        }))
    })
  }

  return result.sort((a, b) => confidenceWeight(b.confidence) - confidenceWeight(a.confidence) || b.score - a.score)
}

export function compareMedia(
  left: MediaFile,
  right: MediaFile,
  strictness: MatchStrictness = 'smart'
): { confidence: MatchConfidence; score: number; reason: string[] } | null {
  const reasons: string[] = []

  if (left.path === right.path) return null
  if (left.rootIndex === right.rootIndex && left.folder === right.folder) return null

  const seriesMismatch =
    left.parsed.episodeKey &&
    right.parsed.episodeKey &&
    left.parsed.episodeKey !== right.parsed.episodeKey
  if (seriesMismatch) return null

  const oneIsEpisode = Boolean(left.parsed.episodeKey || right.parsed.episodeKey)
  if (oneIsEpisode && left.parsed.episodeKey !== right.parsed.episodeKey) return null

  if (left.parsed.year && right.parsed.year && left.parsed.year !== right.parsed.year && !oneIsEpisode) return null

  const titleScore = similarity(left.parsed.comparableTitle, right.parsed.comparableTitle)
  const sizeScore = sizeSimilarity(left.size, right.size)
  const fingerprintSame = Boolean(left.fingerprint && right.fingerprint && left.fingerprint === right.fingerprint)
  const thresholds = strictnessThresholds(strictness)

  if (fingerprintSame) reasons.push('Schneller Datei-Fingerprint stimmt überein')
  if (left.parsed.episodeKey && left.parsed.episodeKey === right.parsed.episodeKey) {
    reasons.push(`Gleiche Serienfolge ${left.parsed.episodeKey}`)
  }
  if (left.parsed.year && left.parsed.year === right.parsed.year) {
    reasons.push(`Gleiches Jahr ${left.parsed.year}`)
  }

  if (titleScore >= 0.96) reasons.push('Titel praktisch gleich')
  else if (titleScore >= 0.86) reasons.push('Titel sehr ähnlich')
  else if (titleScore >= thresholds.enoughTitle) reasons.push('Titel möglicherweise ähnlich')

  if (sizeScore >= 0.94) reasons.push('Dateigröße sehr ähnlich')
  else if (sizeScore >= 0.82) reasons.push('Dateigröße plausibel ähnlich')

  let score = Math.round(titleScore * 70 + sizeScore * 20)
  if (fingerprintSame) score += 18
  if (left.parsed.episodeKey && left.parsed.episodeKey === right.parsed.episodeKey) score += 8
  if (left.parsed.year && left.parsed.year === right.parsed.year) score += 4
  score = Math.min(100, score)

  const enoughTitle = titleScore >= thresholds.enoughTitle && Math.max(left.parsed.comparableTitle.length, right.parsed.comparableTitle.length) >= 4
  const likelyByFingerprint = fingerprintSame && titleScore >= thresholds.fingerprintTitle
  const likelyByEpisode = oneIsEpisode && titleScore >= thresholds.episodeTitle && sizeScore >= thresholds.episodeSize
  const likelyMovie = !oneIsEpisode && titleScore >= thresholds.movieTitle && sizeScore >= thresholds.movieSize

  if (!enoughTitle && !likelyByFingerprint) return null
  if (!likelyByFingerprint && !likelyByEpisode && !likelyMovie) return null

  return {
    confidence: confidenceFromScore(score),
    score,
    reason: reasons.length > 0 ? reasons : ['Name und Metadaten sind ähnlich']
  }
}

export function chooseKeepFile(files: MediaFile[]): MediaFile {
  return files.slice().sort((a, b) => {
    if (a.rootIndex !== b.rootIndex) return a.rootIndex - b.rootIndex
    if (a.parsed.qualityRank !== b.parsed.qualityRank) return b.parsed.qualityRank - a.parsed.qualityRank
    if (a.size !== b.size) return b.size - a.size
    return b.modifiedAt - a.modifiedAt
  })[0]
}

function strictnessThresholds(strictness: MatchStrictness): {
  enoughTitle: number
  fingerprintTitle: number
  episodeTitle: number
  episodeSize: number
  movieTitle: number
  movieSize: number
} {
  if (strictness === 'strict') {
    return { enoughTitle: 0.84, fingerprintTitle: 0.7, episodeTitle: 0.84, episodeSize: 0.72, movieTitle: 0.88, movieSize: 0.72 }
  }
  if (strictness === 'loose') {
    return { enoughTitle: 0.66, fingerprintTitle: 0.45, episodeTitle: 0.66, episodeSize: 0.38, movieTitle: 0.7, movieSize: 0.34 }
  }
  return { enoughTitle: 0.74, fingerprintTitle: 0.55, episodeTitle: 0.74, episodeSize: 0.55, movieTitle: 0.8, movieSize: 0.5 }
}

function normalizeMediaText(text: string): string {
  return deburr(text)
    .toLowerCase()
    .replace(/['`´]/g, '')
    .replace(/[\[\]{}()]/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectQuality(text: string): [RegExp, string, number] | undefined {
  return QUALITY_PATTERNS.find(([pattern]) => pattern.test(text))
}

function candidatePairs(files: MediaFile[]): Array<[number, number]> {
  const buckets = new Map<string, number[]>()

  files.forEach((file, index) => {
    for (const key of candidateKeys(file)) {
      const bucket = buckets.get(key) ?? []
      bucket.push(index)
      buckets.set(key, bucket)
    }
  })

  const pairs = new Set<string>()
  for (const bucket of buckets.values()) {
    if (bucket.length < 2 || bucket.length > 1500) continue

    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        pairs.add(`${bucket[i]}:${bucket[j]}`)
      }
    }
  }

  return [...pairs].map((pair) => {
    const [left, right] = pair.split(':').map(Number)
    return [left, right]
  })
}

function candidateKeys(file: MediaFile): string[] {
  const title = file.parsed.comparableTitle
  const tokens = title.split(/\s+/).filter((token) => token.length >= 3)
  const firstTwo = tokens.slice(0, 2).join(' ')
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0]
  const prefix = title.replace(/\s+/g, '').slice(0, 10)
  const keys = new Set<string>()

  if (file.parsed.episodeKey && firstTwo) keys.add(`episode:${file.parsed.episodeKey}:${firstTwo}`)
  if (file.parsed.year && firstTwo) keys.add(`year:${file.parsed.year}:${firstTwo}`)
  if (firstTwo) keys.add(`title:${firstTwo}`)
  if (longest && longest.length >= 5) keys.add(`token:${longest}`)
  if (prefix.length >= 6) keys.add(`prefix:${prefix}`)
  if (file.fingerprint) keys.add(`fingerprint:${file.fingerprint}`)

  return [...keys]
}

function detectEpisode(text: string): { season: number; episode: number } | undefined {
  const patterns = [
    /\bs(\d{1,2})\s*e(\d{1,3})\b/i,
    /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i,
    /\bstaffel\s*(\d{1,2})\s*folge\s*(\d{1,3})\b/i,
    /\bseason\s*(\d{1,2})\s*episode\s*(\d{1,3})\b/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return { season: Number(match[1]), episode: Number(match[2]) }
  }

  return undefined
}

function detectYear(text: string): number | undefined {
  const match = text.match(/\b((?:19|20)\d{2})\b/)
  return match ? Number(match[1]) : undefined
}

function similarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left || !right) return 0

  const leftTokens = new Set(left.split(/\s+/).filter(Boolean))
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const tokenScore = union === 0 ? 0 : intersection / union
  const distanceScore = 1 - levenshtein(left, right) / Math.max(left.length, right.length)

  return Math.max(tokenScore, distanceScore * 0.92 + tokenScore * 0.08)
}

function sizeSimilarity(left: number, right: number): number {
  if (left <= 0 || right <= 0) return 0
  return Math.min(left, right) / Math.max(left, right)
}

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 92) return 'safe'
  if (score >= 82) return 'likely'
  return 'possible'
}

function confidenceWeight(confidence: MatchConfidence): number {
  if (confidence === 'safe') return 3
  if (confidence === 'likely') return 2
  return 1
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}

function union(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = find(parent, left)
  const rightRoot = find(parent, right)
  if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
}

function find(parent: Map<string, string>, value: string): string {
  const next = parent.get(value)
  if (!next || next === value) return value
  const root = find(parent, next)
  parent.set(value, root)
  return root
}

function collectPairMatches(
  files: MediaFile[],
  edgeReasons: Map<string, { confidence: MatchConfidence; score: number; reason: string[] }>
): Array<{ confidence: MatchConfidence; score: number; reason: string[] }> {
  const matches: Array<{ confidence: MatchConfidence; score: number; reason: string[] }> = []
  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const match = edgeReasons.get(edgeKey(files[i].id, files[j].id))
      if (match) matches.push(match)
    }
  }
  return matches
}

function edgeKey(left: string, right: string): string {
  return [left, right].sort().join('::')
}

function bestGroupTitle(files: MediaFile[]): string {
  const ranked = files.map((file) => file.parsed).sort((a, b) => b.comparableTitle.length - a.comparableTitle.length)[0]
  const suffix = ranked.episodeKey ? ` ${ranked.episodeKey}` : ranked.year ? ` (${ranked.year})` : ''
  return `${ranked.normalizedTitle}${suffix}`
}

function sortByRecommendation(keepId: string) {
  return (a: MediaFile, b: MediaFile): number => {
    if (a.id === keepId) return -1
    if (b.id === keepId) return 1
    if (a.rootIndex !== b.rootIndex) return a.rootIndex - b.rootIndex
    return a.path.localeCompare(b.path)
  }
}

function deburr(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

