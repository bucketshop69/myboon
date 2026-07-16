import { NextRequest } from 'next/server'
import {
  clearInternalSession,
  hasValidDashboardToken,
  internalJson,
  isInternalDashboardConfigured,
  requestClientKey,
  requestHasTrustedOrigin,
  setInternalSession,
} from '../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const failedLoginAttempts = new Map<string, number[]>()

export async function POST(request: NextRequest) {
  if (!requestHasTrustedOrigin(request)) {
    return internalJson({ error: 'Invalid request origin' }, 403)
  }
  if (!isInternalDashboardConfigured()) return internalJson({ error: 'Internal dashboard is unavailable' }, 503)

  const clientKey = requestClientKey(request)
  const retryAfter = retryAfterSeconds(clientKey)
  if (retryAfter > 0) {
    return internalJson({ error: 'Too many attempts. Try again later.' }, 429)
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return internalJson({ error: 'Request payload is too large' }, 413)
  }

  const body = await request.json().catch(() => ({})) as { token?: unknown }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!hasValidDashboardToken(token)) {
    recordFailedAttempt(clientKey)
    return internalJson({ error: 'Invalid internal token' }, 401)
  }

  failedLoginAttempts.delete(clientKey)
  await setInternalSession()
  return internalJson({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!requestHasTrustedOrigin(request)) return internalJson({ error: 'Invalid request origin' }, 403)
  await clearInternalSession()
  return internalJson({ ok: true })
}

function retryAfterSeconds(clientKey: string): number {
  const now = Date.now()
  const attempts = (failedLoginAttempts.get(clientKey) ?? []).filter((attempt) => now - attempt < LOGIN_WINDOW_MS)
  if (attempts.length === 0) {
    failedLoginAttempts.delete(clientKey)
    return 0
  }
  failedLoginAttempts.set(clientKey, attempts)
  if (attempts.length < LOGIN_MAX_ATTEMPTS) return 0
  return Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - attempts[0])) / 1000))
}

function recordFailedAttempt(clientKey: string): void {
  const now = Date.now()
  const attempts = (failedLoginAttempts.get(clientKey) ?? []).filter((attempt) => now - attempt < LOGIN_WINDOW_MS)
  attempts.push(now)
  failedLoginAttempts.set(clientKey, attempts)
}
