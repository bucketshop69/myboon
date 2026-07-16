import assert from 'node:assert/strict'
import test from 'node:test'

test('routes catalog writes to their dedicated credential before broad internal read auth', async () => {
  // createApp composes the CLOB router, whose production session cleanup owns a
  // long-lived interval. Suppress only that import-time test handle.
  const originalSetInterval = globalThis.setInterval
  globalThis.setInterval = (() => 0) as unknown as typeof globalThis.setInterval
  const { createApp } = await import('../bootstrap/create-app.js')
  globalThis.setInterval = originalSetInterval

  const readToken = 'r'.repeat(48)
  const catalogWriteToken = 'w'.repeat(48)
  const app = createApp({
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-key',
    internalDashboardToken: readToken,
    internalEntityWriteToken: 'e'.repeat(48),
    internalPolymarketCatalogWriteToken: catalogWriteToken,
    port: 3000,
    host: '127.0.0.1',
    aiExplanationProvider: 'test',
    aiExplanationBaseUrl: 'https://example.com',
    aiExplanationModel: 'test',
  })

  const response = await app.request('/internal/polymarket/collections/featured/draft', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${catalogWriteToken}`,
      'Content-Type': 'application/json',
    },
    // Deliberately invalid after authentication: reaching catalog validation
    // proves the broad entity read-token middleware did not intercept the POST.
    body: JSON.stringify({ expectedRevision: null }),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: 'items must be an array.',
    code: 'catalog_validation_error',
  })
})
