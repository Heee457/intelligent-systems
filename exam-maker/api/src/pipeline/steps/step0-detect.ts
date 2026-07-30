import type { PipelineContext, StepResult } from '../../shared/types'
import { execSync } from 'child_process'

export async function runStep0(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '🔍 探测环境...' })

  // Run detection locally (doesn't need Claude)
  const checks: string[] = []
  const tools = ['pandoc --version', 'python -c "import sympy"', 'xelatex --version']

  for (const cmd of tools) {
    try {
      execSync(cmd, { cwd: ctx.buildDir, timeout: 5000, stdio: 'pipe' })
      checks.push(`${cmd.split(' ')[0]} ✓`)
    } catch {
      checks.push(`${cmd.split(' ')[0]} ✗ (降级)`)
    }
  }

  const report = `环境探测结果:\n${checks.map((c) => `  · ${c}`).join('\n')}`

  await ctx.claudeClient.sendMessage({
    system: '记录环境探测结果，评估降级影响。',
    messages: [{ role: 'user', content: report }],
    tools: [],
    onToolUse: async () => '',
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  return { success: true, artifacts: [] }
}
