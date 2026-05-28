import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import {
  fetchHyperliquidLeaderboardRows,
  HyperliquidInfoClient,
  type HyperliquidLeaderboardRow,
} from './client.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from './research-lead-thresholds.js'
import {
  buildHyperliquidWalletQualityProfile,
  normalizeHyperliquidWalletWatchlist,
  summarizeHyperliquidWalletProfiles,
  type HyperliquidWalletQualityProfile,
  type HyperliquidWalletWatchlistEntry,
} from './wallet-profile.js'

interface WalletConfigRow {
  wallet?: unknown
  label?: unknown
  reason?: unknown
  active?: unknown
  firstSeenAt?: unknown
  minDepositUsd?: unknown
}

interface WalletProfileConfig {
  manual?: WalletConfigRow[]
  deposit?: WalletConfigRow[]
  leaderboard?: {
    enabled?: unknown
    limit?: unknown
  }
}

interface HypurrscanIdentity {
  tags: string[]
  alias: string | null
}

interface WalletProfilesArtifact {
  kind: 'hyperliquid.wallet-profiles'
  generatedAt: string
  params: {
    lookbackDays: number
    walletCount: number
    manualWallets: number
    depositWallets: number
    leaderboardEnabled: boolean
    leaderboardLimit: number
    largeDepositUsd: number
  }
  summary: ReturnType<typeof summarizeHyperliquidWalletProfiles>
  profiles: HyperliquidWalletQualityProfile[]
  notes: string[]
}

const DEFAULT_CONFIG_PATH = 'config/hyperliquid-wallet-watchlist.json'
const DAY_MS = 24 * 3_600_000

const lookbackDays = Number(
  process.env.HYPERLIQUID_WALLET_PROFILE_DAYS
    ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile.lookbackDays
)
const outputPath = process.env.HYPERLIQUID_WALLET_PROFILE_OUTPUT
const configPath = process.env.HYPERLIQUID_WALLET_PROFILE_CONFIG ?? DEFAULT_CONFIG_PATH

function walletRowsToEntries(rows: WalletConfigRow[] | undefined, source: 'manual' | 'deposit'): HyperliquidWalletWatchlistEntry[] {
  return (rows ?? [])
    .map((row): HyperliquidWalletWatchlistEntry | null => {
      const wallet = typeof row.wallet === 'string' ? row.wallet.trim() : ''
      if (!wallet) return null
      return {
        wallet,
        label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null,
        sources: [source],
        reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : `${source} watchlist`,
        active: typeof row.active === 'boolean' ? row.active : true,
        firstSeenAt: typeof row.firstSeenAt === 'string' ? row.firstSeenAt : null,
        minDepositUsd: typeof row.minDepositUsd === 'number' ? row.minDepositUsd : null,
      }
    })
    .filter((entry): entry is HyperliquidWalletWatchlistEntry => entry != null)
}

function envWalletEntries(): HyperliquidWalletWatchlistEntry[] {
  return (process.env.HYPERLIQUID_WALLET_PROFILE_WALLETS ?? process.env.HYPERLIQUID_WATCHLIST ?? '')
    .split(',')
    .map((wallet) => wallet.trim())
    .filter(Boolean)
    .map((wallet) => ({
      wallet,
      label: null,
      sources: ['manual'],
      reason: 'env Hyperliquid wallet watchlist',
      active: true,
      firstSeenAt: null,
      minDepositUsd: null,
    }))
}

async function loadConfig(): Promise<WalletProfileConfig> {
  try {
    const raw = await readFile(resolve(process.cwd(), configPath), 'utf8')
    return JSON.parse(raw) as WalletProfileConfig
  } catch (err) {
    console.warn(`[hyperliquid-wallet-profiles] Could not read ${configPath}: ${err instanceof Error ? err.message : String(err)}`)
    return {}
  }
}

