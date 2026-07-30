import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS, handleWriteFile, handleReadFile } from '../tools'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是试卷模板提取专家。根据真题 LaTeX 和双向细目表，提取试卷模板结构。

产物：
1. template.json — 模板结构（题型、题数、每题分值、组卷规则、用时）
2. template.md — 人读模板说明（题型分布、分值统计、备注）

完成后调用 request_confirmation 等待教师审核。`

export async function runStep3(ctx: PipelineContext): Promise<StepResult> {
  return analyzeAndVerify(ctx, 'template', SYSTEM)
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
      content: '分析真题产物与双向细目表，提取试卷模板。完成后调用 request_confirmation。',
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
      { name: `${point}.json`, path: path.join(ctx.buildDir, `${point}.json`) },
      { name: `${point}.md`, path: path.join(ctx.buildDir, `${point}.md`) },
    ],
    confirmData,
  }
}
