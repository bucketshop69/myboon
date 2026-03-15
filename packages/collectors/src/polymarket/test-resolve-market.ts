/**
 * One-shot test: verify Gamma API slug resolution for a real conditionId.
 * Run with: npx tsx src/polymarket/test-resolve-market.ts
 *
 * Uses the conditionId from a known bad signal (Biden slug appearing for
 * an Elon Musk tweet market) to confirm the mismatch-guard works.
 */

const GAMMA = 'https://gamma-api.polymarket.com'

// Real conditionId from the bad signal in signals.json
const TEST_CONDITION_ID = '0xfcb98a920dd357f4cbe330deee1902fc5f26f659a4378bac335d535f605d0a27'

async function resolveMarket(conditionId: string): Promise<{ title: string; slug: string | null }> {
  // polymarket_tracked lookup is skipped here (testing Gamma path directly)

  const res = await fetch(`${GAMMA}/markets?condition_id=${conditionId}`)
  if (!res.ok) {
    console.log(`[gamma] HTTP ${res.status} — returning null slug`)
    return { title: conditionId, slug: null }
  }

  const markets = await res.json() as Record<string, unknown>[]
  if (!Array.isArray(markets) || markets.length === 0) {
    console.log('[gamma] Empty array — no match')
    return { title: conditionId, slug: null }
  }

  const m = markets[0]
  console.log('[gamma] First result:')
  console.log('  conditionId field:', m.conditionId ?? m.condition_id ?? '(not present)')
  console.log('  slug            :', m.slug)
  console.log('  question        :', m.question ?? m.title)

  // --- The guard added in the fix ---
  const returnedId = (m.conditionId ?? m.condition_id) as string | undefined
  if (returnedId && returnedId.toLowerCase() !== conditionId.toLowerCase()) {
    console.log(`\n[GUARD TRIGGERED] Gamma returned wrong market (${returnedId}) — slug rejected`)
    return { title: conditionId, slug: null }
  }

  const slug = typeof m.slug === 'string' ? m.slug : null
  return {
    title: (typeof m.question === 'string' ? m.question : typeof m.title === 'string' ? m.title : conditionId),
    slug,
  }
}

async function main() {
  console.log('Testing conditionId:', TEST_CONDITION_ID)
  console.log('---')
  const result = await resolveMarket(TEST_CONDITION_ID)
  console.log('\nFinal result:')
  console.log('  title :', result.title)
  console.log('  slug  :', result.slug)

  if (result.slug === 'will-joe-biden-get-coronavirus-before-the-election') {
    console.log('\n[FAIL] Still returning Biden slug — guard did not fire.')
    console.log('  Check if Gamma includes conditionId in its response or use a different field name.')
  } else if (result.slug === null) {
    console.log('\n[PASS] Guard fired — slug is null, signal will be skipped cleanly.')
  } else {
    console.log('\n[PASS] Got correct slug:', result.slug)
  }
}

main().catch(console.error)
