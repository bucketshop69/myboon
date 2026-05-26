import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { PublishedOutput } from '../../publisher-types.js'
import type { HyperliquidFill } from './client.js'
import {
  buildHyperliquidResearchBrief,
  detectHyperliquidPositionFindings,
  runHyperliquidMechanicalGate,
} from './research.js'
import type {
  HyperliquidEditorDecision,
  HyperliquidMarketSnapshot,
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from './types.js'

export interface HyperliquidShadowReplayOptions {
  now: string
  startTime: number
  endTime: number
  warmupStartTime: number
  minPositionUsd: number
  minChangeUsd: number
  minChangePct: number
  maxPublications: number
}

export interface HyperliquidShadowReplayInput {
  watchlist: HyperliquidWatchlistEntry[]
  fillsByWallet: Record<string, HyperliquidFill[]>
  marketSnapshots: HyperliquidMarketSnapshot[]
  options: HyperliquidShadowReplayOptions
}

export interface HyperliquidShadowReplayArtifact {
  kind: 'hyperliquid.monthly-shadow-replay'
  generatedAt: string
  params: {
    startTime: number
    endTime: number
    warmupStartTime: number
    watchlistCount: number
    minPositionUsd: number
    minChangeUsd: number
    minChangePct: number
    maxPublications: number
  }
  caveats: string[]
  summary: {
    fillCount: number
    findingCount: number
    briefCount: number
    wouldPublishCount: number
    heldCount: number
  }
  wouldPublish: Array<{
    storyKey: string
    decision: HyperliquidEditorDecision
    brief: HyperliquidResearchBrief
    output: PublishedOutput
    publishedNarrativeRow: {
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
  }>
  held: Array<{
    storyKey: string
    decision: HyperliquidEditorDecision
    brief: HyperliquidResearchBrief
  }>
}

interface ReplayState {
  signedSize: number
  avgEntryPrice: number | null
}

interface ReplayStep {
  before: HyperliquidPositionSnapshot | null
  after: HyperliquidPositionSnapshot | null
}

function fillDirection(fill: HyperliquidFill): 1 | -1 | null {
  if (/long/i.test(fill.dir)) return /close/i.test(fill.dir) ? -1 : 1
  if (/short/i.test(fill.dir)) return /close/i.test(fill.dir) ? 1 : -1
  return null
}

function sideFromSigned(size: number): 'long' | 'short' | null {
  if (size > 0) return 'long'
  if (size < 0) return 'short'
  return null
}

function snapshotFromState(
  wallet: string,
  asset: string,
  state: ReplayState,
  fill: HyperliquidFill,
  suffix: string
): HyperliquidPositionSnapshot | null {
  const side = sideFromSigned(state.signedSize)
  if (!side) return null
  const size = Math.abs(state.signedSize)
  return {
    id: `shadow:${wallet}:${fill.time}:${fill.hash ?? fill.oid ?? 'fill'}:${suffix}`,
    wallet,
    asset,
    side,
    size,
    notionalUsd: size * fill.px,
    entryPrice: state.avgEntryPrice,
    markPrice: fill.px,
    leverage: null,
    unrealizedPnlUsd: null,
    marginUsedUsd: null,
    observedAt: new Date(fill.time).toISOString(),
    raw: fill.raw,
  }
}

function applyFill(state: ReplayState, fill: HyperliquidFill): ReplayState {
  const direction = fillDirection(fill)
  if (direction == null) return state
  const delta = direction * fill.sz
  const beforeSize = state.signedSize
  const afterSize = beforeSize + delta
  const sameDirectionAdd = beforeSize === 0 || Math.sign(beforeSize) === Math.sign(delta)
  const avgEntryPrice = sameDirectionAdd
    ? ((Math.abs(beforeSize) * (state.avgEntryPrice ?? fill.px)) + (Math.abs(delta) * fill.px)) / Math.max(Math.abs(afterSize), 1)
    : afterSize === 0
      ? null
      : state.avgEntryPrice
  return {
    signedSize: Math.abs(afterSize) < 1e-9 ? 0 : afterSize,
    avgEntryPrice,
  }
}

function replayFillToSnapshots(wallet: string, fill: HyperliquidFill, stateByAsset: Map<string, ReplayState>): ReplayStep {
  const beforeState = stateByAsset.get(fill.coin) ?? { signedSize: 0, avgEntryPrice: null }
  const before = snapshotFromState(wallet, fill.coin, beforeState, fill, 'before')
  const afterState = applyFill(beforeState, fill)
  stateByAsset.set(fill.coin, afterState)
  const after = snapshotFromState(wallet, fill.coin, afterState, fill, 'after')
  return { before, after }
}

function deterministicDecision(brief: HyperliquidResearchBrief): HyperliquidEditorDecision {
  if (brief.finding === 'flipped') {
    return { decision: 'publish', priority: Math.max(7, brief.priorityHint), reason: 'Watched wallet flipped direction with receipt-backed size.', surface: 'feed_card' }
  }
  if (brief.finding === 'added' || brief.finding === 'opened') {
    return { decision: 'publish', priority: brief.priorityHint, reason: 'Watched wallet made a meaningful position change.', surface: 'feed_card' }
  }
  return { decision: 'hold', priority: 4, reason: 'Useful follow-up candidate, but not strong enough for first monthly shadow publish.', surface: 'none' }
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function deterministicOutput(brief: HyperliquidResearchBrief, decision: HyperliquidEditorDecision): PublishedOutput {
  const before = money(brief.before.notionalUsd)
  const after = money(brief.after.notionalUsd)
  const side = brief.after.side ?? brief.before.side ?? 'position'
  const lead = brief.finding === 'flipped'
    ? `${brief.asset} trader flipped.`
    : `${brief.asset} ${side} got ${brief.after.notionalUsd >= brief.before.notionalUsd ? 'heavier' : 'lighter'}.`
  return {
    content_small: `${lead}\n${before} -> ${after} in ${brief.timeWindow}.\n${brief.suggestedAngle}.`,
    content_full: `${brief.whyItMayMatter} ${brief.uncertainty[0]}`,
    reasoning: decision.reason,
    tags: ['hyperliquid', brief.asset.toLowerCase(), 'perps'],
    priority: decision.priority,
    publisher_score: Math.max(7, decision.priority),
    actions: [{ type: 'perps', asset: brief.asset }],
    content_type: 'crypto',
  }
}

function marketByAsset(snapshots: HyperliquidMarketSnapshot[]): Map<string, HyperliquidMarketSnapshot> {
  return new Map(snapshots.map((snapshot) => [snapshot.asset, snapshot]))
}

export function runHyperliquidMonthlyShadowReplay(input: HyperliquidShadowReplayInput): HyperliquidShadowReplayArtifact {
  const marketsByAsset = marketByAsset(input.marketSnapshots)
  const wouldPublish: HyperliquidShadowReplayArtifact['wouldPublish'] = []
  const held: HyperliquidShadowReplayArtifact['held'] = []
  const storyKeys = new Set<string>()
  let findingCount = 0
  let briefCount = 0
  let fillCount = 0

  for (const watch of input.watchlist.filter((entry) => entry.active)) {
    const stateByAsset = new Map<string, ReplayState>()
    const fills = (input.fillsByWallet[watch.wallet] ?? []).sort((a, b) => a.time - b.time)
    fillCount += fills.length

    for (const fill of fills) {
      const { before, after } = replayFillToSnapshots(watch.wallet, fill, stateByAsset)
      if (fill.time < input.options.startTime || fill.time > input.options.endTime) continue
      if (!before && !after) continue

      const findings = detectHyperliquidPositionFindings(
        watch,
        before ? [before] : [],
        after ? [after] : [],
        marketsByAsset,
        {
          now: new Date(fill.time).toISOString(),
          minPositionUsd: input.options.minPositionUsd,
          minChangeUsd: input.options.minChangeUsd,
          minChangePct: input.options.minChangePct,
          duplicateStoryKeys: storyKeys,
        }
      )
      findingCount += findings.length

      for (const finding of findings) {
        const brief = buildHyperliquidResearchBrief(finding, new Date(fill.time).toISOString())
        briefCount += 1
        const gate = runHyperliquidMechanicalGate(brief, {
          now: brief.createdAt,
          minPositionUsd: input.options.minPositionUsd,
          minChangeUsd: input.options.minChangeUsd,
          minChangePct: input.options.minChangePct,
          duplicateStoryKeys: storyKeys,
        })
        const decision = gate.passed
          ? deterministicDecision(brief)
          : { decision: 'hold' as const, priority: 2, reason: gate.reasons.join('; '), surface: 'none' as const }

        if ((decision.decision === 'publish' || decision.decision === 'update') && wouldPublish.length < input.options.maxPublications) {
          const output = deterministicOutput(brief, decision)
          storyKeys.add(brief.storyKey)
          wouldPublish.push({
            storyKey: brief.storyKey,
            decision,
            brief,
            output,
            publishedNarrativeRow: {
              content_small: output.content_small,
              content_full: output.content_full,
              reasoning: output.reasoning,
              tags: output.tags,
              priority: output.priority,
              actions: output.actions,
              content_type: output.content_type,
              thread_id: null,
              packet_id: brief.id,
              story_key: brief.storyKey,
              story_candidate_id: finding.id,
              evidence_refs: brief.receipts,
            },
          })
          continue
        }

        held.push({ storyKey: brief.storyKey, decision, brief })
      }
    }
  }

  return {
    kind: 'hyperliquid.monthly-shadow-replay',
    generatedAt: input.options.now,
    params: {
      startTime: input.options.startTime,
      endTime: input.options.endTime,
      warmupStartTime: input.options.warmupStartTime,
      watchlistCount: input.watchlist.filter((entry) => entry.active).length,
      minPositionUsd: input.options.minPositionUsd,
      minChangeUsd: input.options.minChangeUsd,
      minChangePct: input.options.minChangePct,
      maxPublications: input.options.maxPublications,
    },
    caveats: [
      'This is a shadow replay. It does not insert into narratives or published_narratives.',
      'Historical positions are reconstructed from userFillsByTime, not official point-in-time position snapshots.',
      'A warm-up window is used before the report window, but pre-warm-up position state can still be incomplete.',
      'Writer output is deterministic for review; live runs may use the AI writer after approval.',
    ],
    summary: {
      fillCount,
      findingCount,
      briefCount,
      wouldPublishCount: wouldPublish.length,
      heldCount: held.length,
    },
    wouldPublish,
    held,
  }
}

export async function writeHyperliquidShadowReplayArtifact(
  artifact: HyperliquidShadowReplayArtifact,
  outputPath?: string
): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(
      process.cwd(),
      'artifacts',
      'hyperliquid-shadow',
      `hyperliquid-monthly-shadow-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}
