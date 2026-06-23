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
  researchPlannerHermesToolsets: '',
  researchPlannerHermesIgnoreRules: false,
  researchPlannerHermesTimeoutMs: 60_000,
  last30DaysPython: 'python3.12',
  last30DaysScript: '/tmp/last30days.py',
  last30DaysTimeoutMs: 300_000,
  last30DaysWebBackend: 'auto',
  maxResearchRounds: 2,
  maxCandidateAgeHours: 48,
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

test('candidateObservedAfter limits researcher fetches to recent candidates', () => {
  assert.equal(__testing.candidateObservedAfter(options), '2026-06-08T00:00:00.000Z')
  assert.equal(__testing.candidateObservedAfter({ ...options, maxCandidateAgeHours: 0 }), null)
})

test('defaultLast30DaysScriptPath uses VPS root path and local Codex path', () => {
  assert.equal(
    __testing.defaultLast30DaysScriptPath('/root'),
    '/root/.agents/skills/last30days/scripts/last30days.py'
  )
  assert.equal(
    __testing.defaultLast30DaysScriptPath('/Users/bibhu'),
    '/Users/bibhu/.codex/skills/last30days/scripts/last30days.py'
  )
})

test('last30days plan payload carries the full research brief into retrieval', () => {
  const brief: any = {
    research_goal: 'Find why July Fed hike sentiment changed.',
    last30days_topic: 'Fed July hike odds',
    lookback_days: 30,
    search_sources: ['reddit', 'grounding'],
    subreddits: ['Economics'],
    polymarket_keywords: ['fed', 'july'],
    last30days_plan: {
      intent: 'prediction',
      freshness_mode: 'strict_recent',
      cluster_mode: 'story',
      subqueries: [{
        label: 'macro',
        search_query: 'Fed July hike inflation yields',
        ranking_query: 'What changed in macro pricing?',
        sources: ['reddit', 'grounding'],
        weight: 1,
      }],
    },
    evidence_to_collect: ['Fed communication', 'inflation data'],
    expected_entities: ['Federal Reserve', 'FOMC'],
    notes: 'Do not restate market rules.',
  }

  const payload = __testing.last30DaysPlanPayload(brief)

  assert.ok(Array.isArray(payload.notes))
  assert.match((payload.notes as string[]).join('\n'), /Find why July Fed hike sentiment changed/)
  assert.match((payload.notes as string[]).join('\n'), /Fed communication/)
  assert.match((payload.notes as string[]).join('\n'), /retrieval only, not observed mentions/)
  assert.match(String((payload.subqueries as any[])[0].ranking_query), /Research goal/)
  assert.match(String((payload.subqueries as any[])[0].ranking_query), /inflation data/)
})

test('normalizeReflectionPlan falls back when planner returns empty subqueries', () => {
  const current = candidate({ title: 'Will Fed hike in July?', slug: 'will-fed-hike-in-july' })
  const context: any = {
    source_url: 'https://polymarket.com/event/fed/will-fed-hike-in-july',
    market: {
      id: 'market-1',
      condition_id: 'condition-1',
      slug: current.slug,
      title: current.title,
      description: 'Resolves based on the FOMC target range.',
      resolution_source: 'FOMC statement',
      end_date: '2026-07-29',
      updated_at: '2026-06-22T00:00:00Z',
    },
    market_structure: { yes_price: 0.2, volume: 1000, volume_24h: 100, liquidity: 200 },
    parent_event: { id: 'event-1', slug: 'fed', title: 'Fed Decision', description: null, end_date: '2026-07-29', volume: 5000, volume_24h: 300, liquidity: 800 },
    sibling_markets: [],
    source_native_questions: [],
  }

  const normalized = __testing.normalizeReflectionPlan({
    research_goal: 'Planner goal',
    last30days_topic: 'Planner topic',
    last30days_plan: {
      intent: 'prediction',
      freshness_mode: 'strict_recent',
      cluster_mode: 'story',
      subqueries: [],
    },
  }, context, current)

  assert.ok(normalized.last30days_plan.subqueries.length > 0)
  assert.equal(normalized.last30days_plan.subqueries[0].label, 'market_sentiment_change')
})

