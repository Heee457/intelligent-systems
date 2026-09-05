import type { Session, PaperData } from '../../../shared/types/index'
import { getDb } from '../db/index'
import { generateId } from '../utils/id'
import { extractQuestionGroupsFromBuildDir, type BankQuestion } from './bank-converter'

type SyncResult = {
  source: string
  totalPapers: number
  synced: number
  created: number
  updated: number
  recommended: number[]
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

function defaultScore(question: BankQuestion): number {
  if (question.score && Number.isFinite(question.score)) return question.score
  if (question.type === 'fillblank') return 3
  if (question.type === 'choice' || question.type === 'truefalse') return 5
  return 10
}

function buildQuestionIndex(teacherId: string) {
  const db = getDb()
  const rows = db.prepare('SELECT id, type, content, options, answer FROM questions WHERE teacher_id = ?').all(teacherId) as Record<string, unknown>[]
  const index = new Map<string, string>()
  for (const row of rows) {
    index.set(rowFingerprint(row), row.id as string)
  }
  return index
}

function ensureQuestionInBank(question: BankQuestion, teacherId: string, index: Map<string, string>): string {
  const fingerprint = questionFingerprint(question)
  const existingId = index.get(fingerprint)
  if (existingId) return existingId

  const db = getDb()
  const now = Date.now()
  const id = generateId()
  db.prepare('INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
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
  index.set(fingerprint, id)
  return id
}

function selectedPaperIndexes(papers: PaperData[] = [], explicit: number[] = []) {
  const fromExplicit = explicit.filter((index) => Number.isFinite(index))
  if (fromExplicit.length > 0) return new Set(fromExplicit)

  const fromPaperData = papers.filter((paper) => paper.selected).map((paper) => paper.index)
  if (fromPaperData.length > 0) return new Set(fromPaperData)

  const first = papers.length > 0 ? papers[0].index : 1
  return new Set([first])
}

function examTitle(session: Session, paperIndex: number) {
  const course = session.config.course?.trim() || 'AI命题'
  return course + ' - AI命题 - 第' + paperIndex + '套'
}

export async function syncGeneratedPapersToExams(
  session: Session,
  selectedIndexes: number[] = [],
): Promise<SyncResult> {
  const extracted = await extractQuestionGroupsFromBuildDir(session.buildDir)

  if (extracted.source === 'blueprint' || extracted.source === 'none') {
    return { source: extracted.source, totalPapers: 0, synced: 0, created: 0, updated: 0, recommended: [], skipped: extracted.papers.length }
  }

  const db = getDb()
  const questionIndex = buildQuestionIndex(session.teacherId)
  const recommended = selectedPaperIndexes(session.papers, selectedIndexes)
  const syncedRecommended = Array.from(recommended)
  const scope = session.config.scope || null
  const now = Date.now()
  let created = 0
  let updated = 0

  for (const group of extracted.papers) {
    const examQuestions = group.questions.map((question, orderIndex) => ({
      questionId: ensureQuestionInBank(question, session.teacherId, questionIndex),
      score: defaultScore(question),
      order: orderIndex + 1,
    }))
    const totalScore = examQuestions.reduce((sum, question) => sum + question.score, 0)
    const knowledgePoints = Array.from(new Set(group.questions.flatMap((question) => question.knowledgePoints || [])))
    const existing = db.prepare("SELECT * FROM exams WHERE teacher_id = ? AND source = 'ai-session' AND session_id = ? AND paper_index = ?").get(
      session.teacherId,
      session.id,
      group.index,
    ) as { id: string; status: string } | undefined

    const isRecommended = recommended.has(group.index) ? 1 : 0
    const title = examTitle(session, group.index)
    if (existing) {
      if (existing.status === 'draft') {
        db.prepare('UPDATE exams SET title=?, questions=?, total_score=?, status=?, is_recommended=?, scope=?, knowledge_points=?, updated_at=? WHERE id=? AND teacher_id=?').run(
          title,
          JSON.stringify(examQuestions),
          totalScore,
          'draft',
          isRecommended,
          scope,
          JSON.stringify(knowledgePoints),
          now,
          existing.id,
          session.teacherId,
        )
      } else {
        db.prepare('UPDATE exams SET is_recommended=?, scope=?, knowledge_points=?, updated_at=? WHERE id=? AND teacher_id=?').run(
          isRecommended,
          scope,
          JSON.stringify(knowledgePoints),
          now,
          existing.id,
          session.teacherId,
        )
      }
      updated += 1
      continue
    }

    const examId = generateId()
    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, source, session_id, paper_index, is_recommended, scope, knowledge_points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      examId,
      session.teacherId,
      title,
      JSON.stringify(examQuestions),
      totalScore,
      'draft',
      'ai-session',
      session.id,
      group.index,
      isRecommended,
      scope,
      JSON.stringify(knowledgePoints),
      now,
      now,
    )
    created += 1
  }

  return {
    source: extracted.source,
    totalPapers: extracted.papers.length,
    synced: extracted.papers.length,
    created,
    updated,
    recommended: syncedRecommended,
    skipped: 0,
  }
}
