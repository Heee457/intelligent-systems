import type { FullConfig } from '@playwright/test'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import path from 'path'

const apiHealthUrl = 'http://127.0.0.1:3001/api/health'
const webUrl = 'http://127.0.0.1:5173'
const e2eDataRoot = path.join(process.cwd(), '.e2e-data')
const reuseServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1'

type ManagedProcess = {
  name: string
  child: ChildProcessWithoutNullStreams
  logs: string[]
}

async function globalSetup(_config: FullConfig) {
  const processes: ManagedProcess[] = []

  if (!reuseServer) {
    fs.rmSync(e2eDataRoot, { recursive: true, force: true })

    processes.push(startProcess('api', ['--workspace', 'api', 'run', 'dev'], {
      EXAM_DATA_ROOT: e2eDataRoot,
      JWT_SECRET: 'e2e-secret',
    }))
    processes.push(startProcess('web', [
      '--workspace',
      'web',
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0',
      '--port',
      '5173',
    ]))
  }

  try {
    await waitForUrl(apiHealthUrl, processes)
    await waitForUrl(webUrl, processes)
  } catch (error) {
    await stopProcesses(processes)
    throw error
  }

  return async () => {
    await stopProcesses(processes)
  }
}

function startProcess(name: string, args: string[], env: Record<string, string> = {}): ManagedProcess {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const managed = { name, child, logs: [] }

  child.stdout.on('data', (chunk) => appendLog(managed, chunk))
  child.stderr.on('data', (chunk) => appendLog(managed, chunk))

  return managed
}

function appendLog(processInfo: ManagedProcess, chunk: Buffer) {
  processInfo.logs.push(chunk.toString())
  if (processInfo.logs.length > 80) processInfo.logs.shift()
}

async function waitForUrl(url: string, processes: ManagedProcess[], timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''

  while (Date.now() < deadline) {
    for (const processInfo of processes) {
      if (processInfo.child.exitCode !== null) {
        throw new Error(`${processInfo.name} exited early with code ${processInfo.child.exitCode}.\n${formatLogs(processes)}`)
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2_000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}.\n${formatLogs(processes)}`)
}

async function stopProcesses(processes: ManagedProcess[]) {
  for (const processInfo of processes.reverse()) {
    const pid = processInfo.child.pid
    if (!pid || processInfo.child.exitCode !== null) continue

    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        processInfo.child.kill('SIGTERM')
      } catch {
        // The process may already have exited.
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
}

function formatLogs(processes: ManagedProcess[]) {
  return processes
    .map((processInfo) => `[${processInfo.name}]\n${processInfo.logs.join('').trim()}`)
    .join('\n\n')
}

export default globalSetup
