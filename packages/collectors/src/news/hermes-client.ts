import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import type {
  HermesWorkerClientOptions,
  HermesWorkerRequest,
  HermesWorkerResult,
  HermesWorkerStatus,
} from './types'

const DEFAULT_HERMES_COMMAND = 'hermes'
const DEFAULT_HERMES_PROFILE = 'myboonfeed'
const DEFAULT_HERMES_TOOLSETS = ['browser', 'web']

type SpawnHermesProcess = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess

export interface HermesWorkerClientConstructorOptions extends Partial<HermesWorkerClientOptions> {
  spawnProcess?: SpawnHermesProcess
}

export class HermesWorkerClient {
  private readonly command: string
  private readonly profile?: string
  private readonly toolsets: string[]
  private readonly spawnProcess: SpawnHermesProcess

  constructor(options: HermesWorkerClientConstructorOptions = {}) {
    this.command = options.command ?? DEFAULT_HERMES_COMMAND
    this.profile = options.profile ?? DEFAULT_HERMES_PROFILE
    this.toolsets = options.toolsets ?? DEFAULT_HERMES_TOOLSETS
    this.spawnProcess = options.spawnProcess ?? spawn
  }

  run(request: HermesWorkerRequest): Promise<HermesWorkerResult> {
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
      throw new Error(`Hermes worker timeoutMs must be positive for job ${request.jobId}`)
    }

    const startedAtMs = Date.now()
    const startedAt = new Date(startedAtMs).toISOString()
    const child = this.spawnProcess(this.command, this.argsForPrompt(request.prompt), {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null
    let settled = false

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    return new Promise((resolve) => {
      const finish = (status: HermesWorkerStatus) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        const finishedAtMs = Date.now()
        resolve({
          jobId: request.jobId,
          taskType: request.taskType,
          status,
          stdout,
          stderr,
          exitCode,
          startedAt,
          finishedAt: new Date(finishedAtMs).toISOString(),
          durationMs: finishedAtMs - startedAtMs,
        })
      }

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        exitCode = null
        finish('timed_out')
      }, request.timeoutMs)

      child.once('error', (error) => {
        stderr += stderr ? `\n${error.message}` : error.message
        exitCode = null
        finish('failed')
      })

      child.once('close', (code) => {
        exitCode = typeof code === 'number' ? code : null
        finish(exitCode === 0 ? 'succeeded' : 'failed')
      })
    })
  }

  private argsForPrompt(prompt: string): string[] {
    const args = ['chat']
    if (this.profile) args.push('--profile', this.profile)
    if (this.toolsets.length > 0) args.push('--toolsets', this.toolsets.join(','))
    args.push('--quiet', '--query', prompt)
    return args
  }
}
