import { describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../db/index'
import { importGeneratedQuestions } from './bank-importer'

async function writeBuildDir(name: string) {
  const buildDir = path.join(process.env.EXAM_DATA_ROOT!, name)
  await fs.rm(buildDir, { recursive: true, force: true })
  await fs.mkdir(buildDir, { recursive: true })
  await fs.writeFile(path.join(buildDir, 'paper-1-questions.json'), JSON.stringify([
    {
      type: 'essay',
      title: '线性相关性证明',
      content: '证明向量组 beta1, beta2, beta3 线性无关。',
      answer: { type: 'essay', referenceAnswer: '设线性组合为零，解齐次方程得系数全为零。' },
      difficulty: 'hard',
      knowledgePoints: ['向量组'],
    },
  ], null, 2))
  return buildDir
}

describe('generated question importer', () => {
  it('imports generated questions once and skips exact duplicates', async () => {
    const db = getDb()
    const now = Date.now()
    const teacherId = 'teacher-generated-import-' + now + '-' + Math.random().toString(36).slice(2, 8)
    db.prepare('INSERT INTO users (id, email, password, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      teacherId, teacherId + '@test.local', 'x', 'Generated Import Teacher', 'teacher', now, now,
    )
    const buildDir = await writeBuildDir('importer-build')

    const first = await importGeneratedQuestions(buildDir, teacherId)
    const second = await importGeneratedQuestions(buildDir, teacherId)

    expect(first).toMatchObject({ source: 'structured', total: 1, imported: 1, skipped: 0 })
    expect(second).toMatchObject({ source: 'structured', total: 1, imported: 0, skipped: 1 })

    const row = db.prepare('SELECT content, answer FROM questions WHERE teacher_id = ?').get(teacherId) as { content: string; answer: string }
    expect(row.content).toContain('证明向量组')
    expect(JSON.parse(row.answer).referenceAnswer).toContain('系数全为零')
  })
})
