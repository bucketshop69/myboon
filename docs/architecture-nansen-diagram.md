# myboon — Architecture Diagram (with Critic + Nansen)

```mermaid
flowchart TD
    subgraph Sources["Signal Sources — packages/collectors"]
        DISC["discovery.ts\nevery 2h\ntop 20 + pinned.json"]
        STREAM["stream.ts\nWebSocket persistent\nprice moves"]
        WHALE["user-tracker.ts\nevery 5min\n18 hardcoded wallets"]
        NAN["nansen.ts ✨\nevery 30min\nmarket screener + event screener"]
    end

    subgraph NansenAPI["Nansen — External"]
        N_PM["prediction-market\nmarket-screener\nevent-screener"]
        N_PROF["prediction-market\npnl-by-address\ntrades-by-address"]
        N_DEPTH["prediction-market\ntop-holders\norderbook"]
    end

    subgraph DB["Supabase"]
        PT[("polymarket_tracked\nslug · token_id\nyes/no price")]
        SIG[("signals\nsource · type · topic\nslug · weight · metadata\nprocessed")]
        NCACHE[("nansen_cache ✨\nkey · data · fetched_at\nttl_hours")]
        NAR[("narratives\ncluster · observation\nscore · slugs[]\nstatus=draft")]
        PUB[("published_narratives\ncontent_small · content_full\nactions[] · slugs[] · tags[]\nscore · reasoning")]
    end

    subgraph Brain["Multi-Agent Brain — packages/brain"]
        AN["🔍 Analyst\nruns every 15min\nreads signals → clusters narratives\nscore ≥ 7 to save"]

        subgraph AnalystTools["Analyst Tool Calling Loop — max 10 turns"]
            T_SNAP["get_market_snapshot\nget_market_by_condition\n(live Polymarket odds)"]
            T_PROF["nansen_bettor_profile ✨\npnl-by-address\nwin rate · trade count · label"]
            T_DEPTH["nansen_market_depth ✨\ntop-holders + orderbook\nwho's on each side"]
        end

        subgraph PublisherLayer["Publisher Layer"]
            PB["✅ Publisher\nruns every 30min\npicks drafts score ≥ 8\nbuilds actions[] from slugs"]
            CRIT["🪞 Critic Agent ✨\nreflection pass\nchallenge · stress-test\nreject or approve"]
        end

        IN["📢 Influencer\nevery 2-4h\nX post drafts\n(issue #041)"]
    end

    subgraph API["Feed API — packages/api · Hono · VPS"]
        FEED_EP["GET /narratives\nGET /narratives/:id"]
        PRED_EP["GET /predict/markets/:slug\nGET /predict/sports/:sport\nGET /predict/sports/:sport/:slug\nGET /predict/history/:tokenId\nPOST /predict/order"]
    end

    subgraph App["myboon — Mobile · apps/hybrid-expo"]
        FEED_TAB["Feed Tab\nnarrative cards\n→ NarrativeSheet\n→ predict block"]
        PRED_TAB["Predict Tab\nGeopolitics · EPL · UCL"]
        SWAP_TAB["Swap Tab\nJupiter preview"]
    end

    %% Collectors → DB
    DISC -->|seeds & refreshes| PT
    DISC -->|MARKET_DISCOVERED\nVOLUME_SURGE · MARKET_CLOSING| SIG
    STREAM -->|reads token_ids from| PT
    STREAM -->|ODDS_SHIFT >5%| SIG
    WHALE -->|WHALE_BET ≥$500| SIG
    NAN -->|PM_MARKET_SURGE\nPM_EVENT_TRENDING| SIG

    %% Nansen collector hits API via cache
    NAN <-->|check cache first| NCACHE
    NAN <-->|on cache miss| N_PM

    %% Analyst flow
    SIG -->|processed=false| AN
    AN <--> T_SNAP
    AN <--> T_PROF
    AN <--> T_DEPTH
    T_PROF <-->|check cache first| NCACHE
    T_DEPTH <-->|check cache first| NCACHE
    T_PROF <-->|on cache miss| N_PROF
    T_DEPTH <-->|on cache miss| N_DEPTH
    AN -->|score ≥ 7| NAR
    AN -->|marks processed=true| SIG

    %% Publisher + Critic flow
    NAR -->|status=draft| PB
    PB -->|checks duplicates| PUB
    PB --> CRIT
    CRIT -->|approved ≥ 8| PUB
    CRIT -->|rejected| NAR
    PUB -.->|future| IN

    %% API → Mobile
    PUB --> FEED_EP
    PUB --> PRED_EP
    FEED_EP --> FEED_TAB
    PRED_EP --> FEED_TAB
    PRED_EP --> PRED_TAB
    SWAP_TAB

    %% Styles
    style NAN fill:#1a1a2e,stroke:#7c3aed,color:#e2e8f0
    style NCACHE fill:#1a1a2e,stroke:#7c3aed,color:#e2e8f0
    style T_PROF fill:#1a1a2e,stroke:#7c3aed,color:#e2e8f0
    style T_DEPTH fill:#1a1a2e,stroke:#7c3aed,color:#e2e8f0
    style CRIT fill:#1a1a2e,stroke:#f59e0b,color:#e2e8f0
    style IN stroke-dasharray: 5 5
```

> Solid lines = built and live. Dashed = planned. **Purple ✨ = Nansen additions. Amber = Critic layer.**

## Signal types

**Existing:** `MARKET_DISCOVERED` · `VOLUME_SURGE` · `MARKET_CLOSING` · `ODDS_SHIFT` · `WHALE_BET`

**Nansen new:** `PM_MARKET_SURGE` · `PM_EVENT_TRENDING`

## Analyst tools

**Existing:** `get_market_snapshot(slug)` · `get_market_by_condition(conditionId)`

**Nansen new:** `nansen_bettor_profile(address)` · `nansen_market_depth(market_id)`

## Nansen cache TTLs

| Data | TTL |
| --- | --- |
| Bettor PnL profile | 24h |
| Market top-holders | 15min |
| Orderbook | 5min |
| Market screener | 30min |
| Event screener | 1h |

## Publisher Critic flow

Publisher picks draft narratives (score ≥ 8) → Critic challenges assumptions, stress-tests evidence → approves (writes to `published_narratives`) or rejects (marks narrative back to review).

## Build order

1. `NansenClient` in `packages/shared` + `nansen_cache` Supabase table
2. `nansen.ts` collector → `PM_MARKET_SURGE` + `PM_EVENT_TRENDING` signals
3. Analyst tools → `nansen_bettor_profile` + `nansen_market_depth`
4. Critic agent → publisher reflection pass (issue #037)
