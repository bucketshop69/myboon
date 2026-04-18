/**
 * E2E test — CLOB V2 geo-proxy verification.
 * Run from anywhere (geo-blocked location) against VPS.
 *
 * Usage: API_BASE=http://<vps-ip>:3000 npx tsx src/e2e-v2.ts
 *
 * Tests all geo-restricted endpoints that proxy through our VPS to
 * clob-v2.polymarket.com and gamma-api.polymarket.com.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:3000'

// V2 preprod test events
const TEST_EVENT_IRAN = '73106'  // US/Iran nuclear deal 2027
const TEST_EVENT_MOVIE = '79831' // Highest grossing movie 2026

type Result = { test: string; ok: boolean; ms: number; detail?: string }

async function test(name: string, fn: () => Promise<string | null>): Promise<Result> {
  const t0 = Date.now()
  try {
    const err = await fn()
    const ms = Date.now() - t0
    if (err) {
      console.log(`  ✗ ${name} (${ms}ms) — ${err}`)
      return { test: name, ok: false, ms, detail: err }
    }
    console.log(`  ✓ ${name} (${ms}ms)`)
    return { test: name, ok: true, ms }
  } catch (e: any) {
    const ms = Date.now() - t0
    console.log(`  ✗ ${name} (${ms}ms) — ${e.message}`)
    return { test: name, ok: false, ms, detail: e.message }
  }
}

async function fetchJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function run() {
  console.log(`\n CLOB V2 E2E — ${BASE}\n`)

  const results: Result[] = []

  // ── 1. V2 Health ──
  console.log('\n[1] V2 CLOB connectivity')
  results.push(await test('V2 health check', async () => {
    const { body } = await fetchJson('/clob/v2/health')
    if (!body?.ok) return `V2 CLOB not reachable: ${JSON.stringify(body)}`
    if (!body.host?.includes('clob-v2')) return `wrong host: ${body.host}`
    return null
  }))

  // ── 2. Gamma proxy (geo-restricted) ──
  console.log('\n[2] Gamma API proxy (geo-restricted)')

  let tokenIds: string[] = []
  let conditionId: string | null = null

  results.push(await test(`Gamma event ${TEST_EVENT_IRAN}`, async () => {
    const { status, body } = await fetchJson(`/clob/gamma/events/${TEST_EVENT_IRAN}`)
    if (status !== 200) return `status ${status}`
    if (!body?.markets?.length && !body?.title) return `no market data: ${JSON.stringify(body).slice(0, 200)}`

    // Extract token IDs from event
    const markets = body.markets || [body]
    for (const m of markets) {
      const tokens = m.clobTokenIds ?? m.clob_token_ids ?? []
      if (typeof tokens === 'string') {
        try { tokenIds.push(...JSON.parse(tokens)) } catch { tokenIds.push(tokens) }
      } else if (Array.isArray(tokens)) {
        tokenIds.push(...tokens)
      }
      if (m.conditionId || m.condition_id) {
        conditionId = m.conditionId || m.condition_id
      }
    }
    if (tokenIds.length === 0) return `no token IDs found in event data`
    console.log(`    → found ${tokenIds.length} token IDs, condition: ${conditionId ?? 'none'}`)
    return null
  }))

  results.push(await test(`Gamma event ${TEST_EVENT_MOVIE}`, async () => {
    const { status, body } = await fetchJson(`/clob/gamma/events/${TEST_EVENT_MOVIE}`)
    if (status !== 200) return `status ${status}`
    if (!body?.markets?.length && !body?.title) return `no market data`
    return null
  }))

  // ── 3. CLOB V2 read-only proxies (geo-restricted) ──
  console.log('\n[3] CLOB V2 read-only proxies (geo-restricted)')

  if (tokenIds.length === 0) {
    console.log('  ⚠ skipping — no token IDs from Gamma')
  } else {
    const tid = tokenIds[0]
    const tidShort = `${tid.slice(0, 8)}...${tid.slice(-4)}`

    results.push(await test(`orderbook (${tidShort})`, async () => {
      const { status, body } = await fetchJson(`/clob/book?token_id=${tid}`)
      if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`
      if (!body?.bids && !body?.asks) return `no bids/asks in response`
      console.log(`    → bids: ${body.bids?.length ?? 0}, asks: ${body.asks?.length ?? 0}`)
      return null
    }))

    results.push(await test(`midpoint (${tidShort})`, async () => {
      const { status, body } = await fetchJson(`/clob/midpoint?token_id=${tid}`)
      if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`
      if (body?.mid == null) return `no midpoint in response: ${JSON.stringify(body)}`
      console.log(`    → mid: ${body.mid}`)
      return null
    }))

    results.push(await test(`last-trade-price (${tidShort})`, async () => {
      const { status, body } = await fetchJson(`/clob/last-trade-price?token_id=${tid}`)
      if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`
      console.log(`    → price: ${body?.price ?? 'null'}`)
      return null
    }))
  }

  if (conditionId) {
    const cidShort = `${conditionId.slice(0, 8)}...`
    results.push(await test(`market info (${cidShort})`, async () => {
      const { status, body } = await fetchJson(`/clob/markets/${conditionId}`)
      if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`
      return null
    }))
  }

  // ── 4. Deposit endpoint (geo-restricted bridge API) ──
  console.log('\n[4] Bridge API proxy (geo-restricted)')

  // Use a dummy address — bridge API should still return deposit addresses
  const dummyAddr = '0x0000000000000000000000000000000000000001'
  results.push(await test('deposit addresses (bridge API)', async () => {
    const { status, body } = await fetchJson(`/clob/deposit/${dummyAddr}`)
    // May fail with 502 if bridge rejects dummy addr, but should at least proxy through
    if (status === 502 && body?.detail?.includes('geo')) return `still geo-blocked — bridge API not proxied`
    console.log(`    → status: ${status}, keys: ${body ? Object.keys(body).join(', ') : 'none'}`)
    return null
  }))

  // ── Summary ──
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  const totalMs = results.reduce((s, r) => s + r.ms, 0)

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`${passed}/${results.length} passed, ${failed} failed (${totalMs}ms total)`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  • ${r.test}: ${r.detail}`)
    }
  }
  console.log()

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('E2E crashed:', err)
  process.exit(1)
})
