import type { PipelineContext, StepResult } from '../../shared/types'
import { COMMON_TOOLS } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

export async function runStep1(ctx: PipelineContext): Promise<StepResult> {
  // List uploaded files in sessionDir
  const files = await fs.readdir(ctx.sessionDir)
  const papers = files.filter((f) => /\.(pdf|docx|doc|tex|md)$/i.test(f) && !f.startsWith('.'))

  if (papers.length === 0) {
    return { success: false, artifacts: [], error: 'No past papers found' }
  }

  const artifacts: Array<{ name: string; path: string }> = []

  for (const file of papers) {
    const ext = path.extname(file).toLowerCase()
    const outName = `source-${path.basename(file, ext)}.tex`
    const outPath = path.join(ctx.buildDir, outName)

    ctx.sendWs({ type: 'log', message: `📄 解析: ${file}` })

    await ctx.claudeClient.sendMessage({
      system: getStep1SystemPrompt(ext),
      messages: [{
        role: 'user',
        content: `解析文件 ${path.join(ctx.sessionDir, file)}，产出 LaTeX 到 ${outPath}。对于 PDF，使用 Read 工具逐页识读并转写；对于 docx，使用 execute_bash 执行 pandoc 转换。`,
      }],
      tools: COMMON_TOOLS,
      maxTokens: 16384,
      onToolUse: async (name, rawInput) => {
        const input = rawInput as Record<string, unknown>
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

    artifacts.push({ name: outName, path: outPath })
  }

  return { success: true, artifacts }
}

function getStep1SystemPrompt(ext: string): string {
  if (ext === '.pdf') {
    return '你是学科转写员。使用 Read 工具逐页识读 PDF，忠实转成 LaTeX。公式、表格、分值标注都要保留。模糊处标 % TODO 存疑。'
  }
  return `你是学科转写员。使用 execute_bash 工具执行 pandoc 将 ${ext} 转为 LaTeX，然后核对转换结果。`
}
