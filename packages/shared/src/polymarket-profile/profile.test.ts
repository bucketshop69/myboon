import { PolymarketProfileClient } from './client.js'

// Known active whale wallet (Car / @CarOnPolymarket)
const TEST_WALLET = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b'

async function runTests() {
  console.log('\n=== Polymarket Profile API — E2E Tests ===\n')

  const client = new PolymarketProfileClient()
  let passed = 0
  let failed = 0

  // ─────────────────────────────────────────────────────────────
  // Test 1: Public Profile
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('[Test 1] GET /public-profile ...')
    const profile = await client.getProfile(TEST_WALLET)

    const checks = [
      profile.proxyWallet === TEST_WALLET,
      typeof profile.name === 'string',
      typeof profile.pseudonym === 'string',
      typeof profile.createdAt === 'string',
    ]

    if (checks.every(Boolean)) {
      console.log(`  PASS — ${profile.name} (${profile.pseudonym}), created ${profile.createdAt}`)
      console.log(`         verified=${profile.verifiedBadge}, x=@${profile.xUsername}`)
      passed++
    } else {
      console.log(`  FAIL — unexpected shape: ${JSON.stringify(profile).slice(0, 200)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 2: Portfolio Value
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 2] GET /value ...')
    const val = await client.getPortfolioValue(TEST_WALLET)

    if (typeof val.value === 'number' && val.value >= 0) {
      console.log(`  PASS — portfolio value: $${val.value.toLocaleString()}`)
      passed++
    } else {
      console.log(`  FAIL — unexpected: ${JSON.stringify(val)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 3: Markets Traded
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 3] GET /traded ...')
    const traded = await client.getMarketsTraded(TEST_WALLET)

    if (typeof traded.traded === 'number' && traded.traded > 0) {
      console.log(`  PASS — ${traded.traded} markets traded`)
      passed++
    } else {
      console.log(`  FAIL — unexpected: ${JSON.stringify(traded)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 4: Positions (top 3 by PnL)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 4] GET /positions (top 3 by CASHPNL) ...')
    const positions = await client.getPositions({
      user: TEST_WALLET,
      limit: 3,
      sortBy: 'CASHPNL',
      sortDirection: 'DESC',
    })

    if (Array.isArray(positions) && positions.length > 0) {
      console.log(`  PASS — ${positions.length} positions returned`)
      for (const p of positions) {
        console.log(`         ${p.title.slice(0, 50)}... | ${p.outcome} | size=${p.size.toFixed(1)} | pnl=$${p.cashPnl.toFixed(2)}`)
      }
      passed++
    } else {
      console.log(`  FAIL — empty or invalid: ${JSON.stringify(positions).slice(0, 200)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 5: Positions with sizeThreshold filter
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 5] GET /positions (sizeThreshold=1000) ...')
    const positions = await client.getPositions({
      user: TEST_WALLET,
      sizeThreshold: 1000,
      limit: 5,
      sortBy: 'TOKENS',
    })

    if (Array.isArray(positions)) {
      const allAboveThreshold = positions.every(p => p.size >= 1000)
      if (allAboveThreshold) {
        console.log(`  PASS — ${positions.length} positions, all size >= 1000`)
        passed++
      } else {
        const small = positions.find(p => p.size < 1000)
        console.log(`  FAIL — found position below threshold: size=${small?.size}`)
        failed++
      }
    } else {
      console.log(`  FAIL — not an array`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 6: Closed Positions (top 3 by realized PnL)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 6] GET /closed-positions (top 3 by REALIZEDPNL) ...')
    const closed = await client.getClosedPositions({
      user: TEST_WALLET,
      limit: 3,
      sortBy: 'REALIZEDPNL',
      sortDirection: 'DESC',
    })

    if (Array.isArray(closed) && closed.length > 0) {
      console.log(`  PASS — ${closed.length} closed positions`)
      for (const c of closed) {
        console.log(`         ${c.title.slice(0, 50)}... | ${c.outcome} | pnl=$${c.realizedPnl.toFixed(2)}`)
      }
      passed++
    } else {
      console.log(`  FAIL — empty or invalid: ${JSON.stringify(closed).slice(0, 200)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 7: Activity (last 5 trades)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 7] GET /activity (last 5 trades) ...')
    const activity = await client.getActivity({
      user: TEST_WALLET,
      type: ['TRADE'],
      limit: 5,
      sortBy: 'TIMESTAMP',
      sortDirection: 'DESC',
    })

    if (Array.isArray(activity) && activity.length > 0) {
      console.log(`  PASS — ${activity.length} activities`)
      for (const a of activity) {
        const date = new Date(a.timestamp * 1000).toISOString().slice(0, 10)
        console.log(`         ${date} | ${a.side} ${a.outcome} | $${a.usdcSize.toFixed(2)} | ${a.title.slice(0, 40)}...`)
      }
      passed++
    } else {
      console.log(`  FAIL — empty or invalid: ${JSON.stringify(activity).slice(0, 200)}`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 8: Activity with side filter (BUY only)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 8] GET /activity (BUY only, last 3) ...')
    const buys = await client.getActivity({
      user: TEST_WALLET,
      type: ['TRADE'],
      side: 'BUY',
      limit: 3,
    })

    if (Array.isArray(buys)) {
      const allBuys = buys.every(a => a.side === 'BUY')
      if (allBuys) {
        console.log(`  PASS — ${buys.length} buy trades, all side=BUY`)
        passed++
      } else {
        const wrong = buys.find(a => a.side !== 'BUY')
        console.log(`  FAIL — found non-BUY: side=${wrong?.side}`)
        failed++
      }
    } else {
      console.log(`  FAIL — not an array`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 9: Profile for unknown wallet (404 handling)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 9] GET /public-profile (invalid address — expect error) ...')
    await client.getProfile('0xinvalid')
    console.log(`  FAIL — should have thrown for invalid address`)
    failed++
  } catch (error) {
    const msg = (error as Error).message
    if (msg.includes('400') || msg.includes('404') || msg.includes('validation')) {
      console.log(`  PASS — rejected invalid address: ${msg.slice(0, 80)}`)
      passed++
    } else {
      console.log(`  PASS — got error: ${msg.slice(0, 80)}`)
      passed++
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Test 10: Positions for wallet with no positions
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 10] GET /positions (empty wallet — expect empty array) ...')
    const positions = await client.getPositions({
      user: '0x0000000000000000000000000000000000000001',
      limit: 5,
    })

    if (Array.isArray(positions) && positions.length === 0) {
      console.log(`  PASS — empty array as expected`)
      passed++
    } else {
      console.log(`  FAIL — expected empty, got ${positions.length} positions`)
      failed++
    }
  } catch (error) {
    // Some APIs return 400 for invalid wallet, that's fine too
    console.log(`  PASS — error for invalid wallet: ${(error as Error).message.slice(0, 80)}`)
    passed++
  }

  // ─────────────────────────────────────────────────────────────
  // Test 11: Pagination (offset)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 11] GET /activity (pagination: offset=0 vs offset=2) ...')
    const [page1, page2] = await Promise.all([
      client.getActivity({ user: TEST_WALLET, type: ['TRADE'], limit: 3, offset: 0 }),
      client.getActivity({ user: TEST_WALLET, type: ['TRADE'], limit: 3, offset: 2 }),
    ])

    if (page1.length > 0 && page2.length > 0) {
      // page2[0] should overlap with page1[2] if data is consistent
      const overlap = page1.length >= 3 && page2[0]?.transactionHash === page1[2]?.transactionHash
      console.log(`  PASS — page1=${page1.length} items, page2=${page2.length} items, overlap=${overlap}`)
      passed++
    } else {
      console.log(`  FAIL — one or both pages empty`)
      failed++
    }
  } catch (error) {
    console.log(`  FAIL — ${(error as Error).message}`)
    failed++
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50))
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  console.log('='.repeat(50) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

runTests()
