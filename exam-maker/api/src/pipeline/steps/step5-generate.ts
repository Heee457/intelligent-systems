import type { PipelineContext, StepResult } from '../../shared/types'
import { BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是命题专家。根据双向细目表、试卷模板和难度配比，生成多套完整试卷。

步骤：
1. 读取 blueprint.md、template.md、difficulty.json 了解考点分布、模板结构和难度指派
2. 读取 ledger.md 了解当前生成进度（如不存在则跳过）
3. 逐套生成试卷，每套写入 paper-{n}.tex（从 1 开始连续编号）
4. 每套试卷包含：
   a. 完整试题（符合考点分布和难度配比要求）
   b. 试题答案/解析（用 \\answer{} 环境标注）
5. 使用 sympy 对计算题答案进行核验
6. 更新 ledger.md 记录每套的生成状态和核验结果

每套试卷必须满足：
- 考点全覆盖（blueprint 中所有考点至少出现一次）
- 难度比例与配置一致
- 题型、题数、分值符合模板规范
- 答案正确可验证

产物：
- paper-{n}.tex — 每套试卷
- ledger.md — 生成日志和核验记录`

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
逐套生成试卷写入 paper-{n}.tex（1 到 ${nSets}），每套包含完整答案和解析。
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

  // Collect generated paper artifacts
  const artifacts: Array<{ name: string; path: string }> = []
  for (let i = 1; i <= nSets; i++) {
    const paperPath = path.join(ctx.buildDir, `paper-${i}.tex`)
    try {
      await fs.access(paperPath)
      artifacts.push({ name: `paper-${i}.tex`, path: paperPath })
    } catch {
      // Paper not generated — skip
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