test('last30days result keeps planner entities as hints and preserves bounded evidence context', () => {
  const current = candidate({ id: 'candidate-fed', title: 'Will Fed hike in July?' })
  const context: any = {
    source_url: 'https://polymarket.com/event/fed/will-fed-hike',
    market: {
      id: 'market-1',
      condition_id: 'condition-1',
      slug: current.slug,
      title: current.title,
      description: 'Resolves based on the FOMC target range.',
      resolution_source: 'FOMC statement',
      end_date: '2026-07-29',
      updated_at: '2026-06-22T00:00:00Z',
    },
    market_structure: { yes_price: 0.2, volume: 1000, volume_24h: 100, liquidity: 200 },
    parent_event: { id: 'event-1', slug: 'fed', title: 'Fed Decision', description: null, end_date: '2026-07-29', volume: 5000, volume_24h: 300, liquidity: 800 },
    sibling_markets: [{ slug: 'no-change', title: 'No change', yes_price: 0.78, end_date: '2026-07-29', volume: 2000, volume_24h: 100, liquidity: 300 }],
    source_native_questions: ['What is known from Polymarket?'],
  }
  const planner: any = {
    plan: {
      known_from_polymarket: ['Current Yes price is known.'],
      do_not_research: ['Current odds already supplied.'],
    },
    raw: '{}',
    error: null,
  }
  const brief: any = {
    research_goal: 'Find what changed in Fed hike sentiment.',
    last30days_topic: 'Fed hike sentiment',
    lookback_days: 30,
    search_sources: ['reddit'],
    subreddits: ['Economics'],
    polymarket_keywords: ['fed'],
    last30days_plan: { intent: 'prediction', freshness_mode: 'strict_recent', cluster_mode: 'story', subqueries: [] },
    evidence_to_collect: ['Fed communication'],
    expected_entities: ['Federal Reserve'],
    notes: 'Research only.',
  }
  const report: any = {
    topic: 'Fed hike sentiment',
    generated_at: '2026-06-22T00:00:00Z',
    range_from: '2026-05-23',
    range_to: '2026-06-22',
    query_plan: { notes: 'brief notes' },
    provider_runtime: { planner_model: 'none' },
    items_by_source: { reddit: [{ id: 'r1' }] },
    artifacts: { plan_source: 'provided' },
    clusters: [{ cluster_id: 'cluster-1', title: 'Fed shift', score: 10, sources: ['reddit'], uncertainty: 'medium', candidate_ids: ['r1'], representative_ids: ['r1'] }],
    ranked_candidates: [{
      title: 'Fed officials sound hawkish',
      url: 'https://example.com/fed',
      source: 'reddit',
      snippet: 'Traders discussed hawkish Fed comments.',
      explanation: 'relevant',
      final_score: 80,
      freshness: 90,
      engagement: 12,
      local_relevance: 0.8,
      subquery_labels: ['macro'],
      metadata: { provenance: [{ source: 'reddit' }] },
      source_items: [{
        title: 'Fed officials sound hawkish',
        url: 'https://example.com/fed',
        source: 'reddit',
        container: 'Economics',
        published_at: '2026-06-20',
        engagement: { score: 10 },
        snippet: 'source snippet',
        metadata: { comments: 2, huge_payload: 'x'.repeat(1000) },
        why_relevant: 'Fed sentiment',
      }],
    }],
    warnings: [],
    errors_by_source: {},
  }

  const result = __testing.last30DaysToResearchResult(
    { candidate: current, familyKey: 'title:fed', clusterKey: 'polymarket:markets:title:fed', depth: 'deep_web', reason: 'test', polymarketNativeContext: context } as any,
    planner,
    brief,
    report,
    '[last30days] normal progress diagnostics',
    ['last30days.py']
  )

  assert.deepEqual(result.entities_mentioned, [])
  assert.deepEqual((result.external_research as any).planner_expected_entities, ['Federal Reserve'])
  assert.deepEqual((result.external_research as any).search_failures, [])
  assert.equal((result.external_research as any).diagnostics.stderr, '[last30days] normal progress diagnostics')
  assert.doesNotMatch(result.uncertainty, /source limitations/i)
  assert.equal((result.polymarket_context as any).source_native_context.source_url, context.source_url)
  assert.equal((result.polymarket_context as any).source_native_context.sibling_markets[0].slug, 'no-change')
  const excerpt = (result.related_context as any[]).find((item) => item.kind === 'last30days_report_excerpt')
  assert.equal(excerpt.ranked_candidates[0].source_items[0].published_at, '2026-06-20')
  assert.deepEqual(excerpt.ranked_candidates[0].source_items[0].metadata, { comments: 2 })
  assert.equal(excerpt.clusters[0].title, 'Fed shift')
})

