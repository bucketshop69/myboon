# News Signal Connector PRD

Status: draft for review
Date: 2026-07-04
Owner: myboon feed
First source: New Source

## Purpose

Build the first news-site signal connector for the myboon intelligence feed.

The connector should let myboon pass a curated news URL, detect whether there is
anything new or materially changed, request browser-backed research from Hermes
only when needed, and hand the result into the existing feed pipeline:

```text
curated source URL
  -> source scout
  -> candidate observations
  -> source-aware research
  -> ResearchPacket
  -> entity manager / entity memories
  -> editor draft
  -> publisher
  -> published_narratives / API
```

This is not a generic scraper and not a separate news feed. It is a source lane
that adds candidate observations and research evidence to the shared feed system.

## Problem

We want to monitor trusted news surfaces every few hours, but repeated runs may
return the same headlines. The system needs to know:

```text
Is there anything new?
Is an existing candidate materially changed?
Is this still the same data and should we skip it?
Is this worth source-aware research?
```

Hermes can use a browser to inspect pages and research articles, but myboon
should own scheduling, state, dedupe, validation, persistence, and downstream
handoff. Hermes should act as a callable worker, not the primary orchestrator.

## Goals

- Start with New Source as the first news connector.
- Accept one or more curated source URLs from myboon configuration.
- Run repeatedly without creating duplicate candidates for the same unchanged
  articles.
- Return structured JSON that myboon can validate before ingesting.
- Split the workflow into a lightweight scout step and a deeper research step.
- Preserve source provenance: URL, observed text, timestamps, article links,
  evidence links, and Hermes run metadata.
- Hand only validated research output into the existing entity memory, editor,
  and publisher path.

## Non-Goals

- Do not build a generic web crawler.
- Do not let Hermes cron/profile own source scheduling or persistence.
- Do not publish feed cards directly from Hermes output.
- Do not create entities for every article mention.
- Do not rely on screenshots as the primary extraction method when structured
  page text, metadata, RSS, or article URLs are available.
- Do not expand to 5-10 news sites until the New Source lane proves the full
  end-to-end path.

## First Source Scope

MVP source configuration:

```text
connector_id: new_source_latest_news
source_name: New Source
source_url: https://example-source.test/latest-news
source_type: curated_news
run_interval: every 2-4 hours
```

Optional second New Source surface after the first lane works:

```text
connector_id: new_source_secondary_surface
source_name: New Source
source_url: https://example-source.test/secondary
source_type: curated_news
```

## System Ownership

myboon owns:

- source registry and source URL configuration
- scheduling
- job IDs and job lifecycle
- dedupe state
- retry policy
- schema validation
- persistence
- candidate selection
- downstream conversion to `ResearchPacket`
- entity memory, editor draft, publisher, and API handoff
- observability and alerts

Hermes owns:

- browser-backed source page inspection
- extraction of visible article candidates
- article-level research when invoked
- source-aware summaries, claims, entities, and evidence
- strict JSON response generation

Core principle:

```text
myboon owns the product system. Hermes is the browser-backed analyst function.
```

## High-Level Architecture

```text
myboon scheduler
  -> create scout job for source URL
  -> invoke Hermes source_scout
  -> validate scout_response JSON
  -> compare candidates against dedupe state
  -> store new or materially changed candidates
  -> queue selected candidates for research
  -> invoke Hermes source_aware_research
  -> validate research_response JSON
  -> convert to ResearchPacket
  -> entity manager
  -> editor draft
  -> publisher
```

## Job Types

### 1. Source Scout

Purpose:

```text
Given a curated source URL, what visible article/news candidates exist now?
Which ones are potentially relevant to myboon?
```

The scout step should be cheap and repeatable. It should not do deep research.
It should extract candidates and enough metadata for myboon to dedupe.

Expected output:

- page observation metadata
- visible article candidates
- article URLs
- headlines
- visible summaries
- visible timestamps
- section labels when available
- entity hints
- relevance score and reason
- stable fingerprint fields

### 2. Source-Aware Research

Purpose:

```text
Given one selected candidate, what should the myboon entity memory remember?
```

This step can inspect the article, follow relevant links, triangulate important
claims, and return a research packet. It should not decide final publish quality.

Expected output:

