import type { PipelineContext, StepResult } from '../../shared/types'
import { BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, handleWriteFile, handleReadFile } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是命题专家。根据双向细目表、试卷模板和难度配比，生成多套完整试卷。

步骤：
1. 读取 blueprint.md、template.md、difficulty.json 了解考点分布、模板结构和难度指派
2. 读取 ledger.md 了解当前生成进度（如不存在则跳过）
3. 逐套生成试卷，每套写入 paper-{n}.tex（从 1 开始连续编号）
4. 每套同时生成答案和结构化题目数据：
   a. paper-{n}.tex — 完整试卷正文，可包含参考答案附录
   b. paper-{n}-answers.tex — 独立参考答案与解析
   c. paper-{n}-questions.json — 结构化题目数组，必须包含完整题干 content 和非空 answer
5. 使用 sympy 对计算题答案进行核验
6. 更新 ledger.md 记录每套的生成状态和核验结果

每套试卷必须满足：
- 考点全覆盖（blueprint 中所有考点至少出现一次）
- 难度比例与配置一致
- 题型、题数、分值符合模板规范
- 答案正确可验证

产物：
- paper-{n}.tex — 每套试卷
- paper-{n}-answers.tex — 每套参考答案与解析
- paper-{n}-questions.json — 题库自动导入使用的结构化题目
- ledger.md — 生成日志和核验记录`
function stripLatexComments(text: string): string {
  return text.replace(/(^|[^\\])%.*/gm, '$1')
}

function findAnswerMarker(tex: string): number {
  const preferred = tex.search(/参考答案与解析|参考答案/)
  if (preferred >= 0) return preferred

  const documentStart = tex.indexOf('\\begin{document}')
  const bodyStart = documentStart >= 0 ? documentStart : 0
  const firstSection = tex.indexOf('\\section*{', bodyStart)
  const fallbackStart = firstSection >= 0 ? firstSection + 1 : bodyStart
  const fallback = tex.slice(fallbackStart).search(/答案与解析/)
  return fallback >= 0 ? fallbackStart + fallback : -1
}

export function extractAnswerDocumentFromPaperTex(tex: string): string | null {
  const uncommented = stripLatexComments(tex)
  const marker = findAnswerMarker(uncommented)
  if (marker < 0) return null

  const sectionStart = uncommented.indexOf('\\section*{', marker)
  const documentEnd = uncommented.lastIndexOf('\\end{document}')
  const bodyStart = sectionStart >= 0 ? sectionStart : marker
  const bodyEnd = documentEnd > bodyStart ? documentEnd : uncommented.length
  const body = uncommented.slice(bodyStart, bodyEnd).trim()
  if (!body || !/(\\section\*\{|\\begin\{answer\})/.test(body)) return null

  return [
    '% Auto-extracted from paper tex.',
    '\\documentclass[12pt]{ctexart}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{geometry}',
    '\\geometry{a4paper,left=2.2cm,right=2.2cm,top=2.4cm,bottom=2.4cm}',
    '\\newenvironment{answer}',
    '  {\\par\\medskip\\noindent{\\bfseries 【答案与解析】}\\par\\nopagebreak\\vspace{1pt}}',
    '  {\\par\\medskip}',
    '\\begin{document}',
    '\\begin{center}',
    '{\\Large\\bfseries 参考答案与解析}',
    '\\end{center}',
    '',
    body,
    '\\end{document}',
    '',
  ].join('\n')
}

async function ensureAnswerArtifacts(buildDir: string, nSets: number): Promise<number> {
  let created = 0
  for (let i = 1; i <= nSets; i++) {
    const paperPath = path.join(buildDir, 'paper-' + i + '.tex')
    const answerPath = path.join(buildDir, 'paper-' + i + '-answers.tex')

    try {
      await fs.access(answerPath)
      continue
    } catch {
      // Missing answer file can be recovered from a paper appendix below.
    }

    let paperTex = ''
    try {
      paperTex = await fs.readFile(paperPath, 'utf-8')
    } catch {
      continue
    }

    const answerDocument = extractAnswerDocumentFromPaperTex(paperTex)
    if (!answerDocument) continue

    await fs.writeFile(answerPath, answerDocument)
    created += 1
  }
  return created
}


export async function runStep5(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '📝 生成试卷...' })

  // Read session config for number of sets
  const sessionRaw = await fs.readFile(path.join(ctx.sessionDir, 'session.json'), 'utf-8')
  const session = JSON.parse(sessionRaw)
  const nSets = session.config?.nSets || 8

  ctx.sendWs({ type: 'log', message: `计划生成 ${nSets} 套试卷` })

  await ctx.claudeClient.sendMessage({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `需要生成 ${nSets} 套试卷。

读取 build 目录下的 blueprint.md、template.md、difficulty.json 和 ledger.md（如存在），
逐套生成试卷写入 paper-{n}.tex（1 到 ${nSets}），并同时写入 paper-{n}-answers.tex 和 paper-{n}-questions.json。
paper-{n}-questions.json 必须是 JSON 数组，每个元素至少包含 type、title、content、answer、difficulty、knowledgePoints；content 必须是完整题干，answer 必须是可用答案，不能留空或写“待补充”。
使用 sympy 核验计算题答案的正确性。
最后更新 ledger.md 记录每套的生成状态和核验结果。`,
    }],
    tools: [BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL],
    maxTokens: 32000,
    onToolUse: async (name, rawInput) => {
      const input = rawInput as Record<string, unknown>
      if (name === 'execute_bash') {
        try {
          const output = execSync(input.command as string, {
            cwd: ctx.buildDir, timeout: 60000, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe',
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

  const createdAnswerFiles = await ensureAnswerArtifacts(ctx.buildDir, nSets)
  if (createdAnswerFiles > 0) {
    ctx.sendWs({ type: 'log', message: '已从试卷附录拆分 ' + createdAnswerFiles + ' 个答案文件' })
  }

  // Collect generated paper artifacts
  const artifacts: Array<{ name: string; path: string }> = []
  for (let i = 1; i <= nSets; i++) {
    for (const suffix of ['.tex', '-answers.tex', '-questions.json']) {
      const paperPath = path.join(ctx.buildDir, `paper-${i}${suffix}`)
      try {
        await fs.access(paperPath)
        artifacts.push({ name: `paper-${i}${suffix}`, path: paperPath })
      } catch {
        // Optional paper artifact not generated.
      }
    }
  }

  // Add ledger.md if present
  const ledgerPath = path.join(ctx.buildDir, 'ledger.md')
  try {
    await fs.access(ledgerPath)
    artifacts.push({ name: 'ledger.md', path: ledgerPath })
  } catch {
    // ledger may not have been created
  }

  return { success: true, artifacts }
}
