import { NextRequest } from 'next/server'
import {
  expectedInternalPolymarketCatalogWriteToken,
  proxyInternalWriteApi,
} from '../../../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CollectionDraftRouteContext {
  params: Promise<{ collectionKey: string }>
}

export async function POST(request: NextRequest, context: CollectionDraftRouteContext) {
  const { collectionKey } = await context.params
  return proxyInternalWriteApi(
    request,
    `/internal/polymarket/collections/${encodeURIComponent(collectionKey)}/draft`,
    {
      writeToken: expectedInternalPolymarketCatalogWriteToken(),
      unavailableMessage: 'Internal Polymarket catalog write service is unavailable',
      passthroughStatuses: [400, 404, 409, 422],
    },
  )
}
