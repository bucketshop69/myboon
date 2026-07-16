import { proxyInternalApi } from '../../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CollectionRouteContext {
  params: Promise<{ collectionKey: string }>
}

export async function GET(_request: Request, context: CollectionRouteContext) {
  const { collectionKey } = await context.params
  return proxyInternalApi(
    `/internal/polymarket/collections/${encodeURIComponent(collectionKey)}`,
    {
      configurationMessage: 'Internal Polymarket catalog is unavailable',
      notFoundMessage: 'Polymarket collection not found',
      unavailableMessage: 'Internal Polymarket catalog service is unavailable',
    },
  )
}
