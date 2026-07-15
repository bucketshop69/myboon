import { Hono } from 'hono'
import {
  dataApiFetch,
  gammaFetch,
  parseNullableNumber,
} from '../read/market-read.js'
import {
  asRecord,
  buildClosedPositionsFromActivity,
  dedupeActivity,
  hydrateMissingPositionCostBasis,
  isPositivePositionValue,
  positionIdentityKey,
  redeemableLossToClosedPosition,
} from '../read/portfolio.js'

export function createPolymarketAccountRoutes(): Hono {
  const routes = new Hono()

  // GET /polymarket/portfolio/:address
  // Portfolio value + open positions + activity via Gamma data-api.
  // All Gamma — no CLOB auth needed, just the polygon proxy wallet address.
  routes.get('/portfolio/:address', async (c) => {
    const address = c.req.param('address')
    if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

    try {
      // Fetch value, active positions, positive-payout redeemables, closed picks,
      // recent activity, and profile in parallel.
      const [valueRes, posRes, redeemableRes, closedRes, activityRes, profileRes] = await Promise.allSettled([
        dataApiFetch(`value?user=${encodeURIComponent(address)}`),
        dataApiFetch(`positions?user=${encodeURIComponent(address)}&redeemable=false&limit=100&sortBy=CURRENT&sortDirection=DESC`),
        dataApiFetch(`positions?user=${encodeURIComponent(address)}&redeemable=true&limit=50&sortBy=CURRENT&sortDirection=DESC`),
        dataApiFetch(`closed-positions?user=${encodeURIComponent(address)}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`),
        dataApiFetch(`activity?user=${encodeURIComponent(address)}&limit=500&sortBy=TIMESTAMP&sortDirection=DESC`),
        gammaFetch(`public-profile?proxyWallet=${encodeURIComponent(address)}`),
      ])

      // Parse portfolio value
      let portfolioValue: number | null = null
      if (valueRes.status === 'fulfilled' && valueRes.value.ok) {
        const body = await valueRes.value.json() as unknown
        // data-api /value returns [{ user, value }] or { value }
        if (Array.isArray(body) && body.length > 0) {
          portfolioValue = parseNullableNumber((body[0] as Record<string, unknown>).value)
        } else if (body && typeof body === 'object') {
          portfolioValue = parseNullableNumber((body as Record<string, unknown>).value)
        }
      }

      // Parse positions
      let positions: unknown[] = []
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const body = await posRes.value.json() as unknown
        positions = Array.isArray(body) ? body : []
      }

      // Parse redeemable positions. Positive-value redeemables are actionable
      // collect rows; zero-value redeemables are settled losses and belong in history.
      let rawRedeemablePositions: unknown[] = []
      if (redeemableRes.status === 'fulfilled' && redeemableRes.value.ok) {
        const body = await redeemableRes.value.json() as unknown
        rawRedeemablePositions = Array.isArray(body) ? body : []
      }

      // Parse closed picks
      let closedPositions: unknown[] = []
      if (closedRes.status === 'fulfilled' && closedRes.value.ok) {
        const body = await closedRes.value.json() as unknown
        closedPositions = Array.isArray(body) ? body : []
      }

      // Parse recent activity. Keep it separate from picks so the UI can acknowledge
      // trades/deposits/redeems without pretending they are actionable positions.
      let activity: unknown[] = []
      if (activityRes.status === 'fulfilled' && activityRes.value.ok) {
        const body = await activityRes.value.json() as unknown
        activity = Array.isArray(body) ? dedupeActivity(body) : []
      }

      positions = hydrateMissingPositionCostBasis(positions, activity)
      rawRedeemablePositions = hydrateMissingPositionCostBasis(rawRedeemablePositions, activity)

      const redeemablePositions = rawRedeemablePositions.filter(isPositivePositionValue)
      const existingClosedKeys = new Set(closedPositions.map(positionIdentityKey).filter((key): key is string => !!key))
      const settledLostPositions = rawRedeemablePositions
        .filter((position) => !isPositivePositionValue(position))
        .map(redeemableLossToClosedPosition)
        .filter((position): position is unknown => {
          const key = positionIdentityKey(position)
          if (!key || existingClosedKeys.has(key)) return false
          existingClosedKeys.add(key)
          return true
        })
      closedPositions = [...closedPositions, ...settledLostPositions].sort((a, b) => {
        const left = parseNullableNumber(asRecord(a)?.timestamp) ?? 0
        const right = parseNullableNumber(asRecord(b)?.timestamp) ?? 0
        return right - left
      })

      // Some deposit-wallet trades appear in data-api /activity before they appear in
      // /positions or /closed-positions. If portfolio state is otherwise empty, expose
      // closed historical picks reconstructed from activity and final Gamma prices.
      if (positions.length === 0 && redeemablePositions.length === 0 && closedPositions.length === 0) {
        try {
          closedPositions = await buildClosedPositionsFromActivity(address)
          if (closedPositions.length > 0) {
            console.log(`[api] Portfolio ${address}: using ${closedPositions.length} activity fallback closed positions`)
          }
        } catch (fallbackErr) {
          console.warn(
            `[api] Portfolio ${address}: activity fallback failed:`,
            fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
          )
        }
      }

      // Parse profile
      let profile: Record<string, unknown> | null = null
      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        profile = await profileRes.value.json() as Record<string, unknown>
      }

      // Compute summary from positions
      let totalPnl = 0
      let cashOutNow = 0
      let openCount = 0
      for (const p of positions) {
        const pos = p as Record<string, unknown>
        totalPnl += parseNullableNumber(pos.cashPnl) ?? 0
        cashOutNow += parseNullableNumber(pos.currentValue) ?? 0
        openCount++
      }
      let readyToCollect = 0
      for (const p of redeemablePositions) {
        readyToCollect += parseNullableNumber((p as Record<string, unknown>).currentValue) ?? 0
      }
      let totalCollected = 0
      let totalRealizedPnl = 0
      for (const p of closedPositions) {
        const closed = p as Record<string, unknown>
        const realized = parseNullableNumber(closed.realizedPnl) ?? 0
        totalRealizedPnl += realized
        if (realized > 0) totalCollected += realized
      }

      return c.json({
        address,
        portfolioValue: portfolioValue !== null ? Math.round(portfolioValue * 100) / 100 : null,
        positions,
        redeemablePositions,
        closedPositions,
        activity,
        profile: profile ? {
          name: profile.name ?? profile.pseudonym ?? null,
          bio: profile.bio ?? null,
          profileImage: profile.profileImage ?? null,
          xUsername: profile.xUsername ?? null,
        } : null,
        summary: {
          openPositions: openCount,
          totalPnl: Math.round(totalPnl * 100) / 100,
          cashOutNow: Math.round(cashOutNow * 100) / 100,
          readyToCollect: Math.round(readyToCollect * 100) / 100,
          activePickCount: openCount,
          closedPickCount: closedPositions.length,
          activityCount: activity.length,
          hasActivity: activity.length > 0,
          hasAnyPicks: openCount + redeemablePositions.length + closedPositions.length > 0,
          totalCollected: Math.round(totalCollected * 100) / 100,
          totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
        },
      })
    } catch (err) {
      console.error(`[api] Unexpected error in GET /polymarket/portfolio/${address}:`, err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  // GET /polymarket/profile/:address
  // Rich wallet profile card — identity, stats, top positions, top wins, classification.
  // Aggregates 5 data-api + gamma-api calls in parallel.
  routes.get('/profile/:address', async (c) => {
    const address = c.req.param('address')
    if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

    try {
      const [profileRes, valueRes, tradedRes, posRes, closedRes] = await Promise.allSettled([
        gammaFetch(`public-profile?address=${encodeURIComponent(address)}`),
        dataApiFetch(`value?user=${encodeURIComponent(address)}`),
        dataApiFetch(`traded?user=${encodeURIComponent(address)}`),
        dataApiFetch(`positions?user=${encodeURIComponent(address)}&limit=5&sortBy=CASHPNL&sortDirection=DESC`),
        dataApiFetch(`closed-positions?user=${encodeURIComponent(address)}&limit=5&sortBy=REALIZEDPNL&sortDirection=DESC`),
      ])

      // Identity
      let identity: Record<string, unknown> | null = null
      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        const p = await profileRes.value.json() as Record<string, unknown>
        identity = {
          name: p.name ?? p.pseudonym ?? null,
          pseudonym: p.pseudonym ?? null,
          xUsername: p.xUsername ?? null,
          verifiedBadge: p.verifiedBadge ?? false,
          createdAt: p.createdAt ?? null,
          profileImage: p.profileImage ?? null,
          bio: p.bio ?? null,
        }
      }

      // Portfolio value
      let portfolioValue: number | null = null
      if (valueRes.status === 'fulfilled' && valueRes.value.ok) {
        const body = await valueRes.value.json() as unknown
        if (Array.isArray(body) && body.length > 0) {
          portfolioValue = parseNullableNumber((body[0] as Record<string, unknown>).value)
        }
      }

      // Markets traded
      let marketsTraded: number | null = null
      if (tradedRes.status === 'fulfilled' && tradedRes.value.ok) {
        const body = await tradedRes.value.json() as Record<string, unknown>
        marketsTraded = parseNullableNumber(body.traded)
      }

      // Top positions
      let topPositions: unknown[] = []
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const body = await posRes.value.json() as unknown
        topPositions = Array.isArray(body) ? body : []
      }

      // Top wins (closed)
      let topWins: unknown[] = []
      if (closedRes.status === 'fulfilled' && closedRes.value.ok) {
        const body = await closedRes.value.json() as unknown
        topWins = Array.isArray(body) ? body : []
      }

      // Derived stats
      let totalOpenPnl = 0
      for (const p of topPositions) {
        totalOpenPnl += parseNullableNumber((p as Record<string, unknown>).cashPnl) ?? 0
      }
      let totalRealizedPnl = 0
      for (const w of topWins) {
        totalRealizedPnl += parseNullableNumber((w as Record<string, unknown>).realizedPnl) ?? 0
      }

      // Classification
      let classification: string = 'unknown'
      if (portfolioValue !== null) {
        if (portfolioValue >= 50_000) classification = 'whale'
        else if (portfolioValue >= 1_000) classification = 'mid'
        else classification = 'retail'
      }

      return c.json({
        address,
        identity,
        stats: {
          portfolioValue: portfolioValue !== null ? Math.round(portfolioValue * 100) / 100 : null,
          marketsTraded,
          openPositions: topPositions.length,
          totalOpenPnl: Math.round(totalOpenPnl * 100) / 100,
          totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
        },
        classification,
        topPositions,
        topWins,
      })
    } catch (err) {
      console.error(`[api] Unexpected error in GET /polymarket/profile/${address}:`, err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  // GET /polymarket/activity/:address
  // Recent trade activity via Gamma data-api.
  routes.get('/activity/:address', async (c) => {
    const address = c.req.param('address')
    if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

    try {
      const res = await dataApiFetch(
        `activity?user=${encodeURIComponent(address)}&limit=500&sortBy=TIMESTAMP&sortDirection=DESC`
      )
      if (!res.ok) {
        console.error(`[api] data-api /activity error ${res.status}`)
        return c.json({ error: 'Failed to fetch activity' }, 502)
      }
      const body = await res.json() as unknown
      return c.json(Array.isArray(body) ? body : [])
    } catch (err) {
      console.error(`[api] Unexpected error in GET /polymarket/activity/${address}:`, err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  // GET /polymarket/positions/:address/market/:slug
  // Positions for a specific market via Gamma data-api.
  // Fetches all user positions and filters by slug (data-api doesn't support slug filter directly).
  routes.get('/positions/:address/market/:slug', async (c) => {
    const address = c.req.param('address')
    const slug = c.req.param('slug')
    if (!address?.trim() || !slug?.trim()) return c.json({ error: 'Bad request' }, 400)

    try {
      const [positionsRes, activityRes] = await Promise.allSettled([
        dataApiFetch(`positions?user=${encodeURIComponent(address)}&redeemable=false&sizeThreshold=0.1&limit=100&sortBy=CURRENT&sortDirection=DESC`),
        dataApiFetch(`activity?user=${encodeURIComponent(address)}&limit=500&sortBy=TIMESTAMP&sortDirection=DESC`),
      ])
      if (positionsRes.status !== 'fulfilled') {
        console.error(`[api] data-api /positions request failed`, positionsRes.reason)
        return c.json({ error: 'Failed to fetch positions' }, 502)
      }
      const res = positionsRes.value
      if (!res.ok) {
        console.error(`[api] data-api /positions error ${res.status}`)
        return c.json({ error: 'Failed to fetch positions' }, 502)
      }
      const body = await res.json() as unknown
      if (!Array.isArray(body)) return c.json([])

      let activity: unknown[] = []
      if (activityRes.status === 'fulfilled' && activityRes.value.ok) {
        const activityBody = await activityRes.value.json() as unknown
        activity = Array.isArray(activityBody) ? dedupeActivity(activityBody) : []
      }

      // Filter positions matching this market's slug or eventSlug
      const filtered = hydrateMissingPositionCostBasis(body, activity).filter((p: unknown) => {
        const pos = p as Record<string, unknown>
        return pos.slug === slug || pos.eventSlug === slug
      })
      return c.json(filtered)
    } catch (err) {
      console.error(`[api] Unexpected error in GET /polymarket/positions/${address}/market/${slug}:`, err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  return routes
}
