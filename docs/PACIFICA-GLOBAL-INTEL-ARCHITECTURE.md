# Pacifica Global Intel - Architecture Deep Dive

## 🎯 What Is It?

**Pacifica Global Intel** (`pacifica-fi/global-intel`) is a **real-time global intelligence dashboard** that provides unified situational awareness through:
- AI-powered news aggregation
- Geopolitical event monitoring
- Infrastructure tracking (flights, ships, cables)
- Economic/market surveillance
- Climate/disaster tracking
- Military activity monitoring

**Key constraint:** Pure browser-based experience (no desktop app), deployed on Vercel.

---

## 🏗️ Technical Architecture

### Stack Overview

```
Frontend: TypeScript (75.3%) + Vanilla JS (no React/Vue/Svelte!)
Build: Vite + Rollup
Deployment: Vercel (serverless functions via /api)
Maps: deck.gl + MapLibre GL + D3.js (SVG fallback for mobile)
ML: @xenova/transformers + onnxruntime-web (browser-based inference)
Database: IndexedDB (client-side) + Upstash Redis (server-side cache)
State: Custom pub/sub + localStorage snapshots
```

### Directory Structure

```
global-intel/
├── api/                    # Vercel serverless functions (57 endpoints)
│   ├── gdelt-geo.js       # GDELT geospatial queries
│   ├── polymarket.js      # Polymarket prediction markets
│   ├── cyber-threats.js   # Cyber threat intelligence
│   ├── earthquakes.js     # USGS earthquake data
│   ├── military-flights.js # Flight tracking
│   ├── ais-snapshot.js    # Maritime AIS data
│   ├── yahoo-finance.js   # Market data
│   ├── coingecko.js       # Crypto prices
│   └── ... (50+ more)
│
├── src/
│   ├── App.ts             # Main application class
│   ├── main.ts            # Entry point
│   ├── components/        # 51 UI components
│   │   ├── MapContainer.ts
│   │   ├── DeckGLMap.ts
│   │   ├── Panel.ts       # Base panel class
│   │   ├── EconomicPanel.ts
│   │   ├── StrategicRiskPanel.ts
│   │   ├── NewsPanel.ts
│   │   └── ... (45 more)
│   ├── services/          # 88 services
│   │   ├── polymarket.ts  # Polymarket client
│   │   ├── gdelt-intel.ts # GDELT processor
│   │   ├── storage.ts     # IndexedDB wrapper
│   │   ├── signal-aggregator.ts # Signal fusion
│   │   ├── clustering.ts  # Event clustering
│   │   ├── correlation.ts # Cross-source correlation
│   │   └── ... (82 more)
│   ├── workers/           # Web Workers for ML/analysis
│   ├── utils/             # Helpers
│   └── config/            # App configuration
│
├── scripts/               # Data collection automation
│   └── ais-relay.cjs      # AIS data relay
│
├── data/                  # Static/reference data
│   └── gamma-irradiators.json
│
└── tests/                 # Unit + E2E (Playwright)
```

---

## 📊 Data Flow Architecture

### 1. Data Collection Layer

**Serverless API Functions** (`/api/*`):
- 57+ endpoints acting as proxies to external APIs
- Handle CORS, rate limiting, caching
- Transform/normalize data formats
- Return JSON to frontend

**External Data Sources** (50+):

| Category | Sources |
|----------|---------|
| **Geopolitical** | GDELT, ACLED, UCDP, UNHCR, World Bank |
| **Markets/Finance** | Polymarket, Yahoo Finance, CoinGecko, Finnhub, FRED |
| **News/Media** | RSS feeds (BBC, CNN, AP), Hacker News, ArXiv |
| **Infrastructure** | AIS (maritime), OpenSky (flights), Cloudflare Radar |
| **Climate/Disasters** | NASA FIRMS (fires), USGS (earthquakes), GDACS, Weather API |
| **Military/Intel** | Military flights, naval vessels, cyber threats |
| **Tech** | GitHub trending, tech hubs, tech events |

