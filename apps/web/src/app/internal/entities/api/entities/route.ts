import { NextRequest } from 'next/server'
import { proxyInternalApi } from '../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return proxyInternalApi(`/internal/entities${request.nextUrl.search}`)
}