test('fallback evidence review rejects Polymarket fallback links as proof', () => {
  const brief: any = {
    research_goal: 'Find why WHOOP IPO odds moved.',
    last30days_topic: 'WHOOP IPO odds',
    lookback_days: 30,
    search_sources: ['reddit', 'grounding', 'polymarket'],
    subreddits: ['investing'],
    polymarket_keywords: ['WHOOP', 'IPO'],
    last30days_plan: { intent: 'prediction', freshness_mode: 'strict_recent', cluster_mode: 'story', subqueries: [] },
    evidence_to_collect: ['IPO filing', 'funding news'],
    expected_entities: ['WHOOP'],
    notes: 'Find external catalyst.',
  }
  const report: any = {
    ranked_candidates: [
      {
        title: 'What will WTI Crude Oil hit in June 2026?',
        url: 'https://polymarket.com/event/what-price-will-wti-hit-in-june-2026',
        source: 'polymarket',
        snippet: 'down 5.8% this week',
        explanation: 'fallback-local-score (entity-miss demotion)',
      },
      {
        title: 'WHOOP reportedly delays IPO plans',
        url: 'https://example.com/whoop-ipo-delay',
        source: 'reddit',
        snippet: 'Investors discussed a delay in IPO timing.',
        explanation: 'directly addresses WHOOP IPO timing',
      },
    ],
  }

  const review = __testing.fallbackEvidenceReview(brief, report, null)

  assert.equal(review.verdict, 'accept')
  assert.equal(review.evidence_quality, 'medium')
  assert.equal(review.catalyst_found, true)
  assert.deepEqual(review.usable_evidence.map((item) => item.title), ['WHOOP reportedly delays IPO plans'])
  assert.deepEqual(review.rejected_evidence.map((item) => item.title), ['What will WTI Crude Oil hit in June 2026?'])
})

test('reviewed research result saves only usable evidence and keeps rejected evidence in review context', () => {
  const current = candidate({ id: 'candidate-whoop', title: 'WHOOP IPO before 2027?', slug: 'whoop-ipo-before-2027' })
  const context: any = {
    source_url: 'https://polymarket.com/event/whoop-ipo-before-2027',
    market: {
      id: 'market-1',
      condition_id: 'condition-1',
      slug: current.slug,
      title: current.title,
      description: 'Resolves based on IPO status.',
      resolution_source: 'Public reporting',
      end_date: '2026-12-31',
      updated_at: '2026-06-22T00:00:00Z',
    },
    market_structure: { yes_price: 0.2, volume: 1000, volume_24h: 100, liquidity: 200 },
    parent_event: null,
    sibling_markets: [],
    source_native_questions: ['What is known from Polymarket?'],
  }
  const planner: any = {
    plan: {
      known_from_polymarket: ['WHOOP IPO market odds moved.'],
      do_not_research: ['Current odds already supplied.'],
    },
    raw: '{}',
    error: null,
  }
  const brief: any = {
    research_goal: 'Find why WHOOP IPO odds moved.',
    last30days_topic: 'WHOOP IPO odds',
    lookback_days: 30,
    search_sources: ['reddit', 'grounding', 'polymarket'],
    subreddits: ['investing'],
    polymarket_keywords: ['WHOOP', 'IPO'],
    last30days_plan: { intent: 'prediction', freshness_mode: 'strict_recent', cluster_mode: 'story', subqueries: [] },
    evidence_to_collect: ['IPO filing', 'funding news'],
    expected_entities: ['WHOOP'],
    notes: 'Find external catalyst.',
  }
  const report: any = {
    ranked_candidates: [{
      title: 'What will WTI Crude Oil hit in June 2026?',
      url: 'https://polymarket.com/event/what-price-will-wti-hit-in-june-2026',
      source: 'polymarket',
      snippet: 'down 5.8% this week',
      explanation: 'fallback-local-score (entity-miss demotion)',
    }],
    warnings: [],
    errors_by_source: {},
  }
  const review: any = {
    verdict: 'reject',
    evidence_quality: 'weak',
    catalyst_found: false,
    research_completeness: 'blocked',
    final_summary: 'No usable external evidence was found for the WHOOP IPO move.',
    key_findings: [],
    usable_evidence: [],
    rejected_evidence: [{
      title: 'What will WTI Crude Oil hit in June 2026?',
      url: 'https://polymarket.com/event/what-price-will-wti-hit-in-june-2026',
      source: 'polymarket',
      reason: 'Unrelated Polymarket fallback result.',
    }],
    missing_evidence: ['No WHOOP IPO filing, funding, or delay source was found.'],
    follow_up_research: null,
    notes: 'Reject unrelated fallback result.',
    raw: '{}',
    error: null,
  }

  const result = __testing.last30DaysToResearchResult(
    { candidate: current, familyKey: 'title:whoop', clusterKey: 'polymarket:markets:title:whoop', depth: 'deep_web', reason: 'test', polymarketNativeContext: context } as any,
    planner,
    brief,
    report,
    '',
    ['last30days.py'],
    review,
    [{ round: 1, brief, report, stderr: '', args: ['last30days.py'], review }]
  )

  assert.equal(result.evidence_quality, 'weak')
  assert.equal(result.catalyst_found, false)
  assert.deepEqual(result.evidence_links, [])
  assert.deepEqual(result.open_questions, ['No WHOOP IPO filing, funding, or delay source was found.'])
  const reviewContext = (result.related_context as any[]).find((item) => item.kind === 'evidence_review')
  assert.equal(reviewContext.verdict, 'reject')
  assert.equal(reviewContext.rejected_evidence[0].title, 'What will WTI Crude Oil hit in June 2026?')
})

