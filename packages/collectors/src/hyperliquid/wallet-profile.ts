import type {
  HyperliquidFill,
  HyperliquidLeaderboardRow,
  HyperliquidLedgerUpdate,
} from './client.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from './research-lead-thresholds.js'
import type { HyperliquidPositionSnapshot } from './types.js'

export type HyperliquidWalletWatchSource = 'manual' | 'leaderboard' | 'deposit'

export type HyperliquidWalletClassification =
  | 'directional_trader'
  | 'possible_market_maker'
  | 'possible_hedged_or_basis_trader'
  | 'vault_or_managed_account'
  | 'too_noisy'
  | 'insufficient_data'

export interface HyperliquidWalletWatchlistEntry {
  wallet: string
  label?: string | null
  sources: HyperliquidWalletWatchSource[]
  reason: string
  active: boolean
  firstSeenAt?: string | null
  minDepositUsd?: number | null
}

export interface HyperliquidWalletProfileInput {
  watch: HyperliquidWalletWatchlistEntry
  fills: HyperliquidFill[]
  positions: HyperliquidPositionSnapshot[]
  leaderboard: HyperliquidLeaderboardRow | null
  ledgerUpdates: HyperliquidLedgerUpdate[]
  userRole: string | null
  hypurrscanTags?: string[]
  hypurrscanAlias?: string | null
  now: string
}

export interface HyperliquidWalletBehaviorProfile {
  accountValueUsd: number | null
  currentExposureUsd: number
  currentLongExposureUsd: number
  currentShortExposureUsd: number
  netExposurePct: number | null
  dayVolumeUsd: number | null
  weekVolumeUsd: number | null
  monthVolumeUsd: number | null
  fillWindowVolumeUsd: number
  volumeToEquityRatio: number | null
  fillsPerDay: number
  assetsTraded: number
  medianHoldTimeHours: number | null
  roundTripSharePct: number
  smallFillSharePct: number
  makerFillSharePct: number | null
  directionalConcentrationPct: number
  largeDepositsUsd: number
  largeDepositCount: number
}

