import { NextRequest } from 'next/server'
import { proxyInternalApi } from '../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return proxyInternalApi(`/internal/entities/${encodeURIComponent(id)}`)
}
