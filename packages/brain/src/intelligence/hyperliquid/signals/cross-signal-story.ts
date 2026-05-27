import type { PublishedOutput } from '../../../publisher-types.js'
import type { HyperliquidResearchBrief } from '../types.js'

export type HyperliquidCrossSignalType =
  | 'open_interest'
  | 'oi'
  | 'price_open_interest'
  | 'price_oi'
  | 'funding'
  | 'volume'
  | 'wallet'

export type HyperliquidCanonicalSignalType =
  | 'open_interest'
  | 'price_open_interest'
  | 'funding'
  | 'volume'
  | 'wallet'

export type HyperliquidSignalBias = 'bullish' | 'bearish' | 'neutral' | 'mixed'

export interface HyperliquidNormalizedSignalFinding {
  id: string
  signalType: HyperliquidCrossSignalType
  asset: string
  observedAt: string
  strength: number
  bias?: HyperliquidSignalBias
  summary: string
  detail?: string
  tags?: string[]
  priorityHint?: number
  confidence?: number
  metrics?: Record<string, number | string | boolean | null>
  evidenceRefs?: HyperliquidResearchBrief['receipts']
}

export interface HyperliquidCrossSignalStoryOptions {
  now?: string
  windowStart?: string
  windowEnd?: string
  maxStories?: number
  minMultiSignalScore?: number
  minSingleSignalScore?: number
}

export interface HyperliquidCrossSignalPublishedNarrativeRow {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  actions: PublishedOutput['actions']
  content_type: PublishedOutput['content_type']
  thread_id: string | null
  packet_id: string
  story_key: string
  story_candidate_id: string
  evidence_refs: HyperliquidResearchBrief['receipts']
}

export interface HyperliquidCrossSignalStoryCandidate {
  asset: string
  storyKey: string
  score: number
  priority: number
  signalCount: number
  signalTypes: HyperliquidCanonicalSignalType[]
  bias: HyperliquidSignalBias
  findings: HyperliquidNormalizedSignalFinding[]
  publishedNarrativeRow: HyperliquidCrossSignalPublishedNarrativeRow
}

interface ScoredAssetGroup {
  asset: string
  score: number
  priority: number
  bias: HyperliquidSignalBias
  signalTypes: HyperliquidCanonicalSignalType[]
  findings: HyperliquidNormalizedSignalFinding[]
  reasoning: string
}

const DEFAULT_MIN_MULTI_SIGNAL_SCORE = 6.5
const DEFAULT_MIN_SINGLE_SIGNAL_SCORE = 8.5
const DEFAULT_MAX_STORIES = 25

const SIGNAL_WEIGHTS: Record<HyperliquidCanonicalSignalType, number> = {
  wallet: 1.2,
  price_open_interest: 1.15,
  open_interest: 1.05,
  funding: 0.95,
  volume: 0.9,
}

const SIGNAL_LABELS: Record<HyperliquidCanonicalSignalType, string> = {
  wallet: 'wallet positioning',
  price_open_interest: 'price/OI',
  open_interest: 'open interest',
  funding: 'funding',
  volume: 'volume',
}

export function combineHyperliquidCrossSignalStories(
  findings: HyperliquidNormalizedSignalFinding[],
  options: HyperliquidCrossSignalStoryOptions = {}
): HyperliquidCrossSignalStoryCandidate[] {
  const maxStories = options.maxStories ?? DEFAULT_MAX_STORIES
  const minMultiSignalScore = options.minMultiSignalScore ?? DEFAULT_MIN_MULTI_SIGNAL_SCORE
  const minSingleSignalScore = options.minSingleSignalScore ?? DEFAULT_MIN_SINGLE_SIGNAL_SCORE
  const groups = groupByAsset(findings.filter((finding) => isInsideWindow(finding, options)))
  const scored = [...groups.entries()]
    .map(([asset, assetFindings]) => scoreAssetGroup(asset, assetFindings, minMultiSignalScore, minSingleSignalScore))
    .filter((group): group is ScoredAssetGroup => group != null)
    .sort(compareStories)
    .slice(0, maxStories)

  return scored.map((group) => {
    const storyKey = buildStoryKey(group.asset, options)
    const row = buildPublishedNarrativeRow(group, storyKey, options)
    return {
      asset: group.asset,
      storyKey,
      score: group.score,
      priority: group.priority,
      signalCount: group.findings.length,
      signalTypes: group.signalTypes,
      bias: group.bias,
      findings: group.findings,
      publishedNarrativeRow: row,
    }
  })
}