**Collection Pattern:**
```typescript
// Serverless function example (api/polymarket.js)
export default async function handler(request, response) {
  // 1. Validate + sanitize params
  const { limit = 15, tag = '' } = request.query;
  
  // 2. Construct upstream URL
  const url = `https://gamma-api.polymarket.com/events?tag=${tag}&limit=${limit}`;
  
  // 3. Fetch with timeout (Cloudflare JA3 blocking is common)
  const res = await fetch(url, { timeout: 8000 });
  
  // 4. Return raw data or fallback []
  const data = await res.json().catch(() => []);
  
  // 5. Apply CORS + cache headers
  response.setHeader('Cache-Control', 'public, max-age=60');
  return response.json(data);
}
```

### 2. Frontend Data Services

**Service Layer** (`src/services/*`):
- 19 external API clients
- 69 internal analysis/processing services

**Example Service Flow:**
```typescript
// src/services/polymarket.ts
export class PolymarketService {
  private directFetchWorks: boolean | null = null;
  
  async fetchPredictions(): Promise<Prediction[]> {
    // Circuit breaker pattern
    const breaker = createCircuitBreaker();
    
    // Fallback chain
    try {
      if (this.directFetchWorks === null) {
        // Probe direct connectivity
        this.directFetchWorks = await this.probeDirectFetch();
      }
      
      if (this.directFetchWorks) {
        return await this.directFetch();
      }
    } catch {
      // Fallback 1: Railway relay
      // Fallback 2: Vercel edge function
      // Fallback 3: Production mirror
    }
    
    // Apply filters
    return data
      .filter(e => e.volume > 1000)
      .filter(e => !this.isExcluded(e))
      .filter(e => Math.abs(e.yesPrice - 50) > 5 || e.volume > 50000)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 15);
  }
}
```

### 3. Caching Strategy

**Multi-tier caching:**

| Tier | Storage | TTL | Purpose |
|------|---------|-----|---------|
| **L1** | In-memory `Map` | 5 min | Article cache, session state |
| **L2** | localStorage | No expiry (manual) | Persistent cache, snapshots |
| **L3** | IndexedDB | Unlimited | Historical baselines, dashboard snapshots |
| **L4** | Upstash Redis | Configurable | Server-side cache (shared across users) |

**Cache Implementation:**
```typescript
// src/services/persistent-cache.ts
const CACHE_PREFIX = 'worldmonitor-persistent-cache:';

export function setPersistentCache<T>(key: string, data: T): void {
  const envelope = {
    key,
    data,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope));
  } catch (e) {
    // Ignore quota errors
  }
}

export function getPersistentCache<T>(key: string): T | null {
  const item = localStorage.getItem(CACHE_PREFIX + key);
  if (!item) return null;
  try {
    const envelope = JSON.parse(item);
    return envelope.data;
  } catch {
    return null;
  }
}
```

**IndexedDB Schema:**
```typescript
// src/services/storage.ts
const DB_NAME = 'worldmonitor_db';
const DB_VERSION = 1;

// Object Stores:
// 1. baselines
//    - keyPath: 'key' (string)
//    - Fields: counts[], timestamps[], avg7d, avg30d, lastUpdated
//
// 2. snapshots
//    - keyPath: 'timestamp' (number)
//    - Index: 'by_time' on timestamp
//    - Fields: events[], marketPrices{}, predictions[], hotspotLevels{}
```

### 4. Signal Aggregation & Correlation

**Signal Fusion Engine** (`src/services/signal-aggregator.ts`):

```typescript
// Unified signal interface
interface GeoSignal {
  type: 'outage' | 'military_flight' | 'protest' | 'ais_disruption' | ...;
  country: string;
  lat: number;
  lon: number;
  severity: number; // 0-10
  title: string;
  timestamp: number;
}

// Ingestion pipeline
ingestOutage(event: OutageEvent) {
  this.clearSignalType('outage'); // Dedup
  
  const signal: GeoSignal = {
    type: 'outage',
    country: event.country,
    lat: event.lat,
    lon: event.lon,
    severity: event.severity,
    title: `Internet outage in ${event.country}`,
    timestamp: Date.now()
  };
  
  this.signals.push(signal);
  this.pruneOld(24 * 60 * 60 * 1000); // Remove >24h old
  this.notifyListeners(); // Pub/sub
}

// Country clustering
getCountryClusters(): CountryCluster[] {
  const byCountry = new Map<string, GeoSignal[]>();
  
  for (const signal of this.signals) {
    if (!byCountry.has(signal.country)) {
      byCountry.set(signal.country, []);
    }
    byCountry.get(signal.country)!.push(signal);
  }
  
  return Array.from(byCountry.entries()).map(([country, signals]) => ({
    country,
    signalCount: signals.length,
    uniqueTypes: new Set(signals.map(s => s.type)).size,
    convergenceScore: this.calculateScore(signals)
  }));
}

// Relevance scoring
calculateScore(signals: GeoSignal[]): number {
  const typeBonus = signals.reduce((acc, s) => acc + new Set(signals.map(x => x.type)).size * 20, 0);
  const countBonus = Math.min(30, signals.length * 5);
  const severityBonus = signals.filter(s => s.severity >= 8).length * 10;
  return Math.min(100, typeBonus + countBonus + severityBonus);
}

// Regional correlation
getRegionalConvergence(): RegionalInsight[] {
  // Predefined regions (Middle East, East Asia, etc.)
  // Check if ≥2 countries in region have signals
  // Check if ≥2 different signal types present
  // Generate natural language description
  return insights;
}
```

### 5. App Initialization & Render Loop

**Bootstrap Flow** (`src/App.ts`):
```typescript
class App {
  async init() {
    // 1. Core services
    await this.initDB();        // IndexedDB
    await this.initI18n();      // Internationalization
    await this.mlWorker.init(); // ML models (desktop only)
    
    // 2. UI rendering
    this.renderLayout();
    this.createPanels();        // 20+ intel panels
    this.setupModals();
    
    // 3. Data loading
    await this.loadAllData();   // Parallel with concurrency control
    
    // 4. Real-time updates
    this.setupRefreshIntervals();
    this.setupSnapshotSaving(); // Every 15 min to IndexedDB
    
    // 5. Event handlers
    this.setupEventListeners();
    this.startHeaderClock();
  }
  
  async loadAllData() {
    const inFlight = new Set<string>(); // Concurrency guard
    
    const tasks = [
      this.loadNews(),
      this.loadMarkets(),
      this.loadPredictions(),
      this.loadGeoIntelligence(),
      // ... conditional on enabled layers
    ];
    
    await Promise.allSettled(tasks);
  }
}
```

**Render Loop (Event-Driven):**
```typescript
// Debounced state changes
onStateChanged = debounce(() => {
  this.syncUrlState();
  this.saveSnapshot();
}, 250);

// Periodic tasks
setupRefreshIntervals() {
  setInterval(() => this.loadNews(), 5 * 60 * 1000);     // 5 min
  setInterval(() => this.loadMarkets(), 2 * 60 * 1000);  // 2 min
  setInterval(() => this.saveSnapshot(), 15 * 60 * 1000); // 15 min
}

// Tab visibility handling
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    this.pauseAnimations();
    this.mlWorker.unloadModel(); // Free memory
  } else {
    this.resumeAnimations();
    this.loadAllData(); // Refresh on return
  }
});
```

---

## 🗺️ Map Visualization Architecture

### Component Hierarchy

```
MapContainer.ts (Facade)
├── DeckGLMap.ts (Desktop - WebGL)
│   ├── deck.gl layers
│   ├── MapLibre GL base map
│   └── Interactive overlays
│
└── MapComponent.ts (Mobile - SVG/D3)
    ├── D3.js geospatial rendering
    └── SVG overlays
```

**Data Layers** (toggleable):
- Earthquakes
- Weather alerts
- Internet outages
- Military flights
- Naval vessels
- Maritime AIS
- Subsea cables
- Cyber threats
- Tech hubs
- Fires (NASA FIRMS)
- Protests
- Climate anomalies

**Rendering Pattern:**
```typescript
// MapContainer.ts
class MapContainer {
  async init() {
    const isMobile = this.detectMobile();
    const hasWebGL = this.checkWebGL();
    
    if (!isMobile && hasWebGL) {
      this.deckGLMap = new DeckGLMap(this.container);
      this.activeMap = this.deckGLMap;
    } else {
      this.svgMap = new MapComponent(this.container);
      this.activeMap = this.svgMap;
    }
  }
  
  setEarthquakes(events: Earthquake[]) {
    this.activeMap.setEarthquakes(events);
  }
  
  setMilitaryFlights(flights: Flight[]) {
    this.activeMap.setMilitaryFlights(flights);
  }
}
```

---

## 🤖 AI/ML Integration

### Browser-Based ML

**Capabilities** (`src/services/ml-capabilities.ts`):
- Text classification (threat detection)
- Entity extraction (NER)
- Summarization
- Clustering

**Implementation:**
```typescript
// Web Worker for ML inference
// src/workers/ml-worker.ts
import { pipeline } from '@xenova/transformers';

class MLWorker {
  private classifier: any = null;
  
  async init() {
    this.classifier = await pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased'
    );
  }
  
  async classify(text: string): Promise<Classification> {
    const result = await this.classifier(text);
    return this.parseResult(result);
  }
  
  async summarize(text: string): Promise<string> {
    // Uses onnxruntime-web for local inference
  }
}
```

### AI-Powered Features

1. **News Summarization:**
   - Groq API or OpenRouter API for LLM summarization
   - Fallback to browser-based summarization

2. **Threat Classification:**
   - Classify events as cyber/military/economic threats
   - Severity scoring

3. **Entity Extraction:**
   - Extract countries, organizations, people from articles
   - Link to knowledge graph

4. **Convergence Detection:**
   - Cross-source correlation
   - Generate natural language insights

---

## 🔐 Security & Performance

### Security Headers (Vercel)

```json
{
  "source": "/api/(.*)",
  "headers": [
    { "key": "Access-Control-Allow-Origin", "value": "https://worldmonitor.app" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "Content-Security-Policy", "value": "default-src 'self'" }
  ]
}
```

### Performance Optimizations

**Vite Build (vite.config.ts):**
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      manualChunks: {
        ml: ['@xenova/transformers', 'onnxruntime-web'],
        map: ['@deck.gl/core', 'maplibre-gl', 'h3-js'],
        d3: ['d3', 'd3-geo', 'd3-scale'],
        topojson: ['topojson-client']
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
```

**Caching Strategy:**
- Static assets: `max-age=31536000, immutable`
- HTML: `no-cache, no-store, must-revalidate`
- API responses: `max-age=60` (1 min)

**Concurrency Controls:**
- `inFlight` Set prevents duplicate requests
- Circuit breakers on API calls
- Debounced state changes (250ms)
- Tab visibility detection (pause when hidden)

---

## 📈 Key Design Patterns

### 1. Circuit Breaker
```typescript
const breaker = createCircuitBreaker({
  threshold: 3,      // Failures before open
  timeout: 30000,    // ms before half-open
  resetTimeout: 60000 // ms before full reset
});

try {
  await breaker.execute(() => fetch(url));
} catch (err) {
  // Cooldown period, fail fast
}
```

### 2. Fallback Chain
```typescript
async function fetchWithFallbacks(): Promise<Data> {
  try { return await directFetch(); }
  catch { try { return await railwayRelay(); }
  catch { try { return await vercelEdge(); }
  catch { return await productionMirror(); }
  } } }
}
```

### 3. Pub/Sub for State
```typescript
class DataFreshnessTracker {
  private listeners: Set<Listener> = new Set();
  
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  
  recordUpdate(sourceId: string, itemCount: number) {
    this.sources.get(sourceId)!.lastUpdate = Date.now();
    this.notifyListeners();
  }
  
  private notifyListeners() {
    this.listeners.forEach(fn => fn(this.getState()));
  }
}
```

### 4. WeakMap for Metadata
```typescript
// Avoid memory leaks with WeakMap
const temporalSourceMap = new WeakMap<object, string>();

temporalSourceMap.set(eventObject, 'military-flights');
// Automatically GC'd when eventObject is garbage collected
```

---

## 🚀 Deployment Architecture

### Vercel Configuration

```json
{
  "headers": [
    {
      "source": "/",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

### Serverless Function Routes

| Pattern | Purpose |
|---------|---------|
| `/api/gdelt-*` | GDELT data proxy |
| `/api/polymarket` | Polymarket markets |
| `/api/yahoo-finance` | Stock/crypto prices |
| `/api/earthquakes` | USGS seismic data |
| `/api/ais-*` | Maritime tracking |
| `/api/military-*` | Military activity |
| `/api/cyber-*` | Cyber threat intel |
| `/api/fred-*` | Economic indicators |

---

## 🎯 Lessons for myboon

### What We Can Borrow

1. **Serverless API Proxy Pattern**
   - 57+ endpoints as thin wrappers around external APIs
   - Handle CORS, rate limits, fallbacks centrally
   - Perfect for our collectors

2. **Multi-Tier Caching**
   - L1: In-memory Map (5 min TTL)
   - L2: localStorage (persistent)
   - L3: IndexedDB (historical)
   - L4: Upstash Redis (shared)

3. **Signal Aggregation Engine**
   - Unified `GeoSignal` interface
   - Country-based clustering
   - Convergence scoring (type diversity + volume + severity)
   - Regional correlation

4. **Circuit Breaker + Fallback Chain**
   - Critical for reliability
   - We should use for Polymarket + Pacifica collectors

5. **Event-Driven Render Loop**
   - Debounced state changes
   - Pub/sub for cross-component communication
   - Tab visibility handling

6. **Data Freshness Tracking**
   - Track last update per source
   - Calculate staleness status
   - Identify intelligence gaps

7. **Browser-Based ML**
   - Web Workers for heavy computation
   - @xenova/transformers for local inference
   - Unload models when tab hidden

### What's Different for myboon

| Global Intel | myboon |
|--------------|--------|
| Map-centric visualization | Feed/narrative-centric |
| 50+ data sources | 2 sources (Polymarket + Pacifica initially) |
| Browser-only ML | Cloud-based LLM (Minimax) |
| Passive monitoring | Active narrative generation |
| No user accounts | User profiles, wallet integration |
| Static dashboards | Dynamic feed with personalization |

---

## 📝 Implementation Checklist for myboon

### Phase 1: Collectors (#051)
- [ ] Create serverless functions for Pacifica API
- [ ] Implement fallback chain (direct → relay → edge)
- [ ] Add circuit breaker pattern
- [ ] Set up 5-min in-memory cache
- [ ] Emit signals to Supabase `signals` table

### Phase 2: Signal Design (#057)
- [ ] Define unified signal interface
- [ ] Implement thresholds (ODDS_SHIFT, FUNDING_SPIKE, etc.)
- [ ] Add metadata schema per signal type
- [ ] Build convergence scoring

### Phase 3: Brain Integration (#055)
- [ ] Create `get_pacific_snapshot()` tool
- [ ] Update Analyst prompt for Pacific signals
- [ ] Enable cross-market clustering
- [ ] Add `[source: PACIFIC]` prefixes

### Phase 4: UI Services (#052, #053)
- [ ] Build TypeScript API client
- [ ] Implement WebSocket subscription
- [ ] Create Trade tab UI
- [ ] Add live price updates

### Phase 5: Builder Code (#054)
- [ ] Register MYBOON builder code
- [ ] Build user approval flow
- [ ] Include builder_code in all orders
- [ ] Track fee earnings

---

## 🔗 References

- **Repo:** https://github.com/pacifica-fi/global-intel
- **Live:** https://worldmonitor.app
- **Pacifica Docs:** https://pacifica.gitbook.io/docs
- **Builder Program:** https://pacifica.gitbook.io/docs/programs/builder-program
- **API Docs:** https://pacifica.gitbook.io/docs/api-documentation/api
