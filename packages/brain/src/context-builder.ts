// context-builder.ts
// Pure TypeScript — no LLM calls, no side effects.
// Takes raw signals + a supabase fetch helper, groups by slug, enriches from
// polymarket_tracked, and returns structured MarketContext objects for the
// narrative-analyst to pass directly into the LLM prompt.

// --- shared Signal type (matches what narrative-analyst fetches) ---

export interface SignalMetadata {
  marketId?: string
  slug?: string
  volume?: number
  endDate?: string
  yes_price?: number
  no_price?: number
  shift_from?: number
  shift_to?: number
  user?: string
  amount?: number
  side?: string
  outcome?: string
  // Added by #035 — present when wallet enrichment is available
  walletWinRate?: number | null
  walletLabel?: string
}

export interface Signal {
  id: string
  source: string
  type: string
  topic: string
  slug?: string        // top-level slug field (added by #031)
  weight: number
  metadata: SignalMetadata
  created_at: string
  processed?: boolean
}

// --- output type ---

export interface MarketContext {
  slug: string
  title: string
  currentYes: number | null
  currentNo: number | null
  priceShift: number | null      // shift_to - shift_from from largest ODDS_SHIFT, or null
  volume: number | null
  recentBets: Array<{
    wallet: string
    amount: number
    side: string
    outcome: string
    timestamp: string
    walletWinRate?: number | null
    walletLabel?: string
  }>
  aggregates: {
    totalWhaleVolume: number
    netOutcome: 'YES-heavy' | 'NO-heavy' | 'split'
    uniqueWallets: number
    largestBet: number
    hasOddsShift: boolean
    oddsShiftSize: number | null
  }
}

// --- polymarket_tracked row shape ---

interface PolymarketTrackedRow {
  title?: string
  yes_price?: number | null
  no_price?: number | null
  volume?: number | null
}

// --- helpers ---

function resolveSlug(signal: Signal): string | null {
  // Prefer top-level slug (added by #031), fall back to metadata.slug
  return signal.slug ?? signal.metadata.slug ?? null
}

function computeNetOutcome(
  yesVolume: number,
  noVolume: number,
  total: number
): 'YES-heavy' | 'NO-heavy' | 'split' {
  if (total === 0) return 'split'
  if (yesVolume / total > 0.6) return 'YES-heavy'
  if (noVolume / total > 0.6) return 'NO-heavy'
  return 'split'
}

// --- main export ---

export async function buildMarketContexts(
  signals: Signal[],
  supabaseFetch: (path: string) => Promise<Response>
): Promise<MarketContext[]> {
  // 1. Filter to signals that have a resolvable slug
  const signalsWithSlug = signals.filter((s) => resolveSlug(s) !== null)

  if (signalsWithSlug.length === 0) return []

  // 2. Group by slug
  const bySlug = new Map<string, Signal[]>()
  for (const signal of signalsWithSlug) {
    const slug = resolveSlug(signal)!
    const group = bySlug.get(slug) ?? []
    group.push(signal)
    bySlug.set(slug, group)
  }

  // 3. Build a context for each slug group
  const contexts: MarketContext[] = []

  for (const [slug, group] of bySlug) {
    // 3a. Fetch current row from polymarket_tracked
    let trackedTitle = slug   // fallback: use slug as title
    let currentYes: number | null = null
    let currentNo: number | null = null
    let trackedVolume: number | null = null

    try {
      const res = await supabaseFetch(
        `polymarket_tracked?slug=eq.${encodeURIComponent(slug)}&select=title,yes_price,no_price,volume&limit=1`
      )
      if (res.ok) {
        const rows = (await res.json()) as PolymarketTrackedRow[]
        if (rows.length > 0) {
          const row = rows[0]
          if (row.title) trackedTitle = row.title
          currentYes = row.yes_price ?? null
          currentNo = row.no_price ?? null
          trackedVolume = row.volume ?? null
        }
      } else {
        console.warn(`[context-builder] polymarket_tracked fetch non-OK for slug "${slug}": ${res.status}`)
      }
    } catch (err) {
      console.warn(`[context-builder] polymarket_tracked fetch error for slug "${slug}":`, err)
    }

    // 3b. Build recentBets from WHALE_BET signals
    const recentBets: MarketContext['recentBets'] = []
    for (const signal of group) {
      if (signal.type !== 'WHALE_BET') continue
      const m = signal.metadata
      const wallet = m.user ?? 'unknown'
      const amount = m.amount ?? 0
      const side = m.side ?? 'unknown'
      const outcome = m.outcome ?? m.side ?? 'unknown'
      const bet: MarketContext['recentBets'][number] = {
        wallet,
        amount,
        side,
        outcome,
        timestamp: signal.created_at,
      }
      // Attach wallet enrichment from #035 if present
      if ('walletWinRate' in m) bet.walletWinRate = m.walletWinRate
      if (m.walletLabel) bet.walletLabel = m.walletLabel
      recentBets.push(bet)
    }

    // 3c. Compute aggregates
    const totalWhaleVolume = recentBets.reduce((sum, b) => sum + b.amount, 0)
    const largestBet = recentBets.reduce((max, b) => Math.max(max, b.amount), 0)
    const uniqueWallets = new Set(recentBets.map((b) => b.wallet)).size

    let yesVolume = 0
    let noVolume = 0
    for (const bet of recentBets) {
      const normalised = (bet.outcome ?? '').toUpperCase()
      if (normalised === 'YES') yesVolume += bet.amount
      else if (normalised === 'NO') noVolume += bet.amount
    }
    const netOutcome = computeNetOutcome(yesVolume, noVolume, totalWhaleVolume)

    // 3d. ODDS_SHIFT: pick largest by absolute shift magnitude
    const oddsShiftSignals = group.filter((s) => s.type === 'ODDS_SHIFT')
    let hasOddsShift = oddsShiftSignals.length > 0
    let oddsShiftSize: number | null = null
    let priceShift: number | null = null

    if (oddsShiftSignals.length > 0) {
      let largest: Signal | null = null
      let largestMag = -Infinity
      for (const s of oddsShiftSignals) {
        const from = s.metadata.shift_from ?? s.metadata.yes_price ?? null
        const to = s.metadata.shift_to ?? null
        if (from != null && to != null) {
          const mag = Math.abs(to - from)
          if (mag > largestMag) {
            largestMag = mag
            largest = s
          }
        }
      }
      if (largest != null) {
        const from = largest.metadata.shift_from ?? largest.metadata.yes_price ?? null
        const to = largest.metadata.shift_to ?? null
        if (from != null && to != null) {
          priceShift = to - from
          oddsShiftSize = Math.abs(priceShift)
        }
      }
    }

    contexts.push({
      slug,
      title: trackedTitle,
      currentYes,
      currentNo,
      priceShift,
      volume: trackedVolume,
      recentBets,
      aggregates: {
        totalWhaleVolume,
        netOutcome,
        uniqueWallets,
        largestBet,
        hasOddsShift,
        oddsShiftSize,
      },
    })
  }

  // 4. Sort by signal count descending
  contexts.sort((a, b) => {
    const countA = (bySlug.get(a.slug) ?? []).length
    const countB = (bySlug.get(b.slug) ?? []).length
    return countB - countA
  })

  return contexts
}
