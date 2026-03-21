# myboon — Architecture Diagram

```mermaid
flowchart TD
    subgraph Sources["Signal Sources — packages/collectors"]
        DISC["discovery.ts\nevery 2h\ntop 20 + pinned.json"]
        STREAM["stream.ts\nWebSocket persistent\nprice moves"]
        WHALE["user-tracker.ts\nevery 5min\n18 hardcoded wallets"]
    end

    subgraph DB["Supabase"]
        PT[("polymarket_tracked\nslug · token_id\nyes/no price")]
        SIG[("signals\nsource · type · topic\nslug · weight · metadata\nprocessed")]
        NAR[("narratives\ncluster · observation\nscore · slugs[]\nstatus=draft")]
        PUB[("published_narratives\ncontent_small · content_full\nactions[] · slugs[] · tags[]\nscore · reasoning")]
    end

    subgraph Brain["Multi-Agent Brain — packages/brain"]
        AN["🔍 Analyst\nruns every 15min\nreads signals → clusters narratives\nscore ≥ 7 to save"]
        TOOLS["Tool Calling Loop\nmax 10 turns\nget_market_snapshot\nget_market_by_condition"]
        PB["✅ Publisher\nruns every 30min\ncritic pass · score ≥ 8\nbuilds actions[] from slugs"]
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

    DISC -->|seeds & refreshes| PT
    DISC -->|MARKET_DISCOVERED\nVOLUME_SURGE\nMARKET_CLOSING| SIG
    STREAM -->|reads token_ids from| PT
    STREAM -->|ODDS_SHIFT >5%| SIG
    WHALE -->|WHALE_BET ≥$500| SIG

    SIG -->|processed=false| AN
    AN <-->|live odds mid-analysis| TOOLS
    AN -->|score ≥ 7| NAR
    AN -->|marks processed=true| SIG

    NAR -->|status=draft| PB
    PB -->|checks duplicates| PUB
    PB -->|status=published| PUB
    PUB -.->|future| IN

    PUB --> FEED_EP
    PUB --> PRED_EP

    FEED_EP --> FEED_TAB
    PRED_EP --> FEED_TAB
    PRED_EP --> PRED_TAB
    SWAP_TAB

    style IN stroke-dasharray: 5 5
```

> Solid lines = built and live. Dashed = planned.
>
> **Collector signals:** `MARKET_DISCOVERED` · `VOLUME_SURGE` · `MARKET_CLOSING` · `ODDS_SHIFT` · `WHALE_BET`
>
> **Analyst tools (live):** `get_market_snapshot(slug)` · `get_market_by_condition(conditionId)`
>
> **Published narrative actions:** `{ type: 'predict', slug }` built deterministically from `narrative.slugs[]` · `{ type: 'perps', symbol }` added by LLM for crypto signals