test('followUpBrief uses reviewer follow-up searches for the next retrieval round', () => {
  const priorBrief: any = {
    research_goal: 'Find why WHOOP IPO odds moved.',
    last30days_topic: 'WHOOP IPO odds',
    lookback_days: 30,
    search_sources: ['reddit', 'grounding', 'polymarket'],
    subreddits: ['investing'],
    polymarket_keywords: ['WHOOP', 'IPO'],
    last30days_plan: {
      intent: 'prediction',
      freshness_mode: 'strict_recent',
      cluster_mode: 'story',
      subqueries: [{ label: 'initial', search_query: 'WHOOP IPO', ranking_query: 'What changed?', sources: ['reddit', 'grounding'], weight: 1 }],
    },
    evidence_to_collect: ['IPO filing'],
    expected_entities: ['WHOOP'],
    notes: 'Initial search.',
  }
  const review: any = {
    follow_up_research: {
      topic: 'WHOOP IPO delay funding valuation 2026',
      evidence_to_collect: ['S-1 filing', 'funding round', 'valuation change'],
      search_sources: ['reddit', 'grounding'],
      subreddits: ['investing', 'stocks'],
      polymarket_keywords: ['WHOOP IPO delay'],
      subqueries: [{
        label: 'whoop_ipo_delay',
        search_query: 'WHOOP IPO delayed 2026 filing funding valuation',
        ranking_query: 'Was there direct news that changed WHOOP IPO timing or valuation?',
        sources: ['reddit', 'grounding'],
        weight: 1,
      }],
      notes: 'Search directly for IPO delay evidence.',
    },
  }

  const next = __testing.followUpBrief(priorBrief, review)

  assert.equal(next.last30days_topic, 'WHOOP IPO delay funding valuation 2026')
  assert.deepEqual(next.search_sources, ['reddit', 'grounding'])
  assert.equal(next.last30days_plan.subqueries[0].label, 'whoop_ipo_delay')
  assert.match(next.notes, /Follow-up/)
})

test('normalizeEvidenceReview does not accept a review with no usable evidence', () => {
  const brief: any = {
    research_goal: 'Find direct evidence.',
    last30days_topic: 'topic',
    lookback_days: 30,
    search_sources: ['reddit', 'grounding'],
    subreddits: ['news'],
    polymarket_keywords: [],
    last30days_plan: { intent: 'prediction', freshness_mode: 'strict_recent', cluster_mode: 'story', subqueries: [] },
    evidence_to_collect: ['direct source'],
    expected_entities: [],
    notes: 'Research.',
  }
  const review = __testing.normalizeEvidenceReview({
    verdict: 'accept',
    evidence_quality: 'strong',
    catalyst_found: true,
    research_completeness: 'complete',
    final_summary: 'Looks good.',
    usable_evidence: [],
    rejected_evidence: [],
    missing_evidence: ['No direct source.'],
  } as any, brief, { ranked_candidates: [] }, '{}', null)

  assert.equal(review.verdict, 'reject')
  assert.equal(review.evidence_quality, 'weak')
  assert.equal(review.catalyst_found, false)
  assert.equal(review.research_completeness, 'blocked')
})

test('finalizeReviewForRound converts max-round retry into blocked reject', () => {
  const review: any = {
    verdict: 'retry',
    evidence_quality: 'weak',
    catalyst_found: false,
    research_completeness: 'blocked',
    final_summary: 'Need another search.',
    key_findings: [],
    usable_evidence: [],
    rejected_evidence: [],
    missing_evidence: ['No direct source.'],
    follow_up_research: {
      topic: 'better search',
      evidence_to_collect: [],
      search_sources: ['grounding'],
      subreddits: [],
      polymarket_keywords: [],
      subqueries: [],
      notes: 'try again',
    },
    notes: 'Retry would help.',
    raw: '{}',
    error: null,
  }

  const finalReview = __testing.finalizeReviewForRound(review, 2, 2)

  assert.equal(finalReview.verdict, 'reject')
  assert.equal(finalReview.evidence_quality, 'weak')
  assert.equal(finalReview.catalyst_found, false)
  assert.equal(finalReview.research_completeness, 'blocked')
  assert.match(finalReview.notes, /Max research rounds reached/)
})