export interface HyperliquidWalletQualityProfile {
  wallet: string
  label: string | null
  sources: HyperliquidWalletWatchSource[]
  identitySources: {
    userProvidedLabel: string | null
    hyperliquidDisplayName: string | null
    hypurrscanTags: string[]
    hypurrscanAlias: string | null
    userRole: string | null
  }
  behavior: HyperliquidWalletBehaviorProfile
  classification: HyperliquidWalletClassification
  confidence: number
  reasons: string[]
  receipts: Array<{
    source: 'hyperliquid' | 'hypurrscan' | 'local'
    rawRef: string
    capturedAt: string
  }>
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function fillNotional(fill: HyperliquidFill): number {
  return fill.px * fill.sz
}

function fillDirection(fill: HyperliquidFill): 1 | -1 | null {
  if (/long/i.test(fill.dir)) return /close/i.test(fill.dir) ? -1 : 1
  if (/short/i.test(fill.dir)) return /close/i.test(fill.dir) ? 1 : -1
  if (/buy/i.test(fill.dir)) return 1
  if (/sell/i.test(fill.dir)) return -1
  return null
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return round((numerator / denominator) * 100)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const left = sorted[mid - 1]
  const right = sorted[mid]
  if (left == null || right == null) return null
  return (left + right) / 2
}

function fillWindowDays(fills: HyperliquidFill[]): number {
  if (fills.length < 2) return HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile.lookbackDays
  const times = fills.map((fill) => fill.time)
  const start = Math.min(...times)
  const end = Math.max(...times)
  return Math.max((end - start) / 86_400_000, 1)
}

function currentExposure(positions: HyperliquidPositionSnapshot[]): {
  currentExposureUsd: number
  currentLongExposureUsd: number
  currentShortExposureUsd: number
  netExposurePct: number | null
} {
  const currentLongExposureUsd = positions
    .filter((position) => position.side === 'long')
    .reduce((sum, position) => sum + position.notionalUsd, 0)
  const currentShortExposureUsd = positions
    .filter((position) => position.side === 'short')
    .reduce((sum, position) => sum + position.notionalUsd, 0)
  const currentExposureUsd = currentLongExposureUsd + currentShortExposureUsd
  return {
    currentExposureUsd: round(currentExposureUsd),
    currentLongExposureUsd: round(currentLongExposureUsd),
    currentShortExposureUsd: round(currentShortExposureUsd),
    netExposurePct: currentExposureUsd > 0
      ? pct(Math.abs(currentLongExposureUsd - currentShortExposureUsd), currentExposureUsd)
      : null,
  }
}

function behaviorFromInput(input: HyperliquidWalletProfileInput): HyperliquidWalletBehaviorProfile {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile
  const grossVolume = input.fills.reduce((sum, fill) => sum + fillNotional(fill), 0)
  const fillsByAsset = new Set(input.fills.map((fill) => fill.coin))
  const windowDays = fillWindowDays(input.fills)
  const smallFillVolume = input.fills
    .filter((fill) => fillNotional(fill) < thresholds.smallFillUsd)
    .reduce((sum, fill) => sum + fillNotional(fill), 0)
  const makerKnownVolume = input.fills
    .filter((fill) => fill.crossed != null)
    .reduce((sum, fill) => sum + fillNotional(fill), 0)
  const makerFillVolume = input.fills
    .filter((fill) => fill.crossed === false)
    .reduce((sum, fill) => sum + fillNotional(fill), 0)
  const signedByAsset = new Map<string, number>()
  const stateByAsset = new Map<string, { signedSize: number; openedAt: number | null }>()
  const holdTimesHours: number[] = []
  let roundTripVolume = 0

  for (const fill of [...input.fills].sort((a, b) => a.time - b.time)) {
    const direction = fillDirection(fill)
    if (direction == null) continue
    const notional = fillNotional(fill)
    signedByAsset.set(fill.coin, (signedByAsset.get(fill.coin) ?? 0) + direction * notional)

    const before = stateByAsset.get(fill.coin) ?? { signedSize: 0, openedAt: null }
    const delta = direction * fill.sz
    const afterSize = before.signedSize + delta
    const reducing = before.signedSize !== 0 && Math.sign(before.signedSize) !== Math.sign(delta)
    if (reducing) {
      roundTripVolume += notional
      if (before.openedAt != null) {
        holdTimesHours.push((fill.time - before.openedAt) / 3_600_000)
      }
    }
    stateByAsset.set(fill.coin, {
      signedSize: Math.abs(afterSize) < 1e-9 ? 0 : afterSize,
      openedAt: afterSize === 0
        ? null
        : before.signedSize === 0 || Math.sign(before.signedSize) !== Math.sign(afterSize)
          ? fill.time
          : before.openedAt,
    })
  }

  const directionalGross = [...signedByAsset.values()].reduce((sum, value) => sum + Math.abs(value), 0)
  const largestDirectional = Math.max(0, ...[...signedByAsset.values()].map((value) => Math.abs(value)))
  const accountValueUsd = input.leaderboard?.accountValueUsd ?? null
  const volumeToEquityRatio = accountValueUsd != null && accountValueUsd > 0
    ? round((input.leaderboard?.monthVolumeUsd ?? grossVolume) / accountValueUsd)
    : null
  const exposure = currentExposure(input.positions)
  const largeDeposits = input.ledgerUpdates
    .filter((update) => update.type === 'deposit' && (update.requestedUsd ?? 0) >= thresholds.largeDepositUsd)
  const largeDepositsUsd = largeDeposits.reduce((sum, update) => sum + (update.requestedUsd ?? 0), 0)

  return {
    accountValueUsd,
    ...exposure,
    dayVolumeUsd: input.leaderboard?.dayVolumeUsd ?? null,
    weekVolumeUsd: input.leaderboard?.weekVolumeUsd ?? null,
    monthVolumeUsd: input.leaderboard?.monthVolumeUsd ?? null,
    fillWindowVolumeUsd: round(grossVolume),
    volumeToEquityRatio,
    fillsPerDay: round(input.fills.length / windowDays),
    assetsTraded: fillsByAsset.size,
    medianHoldTimeHours: median(holdTimesHours) == null ? null : round(median(holdTimesHours) ?? 0),
    roundTripSharePct: pct(roundTripVolume, grossVolume),
    smallFillSharePct: pct(smallFillVolume, grossVolume),
    makerFillSharePct: makerKnownVolume > 0 ? pct(makerFillVolume, makerKnownVolume) : null,
    directionalConcentrationPct: pct(largestDirectional, directionalGross),
    largeDepositsUsd: round(largeDepositsUsd),
    largeDepositCount: largeDeposits.length,
  }
}

function classify(input: HyperliquidWalletProfileInput, behavior: HyperliquidWalletBehaviorProfile): {
  classification: HyperliquidWalletClassification
  confidence: number
  reasons: string[]
} {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile
  const reasons: string[] = []
  const role = input.userRole?.toLowerCase() ?? ''

  if (role.includes('vault') || role.includes('subaccount')) {
    return {
      classification: 'vault_or_managed_account',
      confidence: 0.75,
      reasons: [`Hyperliquid userRole returned ${input.userRole}.`],
    }
  }

  if (input.fills.length < thresholds.minFillsForProfile && behavior.currentExposureUsd < thresholds.minCurrentExposureUsd) {
    return {
      classification: 'insufficient_data',
      confidence: 0.2,
      reasons: [
        `Only ${input.fills.length} fills and ${money(behavior.currentExposureUsd)} current exposure in the profile window.`,
      ],
    }
  }

  if (
    behavior.currentLongExposureUsd > thresholds.minCurrentExposureUsd
    && behavior.currentShortExposureUsd > thresholds.minCurrentExposureUsd
    && behavior.netExposurePct != null
    && behavior.netExposurePct <= thresholds.hedgedNetExposureMaxPct
  ) {
    return {
      classification: 'possible_hedged_or_basis_trader',
      confidence: 0.72,
      reasons: [
        `Current long and short exposure are both meaningful, with only ${behavior.netExposurePct}% net directional exposure.`,
      ],
    }
  }

  const marketMakerFlags = [
    behavior.assetsTraded > thresholds.maxAssetsTradedForDirectional
      ? `Traded ${behavior.assetsTraded} assets in the lookback window.`
      : null,
    behavior.fillsPerDay > thresholds.maxFillsPerDayForDirectional
      ? `${behavior.fillsPerDay} fills/day is more active than a normal directional watch wallet.`
      : null,
    behavior.volumeToEquityRatio != null && behavior.volumeToEquityRatio > thresholds.maxVolumeToEquityRatioForDirectional
      ? `Monthly volume/equity ratio is ${behavior.volumeToEquityRatio}x.`
      : null,
    behavior.roundTripSharePct > thresholds.maxRoundTripSharePct
      ? `${behavior.roundTripSharePct}% of fill notional looks like round-trip/churn activity.`
      : null,
    behavior.smallFillSharePct > thresholds.maxSmallFillSharePct
      ? `${behavior.smallFillSharePct}% of fill notional came from small fills.`
      : null,
    behavior.makerFillSharePct != null && behavior.makerFillSharePct > thresholds.maxMakerFillSharePct
      ? `${behavior.makerFillSharePct}% of known fills were passive maker-style fills.`
      : null,
    behavior.directionalConcentrationPct < thresholds.minDirectionalConcentrationPct
      ? `Directional activity is spread out; largest asset is only ${behavior.directionalConcentrationPct}% of signed notional.`
      : null,
  ].filter((reason): reason is string => reason != null)

  if (marketMakerFlags.length >= 2) {
    return {
      classification: 'possible_market_maker',
      confidence: Math.min(0.9, round(0.58 + marketMakerFlags.length * 0.06, 2)),
      reasons: marketMakerFlags,
    }
  }

  if (marketMakerFlags.length === 1 && behavior.roundTripSharePct > 50) {
    return {
      classification: 'too_noisy',
      confidence: 0.6,
      reasons: marketMakerFlags,
    }
  }

  if (
    behavior.currentExposureUsd < thresholds.minCurrentExposureUsd
    && behavior.fillsPerDay > 100
    && behavior.roundTripSharePct > 45
  ) {
    return {
      classification: 'too_noisy',
      confidence: 0.62,
      reasons: [
        `No meaningful current exposure, ${behavior.fillsPerDay} fills/day, and ${behavior.roundTripSharePct}% round-trip activity.`,
      ],
    }
  }

  if (
    behavior.currentExposureUsd < thresholds.minCurrentExposureUsd
    && behavior.directionalConcentrationPct < thresholds.minDirectionalConcentrationPct
  ) {
    return {
      classification: 'too_noisy',
      confidence: 0.55,
      reasons: [
        `No meaningful current exposure and directional concentration is only ${behavior.directionalConcentrationPct}%.`,
      ],
    }
  }

  if (behavior.directionalConcentrationPct >= thresholds.minDirectionalConcentrationPct) {
    reasons.push(`Largest directional asset is ${behavior.directionalConcentrationPct}% of signed notional.`)
  }
  if (behavior.currentExposureUsd >= thresholds.minCurrentExposureUsd) {
    reasons.push(`Current exposure is ${money(behavior.currentExposureUsd)}.`)
  }
  if (behavior.largeDepositCount > 0) {
    reasons.push(`${behavior.largeDepositCount} large deposit event(s), totaling ${money(behavior.largeDepositsUsd)}.`)
  }

  return {
    classification: 'directional_trader',
    confidence: Math.min(0.9, round(0.55 + (reasons.length * 0.08), 2)),
    reasons: reasons.length > 0 ? reasons : ['No market-maker or hedging flags crossed the profile thresholds.'],
  }
}

function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

export function buildHyperliquidWalletQualityProfile(input: HyperliquidWalletProfileInput): HyperliquidWalletQualityProfile {
  const behavior = behaviorFromInput(input)
  const classified = classify(input, behavior)
  const label = input.watch.label
    ?? input.leaderboard?.displayName
    ?? input.hypurrscanAlias
    ?? null

  return {
    wallet: input.watch.wallet,
    label,
    sources: input.watch.sources,
    identitySources: {
      userProvidedLabel: input.watch.label ?? null,
      hyperliquidDisplayName: input.leaderboard?.displayName ?? null,
      hypurrscanTags: input.hypurrscanTags ?? [],
      hypurrscanAlias: input.hypurrscanAlias ?? null,
      userRole: input.userRole,
    },
    behavior,
    classification: classified.classification,
    confidence: classified.confidence,
    reasons: classified.reasons,
    receipts: [
      { source: 'local', rawRef: 'hyperliquid-wallet-watchlist', capturedAt: input.now },
      { source: 'hyperliquid', rawRef: 'userFillsByTime', capturedAt: input.now },
      { source: 'hyperliquid', rawRef: 'clearinghouseState', capturedAt: input.now },
      { source: 'hyperliquid', rawRef: 'userNonFundingLedgerUpdates', capturedAt: input.now },
    ],
  }
}

export function normalizeHyperliquidWalletWatchlist(entries: HyperliquidWalletWatchlistEntry[]): HyperliquidWalletWatchlistEntry[] {
  const byWallet = new Map<string, HyperliquidWalletWatchlistEntry>()
  for (const entry of entries) {
    const wallet = entry.wallet.trim()
    if (!wallet) continue
    const key = wallet.toLowerCase()
    const existing = byWallet.get(key)
    if (!existing) {
      byWallet.set(key, {
        ...entry,
        wallet,
        sources: [...new Set(entry.sources)],
        active: entry.active,
      })
      continue
    }
    byWallet.set(key, {
      ...existing,
      label: existing.label ?? entry.label,
      sources: [...new Set([...existing.sources, ...entry.sources])],
      reason: [...new Set([existing.reason, entry.reason].filter(Boolean))].join('; '),
      active: existing.active || entry.active,
      firstSeenAt: existing.firstSeenAt ?? entry.firstSeenAt ?? null,
      minDepositUsd: Math.max(existing.minDepositUsd ?? 0, entry.minDepositUsd ?? 0) || null,
    })
  }
  return [...byWallet.values()].filter((entry) => entry.active)
}

export function summarizeHyperliquidWalletProfiles(profiles: HyperliquidWalletQualityProfile[]): Record<HyperliquidWalletClassification, number> {
  const summary: Record<HyperliquidWalletClassification, number> = {
    directional_trader: 0,
    possible_market_maker: 0,
    possible_hedged_or_basis_trader: 0,
    vault_or_managed_account: 0,
    too_noisy: 0,
    insufficient_data: 0,
  }
  for (const profile of profiles) {
    summary[profile.classification] += 1
  }
  return summary
}