- source signal summary
- entities
- claims
- evidence links
- contradictions or uncertainty
- confidence
- open questions
- suggested memory candidates
- `status = ready_for_entity_memory` when usable

## Scout Request Contract

myboon sends a structured request to Hermes inside the prompt or worker API.

```json
{
  "schema_version": "myboon.hermes.scout_request.v1",
  "job_id": "job_20260704_083000_new_source_latest",
  "connector_id": "new_source_latest_news",
  "source": {
    "name": "New Source",
    "url": "https://example-source.test/latest-news",
    "source_type": "curated_news"
  },
  "task": {
    "type": "source_scout",
    "max_candidates": 10,
    "min_relevance_score": 0.65
  },
  "interest_profile": {
    "include": [
      "crypto markets",
      "stablecoins",
      "sanctions",
      "exchanges",
      "DeFi",
      "tokenization",
      "institutional flows",
      "prediction markets",
      "policy and market structure"
    ],
    "exclude": [
      "generic price recaps without new evidence",
      "sponsored posts",
      "evergreen explainers",
      "duplicate wire copy"
    ]
  },
  "response_rules": {
    "return_json_only": true,
    "do_not_publish": true,
    "do_not_make_trade_recommendations": true
  }
}
```

## Scout Response Contract

Hermes returns JSON only.

```json
{
  "schema_version": "myboon.hermes.scout_response.v1",
  "job_id": "job_20260704_083000_new_source_latest",
  "connector_id": "new_source_latest_news",
  "status": "success",
  "source_observed": {
    "name": "New Source",
    "url": "https://example-source.test/latest-news",
    "observed_at": "2026-07-04T08:31:12Z",
    "access_method": "browser_page_structure",
    "access_status": "success"
  },
  "candidates": [
    {
      "candidate_external_id": "newsource_91af3c",
      "headline": "This sanctioned Russian stablecoin claims it processes billions, but blockchain analysts disagree",
      "article_url": "https://example-source.test/articles/example",
      "source_section": "Finance",
      "visible_summary": "A7A5 claims crypto data providers understate its trading activity.",
      "visible_time": "10 hours ago",
      "page_rank": 1,
      "detected_entities": [
        {
          "name": "A7A5",
          "type": "token"
        }
      ],
      "relevance": {
        "score": 0.93,
        "lane": "sanctions_stablecoins",
        "reasons": [
          "sanctioned stablecoin",
          "disputed volume claim",
          "requires on-chain/source verification"
        ]
      },
      "fingerprint": {
        "canonical_url": "https://example-source.test/articles/example",
        "headline_hash": "sha256:...",
        "source_key": "new_source_latest_news"
      }
    }
  ],
  "errors": []
}
```

## Freshness And Dedupe

myboon must decide what is new. Hermes can suggest fingerprints, but myboon is
the source of truth.

Primary dedupe keys:

```text
connector_id
canonical_article_url
headline_hash
published_at or visible_time when available
```

Candidate outcomes after scout validation:

```text
new_candidate
known_unchanged
known_materially_changed
known_but_needs_recheck
ignored_low_relevance
ignored_excluded_source_item
```

Rules:

- If canonical URL was seen and headline/summary/source timestamp are unchanged,
  skip research.
- If canonical URL was seen but headline, summary, timestamp, or rank changed
  materially, store a new observation event against the same candidate.
- If URL is new and relevance passes threshold, create a candidate observation.
- If Hermes returns no useful candidates, store a successful empty scout result
  so the run is observable.
- If the source page is blocked or unreadable, do not mark all candidates stale;
  mark the scout job failed or partial.

## Research Request Contract

myboon sends one selected candidate at a time.

```json
{
  "schema_version": "myboon.hermes.research_request.v1",
  "job_id": "job_20260704_091500_research_91af3c",
  "candidate_id": "cand_12345",
  "connector_id": "new_source_latest_news",
  "task": {
    "type": "source_aware_research",
    "objective": "Research the candidate signal and return a concrete intelligence packet."
  },
  "candidate": {
    "source_name": "New Source",
    "source_url": "https://example-source.test/latest-news",
    "article_url": "https://example-source.test/articles/example",
    "headline": "This sanctioned Russian stablecoin claims it processes billions, but blockchain analysts disagree",
    "visible_summary": "A7A5 claims crypto data providers understate its trading activity.",
    "source_section": "Finance",
    "observed_at": "2026-07-04T08:31:12Z"
  },
  "research_requirements": {
    "extract_entities": true,
    "extract_claims": true,
    "collect_evidence": true,
    "note_uncertainty": true,
    "return_memory_candidates": true
  },
  "response_rules": {
    "return_json_only": true,
    "do_not_publish": true,
    "do_not_make_trade_recommendations": true
  }
}
```