async function safeLeaderboardRows(enabled: boolean, limit: number): Promise<HyperliquidLeaderboardRow[]> {
  if (!enabled) return []
  try {
    return await fetchHyperliquidLeaderboardRows(limit)
  } catch (err) {
    console.warn(`[hyperliquid-wallet-profiles] Leaderboard fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

function leaderboardEntries(rows: HyperliquidLeaderboardRow[]): HyperliquidWalletWatchlistEntry[] {
  return rows.map((row) => ({
    wallet: row.wallet,
    label: row.displayName,
    sources: ['leaderboard'],
    reason: 'Hyperliquid public leaderboard',
    active: true,
    firstSeenAt: null,
    minDepositUsd: null,
  }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function safeHyperliquidCall<T>(label: string, call: () => Promise<T>, fallback: T): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await call()
    } catch (err) {
      lastError = err
      await sleep(250 * attempt)
    }
  }
  console.warn(`[hyperliquid-wallet-profiles] ${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  return fallback
}

async function safeHypurrscanIdentity(wallet: string): Promise<HypurrscanIdentity> {
  try {
    const res = await fetch(`https://api.hypurrscan.io/tags/${wallet}`)
    if (!res.ok) return { tags: [], alias: null }
    const data = await res.json() as unknown
    if (Array.isArray(data)) {
      return {
        tags: data.filter((tag): tag is string => typeof tag === 'string'),
        alias: null,
      }
    }
    if (data && typeof data === 'object') {
      const row = data as Record<string, unknown>
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === 'string')
        : []
      const alias = typeof row.alias === 'string'
        ? row.alias
        : typeof row.name === 'string'
          ? row.name
          : null
      return { tags, alias }
    }
  } catch {
    return { tags: [], alias: null }
  }
  return { tags: [], alias: null }
}

async function writeArtifact(artifact: WalletProfilesArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-wallets', `hyperliquid-wallet-profiles-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

function money(value: number | null): string | null {
  if (value == null) return null
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

async function main(): Promise<void> {
  const now = new Date()
  const endTime = now.getTime()
  const startTime = endTime - lookbackDays * DAY_MS
  const client = new HyperliquidInfoClient()
  const config = await loadConfig()
  const leaderboardLimit = Number(process.env.HYPERLIQUID_WALLET_PROFILE_LEADERBOARD_LIMIT ?? config.leaderboard?.limit ?? 25)
  const leaderboardEnabled = process.env.HYPERLIQUID_WALLET_PROFILE_LEADERBOARD === '1'
    || config.leaderboard?.enabled === true
  const leaderboardRows = await safeLeaderboardRows(leaderboardEnabled, leaderboardLimit)
  const leaderboardByWallet = new Map(leaderboardRows.map((row) => [row.wallet.toLowerCase(), row]))
  const watchlist = normalizeHyperliquidWalletWatchlist([
    ...walletRowsToEntries(config.manual, 'manual'),
    ...walletRowsToEntries(config.deposit, 'deposit'),
    ...envWalletEntries(),
    ...leaderboardEntries(leaderboardRows),
  ])

  console.log(`[hyperliquid-wallet-profiles] Wallets: ${watchlist.length}`)
  console.log(`[hyperliquid-wallet-profiles] Lookback: ${lookbackDays}d`)

  const profiles: HyperliquidWalletQualityProfile[] = []
  for (const watch of watchlist) {
    const shortWallet = `${watch.wallet.slice(0, 10)}...`
    const fills = await safeHyperliquidCall(`${shortWallet} fills`, () => client.fetchUserFillsByTime(watch.wallet, startTime, endTime), [])
    const positions = await safeHyperliquidCall(`${shortWallet} positions`, () => client.fetchWalletPositions(watch.wallet, now.toISOString()), [])
    const ledgerUpdates = await safeHyperliquidCall(`${shortWallet} ledger`, () => client.fetchUserNonFundingLedgerUpdates(watch.wallet, startTime, endTime), [])
    const userRole = await safeHyperliquidCall<string | null>(`${shortWallet} role`, () => client.fetchUserRole(watch.wallet), null)
    const identity = await safeHypurrscanIdentity(watch.wallet)

    const profile = buildHyperliquidWalletQualityProfile({
      watch,
      fills,
      positions,
      ledgerUpdates,
      userRole,
      hypurrscanTags: identity.tags,
      hypurrscanAlias: identity.alias,
      leaderboard: leaderboardByWallet.get(watch.wallet.toLowerCase()) ?? null,
      now: now.toISOString(),
    })
    profiles.push(profile)
    console.log(`[hyperliquid-wallet-profiles] ${shortWallet} ${profile.classification} confidence=${profile.confidence} fills=${fills.length}`)
  }

  const artifact: WalletProfilesArtifact = {
    kind: 'hyperliquid.wallet-profiles',
    generatedAt: now.toISOString(),
    params: {
      lookbackDays,
      walletCount: watchlist.length,
      manualWallets: walletRowsToEntries(config.manual, 'manual').length + envWalletEntries().length,
      depositWallets: walletRowsToEntries(config.deposit, 'deposit').length,
      leaderboardEnabled,
      leaderboardLimit,
      largeDepositUsd: HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile.largeDepositUsd,
    },
    summary: summarizeHyperliquidWalletProfiles(profiles),
    profiles,
    notes: [
      'This profiles Hyperliquid wallets only. It does not read Polymarket/Supabase watchlists.',
      'Manual, leaderboard, and deposit-sourced wallets are kept as separate sources on each profile.',
      'Large deposit discovery for unknown wallets requires a source adapter; this runner can already profile deposit-sourced wallets once discovered.',
    ],
  }
  const artifactPath = await writeArtifact(artifact)
  const sorted = [...profiles].sort((a, b) => b.confidence - a.confidence)

  console.log(JSON.stringify({
    artifactPath,
    summary: artifact.summary,
    topDirectional: sorted
      .filter((profile) => profile.classification === 'directional_trader')
      .slice(0, 8)
      .map((profile) => ({
        wallet: profile.wallet,
        label: profile.label,
        sources: profile.sources,
        confidence: profile.confidence,
        currentExposure: money(profile.behavior.currentExposureUsd),
        fillWindowVolume: money(profile.behavior.fillWindowVolumeUsd),
        assetsTraded: profile.behavior.assetsTraded,
        directionalConcentrationPct: profile.behavior.directionalConcentrationPct,
        reasons: profile.reasons,
      })),
    noisyOrAvoid: sorted
      .filter((profile) => profile.classification !== 'directional_trader')
      .slice(0, 8)
      .map((profile) => ({
        wallet: profile.wallet,
        label: profile.label,
        sources: profile.sources,
        classification: profile.classification,
        confidence: profile.confidence,
        currentExposure: money(profile.behavior.currentExposureUsd),
        fillWindowVolume: money(profile.behavior.fillWindowVolumeUsd),
        assetsTraded: profile.behavior.assetsTraded,
        fillsPerDay: profile.behavior.fillsPerDay,
        reasons: profile.reasons,
      })),
    note: 'These are wallet-quality profiles, not feed publications and not Supabase writes.',
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-wallet-profiles] Fatal error:', err)
  process.exit(1)
})
