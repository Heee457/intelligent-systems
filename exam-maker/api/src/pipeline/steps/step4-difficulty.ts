import type { PipelineContext, StepResult } from '../../shared/types'
import { BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, handleWriteFile, handleReadFile } from '../tools'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const SYSTEM = `你是难度配比专家。根据试卷模板结构，按照难度比例配置为每个题位指派难度等级。

步骤：
1. 读取 template.md 了解试卷的题型、题数、分值信息
2. 读取 session.json 获取难度配比比例（如 "基础60% 中等30% 难10%"）
3. 按比例为每个题位指派难度（基础/中等/难），确保各难度层分值占比符合配置
4. 使用 Python 编写核算脚本，验证各难度层实际分值占比
5. 更新 template.md，在末尾追加难度核算表

产物：
- template.md（更新版，追加难度核算表）
- difficulty.json — 每题难度指派结果（JSON 格式：题号、题型、分值、难度）`

export async function runStep4(ctx: PipelineContext): Promise<StepResult> {
  ctx.sendWs({ type: 'log', message: '📊 执行难度配比...' })

  // Read session config for difficulty and nSets settings
  const sessionRaw = await fs.readFile(path.join(ctx.sessionDir, 'session.json'), 'utf-8')
  const session = JSON.parse(sessionRaw)
  const difficultyConfig = session.config?.difficulty || '基础60% 中等30% 难10%'

  ctx.sendWs({ type: 'log', message: `难度配比: ${difficultyConfig}` })

  await ctx.claudeClient.sendMessage({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `难度配比配置: ${difficultyConfig}

读取 build 目录下的 template.md 和 session.json，按照配比为每个题位指派难度。
使用 python 编写核算脚本验证各难度层分值占比是否符合配置。
最后更新 template.md 追加难度核算表，产出 difficulty.json。`,
    }],
    tools: [BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL],
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
        return await handleReadFile(ctx.buildDir, input.path as string)
      }
      if (name === 'write_file') {
        return await handleWriteFile(ctx.buildDir, input.path as string, input.content as string)
      }
      return 'OK'
    },
    onText: (text) => ctx.sendWs({ type: 'log', message: text }),
  })

  return {
    success: true,
    artifacts: [
      { name: 'template.md', path: path.join(ctx.buildDir, 'template.md') },
      { name: 'difficulty.json', path: path.join(ctx.buildDir, 'difficulty.json') },
    ],
  }
}
