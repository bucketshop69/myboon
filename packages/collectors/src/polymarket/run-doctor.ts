import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env' })
loadEnv({ path: '../../.env' })
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { fetchPolymarketNativeContext } from './market-context'

const execFileAsync = promisify(execFile)

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

function envString(name: string, fallback = ''): string {
  const value = process.env[name]?.trim()
  return value || fallback
}

function requiredEnv(name: string): CheckResult {
  return {
    name: `env:${name}`,
    ok: Boolean(process.env[name]?.trim()),
    detail: process.env[name]?.trim() ? 'present' : 'missing',
  }
}

async function checkCommand(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string, stderr: string }> {
  return execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 5 * 1024 * 1024,
    env: { ...process.env },
  })
}

async function runCheck(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await fn() }
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main(): Promise<void> {
  const hermesCommand = 'hermes'
  const hermesTimeoutMs = 60_000
  const last30DaysPython = 'python3.12'
  const last30DaysScript = `${process.env.HOME ?? ''}/.codex/skills/last30days/scripts/last30days.py`
  const slug = envString('POLYMARKET_DOCTOR_SLUG', 'will-the-fed-increase-interest-rates-by-25-bps-after-the-july-2026-meeting')

  const results: CheckResult[] = [
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  ]

  results.push(await runCheck('supabase:polymarket_market_candidates:read', async () => {
    const db = createClient(envString('SUPABASE_URL'), envString('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await db
      .from('polymarket_market_candidates')
      .select('id')
      .limit(1)
    if (error) throw new Error(error.message)
    return 'read ok'
  }))

  results.push(await runCheck('supabase:polymarket_market_candidate_research:read', async () => {
    const db = createClient(envString('SUPABASE_URL'), envString('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await db
      .from('polymarket_market_candidate_research')
      .select('id')
      .limit(1)
    if (error) throw new Error(error.message)
    return 'read ok'
  }))

  results.push(await runCheck('polymarket:gamma_api', async () => {
    const context = await fetchPolymarketNativeContext(slug)
    return `fetched ${context.market.slug}`
  }))

  results.push(await runCheck('hermes:version', async () => {
    const { stdout } = await checkCommand(hermesCommand, ['--version'], 15_000)
    return stdout.trim() || 'available'
  }))

  results.push(await runCheck('hermes:planner_json', async () => {
    const args = ['--ignore-rules']
    args.push('-z', 'Return strict JSON only: {"ok": true}')

    const { stdout } = await checkCommand(
      hermesCommand,
      args,
      hermesTimeoutMs
    )
    const parsed = JSON.parse(stdout.trim()) as { ok?: unknown }
    if (parsed.ok !== true) throw new Error(`unexpected output: ${stdout.slice(0, 500)}`)
    return 'strict JSON ok'
  }))

  results.push(await runCheck('last30days:python', async () => {
    const { stdout } = await checkCommand(last30DaysPython, ['--version'], 15_000)
    return stdout.trim() || 'python available'
  }))

  results.push(await runCheck('last30days:script_exists', async () => {
    await access(last30DaysScript)
    return last30DaysScript
  }))

  results.push(await runCheck('last30days:help', async () => {
    await checkCommand(last30DaysPython, [last30DaysScript, '--help'], 30_000)
    return 'help ok'
  }))

  const ok = results.every((result) => result.ok)
  console.log(JSON.stringify({
    ok,
    mode: 'polymarket_collector_researcher_doctor',
    checks: results,
  }, null, 2))

  if (!ok) process.exit(1)
}

main().catch((error) => {
  console.error('[polymarket-doctor] fatal:', error)
  process.exit(1)
})
