import { NextRequest } from 'next/server'
import { proxyInternalWriteApi } from '../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return proxyInternalWriteApi(request, '/internal/entity-commands/preview')
}
