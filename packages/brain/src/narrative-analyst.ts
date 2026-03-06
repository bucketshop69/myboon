import 'dotenv/config'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[narrative-analyst] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// --- types ---

interface SignalMetadata {
  volume?: number
  yes_price?: number
  no_price?: number
  shift_from?: number
  shift_to?: number
  user?: string
  amount?: number
  side?: string
  outcome?: string
  slug?: string
}

interface Signal {
  id: string
  source: string
  type: string
  topic: string
  weight: number
  metadata: SignalMetadata
  created_at: string
  processed?: boolean
}

interface NarrativeCluster {
  cluster: string
  observation: string
  score: number
  signal_count: number
  key_signals: string[]
}

// --- supabase helpers ---

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function fetchUnprocessedSignals(): Promise<Signal[]> {
  const url = `${SUPABASE_URL}/rest/v1/signals?processed=eq.false&order=created_at.asc&limit=300`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<Signal[]>
}

async function markSignalsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const idList = ids.join(',')
  const url = `${SUPABASE_URL}/rest/v1/signals?id=in.(${idList})`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ processed: true }),
  })
  if (!res.ok) {
    throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`)
  }
}

// --- signal formatting ---

function formatDollars(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toLocaleString()}`
}

function formatSignalLine(signal: Signal): string {
  const { type, topic, weight, metadata } = signal

  switch (type) {
    case 'ODDS_SHIFT': {
      const from = metadata.shift_from ?? metadata.yes_price ?? '?'
      const to = metadata.shift_to ?? '?'
      return `[ODDS_SHIFT] "${topic}" — yes_price ${from} → ${to} (weight: ${weight})`
    }
    case 'WHALE_BET': {
      const user = metadata.user ?? 'unknown'
      const amount = metadata.amount != null ? formatDollars(metadata.amount) : '?'
      const side = metadata.outcome ?? metadata.side ?? '?'
      return `[WHALE_BET] "${topic}" — ${user} bet ${amount} ${side} (weight: ${weight})`
    }
    case 'MARKET_DISCOVERED': {
      const volume =
        metadata.volume != null ? formatDollars(metadata.volume) : '?'
      return `[MARKET_DISCOVERED] "${topic}" — volume ${volume} (weight: ${weight})`
    }
    default: {
      return `[${type}] "${topic}" (weight: ${weight})`
    }
  }
}

// --- minimax call ---

async function clusterNarratives(
  signalLines: string[]
): Promise<NarrativeCluster[]> {
  const systemPrompt =
    'You are a market intelligence analyst monitoring Polymarket prediction markets and whale betting activity.'

  const userPrompt = `Below are recent signals from Polymarket. Cluster them into emerging narratives.

Signals:
${signalLines.join('\n')}

Return a JSON array only — no markdown, no explanation. Each element:
{
  "cluster": "short narrative title",
  "observation": "factual 2-3 sentence analyst note",
  "score": <integer 1-10 urgency/importance>,
  "signal_count": <number of signals in this cluster>,
  "key_signals": ["brief signal 1", "brief signal 2"]
}`

  const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': MINIMAX_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      temperature: 0.3,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`MiniMax request failed: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>
  }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''

  // strip possible markdown fences
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(clean) as NarrativeCluster[]
}

// --- csv output ---

const CSV_PATH = join(process.cwd(), 'reports', 'narratives.csv')
const CSV_HEADER = 'timestamp,cluster,score,signal_count,observation,key_signals\n'

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""')
  return `"${escaped}"`
}

function saveToCsv(clusters: NarrativeCluster[], timestamp: string): void {
  const dir = join(process.cwd(), 'reports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const needsHeader = !existsSync(CSV_PATH)
  if (needsHeader) appendFileSync(CSV_PATH, CSV_HEADER, 'utf8')

  for (const c of clusters) {
    const keySignalsStr = c.key_signals.join(' | ')
    const row = [
      csvEscape(timestamp),
      csvEscape(c.cluster),
      String(c.score),
      String(c.signal_count),
      csvEscape(c.observation),
      csvEscape(keySignalsStr),
    ].join(',')
    appendFileSync(CSV_PATH, row + '\n', 'utf8')
  }
}

// --- terminal report ---

function printReport(clusters: NarrativeCluster[], timestamp: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(`[narrative-analyst] Report — ${timestamp}`)
  console.log('='.repeat(60))

  if (clusters.length === 0) {
    console.log('No narrative clusters identified.')
  }

  for (const c of clusters) {
    console.log(`\nCluster : ${c.cluster}`)
    console.log(`Score   : ${c.score}/10  |  Signals: ${c.signal_count}`)
    console.log(`Note    : ${c.observation}`)
    if (c.key_signals.length > 0) {
      console.log('Key     :')
      for (const s of c.key_signals) {
        console.log(`  • ${s}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

// --- main run ---

async function run(): Promise<void> {
  const timestamp = new Date().toISOString()
  console.log(`[narrative-analyst] Running at ${timestamp}`)

  const signals = await fetchUnprocessedSignals()

  if (signals.length === 0) {
    console.log('[narrative-analyst] No unprocessed signals. Skipping LLM call.')
    return
  }

  console.log(`[narrative-analyst] Found ${signals.length} unprocessed signal(s).`)

  const signalLines = signals.map(formatSignalLine)
  const clusters = await clusterNarratives(signalLines)

  printReport(clusters, timestamp)
  saveToCsv(clusters, timestamp)
  console.log(`[narrative-analyst] Saved ${clusters.length} cluster(s) to ${CSV_PATH}`)

  const ids = signals.map((s) => s.id)
  await markSignalsProcessed(ids)
  console.log(`[narrative-analyst] Marked ${ids.length} signal(s) as processed.`)
}

// --- entry point ---

async function main(): Promise<void> {
  await run().catch((err: unknown) => {
    console.error('[narrative-analyst] Error during run:', err)
  })

  setInterval(() => {
    run().catch((err: unknown) => {
      console.error('[narrative-analyst] Error during run:', err)
    })
  }, 15 * 60 * 1000)
}

main()
