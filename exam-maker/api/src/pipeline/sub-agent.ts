import { execSync } from 'child_process'
import type { ClaudeClient, ClaudeTool } from '../shared/types'

interface SubAgentOpts {
  label: string
  system: string
  prompt: string
  tools: ClaudeTool[]
  client: ClaudeClient
  onLog: (msg: string) => void
  maxRetries?: number
}

export async function runSubAgent(opts: SubAgentOpts): Promise<string> {
  const { label, system, prompt, tools, client, onLog, maxRetries = 2 } = opts

  onLog(`子代理启动: ${label}`)

  let lastError = ''
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.sendMessage({
        system,
        messages: [{ role: 'user', content: prompt }],
        tools,
        maxTokens: 16384,
        onToolUse: async (name, input) => {
          if (name === 'execute_bash') {
            const cmd = (input as { command?: string }).command ?? ''
            try {
              return execSync(cmd, {
                timeout: 30000,
                maxBuffer: 5 * 1024 * 1024,
                stdio: 'pipe',
              }).toString()
            } catch (e: any) {
              return `ERROR: ${e.stderr?.toString() || e.message}`
            }
          }
          return `Tool ${name}: OK`
        },
        onText: (text) => onLog(text),
      })
      onLog(`子代理完成: ${label}`)
      return result
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      onLog(`子代理失败 (${attempt + 1}/${maxRetries + 1}): ${lastError}`)
    }
  }

  throw new Error(`子代理 ${label} 失败: ${lastError}`)
}

interface AnalyzeAndVerifyOpts {
  label: string
  analyzerSystem: string
  verifierSystem: string
  taskPrompt: string
  analyzerTools: ClaudeTool[]
  verifierTools: ClaudeTool[]
  client: ClaudeClient
  onLog: (msg: string) => void
  maxRounds?: number
}

export async function analyzeAndVerify(opts: AnalyzeAndVerifyOpts): Promise<string> {
  const {
    label,
    analyzerSystem,
    verifierSystem,
    taskPrompt,
    analyzerTools,
    verifierTools,
    client,
    onLog,
    maxRounds = 3,
  } = opts

  for (let round = 0; round < maxRounds; round++) {
    // Analysis round
    onLog(`分析轮 ${round + 1}: ${label}`)
    const analysis = await runSubAgent({
      label: `${label}-分析`,
      system: analyzerSystem,
      prompt: taskPrompt,
      tools: analyzerTools,
      client,
      onLog,
    })

    // Verification round
    onLog(`核验轮 ${round + 1}: ${label}`)
    const verification = await runSubAgent({
      label: `${label}-核对`,
      system: verifierSystem,
      prompt: `这是分析产物，请独立核对:\n\n${analysis}`,
      tools: verifierTools,
      client,
      onLog,
    })

    if (verification.includes('PASS') && !verification.includes('FAIL')) {
      onLog(`分析+核对通过: ${label}`)
      return analysis
    }

    onLog(`核验未通过，重新分析 (${round + 1}/${maxRounds})`)
  }

  throw new Error(`${label} 分析+核对: 达到最大轮次 ${maxRounds}`)
}