function groupByAsset(findings: HyperliquidNormalizedSignalFinding[]): Map<string, HyperliquidNormalizedSignalFinding[]> {
  const groups = new Map<string, HyperliquidNormalizedSignalFinding[]>()
  for (const finding of findings) {
    const asset = normalizeAsset(finding.asset)
    if (!asset || !finding.summary.trim()) continue
    const normalized = {
      ...finding,
      asset,
      strength: clampScore(finding.strength),
    }
    groups.set(asset, [...(groups.get(asset) ?? []), normalized])
  }
  return groups
}

function scoreAssetGroup(
  asset: string,
  findings: HyperliquidNormalizedSignalFinding[],
  minMultiSignalScore: number,
  minSingleSignalScore: number
): ScoredAssetGroup | null {
  const ranked = [...findings].sort((a, b) => weightedStrength(b) - weightedStrength(a))
  const signalTypes = uniqueSignalTypes(ranked)
  const topWeightedScores = ranked.slice(0, 3).map(weightedStrength)
  const strongest = topWeightedScores[0] ?? 0
  const averageTop = average(topWeightedScores)
  const diversityBonus = Math.min(2.2, Math.max(0, signalTypes.length - 1) * 0.9)
  const agreementBonus = directionalAgreementBonus(ranked)
  const evidenceBonus = Math.min(0.4, evidenceRefsForFindings(ranked).length * 0.08)
  const score = roundToOne(clampScore((strongest * 0.72) + (averageTop * 0.28) + diversityBonus + agreementBonus + evidenceBonus))
  const isMultiSignal = signalTypes.length >= 2
  const threshold = isMultiSignal ? minMultiSignalScore : minSingleSignalScore

  if (score < threshold) return null

  return {
    asset,
    score,
    priority: Math.max(1, Math.min(10, Math.round(score))),
    bias: dominantBias(ranked),
    signalTypes,
    findings: ranked,
    reasoning: [
      `${asset} scored ${score}/10 from ${ranked.length} finding(s) across ${signalTypes.length} signal type(s).`,
      isMultiSignal
        ? `Multi-signal threshold ${minMultiSignalScore}/10 was met.`
        : `Single-signal threshold ${minSingleSignalScore}/10 was met by a very strong finding.`,
      `Top inputs: ${ranked.slice(0, 3).map((finding) => `${labelFor(finding)} ${clampScore(finding.strength).toFixed(1)}/10`).join(', ')}.`,
    ].join(' '),
  }
}

function buildPublishedNarrativeRow(
  group: ScoredAssetGroup,
  storyKey: string,
  options: HyperliquidCrossSignalStoryOptions
): HyperliquidCrossSignalPublishedNarrativeRow {
  const evidenceRefs = evidenceRefsForFindings(group.findings)
  const topFindings = group.findings.slice(0, 3)
  const signalPhrase = group.signalTypes.map((type) => SIGNAL_LABELS[type]).join(' + ')
  const setup = group.signalTypes.length >= 2
    ? `${group.asset}: ${group.signalTypes.length} Hyperliquid signals line up.`
    : `${group.asset}: one unusually strong Hyperliquid signal.`
  const biasPhrase = group.bias === 'neutral' || group.bias === 'mixed'
    ? 'mixed'
    : group.bias
  const strongestSummary = topFindings[0]?.summary ?? 'Signal strength crossed the story threshold.'
  const contentSmall = [
    setup,
    `${signalPhrase} point to a ${biasPhrase} setup.`,
    strongestSummary,
  ].join('\n')
  const contentFull = [
    `The strongest inputs are ${topFindings.map((finding) => `${labelFor(finding)} (${clampScore(finding.strength).toFixed(1)}/10)`).join(', ')}.`,
    `Score ${group.score}/10; treat this as a backtest story candidate, not confirmation of direction.`,
  ].join(' ')
  const tags = [
    'hyperliquid',
    'perps',
    group.asset.toLowerCase(),
    'cross-signal',
    ...group.signalTypes.map((type) => `hl-${type.replace(/_/g, '-')}`),
    ...group.findings.flatMap((finding) => finding.tags ?? []),
  ]

  return {
    content_small: limitLength(contentSmall, 300),
    content_full: limitLength(contentFull, 600),
    reasoning: group.reasoning,
    tags: uniqueStrings(tags),
    priority: group.priority,
    actions: [{ type: 'perps', asset: group.asset }],
    content_type: 'crypto',
    thread_id: null,
    packet_id: `hyperliquid-cross-signal:${group.asset.toLowerCase()}:${rowTime(options)}`,
    story_key: storyKey,
    story_candidate_id: `${storyKey}:candidate`,
    evidence_refs: evidenceRefs,
  }
}

