import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env' })
loadEnv({ path: '../../.env' })
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { HermesEditorDraftProvider } from './hermes-editor'
import { editorDraftCliConfig, runEditorDraft } from './runner'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function runOnce(): Promise<void> {
  const config = editorDraftCliConfig()
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
  const result = await runEditorDraft(supabase, {
    batchSize: config.batchSize,
    recentMemoryLimit: config.recentMemoryLimit,
    laneMemoryLimit: config.laneMemoryLimit,
    priorDraftLimit: config.priorDraftLimit,
    publishedHistoryLimit: config.publishedHistoryLimit,
    provider: new HermesEditorDraftProvider({ timeoutMs: config.hermesTimeoutMs }),
  })
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  const config = editorDraftCliConfig()
  await runOnce()

  if (config.runOnce) return

  setInterval(() => {
    runOnce().catch((err) => {
      console.error('[editor-draft] run failed:', err)
    })
  }, config.intervalMs)
}

main().catch((err) => {
  console.error('[editor-draft] fatal:', err)
  process.exit(1)
})
