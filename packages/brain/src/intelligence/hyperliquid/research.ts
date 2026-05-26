import type {
  HyperliquidFindingType,
  HyperliquidMarketSnapshot,
  HyperliquidMechanicalGateResult,
  HyperliquidPositionChangeFinding,
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from './types.js'

export interface HyperliquidResearchOptions {
  now: string
  minPositionUsd: number
  minChangeUsd: number
  minChangePct: number
  duplicateStoryKeys?: Set<string>
}

interface PositionPair {
  asset: string
  before: HyperliquidPositionSnapshot | null
  after: HyperliquidPositionSnapshot | null
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function compactWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function positionMap(snapshots: HyperliquidPositionSnapshot[]): Map<string, HyperliquidPositionSnapshot> {
  const map = new Map<string, HyperliquidPositionSnapshot>()
  for (const snapshot of snapshots) {
    map.set(snapshot.asset, snapshot)
  }
  return map
}

function pairPositions(
  previous: HyperliquidPositionSnapshot[],
  current: HyperliquidPositionSnapshot[]
): PositionPair[] {
  const prev = positionMap(previous)
  const curr = positionMap(current)
  const assets = new Set([...prev.keys(), ...curr.keys()])
  return [...assets].map((asset) => ({
    asset,
    before: prev.get(asset) ?? null,
    after: curr.get(asset) ?? null,
  }))
}

function classifyChange(pair: PositionPair, minPositionUsd: number): HyperliquidFindingType | null {
  const before = pair.before
  const after = pair.after
  const beforeOpen = before != null && before.notionalUsd >= minPositionUsd
  const afterOpen = after != null && after.notionalUsd >= minPositionUsd

  if (!beforeOpen && afterOpen) return 'opened'
  if (beforeOpen && !afterOpen) return 'closed'
  if (!beforeOpen || !afterOpen || !before || !after) return null
  if (before.side !== after.side) return 'flipped'
  if (after.notionalUsd > before.notionalUsd) return 'added'
  if (after.notionalUsd < before.notionalUsd) return 'reduced'
  return null
}

function changeMagnitude(pair: PositionPair): { deltaUsd: number; deltaPct: number | null } {
  const before = pair.before?.notionalUsd ?? 0
  const after = pair.after?.notionalUsd ?? 0
  const deltaUsd = after - before
  const deltaPct = before > 0 ? deltaUsd / before : null
  return { deltaUsd, deltaPct }
}

function storyKey(wallet: string, asset: string): string {
  return ['hyperliquid', 'wallet-position', normalizePart(wallet), normalizePart(asset)].join(':')
}

function dedupeKey(wallet: string, asset: string, type: HyperliquidFindingType): string {
  return ['hyperliquid', 'wallet-position', normalizePart(wallet), normalizePart(asset), type].join(':')
}

function findingReason(type: HyperliquidFindingType, before: number, after: number, asset: string): string {
  if (type === 'opened') return `Opened a new ${asset} position worth ${round(after)} USD.`
  if (type === 'closed') return `Closed a ${asset} position that was worth ${round(before)} USD.`
  if (type === 'flipped') return `Flipped ${asset} direction while keeping meaningful size.`
  if (type === 'added') return `Added to an existing ${asset} position.`
  return `Reduced an existing ${asset} position.`
}

export function detectHyperliquidPositionFindings(
  watch: HyperliquidWatchlistEntry,
  previous: HyperliquidPositionSnapshot[],
  current: HyperliquidPositionSnapshot[],
  marketByAsset: Map<string, HyperliquidMarketSnapshot>,
  options: HyperliquidResearchOptions
): HyperliquidPositionChangeFinding[] {
  const minPositionUsd = watch.minPositionUsd ?? options.minPositionUsd
  const findings: HyperliquidPositionChangeFinding[] = []

  for (const pair of pairPositions(previous, current)) {
    const type = classifyChange(pair, minPositionUsd)
    if (!type) continue

    const { deltaUsd, deltaPct } = changeMagnitude(pair)
    const absDeltaUsd = Math.abs(deltaUsd)
    const absDeltaPct = Math.abs(deltaPct ?? 1)
    if (type === 'added' || type === 'reduced') {
      if (absDeltaUsd < options.minChangeUsd || absDeltaPct < options.minChangePct) continue
    }

    const key = storyKey(watch.wallet, pair.asset)
    findings.push({
      id: `${dedupeKey(watch.wallet, pair.asset, type)}:${options.now}`,
      type,
      wallet: watch.wallet,
      walletLabel: watch.label,
      watchReason: watch.reason,
      asset: pair.asset,
      before: pair.before,
      after: pair.after,
      market: marketByAsset.get(pair.asset) ?? null,
      notionalDeltaUsd: round(deltaUsd),
      notionalDeltaPct: deltaPct == null ? null : round(deltaPct, 4),
      observedAt: options.now,
      dedupeKey: dedupeKey(watch.wallet, pair.asset, type),
      storyKey: key,
      receiptIds: [
        ...(pair.before?.id ? [pair.before.id] : []),
        ...(pair.after?.id ? [pair.after.id] : []),
      ],
      reason: findingReason(type, pair.before?.notionalUsd ?? 0, pair.after?.notionalUsd ?? 0, pair.asset),
    })
  }

  return findings
}

function sideText(snapshot: HyperliquidPositionSnapshot | null): string {
  return snapshot ? snapshot.side : 'flat'
}

function notional(snapshot: HyperliquidPositionSnapshot | null): number {
  return round(snapshot?.notionalUsd ?? 0)
}

function timeWindow(finding: HyperliquidPositionChangeFinding): string {
  const before = finding.before?.observedAt
  const after = finding.after?.observedAt
  if (!before || !after) return 'since previous snapshot'
  const minutes = Math.max(1, Math.round((new Date(after).getTime() - new Date(before).getTime()) / 60_000))
  return `${minutes} min`
}

function suggestedAngle(finding: HyperliquidPositionChangeFinding): string {
  if (finding.type === 'flipped') return `${finding.asset} bias flipped`
  if (finding.type === 'opened') return `${finding.asset} ${sideText(finding.after)} opened`
  if (finding.type === 'closed') return `${finding.asset} position closed`
  if (finding.type === 'added') return `${finding.asset} ${sideText(finding.after)} double-down`
  return `${finding.asset} ${sideText(finding.before)} trimmed`
}

function whyItMayMatter(finding: HyperliquidPositionChangeFinding): string {
  const wallet = finding.walletLabel || compactWallet(finding.wallet)
  if (finding.type === 'flipped') {
    return `${wallet} changed direction instead of simply reducing exposure.`
  }
  if (finding.type === 'added') {
    return `${wallet} increased same-direction exposure, which can be a conviction signal.`
  }
  if (finding.type === 'opened') {
    return `${wallet} opened a meaningful new position from flat.`
  }
  if (finding.type === 'closed') {
    return `${wallet} removed a previously meaningful position, which can resolve or invalidate an open story.`
  }
  return `${wallet} reduced exposure, which can indicate risk being taken off.`
}

function priorityHint(finding: HyperliquidPositionChangeFinding): number {
  const size = Math.max(finding.before?.notionalUsd ?? 0, finding.after?.notionalUsd ?? 0)
  const base = finding.type === 'flipped' ? 7 : finding.type === 'added' ? 6 : 5
  const sizeBoost = size >= 1_000_000 ? 2 : size >= 500_000 ? 1 : 0
  return Math.min(9, base + sizeBoost)
}

export function buildHyperliquidResearchBrief(
  finding: HyperliquidPositionChangeFinding,
  now: string
): HyperliquidResearchBrief {
  return {
    id: `brief:${finding.id}`,
    type: 'wallet_position_change',
    asset: finding.asset,
    wallet: finding.wallet,
    walletLabel: finding.walletLabel,
    finding: finding.type,
    before: {
      side: finding.before?.side ?? null,
      notionalUsd: notional(finding.before),
      entryPrice: finding.before?.entryPrice ?? null,
      unrealizedPnlUsd: finding.before?.unrealizedPnlUsd ?? null,
    },
    after: {
      side: finding.after?.side ?? null,
      notionalUsd: notional(finding.after),
      entryPrice: finding.after?.entryPrice ?? null,
      unrealizedPnlUsd: finding.after?.unrealizedPnlUsd ?? null,
    },
    marketContext: {
      fundingRate: finding.market?.fundingRate ?? null,
      openInterestUsd: finding.market?.openInterestUsd ?? null,
      markPrice: finding.market?.markPrice ?? null,
      volume24hUsd: finding.market?.volume24hUsd ?? null,
    },
    timeWindow: timeWindow(finding),
    receipts: [
      ...(finding.before ? [{
        source: 'hyperliquid' as const,
        sourceId: finding.before.id ?? `position:${finding.wallet}:${finding.asset}:before`,
        capturedAt: finding.before.observedAt,
        rawRef: 'hyperliquid_position_snapshots',
      }] : []),
      ...(finding.after ? [{
        source: 'hyperliquid' as const,
        sourceId: finding.after.id ?? `position:${finding.wallet}:${finding.asset}:after`,
        capturedAt: finding.after.observedAt,
        rawRef: 'hyperliquid_position_snapshots',
      }] : []),
    ],
    whyItMayMatter: whyItMayMatter(finding),
    uncertainty: [
      'The wallet may be hedged elsewhere.',
      'Hyperliquid position data does not reveal private intent.',
    ],
    suggestedAngle: suggestedAngle(finding),
    dedupeKey: finding.dedupeKey,
    storyKey: finding.storyKey,
    priorityHint: priorityHint(finding),
    createdAt: now,
  }
}

export function runHyperliquidMechanicalGate(
  brief: HyperliquidResearchBrief,
  options: HyperliquidResearchOptions
): HyperliquidMechanicalGateResult {
  const reasons: string[] = []
  const maxNotional = Math.max(brief.before.notionalUsd, brief.after.notionalUsd)
  const absDelta = Math.abs(brief.after.notionalUsd - brief.before.notionalUsd)

  if (maxNotional < options.minPositionUsd) {
    reasons.push(`position below ${options.minPositionUsd} USD threshold`)
  }
  if (brief.finding === 'added' || brief.finding === 'reduced') {
    const pct = brief.before.notionalUsd > 0 ? absDelta / brief.before.notionalUsd : 1
    if (absDelta < options.minChangeUsd) reasons.push(`change below ${options.minChangeUsd} USD threshold`)
    if (pct < options.minChangePct) reasons.push(`change below ${Math.round(options.minChangePct * 100)}% threshold`)
  }
  if (brief.receipts.length === 0) reasons.push('missing before/after receipts')
  if (options.duplicateStoryKeys?.has(brief.storyKey)) reasons.push('recent duplicate story')

  return {
    passed: reasons.length === 0,
    reasons,
  }
}
