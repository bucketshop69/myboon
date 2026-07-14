import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const INTERNAL_ENTITY_SESSION_COOKIE = 'myboon_internal_entity_session'

const MIN_SECRET_BYTES = 32
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 4
const MAX_WRITE_BODY_BYTES = 256 * 1024
const INTERNAL_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

export async function getInternalSession(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.get(INTERNAL_ENTITY_SESSION_COOKIE)?.value ?? ''
}

export function expectedInternalToken(): string {
  return process.env.INTERNAL_DASHBOARD_TOKEN ?? ''
}

export function expectedInternalWriteToken(): string {
  return process.env.INTERNAL_ENTITY_WRITE_TOKEN ?? ''
}

export function isInternalDashboardConfigured(): boolean {
  return isStrongSecret(expectedInternalToken())
    && isStrongSecret(process.env.INTERNAL_DASHBOARD_SESSION_SECRET ?? '')
}

export function hasValidDashboardToken(token: string): boolean {
  const expected = expectedInternalToken()
  return isInternalDashboardConfigured() && secureEqual(token, expected)
}

export function hasValidInternalSession(session: string): boolean {
  const signingKey = sessionSigningKey()
  if (!signingKey) return false

  const [version, expiresAt, nonce, signature] = session.split('.')
  if (version !== 'v1' || !/^\d{10}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{16,}$/.test(nonce)) return false
  if (!signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false

  const payload = `${version}.${expiresAt}.${nonce}`
  const expectedSignature = signSession(payload, signingKey)
  return secureEqual(signature, expectedSignature)
}

export async function setInternalSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(INTERNAL_ENTITY_SESSION_COOKIE, createInternalSession(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/internal/entities',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearInternalSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(INTERNAL_ENTITY_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/internal/entities',
    maxAge: 0,
  })
}

export function internalApiBaseUrl(): string {
  return (process.env.INTERNAL_API_BASE_URL ?? process.env.MYBOON_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
}

export function internalJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: INTERNAL_HEADERS })
}

export function requestHasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(request.url)
    const forwardedHost = request.headers.get('x-forwarded-host')
    const host = forwardedHost ?? request.headers.get('host') ?? requestUrl.host
    const isLocalhost = originUrl.hostname === 'localhost'
      || originUrl.hostname === '127.0.0.1'
      || originUrl.hostname === '::1'
    const hasTrustedProtocol = originUrl.protocol === 'https:' || (isLocalhost && originUrl.protocol === 'http:')
    return hasTrustedProtocol && originUrl.host === host
  } catch {
    return false
  }
}

export function requestClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const address = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return address.slice(0, 128)
}

export async function proxyInternalApi(path: string): Promise<NextResponse> {
  const session = await getInternalSession()
  if (!isInternalDashboardConfigured()) {
    return internalJson({ error: 'Internal browser is unavailable' }, 503)
  }
  if (!hasValidInternalSession(session)) {
    return internalJson({ error: 'Unauthorized' }, 401)
  }

  try {
    const upstream = await fetch(`${internalApiBaseUrl()}${path}`, {
      headers: {
        Authorization: `Bearer ${expectedInternalToken()}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstream.ok) {
      if (upstream.status === 404) return internalJson({ error: 'Entity not found' }, 404)
      return internalJson({ error: 'Internal data service is unavailable' }, 502)
    }

    return new NextResponse(await upstream.text(), {
      status: 200,
      headers: {
        ...INTERNAL_HEADERS,
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch {
    return internalJson({ error: 'Internal data service is unavailable' }, 502)
  }
}

export async function proxyInternalWriteApi(request: Request, path: string): Promise<NextResponse> {
  const session = await getInternalSession()
  if (!isInternalDashboardConfigured() || !isStrongSecret(expectedInternalWriteToken())) {
    return internalJson({ error: 'Internal Entity write service is unavailable' }, 503)
  }
  if (!hasValidInternalSession(session)) return internalJson({ error: 'Unauthorized' }, 401)
  if (!requestHasTrustedOrigin(request)) return internalJson({ error: 'Invalid request origin' }, 403)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_WRITE_BODY_BYTES) {
    return internalJson({ error: 'Request payload is too large' }, 413)
  }
  const body = await request.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_WRITE_BODY_BYTES) {
    return internalJson({ error: 'Request payload is too large' }, 413)
  }

  try {
    const upstream = await fetch(`${internalApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${expectedInternalWriteToken()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!upstream.ok && upstream.status !== 400 && upstream.status !== 409) {
      return internalJson({ error: 'Internal Entity write service is unavailable' }, 502)
    }
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...INTERNAL_HEADERS,
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch {
    return internalJson({ error: 'Internal Entity write service is unavailable' }, 502)
  }
}

function createInternalSession(): string {
  const signingKey = sessionSigningKey()
  if (!signingKey) throw new Error('Internal dashboard is not configured')

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const nonce = randomBytes(18).toString('base64url')
  const payload = `v1.${expiresAt}.${nonce}`
  return `${payload}.${signSession(payload, signingKey)}`
}

function sessionSigningKey(): Buffer | null {
  if (!isInternalDashboardConfigured()) return null
  return createHmac('sha256', process.env.INTERNAL_DASHBOARD_SESSION_SECRET!)
    .update(expectedInternalToken())
    .digest()
}

function signSession(payload: string, signingKey: Buffer): string {
  return createHmac('sha256', signingKey).update(payload).digest('base64url')
}

function isStrongSecret(value: string): boolean {
  return Buffer.byteLength(value, 'utf8') >= MIN_SECRET_BYTES
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
