import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS, handleWriteFile, handleReadFile } from '../tools'
import path from 'path'
import fs from 'fs/promises'
import { execSync } from 'child_process'

const SYSTEM = `你是考点分析专家。依据真题 LaTeX 文件逐题判定考点、题型、分值、难度、认知层次，产出双向细目表。

产物：
1. blueprint.jsonl — 每题一行 JSON（src, no, type, points, kp, difficulty, cognition, stem_kind）
2. blueprint.md — 人读细目表（考点×难度分值矩阵 + 考点清单 + 频次），用 Markdown 表格

完成后调用 request_confirmation 等待教师审核。`

export async function runStep2(ctx: PipelineContext): Promise<StepResult> {
  return analyzeAndVerify(ctx, 'blueprint', SYSTEM)
}

async function analyzeAndVerify(
  ctx: PipelineContext,
  point: string,
  system: string,
): Promise<StepResult> {
  // Include user feedback in the prompt if provided (from reject/modify action)
  const feedbackInstruction = ctx.feedback
    ? `\n\n【用户的修改/驳回意见】\n${ctx.feedback}\n\n请根据以上意见调整你的分析和产物。`
    : ''

  // Round 1: Analysis
  await ctx.claudeClient.sendMessage({
    system,
    messages: [{
      role: 'user',
      content: `分析真题产物，产出分析结果。完成后调用 request_confirmation。${feedbackInstruction}`,
    }],
    tools: COMMON_TOOLS,
    maxTokens: 16384,
    onToolUse: async (name, rawInput) => {
      const input = rawInput as Record<string, unknown>

      if (name === 'request_confirmation') {
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

  // Read the produced files for confirmData
  let mdContent = ''
  try {
    mdContent = await fs.readFile(path.join(ctx.buildDir, `${point}.md`), 'utf-8')
  } catch { /* file may not exist */ }

  // Ensure we always have meaningful content for the confirm panel
  if (!mdContent.trim()) {
    mdContent = `## 双向细目表\n\n分析产物已生成，详情请查看生成文件：\n\n- \`${point}.md\` — 可读细目表\n- \`${point}.jsonl\` — 结构化数据`
    ctx.sendWs({ type: 'log', message: '⚠️ 细目表 .md 文件为空，使用默认摘要' })
  }

  return {
    success: true,
    artifacts: [
      { name: `${point}.md`, path: path.join(ctx.buildDir, `${point}.md`) },
      { name: `${point}.jsonl`, path: path.join(ctx.buildDir, `${point}.jsonl`) },
    ],
    confirmData: { content: mdContent, type: point },
  }
}
