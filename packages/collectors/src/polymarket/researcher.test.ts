import assert from 'node:assert/strict'
import test from 'node:test'
import type { PolymarketResearcherOptions } from './researcher'
import { __testing } from './researcher'

const options: Required<PolymarketResearcherOptions> = {
  now: '2026-06-10T00:00:00.000Z',
  batchSize: 10,
  slugCooldownMinutes: 60,
  retryWindowMinutes: 240,
  maxRetryCount: 2,
  structureOnlyScoreMax: 55,
  thinVolume24hMax: 1_000,
  thinLiquidityMax: 1_000,
  backend: 'hermes_cli',
  researchModel: 'hermes_cli',
  hermesCommand: 'hermes',
  hermesToolsets: 'web',
  hermesTimeoutMs: 600_000,
}

function candidate(overrides: Record<string, unknown> = {}): any {
  return {
    id: String(overrides.id ?? 'candidate-1'),
    source: 'polymarket',
    area: 'markets',
    candidate_type: String(overrides.candidate_type ?? 'odds_moved'),
    market_id: String(overrides.market_id ?? 'market-1'),
    slug: String(overrides.slug ?? 'will-fed-cut-rates-in-june'),
    title: String(overrides.title ?? 'Will Fed cut rates in June?'),
    tag_slug: String(overrides.tag_slug ?? 'macro'),
    tag_label: String(overrides.tag_label ?? 'Macro'),
    observed_at: String(overrides.observed_at ?? options.now),
    what_changed: String(overrides.what_changed ?? 'Odds moved from 40% to 46%.'),
    why_flagged: String(overrides.why_flagged ?? 'Odds moved above threshold.'),
    score: Number(overrides.score ?? 80),
    score_breakdown: {},
    metrics: (overrides.metrics as unknown) ?? { oddsDelta: 0.06, currentVolume24h: 10_000, liquidity: 5_000 },
    evidence_refs: (overrides.evidence_refs as unknown) ?? [{ source_url: 'https://polymarket.com/event/test' }],
    status: String(overrides.status ?? 'pending_research'),
    research_retry_count: (overrides.research_retry_count as number | null | undefined) ?? 0,
    research_next_retry_at: (overrides.research_next_retry_at as string | null | undefined) ?? null,
    research_last_error_kind: (overrides.research_last_error_kind as string | null | undefined) ?? null,
  }
}

function prior(overrides: Record<string, unknown> = {}): any {
  return {
    id: String(overrides.id ?? 'research-1'),
    candidate_id: String(overrides.candidate_id ?? 'old-candidate'),
    slug: String(overrides.slug ?? 'will-fed-cut-rates-in-june'),
    research_mode: String(overrides.research_mode ?? 'macro_crypto'),
    summary: String(overrides.summary ?? 'Prior summary'),
    notes: String(overrides.notes ?? 'Prior notes'),
    key_findings: (overrides.key_findings as unknown) ?? ['Finding'],
    evidence_links: (overrides.evidence_links as unknown) ?? [{ url: 'https://example.com/source' }],
    related_context: (overrides.related_context as unknown) ?? ['Context'],
    uncertainty: String(overrides.uncertainty ?? 'Prior uncertainty'),
    editor_notes: String(overrides.editor_notes ?? 'Prior editor note'),
    researched_at: String(overrides.researched_at ?? '2026-06-09T23:30:00.000Z'),
    research_family_key: (overrides.research_family_key as string | null | undefined) ?? 'title:fed-cut-rates-june',
    research_cluster_key: (overrides.research_cluster_key as string | null | undefined) ?? 'polymarket:markets:title:fed-cut-rates-june',
    research_depth: (overrides.research_depth as string | null | undefined) ?? 'deep_web',
    evidence_quality: (overrides.evidence_quality as string | null | undefined) ?? 'strong',
    catalyst_found: (overrides.catalyst_found as boolean | null | undefined) ?? true,
    recommended_editor_action: (overrides.recommended_editor_action as string | null | undefined) ?? 'publish_candidate',
    research_backend: (overrides.research_backend as string | null | undefined) ?? 'hermes_cli',
    research_model: (overrides.research_model as string | null | undefined) ?? 'hermes_cli',
  }
}

test('classifyResearchDepth reuses recent exact-slug research', () => {
  const row = prior()
  const decision = __testing.classifyResearchDepth(
    candidate(),
    { bySlug: new Map([[row.slug, [row]]]), byFamilyKey: new Map() },
    Date.parse(options.now),
    options
  )

  assert.equal(decision.depth, 'reuse_prior')
  assert.equal(decision.prior?.id, row.id)
  assert.equal(decision.reason, 'recent_exact_slug_research')
})

test('classifyResearchDepth routes low-score thin markets to market-structure-only', () => {
  const decision = __testing.classifyResearchDepth(
    candidate({
      slug: 'will-random-token-hit-123',
      title: 'Will random token hit 123?',
      tag_slug: 'markets',
      tag_label: 'Markets',
      score: 35,
      metrics: { oddsDelta: 0.05, currentVolume24h: 250, liquidity: 300 },
      what_changed: 'Odds moved mechanically.',
      why_flagged: 'Small move on thin market.',
    }),
    { bySlug: new Map(), byFamilyKey: new Map() },
    Date.parse(options.now),
    options
  )

  assert.equal(decision.depth, 'market_structure_only')
})

test('buildReusePriorRow preserves prior metadata and links duplicate research id', () => {
  const row = prior()
  const current = candidate()
  const decision = {
    candidate: current,
    depth: 'reuse_prior' as const,
    familyKey: __testing.primaryFamilyKey(current),
    clusterKey: __testing.clusterKeyForCandidate(current),
    prior: row,
    reason: 'recent_exact_slug_research',
  }

  const research = __testing.buildReusePriorRow(decision, options.now, options)

  assert.equal(research.research_depth, 'reuse_prior')
  assert.equal(research.duplicate_of_research_id, row.id)
  assert.equal(research.evidence_quality, 'strong')
  assert.equal(research.catalyst_found, true)
})

test('buildMarketStructureRow recommends rejecting very weak deterministic rows', () => {
  const current = candidate({
    score: 30,
    metrics: { oddsDelta: 0.04, currentVolume24h: 100, liquidity: 100 },
    evidence_refs: [],
  })
  const decision = {
    candidate: current,
    depth: 'market_structure_only' as const,
    familyKey: __testing.primaryFamilyKey(current),
    clusterKey: __testing.clusterKeyForCandidate(current),
    reason: 'low_score_thin_market_structure',
  }

  const research = __testing.buildMarketStructureRow(decision, options.now, options)

  assert.equal(research.research_depth, 'market_structure_only')
  assert.equal(research.evidence_quality, 'weak')
  assert.equal(research.recommended_editor_action, 'reject_thin')
})

test('retry helpers classify timeout failures and existing retry counts', () => {
  assert.equal(__testing.errorKind('Hermes timed out after 600000ms'), 'timeout')
  assert.equal(__testing.retryCount(candidate({ research_retry_count: '1' })), 1)
})
