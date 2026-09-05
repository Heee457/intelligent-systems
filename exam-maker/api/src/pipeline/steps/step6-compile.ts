import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS, handleWriteFile, handleReadFile } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是编译转换专家。将生成的试卷 LaTeX 文件编译为 PDF，并转换为其他格式。

步骤：
1. 扫描 build 目录中所有 paper-*.tex 文件，包括 paper-{n}.tex 和 paper-{n}-answers.tex
2. 对每份试卷和答案文件：
   a. 使用 xelatex 编译两次生成 PDF（xelatex 需执行两次以解析交叉引用）
   b. 根据配置使用 pandoc 转换为 docx 和/或 md
3. 检查编译结果，确认 PDF 文件已生成
4. 整理每套试卷可用的格式列表
5. 完成后调用 request_confirmation(point="selection") 呈现所有试卷让用户选择下载

调用 request_confirmation 时 data 应包含：
{
  "papers": [
    { "index": 1, "filename": "paper-1", "formats": ["tex", "pdf"] },
    ...
  ]
}

产物：
- paper-{n}.pdf — 编译后的试卷 PDF
- paper-{n}.docx — 转换后的试卷 Word（可选）
- paper-{n}.md — 转换后的试卷 Markdown（可选）
- paper-{n}-answers.pdf/docx/md — 独立答案与解析文件（如存在）`

export async function runStep6(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '🔧 编译转换...' })

  // Include user feedback in the prompt if provided (from reject/modify action)
  const feedbackInstruction = ctx.feedback
    ? `\n\n【用户的修改/驳回意见】\n${ctx.feedback}\n\n请根据以上意见调整你的编译和选题工作。`
    : ''

  let confirmData: unknown = null

  await ctx.claudeClient.sendMessage({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `读取 build 目录下所有 paper-*.tex 文件，包括 paper-{n}-answers.tex。逐套用 xelatex 编译为 PDF，用 pandoc 转换格式（docx/md）。检查编译结果，完成后调用 request_confirmation 让用户选择下载。${feedbackInstruction}`,
    }],
    tools: COMMON_TOOLS,
    maxTokens: 32000,
    onToolUse: async (name, rawInput) => {
      const input = rawInput as Record<string, unknown>

      if (name === 'request_confirmation') {
        confirmData = input.data
        ctx.sendWs({ type: 'log', message: `⏸ 请求选卷: ${input.summary}` })
        return 'CONFIRM_REQUESTED'
      }
      if (name === 'execute_bash') {
        try {
          const output = execSync(input.command as string, {
            cwd: ctx.buildDir, timeout: 120000, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe',
          })
          return output.toString()
        } catch (e: any) {
          return `Error: ${e.message}\n${e.stderr?.toString() || ''}`
        }
      }
      if (name === 'read_file') {
        return await handleReadFile(ctx.buildDir, input.path as string)
      }
      if (name === 'write_file') {
        return await handleWriteFile(ctx.buildDir, input.path as string, input.content as string)
      }
      return 'OK'
    },
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  // Collect compilation artifacts
  const artifacts: Array<{ name: string; path: string }> = []
  const buildFiles = await fs.readdir(ctx.buildDir)

  for (const file of buildFiles) {
    if (/^paper-\d+(?:-answers|-questions)?\.(pdf|docx|md|tex|json)$/i.test(file)) {
      artifacts.push({ name: file, path: path.join(ctx.buildDir, file) })
    }
  }

  // If Claude did not call request_confirmation, build fallback confirmData
  // from the compilation artifacts so the selection panel still appears
  if (!confirmData) {
    const paperSet = new Set<number>()
    const paperFormats = new Map<number, string[]>()

    for (const a of artifacts) {
      const m = a.name.match(/^paper-(\d+)\.(\w+)$/i)
      if (m) {
        const idx = parseInt(m[1], 10)
        const fmt = m[2].toLowerCase()
        paperSet.add(idx)
        if (!paperFormats.has(idx)) paperFormats.set(idx, [])
        paperFormats.get(idx)!.push(fmt)
      }
    }

    const papers = Array.from(paperSet)
      .sort((a, b) => a - b)
      .map((idx) => ({
        index: idx,
        filename: `paper-${idx}`,
        formats: paperFormats.get(idx) || ['tex'],
        verifyPassed: '未验证',
        difficulty: { basic: 0, medium: 0, hard: 0 },
        coverage: '未知',
        selected: false,
      }))

    confirmData = papers
    ctx.sendWs({ type: 'log', message: `⚠️ 自动构建选题列表: ${papers.length} 套试卷` })
  }

  // Normalize: if Claude returned { papers: [...] }, extract the array;
  // otherwise keep as-is (already an array from fallback, or other shape)
  if (confirmData && typeof confirmData === 'object' && 'papers' in (confirmData as Record<string, unknown>)) {
    confirmData = (confirmData as Record<string, unknown>).papers
  }

  return { success: true, artifacts, confirmData }
}
