// Default points at the local API dev server. Callers (mobile client, etc.)
// should override `apiBaseUrl` with their resolved backend base URL — this
// client only ever talks to myboon's own backend proxy, never Helius
// directly, since the Helius key is metered/paid and must stay server-side.
export const SPOT_API_BASE_URL = 'http://localhost:3000'

export const SPOT_CACHE_POLICY = {
  balances: { freshMs: 15_000, staleMs: 2 * 60_000 },
} as const
