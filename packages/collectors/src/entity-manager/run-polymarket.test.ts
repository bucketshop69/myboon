import assert from 'node:assert/strict'
import test from 'node:test'
import { polymarketEntityManagerCliConfig } from './run-polymarket'

test('polymarketEntityManagerCliConfig reads batch, interval, and run-once env', () => {
  const config = polymarketEntityManagerCliConfig({
    ENTITY_MANAGER_POLYMARKET_BATCH_SIZE: '7',
    ENTITY_MANAGER_POLYMARKET_INTERVAL_MS: '30000',
    ENTITY_MANAGER_POLYMARKET_RUN_ONCE: '1',
    ENTITY_MANAGER_HERMES_TIMEOUT_MS: '180000',
  })

  assert.equal(config.batchSize, 7)
  assert.equal(config.intervalMs, 30_000)
  assert.equal(config.runOnce, true)
  assert.equal(config.hermesTimeoutMs, 180_000)
})

test('polymarketEntityManagerCliConfig falls back on invalid numeric env', () => {
  const config = polymarketEntityManagerCliConfig({
    ENTITY_MANAGER_POLYMARKET_BATCH_SIZE: '0',
    ENTITY_MANAGER_POLYMARKET_INTERVAL_MS: 'abc',
  })

  assert.equal(config.batchSize, 20)
  assert.equal(config.intervalMs, 300_000)
  assert.equal(config.runOnce, false)
  assert.equal(config.hermesTimeoutMs, 60_000)
})
