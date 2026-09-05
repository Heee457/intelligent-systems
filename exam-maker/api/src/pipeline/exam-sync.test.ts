import { describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../db/index'
import { syncGeneratedPapersToExams } from './exam-sync'
import type { Session } from '../../../shared/types/index'

async function writeBuildDir(name: string) {
  const buildDir = path.join(process.env.EXAM_DATA_ROOT!, name)
  await fs.rm(buildDir, { recursive: true, force: true })
  await fs.mkdir(buildDir, { recursive: true })
  for (const index of [1, 2]) {
    await fs.writeFile(path.join(buildDir, 'paper-' + index + '-questions.json'), JSON.stringify([
      {
        type: 'fillblank',
        title: '矩阵填空 ' + index,
        content: '设矩阵 $A$，求 $r(A)$。第 ' + index + ' 套',
        answer: { type: 'fillblank', blanks: ['2'] },
        difficulty: 'medium',
        knowledgePoints: ['矩阵的秩'],
        score: 6,
      },
    ]))
  }
  return buildDir
}

describe('generated paper exam sync', () => {
  it('syncs all generated papers as draft exams and marks selected paper recommended', async () => {
    const db = getDb()
    const now = Date.now()
    const teacherId = 'teacher-exam-sync-' + now + '-' + Math.random().toString(36).slice(2, 8)
    db.prepare('INSERT INTO users (id, email, password, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      teacherId, teacherId + '@test.local', 'x', 'Exam Sync Teacher', 'teacher', now, now,
    )
    const buildDir = await writeBuildDir('exam-sync-build-' + teacherId)
    const session: Session = {
      id: 'session-exam-sync-' + teacherId,
      teacherId,
      workDir: path.dirname(buildDir),
      buildDir,
      config: { course: '线性代数', scope: '矩阵', difficulty: '标准', nSets: 2, outputFormat: 'latex', verifyMode: 'auto' },
      status: 'AWAIT_SELECTION',
      currentStep: 6,
      stepDetail: '待确认',
      files: [],
      papers: [
        { index: 1, filename: 'paper-1', formats: ['tex'], verifyPassed: '未验证', difficulty: { basic: 0, medium: 0, hard: 0 }, coverage: '未知', selected: false },
        { index: 2, filename: 'paper-2', formats: ['tex'], verifyPassed: '未验证', difficulty: { basic: 0, medium: 0, hard: 0 }, coverage: '未知', selected: true },
      ],
      createdAt: now,
      updatedAt: now,
    }

    const result = await syncGeneratedPapersToExams(session, [2])

    expect(result).toMatchObject({ source: 'structured', totalPapers: 2, synced: 2, created: 2 })
    const rows = db.prepare("SELECT title, questions, total_score, source, paper_index, is_recommended FROM exams WHERE teacher_id = ? AND source = 'ai-session' ORDER BY paper_index").all(teacherId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toContain('第1套')
    expect(rows[0].is_recommended).toBe(0)
    expect(rows[1].is_recommended).toBe(1)
    expect(JSON.parse(rows[1].questions)).toHaveLength(1)
    expect(rows[1].total_score).toBe(6)

    const second = await syncGeneratedPapersToExams(session, [1])
    expect(second.updated).toBe(2)
    const recommended = db.prepare("SELECT paper_index FROM exams WHERE teacher_id = ? AND source = 'ai-session' AND is_recommended = 1").all(teacherId) as any[]
    expect(recommended.map((row) => row.paper_index)).toEqual([1])
  })
})
