import { NextRequest } from 'next/server'
import { DELETE as deleteInternalSession, POST as createInternalSession } from '../../session/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return createInternalSession(request)
}

export async function DELETE(request: NextRequest) {
  return deleteInternalSession(request)
}
