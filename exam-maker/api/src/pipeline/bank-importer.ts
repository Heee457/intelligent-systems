import { getDb } from '../db/index'
import { generateId } from '../utils/id'
import { extractQuestionsFromBuildDir, type BankQuestion } from './bank-converter'

type ImportResult = {
  source: string
  total: number
  imported: number
  skipped: number
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ')
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = normalizeValue((value as Record<string, unknown>)[key])
    }
    return result
  }
  return value ?? null
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value))
}

function questionFingerprint(question: Pick<BankQuestion, 'type' | 'content' | 'options' | 'answer'>): string {
  return stableJson({
    type: question.type,
    content: question.content,
    options: question.options || null,
    answer: question.answer || null,
  })
}

function rowFingerprint(row: Record<string, unknown>): string {
  return stableJson({
    type: row.type,
    content: row.content,
    options: row.options ? JSON.parse(row.options as string) : null,
    answer: row.answer ? JSON.parse(row.answer as string) : null,
  })
}

export async function importGeneratedQuestions(buildDir: string, teacherId: string): Promise<ImportResult> {
  const result = await extractQuestionsFromBuildDir(buildDir)

  // Blueprint-only data is metadata, not real questions. Never auto-import skeletons.
  if (result.source === 'blueprint') {
    return { source: result.source, total: 0, imported: 0, skipped: result.questions.length }
  }

  const db = getDb()
  const existingRows = db.prepare('SELECT type, content, options, answer FROM questions WHERE teacher_id = ?').all(teacherId) as Record<string, unknown>[]
  const existing = new Set(existingRows.map(rowFingerprint))
  const now = Date.now()
  let imported = 0
  let skipped = 0

  for (const question of result.questions) {
    const fingerprint = questionFingerprint(question)
    if (existing.has(fingerprint)) {
      skipped += 1
      continue
    }

    db.prepare('INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      generateId(),
      teacherId,
      question.type,
      question.title,
      question.content,
      question.options ? JSON.stringify(question.options) : null,
      JSON.stringify(question.answer),
      question.difficulty || 'medium',
      question.knowledgePoints ? JSON.stringify(question.knowledgePoints) : null,
      question.explanation || null,
      now,
      now,
    )
    existing.add(fingerprint)
    imported += 1
  }

  return { source: result.source, total: result.questions.length, imported, skipped }
}