function canonicalSignalType(type: HyperliquidCrossSignalType): HyperliquidCanonicalSignalType {
  if (type === 'oi') return 'open_interest'
  if (type === 'price_oi') return 'price_open_interest'
  return type
}

function uniqueSignalTypes(findings: HyperliquidNormalizedSignalFinding[]): HyperliquidCanonicalSignalType[] {
  return uniqueStrings(findings.map((finding) => canonicalSignalType(finding.signalType))) as HyperliquidCanonicalSignalType[]
}

function weightedStrength(finding: HyperliquidNormalizedSignalFinding): number {
  return clampScore(finding.strength) * SIGNAL_WEIGHTS[canonicalSignalType(finding.signalType)]
}

function compareStories(a: ScoredAssetGroup, b: ScoredAssetGroup): number {
  const aRank = a.score + (a.signalTypes.length >= 2 ? 0.6 : 0)
  const bRank = b.score + (b.signalTypes.length >= 2 ? 0.6 : 0)
  if (bRank !== aRank) return bRank - aRank
  if (b.signalTypes.length !== a.signalTypes.length) return b.signalTypes.length - a.signalTypes.length
  return a.asset.localeCompare(b.asset)
}

function directionalAgreementBonus(findings: HyperliquidNormalizedSignalFinding[]): number {
  const directional = findings
    .map((finding) => finding.bias)
    .filter((bias): bias is 'bullish' | 'bearish' => bias === 'bullish' || bias === 'bearish')
  if (directional.length < 2) return 0
  return new Set(directional).size === 1 ? 0.4 : -0.3
}

function dominantBias(findings: HyperliquidNormalizedSignalFinding[]): HyperliquidSignalBias {
  const counts = findings.reduce<Record<'bullish' | 'bearish', number>>((acc, finding) => {
    if (finding.bias === 'bullish' || finding.bias === 'bearish') {
      acc[finding.bias] += weightedStrength(finding)
    }
    return acc
  }, { bullish: 0, bearish: 0 })
  if (counts.bullish === 0 && counts.bearish === 0) return 'mixed'
  if (Math.abs(counts.bullish - counts.bearish) < 1) return 'mixed'
  return counts.bullish > counts.bearish ? 'bullish' : 'bearish'
}

function evidenceRefsForFindings(findings: HyperliquidNormalizedSignalFinding[]): HyperliquidResearchBrief['receipts'] {
  const refs = findings.flatMap((finding) => {
    if (finding.evidenceRefs?.length) return finding.evidenceRefs
    return [{
      source: 'hyperliquid' as const,
      sourceId: finding.id,
      capturedAt: finding.observedAt,
      rawRef: `${canonicalSignalType(finding.signalType)}:${finding.id}`,
    }]
  })
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.source}:${ref.sourceId}:${ref.rawRef}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function labelFor(finding: HyperliquidNormalizedSignalFinding): string {
  return SIGNAL_LABELS[canonicalSignalType(finding.signalType)]
}

function isInsideWindow(finding: HyperliquidNormalizedSignalFinding, options: HyperliquidCrossSignalStoryOptions): boolean {
  const observed = Date.parse(finding.observedAt)
  if (!Number.isFinite(observed)) return false
  const start = options.windowStart ? Date.parse(options.windowStart) : null
  const end = options.windowEnd ? Date.parse(options.windowEnd) : null
  if (start != null && Number.isFinite(start) && observed < start) return false
  if (end != null && Number.isFinite(end) && observed > end) return false
  return true
}

function buildStoryKey(asset: string, options: HyperliquidCrossSignalStoryOptions): string {
  const suffix = options.windowStart || options.windowEnd
    ? `${dateKey(options.windowStart ?? options.now)}:${dateKey(options.windowEnd ?? options.now)}`
    : dateKey(options.now)
  return `hyperliquid:cross-signal:${asset.toLowerCase()}:${suffix}`
}

function rowTime(options: HyperliquidCrossSignalStoryOptions): string {
  return (options.windowEnd ?? options.now ?? new Date(0).toISOString()).replace(/[^0-9A-Za-z]/g, '').slice(0, 14)
}

function dateKey(value?: string): string {
  const time = value ? Date.parse(value) : NaN
  if (!Number.isFinite(time)) return 'latest'
  return new Date(time).toISOString().slice(0, 10)
}

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase()
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(10, score))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function limitLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}
