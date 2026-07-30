import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS, handleWriteFile, handleReadFile } from '../tools'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是考点分析专家。依据真题 LaTeX 文件逐题判定考点、题型、分值、难度、认知层次，产出双向细目表。

产物：
1. blueprint.jsonl — 每题一行 JSON（src, no, type, points, kp, difficulty, cognition, stem_kind）
2. blueprint.md — 人读细目表（考点×难度分值矩阵 + 考点清单 + 频次）

完成后调用 request_confirmation 等待教师审核。`

export async function runStep2(ctx: PipelineContext): Promise<StepResult> {
  return analyzeAndVerify(ctx, 'blueprint', SYSTEM)
}

async function analyzeAndVerify(
  ctx: PipelineContext,
  point: string,
  system: string,
): Promise<StepResult> {
  let confirmData: unknown = null

  // Round 1: Analysis
  await ctx.claudeClient.sendMessage({
    system,
    messages: [{
      role: 'user',
      content: '分析真题产物，产出分析结果。完成后调用 request_confirmation。',
    }],
    tools: COMMON_TOOLS,
    maxTokens: 16384,
    onToolUse: async (name, rawInput) => {
      const input = rawInput as Record<string, unknown>

      if (name === 'request_confirmation') {
        confirmData = input.data
        ctx.sendWs({ type: 'log', message: `⏸ 请求确认: ${input.summary}` })
        return 'CONFIRM_REQUESTED'
      }
      if (name === 'write_file') {
        return await handleWriteFile(ctx.buildDir, input.path as string, input.content as string)
      }
      if (name === 'read_file') {
        return await handleReadFile(ctx.buildDir, input.path as string)
      }
      if (name === 'execute_bash') {
        try {
          const output = execSync(input.command as string, {
            cwd: ctx.buildDir, timeout: 30000, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe',
          })
          return output.toString()
        } catch (e: any) {
          return `Error: ${e.message}\n${e.stderr?.toString() || ''}`
        }
      }
      return 'OK'
    },
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  return {
    success: true,
    artifacts: [
      { name: `${point}.md`, path: path.join(ctx.buildDir, `${point}.md`) },
      { name: `${point}.jsonl`, path: path.join(ctx.buildDir, `${point}.jsonl`) },
    ],
    confirmData,
  }
}
