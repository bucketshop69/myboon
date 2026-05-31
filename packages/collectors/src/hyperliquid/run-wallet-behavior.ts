import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import {
  fetchHyperliquidLeaderboardRows,
  HyperliquidInfoClient,
  type HyperliquidLeaderboardRow,
} from './client.js'
import {
  collectionLeadPersistenceStatus,
  finishCollectionRun,
  persistCollectionLeads,
  startCollectionRun,
} from './collection-lead-store.js'
import {
  buildHyperliquidWalletBehaviorResearchLeads,
  rankHyperliquidResearchLeads,
  summarizeHyperliquidResearchLeads,
  type HyperliquidResearchLead,
} from './research-leads.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from './research-lead-thresholds.js'
import {
  buildHyperliquidWalletQualityProfile,
  normalizeHyperliquidWalletWatchlist,
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

interface WalletBehaviorConfig {
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

interface WalletBehaviorArtifact {
  kind: 'hyperliquid.wallet-behavior-leads'
  generatedAt: string
  params: {
    lookbackDays: number
    walletCount: number
    source: string
  }
  profiles: HyperliquidWalletQualityProfile[]
  leads: HyperliquidResearchLead[]
  laneSummaries: ReturnType<typeof summarizeHyperliquidResearchLeads>
  notes: string[]
}

const DEFAULT_CONFIG_PATH = 'config/hyperliquid-wallet-watchlist.json'
const DAY_MS = 24 * 3_600_000
const SOURCE = 'hyperliquid'
const COLLECTOR = 'hyperliquid.wallet-behavior'

const lookbackDays = Number(
  process.env.HYPERLIQUID_WALLET_BEHAVIOR_DAYS
    ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.walletProfile.lookbackDays
)
const outputPath = process.env.HYPERLIQUID_WALLET_BEHAVIOR_OUTPUT
const localHandoffDir = process.env.V3_LOCAL_DATA_DIR
  ? resolve(process.env.V3_LOCAL_DATA_DIR, 'collection-leads')
  : process.env.HYPERLIQUID_RESEARCH_LEAD_HANDOFF_DIR
    ? resolve(process.env.HYPERLIQUID_RESEARCH_LEAD_HANDOFF_DIR)
    : null
const configPath = process.env.HYPERLIQUID_WALLET_BEHAVIOR_CONFIG
  ?? process.env.HYPERLIQUID_WALLET_PROFILE_CONFIG
  ?? DEFAULT_CONFIG_PATH

function cliWallets(): string[] {
  return process.argv.slice(2)
    .flatMap((arg) => arg.split(','))
    .map((wallet) => wallet.trim())
    .filter((wallet) => wallet && wallet !== '--')
}

function envWallets(): string[] {
  return (process.env.HYPERLIQUID_WALLET_BEHAVIOR_WALLETS ?? '')
    .split(',')
    .map((wallet) => wallet.trim())
    .filter(Boolean)
}

function explicitWalletEntries(wallets: string[]): HyperliquidWalletWatchlistEntry[] {
  return wallets.map((wallet) => ({
    wallet,
    label: null,
    sources: ['manual'],
    reason: 'explicit wallet behavior request',
    active: true,
    firstSeenAt: null,
    minDepositUsd: null,
  }))
}

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

async function loadConfig(): Promise<WalletBehaviorConfig> {
  try {
    const raw = await readFile(resolve(process.cwd(), configPath), 'utf8')
    return JSON.parse(raw) as WalletBehaviorConfig
  } catch (err) {
    console.warn(`[hyperliquid-wallet-behavior] Could not read ${configPath}: ${err instanceof Error ? err.message : String(err)}`)
    return {}
  }
}

async function safeLeaderboardRows(enabled: boolean, limit: number): Promise<HyperliquidLeaderboardRow[]> {
  if (!enabled) return []
  try {
    return await fetchHyperliquidLeaderboardRows(limit)
  } catch (err) {
    console.warn(`[hyperliquid-wallet-behavior] Leaderboard fetch failed: ${err instanceof Error ? err.message : String(err)}`)
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
  console.warn(`[hyperliquid-wallet-behavior] ${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  return fallback
}

async function safeHypurrscanIdentity(wallet: string): Promise<HypurrscanIdentity> {
  try {
    const res = await fetch(`https://api.hypurrscan.io/tags/${wallet}`)
    if (!res.ok) return { tags: [], alias: null }
    const data = await res.json() as unknown
    if (Array.isArray(data)) {
      return { tags: data.filter((tag): tag is string => typeof tag === 'string'), alias: null }
    }
    if (data && typeof data === 'object') {
      const row = data as Record<string, unknown>
      return {
        tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        alias: typeof row.alias === 'string'
          ? row.alias
          : typeof row.name === 'string'
            ? row.name
            : null,
      }
    }
  } catch {
    return { tags: [], alias: null }
  }
  return { tags: [], alias: null }
}

async function writeArtifact(artifact: WalletBehaviorArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-wallets', `hyperliquid-wallet-behavior-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

function safeFilePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

function localHandoffStatus(): string {
  return localHandoffDir
    ? `enabled; pending JSON files will be written to ${join(localHandoffDir, 'pending')}`
    : 'disabled; set V3_LOCAL_DATA_DIR or HYPERLIQUID_RESEARCH_LEAD_HANDOFF_DIR'
}

async function writeLocalHandoff(artifact: WalletBehaviorArtifact): Promise<string | null> {
  if (!localHandoffDir) return null
  const pendingDir = join(localHandoffDir, 'pending')
  await mkdir(pendingDir, { recursive: true })
  const path = join(pendingDir, `hyperliquid-wallet-behavior-${safeFilePart(artifact.generatedAt)}.json`)
  const tempPath = join(pendingDir, `.wallet-behavior-${safeFilePart(artifact.generatedAt)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
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
  let runId: string | null = null

  try {
    const now = new Date()
    const endTime = now.getTime()
    const startTime = endTime - lookbackDays * DAY_MS
    const client = new HyperliquidInfoClient()
    const config = await loadConfig()
    const explicit = [...cliWallets(), ...envWallets()]
    const leaderboardLimit = Number(process.env.HYPERLIQUID_WALLET_BEHAVIOR_LEADERBOARD_LIMIT ?? config.leaderboard?.limit ?? 25)
    const leaderboardEnabled = explicit.length === 0 && (
      process.env.HYPERLIQUID_WALLET_BEHAVIOR_LEADERBOARD === '1'
        || config.leaderboard?.enabled === true
    )
    const leaderboardRows = await safeLeaderboardRows(leaderboardEnabled, leaderboardLimit)
    const leaderboardByWallet = new Map(leaderboardRows.map((row) => [row.wallet.toLowerCase(), row]))
    const watchlist = normalizeHyperliquidWalletWatchlist(explicit.length > 0
      ? explicitWalletEntries(explicit)
      : [
        ...walletRowsToEntries(config.manual, 'manual'),
        ...walletRowsToEntries(config.deposit, 'deposit'),
        ...leaderboardEntries(leaderboardRows),
      ])

    console.log(`[hyperliquid-wallet-behavior] Wallets: ${watchlist.length}`)
    console.log(`[hyperliquid-wallet-behavior] Lookback: ${lookbackDays}d`)
    console.log(`[hyperliquid-wallet-behavior] Collection lead persistence: ${collectionLeadPersistenceStatus()}`)
    console.log(`[hyperliquid-wallet-behavior] Local JSON handoff: ${localHandoffStatus()}`)

    const run = await startCollectionRun({
      source: SOURCE,
      collector: COLLECTOR,
      params: {
        lookbackDays,
        walletCount: watchlist.length,
        source: explicit.length > 0 ? 'explicit wallets' : configPath,
        leaderboardEnabled,
        leaderboardLimit,
        startTime: new Date(startTime).toISOString(),
        endTime: now.toISOString(),
      },
    })
    runId = run?.id ?? null

    const profiles: HyperliquidWalletQualityProfile[] = []
    const leads: HyperliquidResearchLead[] = []
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
      const walletLeads = buildHyperliquidWalletBehaviorResearchLeads({
        wallet: watch.wallet,
        profile,
        fills,
        currentPositions: positions,
        now: now.toISOString(),
        lookbackDays,
        maxLeads: 8,
      })
      profiles.push(profile)
      leads.push(...walletLeads)
      console.log(`[hyperliquid-wallet-behavior] ${shortWallet} ${profile.classification} fills=${fills.length} behaviorLeads=${walletLeads.length}`)
    }

    const rankedLeads = rankHyperliquidResearchLeads(leads)
    const artifact: WalletBehaviorArtifact = {
      kind: 'hyperliquid.wallet-behavior-leads',
      generatedAt: now.toISOString(),
      params: {
        lookbackDays,
        walletCount: watchlist.length,
        source: explicit.length > 0 ? 'explicit wallets' : configPath,
      },
      profiles,
      leads: rankedLeads,
      laneSummaries: summarizeHyperliquidResearchLeads(rankedLeads),
      notes: [
        'Wallet behavior leads are research inputs only. Supabase collection_leads writes are opt-in and published narratives are not created.',
        'The wallet quality profile gates behavior leads so noisy, managed, or hedged wallets do not become strong leads by default.',
        'Fill flow over the lookback window is useful behavior context, but it is not a complete explanation of wallet intent.',
      ],
    }
    const artifactPath = await writeArtifact(artifact)
    const localHandoffPath = await writeLocalHandoff(artifact)
    const persistedLeads = runId
      ? await persistCollectionLeads({ source: SOURCE, collector: COLLECTOR, runId, leads: rankedLeads })
      : 0
    await finishCollectionRun(runId, {
      status: 'completed',
      summary: artifact.laneSummaries,
      artifactPath,
    })

    const researchLeads = rankedLeads.filter((lead) => lead.status === 'research')
    const watchLeads = rankedLeads.filter((lead) => lead.status === 'watch')

    console.log(JSON.stringify({
      artifactPath,
      localHandoffPath,
      persistedLeads,
      laneSummaries: artifact.laneSummaries,
      topResearchLeads: researchLeads.slice(0, 10).map((lead) => ({
        wallet: lead.metrics.wallet,
        asset: lead.asset,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        netFlow: money(typeof lead.metrics.absNetDirectionalFlowUsd === 'number' ? lead.metrics.absNetDirectionalFlowUsd : null),
        currentPosition: money(typeof lead.metrics.currentPositionNotionalUsd === 'number' ? lead.metrics.currentPositionNotionalUsd : null),
        walletClassification: lead.metrics.walletClassification,
      })),
      topWatchLeads: watchLeads.slice(0, 8).map((lead) => ({
        wallet: lead.metrics.wallet,
        asset: lead.asset,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        failedChecks: lead.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.value} vs ${check.threshold}`),
      })),
      ignoredBecauseWalletQuality: rankedLeads
        .filter((lead) => lead.status === 'ignore' && lead.checks.some((check) => check.name === 'wallet is directional' && !check.passed))
        .slice(0, 8)
        .map((lead) => ({
          wallet: lead.metrics.wallet,
          asset: lead.asset,
          headline: lead.headline,
          walletClassification: lead.metrics.walletClassification,
        })),
      note: 'These are wallet behavior research leads, not feed publications.',
    }, null, 2))
  } catch (err) {
    await finishCollectionRun(runId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }).catch((finishErr) => {
      console.warn(`[hyperliquid-wallet-behavior] Could not mark collection run failed: ${finishErr instanceof Error ? finishErr.message : String(finishErr)}`)
    })
    throw err
  }
}

main().catch((err) => {
  console.error('[hyperliquid-wallet-behavior] Fatal error:', err)
  process.exit(1)
})
