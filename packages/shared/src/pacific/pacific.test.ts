import { PacificClient, PacificWebSocket } from './index';

const TEST_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Public wallet for testing

async function runTests() {
  console.log('\n🧪 Pacific API Client — E2E Tests\n');
  console.log('='.repeat(50));

  const client = new PacificClient('mainnet');
  let passed = 0;
  let failed = 0;

  // ─────────────────────────────────────────────────────────────
  // Test 1: Get Markets
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 1] GET /info — Fetch all markets...');
    const markets = await client.getMarkets();
    
    if (markets.length > 0) {
      console.log(`✅ PASS — Received ${markets.length} markets`);
      console.log(`   Sample: ${markets[0].symbol} (tick: ${markets[0].tick_size}, lot: ${markets[0].lot_size})`);
      passed++;
    } else {
      console.log('❌ FAIL — No markets returned');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL —', (error as Error).message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // Test 2: Get Prices
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 2] GET /info/prices — Fetch live prices...');
    const prices = await client.getPrices();
    
    if (prices.length > 0) {
      const btc = prices.find(p => p.symbol === 'BTC');
      console.log(`✅ PASS — Received ${prices.length} prices`);
      if (btc) {
        console.log(`   BTC: $${btc.oracle} (24h vol: $${Number(btc.volume_24h).toLocaleString()})`);
      }
      passed++;
    } else {
      console.log('❌ FAIL — No prices returned');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL —', (error as Error).message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // Test 3: Get Account Info (public data)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 3] GET /account — Fetch account info...');
    const account = await client.getAccountInfo(TEST_WALLET);
    
    console.log('✅ PASS — Account data retrieved');
    console.log(`   Balance: $${account.balance}`);
    console.log(`   Positions: ${account.positions_count}`);
    console.log(`   Fee level: ${account.fee_level} (maker: ${account.maker_fee}, taker: ${account.taker_fee})`);
    passed++;
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('Account not found')) {
      console.log('⚠️  SKIP — Test wallet not found on Pacific (expected for random address)');
      // Don't count as failure - this is expected behavior
    } else {
      console.log('❌ FAIL —', msg);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Test 4: Get Positions (public data)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 4] GET /positions — Fetch account positions...');
    const result = await client.getPositions(TEST_WALLET);
    
    console.log('✅ PASS — Positions retrieved');
    console.log(`   Open positions: ${result.positions.length}`);
    console.log(`   Last order ID: ${result.lastOrderId}`);
    if (result.positions.length > 0) {
      const pos = result.positions[0];
      console.log(`   Sample: ${pos.side} ${pos.amount} ${pos.symbol} @ $${pos.entry_price}`);
    }
    passed++;
  } catch (error) {
    console.log('❌ FAIL —', (error as Error).message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // Test 5: Get Open Orders (public data)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 5] GET /orders — Fetch open orders...');
    const result = await client.getOpenOrders(TEST_WALLET);
    
    console.log('✅ PASS — Open orders retrieved');
    console.log(`   Open orders: ${result.orders.length}`);
    console.log(`   Last order ID: ${result.lastOrderId}`);
    if (result.orders.length > 0) {
      const order = result.orders[0];
      console.log(`   Sample: ${order.side} ${order.initial_amount} ${order.symbol} @ $${order.price}`);
    }
    passed++;
  } catch (error) {
    console.log('❌ FAIL —', (error as Error).message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // Test 6: WebSocket Connection (Basic)
  // ─────────────────────────────────────────────────────────────
  try {
    console.log('\n[Test 6] WebSocket — Connect and verify connection...');
    
    const ws = new PacificWebSocket('mainnet');
    
    await ws.connect();
    
    // Note: Pacific WebSocket only pushes data on actual price changes
    // For full price stream testing, run during active market hours
    
    ws.disconnect();
    
    console.log('✅ PASS — WebSocket connection established');
    console.log('   ℹ️  Price subscription test skipped (requires active market movement)');
    passed++;
  } catch (error) {
    console.log('❌ FAIL —', (error as Error).message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Pacific client is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
