import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是编译转换专家。将生成的试卷 LaTeX 文件编译为 PDF，并转换为其他格式。

步骤：
1. 扫描 build 目录中所有 paper-*.tex 文件
2. 对每套试卷：
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
- paper-{n}.pdf — 编译后的 PDF
- paper-{n}.docx — 转换后的 Word（可选）
- paper-{n}.md — 转换后的 Markdown（可选）`

export async function runStep6(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '🔧 编译转换...' })

  let confirmData: unknown = null

  await ctx.claudeClient.sendMessage({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: '读取 build 目录下所有 paper-*.tex 文件，逐套用 xelatex 编译为 PDF，用 pandoc 转换格式（docx/md）。检查编译结果，完成后调用 request_confirmation 让用户选择下载。',
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
        try {
          const content = await fs.readFile(path.join(ctx.buildDir, input.path as string), 'utf-8')
          return content
        } catch (e: any) {
          return `Error: ${e.message}`
        }
      }
      if (name === 'write_file') {
        await fs.writeFile(
          path.join(ctx.buildDir, input.path as string),
          input.content as string,
          'utf-8',
        )
        return `Written: ${input.path}`
      }
      return 'OK'
    },
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  // Collect compilation artifacts
  const artifacts: Array<{ name: string; path: string }> = []
  const buildFiles = await fs.readdir(ctx.buildDir)

  for (const file of buildFiles) {
    if (/^paper-\d+\.(pdf|docx|md|tex)$/i.test(file)) {
      artifacts.push({ name: file, path: path.join(ctx.buildDir, file) })
    }
  }

  return { success: true, artifacts, confirmData }
}
