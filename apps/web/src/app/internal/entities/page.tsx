import type { Metadata } from 'next'
import { EntityMemoryBrowser } from './EntityMemoryBrowser'
import { LoginPanel } from './LoginPanel'
import { getInternalSession, hasValidInternalSession, isInternalDashboardConfigured } from './_lib/server'

export const metadata: Metadata = {
  title: 'Entity Memory | myboon Internal',
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InternalEntitiesPage() {
  const session = await getInternalSession()
  const isConfigured = isInternalDashboardConfigured()
  const isAuthorized = hasValidInternalSession(session)

  if (!isAuthorized) {
    return <LoginPanel isConfigured={isConfigured} />
  }

  return <EntityMemoryBrowser />
}
