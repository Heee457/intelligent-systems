import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS, handleWriteFile, handleReadFile } from '../tools'
import path from 'path'
import fs from 'fs/promises'
import { execSync } from 'child_process'

const SYSTEM = `你是试卷模板提取专家。根据真题 LaTeX 和双向细目表，提取试卷模板结构。

产物：
1. template.json — 模板结构（题型、题数、每题分值、组卷规则、用时）
2. template.md — 人读模板说明（题型分布、分值统计、备注），用 Markdown 表格

完成后调用 request_confirmation 等待教师审核。`

export async function runStep3(ctx: PipelineContext): Promise<StepResult> {
  // Include user feedback in the prompt if provided (from reject/modify action)
  const feedbackInstruction = ctx.feedback
    ? `\n\n【用户的修改/驳回意见】\n${ctx.feedback}\n\n请根据以上意见调整你的分析和产物。`
    : ''

  // Round 1: Analysis
  await ctx.claudeClient.sendMessage({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `分析真题产物与双向细目表，提取试卷模板。完成后调用 request_confirmation。${feedbackInstruction}`,
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

  // Read the produced template.md for confirmData
  let mdContent = ''
  try {
    mdContent = await fs.readFile(path.join(ctx.buildDir, 'template.md'), 'utf-8')
  } catch { /* file may not exist */ }

  // Ensure we always have meaningful content for the confirm panel
  if (!mdContent.trim()) {
    mdContent = `## 模板结构\n\n模板产物已生成，详情请查看生成文件：\n\n- \`template.json\` — 结构化模板\n- \`template.md\` — 可读模板说明`
    ctx.sendWs({ type: 'log', message: '⚠️ 模板 .md 文件为空，使用默认摘要' })
  }

  return {
    success: true,
    artifacts: [
      { name: 'template.json', path: path.join(ctx.buildDir, 'template.json') },
      { name: 'template.md', path: path.join(ctx.buildDir, 'template.md') },
    ],
    confirmData: { content: mdContent, type: 'template' },
  }
}