## Research Response Contract

Hermes returns JSON only.

```json
{
  "schema_version": "myboon.hermes.research_response.v1",
  "job_id": "job_20260704_091500_research_91af3c",
  "candidate_id": "cand_12345",
  "status": "ready_for_entity_memory",
  "source_signal": {
    "source_name": "New Source",
    "headline": "This sanctioned Russian stablecoin claims it processes billions, but blockchain analysts disagree",
    "article_url": "https://example-source.test/articles/example",
    "trigger_reason": "Sanctioned ruble-backed stablecoin volume dispute involving blockchain analytics firms."
  },
  "research_summary": {
    "one_liner": "A ruble-backed stablecoin has a disputed volume claim that may matter for sanctions evasion and on-chain analytics coverage.",
    "confidence": "medium",
    "risk_level": "high",
    "requires_followup": true,
    "followup_reason": "Exact current on-chain volume requires direct explorer or analytics query."
  },
  "entities": [
    {
      "name": "A7A5",
      "type": "token",
      "role": "ruble-backed stablecoin",
      "aliases": ["A7A5 stablecoin"]
    }
  ],
  "claims": [
    {
      "claim_id": "claim_1",
      "claim": "A7A5 claims it processed billions in volume.",
      "claimed_by": "A7A5 or article-reported source",
      "status": "disputed",
      "evidence_refs": ["src_1", "src_2"]
    }
  ],
  "evidence": [
    {
      "evidence_id": "src_1",
      "title": "New Source article",
      "url": "https://example-source.test/articles/example",
      "source_type": "news_article",
      "observed_at": "2026-07-04T09:15:00Z"
    }
  ],
  "memory_candidates": [
    {
      "entity_hint": "A7A5",
      "memory_type": "claim_update",
      "summary": "Volume claims for A7A5 are disputed and require verification against on-chain data.",
      "confidence": "medium",
      "evidence_refs": ["src_1"]
    }
  ],
  "open_questions": [
    "What is the actual current on-chain transfer volume?",
    "Which issuer, wallets, or venues are directly sanctioned?"
  ],
  "errors": []
}
```

## Validation

Every Hermes response must pass schema validation before myboon stores it as a
usable scout or research result.

Validation requirements:

- valid JSON only
- expected `schema_version`
- matching `job_id`
- matching `connector_id` or `candidate_id`
- required fields present
- bounded array sizes
- URLs parse as URLs
- relevance score between `0` and `1`
- evidence references resolve to entries in `evidence`
- no final publishing instructions

Invalid response handling:

```text
invalid_json
  -> attempt one repair prompt or JSON extraction
  -> validate again
  -> retry Hermes job if still invalid
  -> mark failed_permanent after retry budget
```

## Job Lifecycle

Scout job statuses:

```text
scheduled
queued
running
succeeded
result_validated
candidates_ingested
failed_transient
retry_scheduled
failed_permanent
```

Candidate statuses:

```text
observed
deduped_known_unchanged
deduped_new
deduped_materially_changed
research_queued
researching
researched
handed_to_entity_memory
held_low_relevance
failed_research
```

Research job statuses:

```text
queued
running
succeeded
result_validated
research_ingested
failed_transient
retry_scheduled
failed_permanent
```

## Timeout And Retry Policy

Initial policy:

```text
scout timeout: 120 seconds
research timeout: 300 seconds
max retries: 2
backoff: 15 minutes, then 60 minutes
permanent failure: after 3 total attempts
```

Retryable failures:

- browser navigation timeout
- temporary Hermes/model/provider failure
- invalid JSON
- source page temporarily blocked
- empty page result when the source previously worked

Non-retryable failures:

