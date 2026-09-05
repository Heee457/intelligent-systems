import { describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { extractQuestionsFromBuildDir } from './bank-converter'

async function writeSampleBuildDir(name: string) {
  const buildDir = path.join(process.env.EXAM_DATA_ROOT!, name)
  await fs.rm(buildDir, { recursive: true, force: true })
  await fs.mkdir(buildDir, { recursive: true })
  await fs.writeFile(path.join(buildDir, 'blueprint.jsonl'), JSON.stringify({
    src: 'sample.tex',
    no: '一.1',
    type: '填空题',
    points: 3,
    kp: '矩阵的秩',
    difficulty: '中等',
    cognition: '分析',
    stem_kind: '计算型',
  }) + '\n')
  const paperTex = [
    '\\documentclass{ctexart}',
    '% ===== 答案环境（用于参考答案与解析）=====',
    '\\newenvironment{answer}',
    '  {\\par\\noindent{\\bfseries 【答案与解析】}}',
    '  {\\par}',
    '\\begin{document}',
    '\\section*{一、填空题（每题 3 分，共 3 分）}',
    '\\noindent',
    '\\textbf{1.} 设矩阵 $A$ 满足 $A^2=A$，则 $r(A)$ 与 $tr(A)$ 的关系为\\underline{\\qquad}。',
    '',
    '\\newpage',
    '\\begin{center}',
    '{\\Large\\bfseries 参考答案与解析}',
    '\\end{center}',
    '\\section*{一、填空题}',
    '\\begin{answer}',
    '\\textbf{1.} $r(A)=tr(A)$。因为幂等矩阵可对角化，特征值只能为 $0$ 或 $1$。',
    '\\end{answer}',
    '\\end{document}',
  ].join('\n')
  await fs.writeFile(path.join(buildDir, 'paper-1.tex'), paperTex)
  return buildDir
}

describe('bank converter', () => {
  it('extracts real stems and answers from generated paper tex', async () => {
    const buildDir = await writeSampleBuildDir('converter-build')
    const result = await extractQuestionsFromBuildDir(buildDir)

    expect(result.source).toBe('paper')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].title).toContain('矩阵的秩')
    expect(result.questions[0].content).toContain('设矩阵')
    expect(result.questions[0].content).not.toContain('题目内容待补充')
    expect(result.questions[0].answer.type).toBe('fillblank')
    expect((result.questions[0].answer as { blanks: string[] }).blanks[0]).toContain('r(A)=tr(A)')
  })
})