- source URL permanently 404
- candidate already known unchanged
- candidate manually suppressed
- source excluded by policy
- repeated schema failure after repair and retries

## Browser State

Hermes may keep browser/session state inside a dedicated worker profile, but
myboon must treat that state as a cache, not as product state.

Rules:

- myboon stores all durable source/job/candidate/research state.
- Hermes browser cookies or sessions are implementation details.
- A fresh Hermes browser profile should still be able to complete public-source
  MVP jobs.
- If a site requires login, that source needs a separate access and compliance
  decision before entering the connector list.

## Persistence Shape

The exact database design can follow existing collector patterns, but the news
lane needs these durable concepts:

```text
news_sources
news_source_runs
news_candidate_observations
news_research_jobs
news_research_results
```

Minimum stored fields:

- connector ID
- source URL
- run/job ID
- status
- observed at
- canonical article URL
- headline hash
- raw Hermes JSON
- validated normalized payload
- dedupe outcome
- retry count
- error details
- downstream handoff ID when created

## Downstream Handoff

Validated research output should be converted into the existing shared
`ResearchPacket` shape.

Mapping:

```text
research_response.source_signal      -> source context
research_response.entities           -> observed entities / entity hints
research_response.claims             -> research claims
research_response.evidence           -> evidence links
research_response.memory_candidates  -> memory candidates
research_response.open_questions     -> research notes / follow-up
```

The news connector should not call the publisher. It should stop once the
research result is handed to the entity manager.

## Editor And Publisher Expectations

The editor decides whether a researched news signal becomes:

```text
draft_post
watch
needs_more_research
reject
```

The publisher only publishes eligible editor drafts. It should not call Hermes
or perform new research.

## Observability

Each scheduled run should make it easy to answer:

```text
Did the source run?
Did Hermes complete?
Was the JSON valid?
How many candidates were found?
How many were new?
How many were unchanged duplicates?
How many were researched?
How many reached entity memory?
How many became drafts or published narratives?
```

MVP dashboard/log fields:

- source run count
- scout success/failure count
- candidate count by dedupe outcome
- research success/failure count
- validation failure count
- average scout/research duration
- downstream handoff count
- duplicate suppression count

## MVP Acceptance Criteria

The first version is done when:

1. myboon can run a New Source scout job from a configured source URL.
2. Hermes returns `scout_response.v1` JSON.
3. myboon validates the scout response.
4. Repeated unchanged New Source results do not create duplicate research jobs.
5. A new or materially changed candidate creates a candidate observation.
6. myboon can invoke Hermes research for one candidate.
7. Hermes returns `research_response.v1` JSON.
8. myboon validates and stores the research response.
9. The validated research result is converted to `ResearchPacket`.
10. The result can enter entity memory, editor draft, and publisher flow without
    adding a source-specific feed path.

## Implementation Phases

### Phase 1: Contract And Preview

- Define source config for New Source.
- Define scout and research JSON schemas.
- Build no-write preview command for scout.
- Store raw and validated preview outputs.
- Verify duplicate detection across repeated runs.

### Phase 2: Candidate And Research Jobs

- Persist candidate observations.
- Add dedupe outcomes.
- Queue selected candidates for research.
- Invoke Hermes programmatically for research.
- Validate and store research output.

### Phase 3: Feed Pipeline Handoff

- Convert news research output to `ResearchPacket`.
- Run entity manager.
- Verify entity memories.
- Run editor draft.
- Publish only through existing publisher when eligible.

### Phase 4: Hardening

- Add retries, timeout handling, and observability.
- Add failure dashboards/log summaries.
- Add tests for schema validation and dedupe.
- Consider adding `new_source_secondary_surface`.

## Open Questions

- Should the first implementation invoke Hermes directly through CLI/subprocess,
  or should we immediately wrap Hermes behind a small internal worker HTTP API?
- What is the first run interval: 2 hours, 4 hours, or manual preview first?
- What score threshold should queue research automatically?
- Should low-confidence candidates be stored as watch-only observations?
- Which exact existing table or adapter should receive the first news
  `ResearchPacket` handoff?

## Recommended Starting Decision

Start with programmatic myboon orchestration and a single new source URL.
Use Hermes only for the browser-backed scout and research calls. Build the
freshness/dedupe layer before adding more news sites.
