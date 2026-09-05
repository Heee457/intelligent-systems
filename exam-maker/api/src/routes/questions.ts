import type { FastifyInstance, FastifyRequest } from 'fastify'
import type Database from 'better-sqlite3'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }
type Difficulty = 'easy' | 'medium' | 'hard'
type QuestionRow = Record<string, any>

type QuestionPerformance = {
  attempts: number
  score: number
  maxScore: number
  scoreRate: number
  suggestedDifficulty: Difficulty
  reason: string
}

const MIN_CALIBRATION_ATTEMPTS = 1

export async function questionRoutes(app: FastifyInstance) {
  const auth = { preHandler: [requireAuth, requireRole('teacher')] }

  // List — with pagination and filters
  app.get('/api/questions', auth, async (req) => {
    const { page = '1', limit = '20', type, difficulty, kp, keyword } = req.query as Record<string, string>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))

    const conditions = ['teacher_id = ?']
    const params: unknown[] = [userId]

    if (type) { conditions.push('type = ?'); params.push(type) }
    if (difficulty) { conditions.push('difficulty = ?'); params.push(difficulty) }
    if (kp) { conditions.push('knowledge_points LIKE ?'); params.push('%' + kp + '%') }
    if (keyword) { conditions.push('(title LIKE ? OR content LIKE ?)'); params.push('%' + keyword + '%', '%' + keyword + '%') }

    const where = conditions.join(' AND ')
    const offset = (pageNum - 1) * limitNum

    const total = (db.prepare('SELECT COUNT(*) as count FROM questions WHERE ' + where).get(...params) as { count: number }).count
    const rows = db.prepare('SELECT * FROM questions WHERE ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, limitNum, offset)

    return {
      questions: rows.map((r: any) => serializeQuestion(r)),
      total,
      page: pageNum,
      limit: limitNum,
    }
  })

  // Create
  app.post('/api/questions', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare('INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, (req as AuthRequest).user.userId, body.type, body.title, body.content,
      body.options ? JSON.stringify(body.options) : null,
      JSON.stringify(body.answer || defaultAnswer(body.type)),
      body.difficulty || 'medium',
      body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      body.explanation || null, now, now
    )

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
    return { question: serializeQuestion(question) }
  })

  // Import (JSON array of questions, teacher-owned)
  app.post('/api/questions/import', auth, async (req) => {
    const body = req.body as { questions?: any[] }
    const db = getDb()
    const now = Date.now()
    const userId = (req as AuthRequest).user.userId
    let count = 0

    for (const q of body.questions || []) {
      if (!q || !q.type || !q.title || !q.content) continue
      const id = generateId()
      db.prepare('INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
        id, userId, q.type, q.title, q.content,
        q.options ? JSON.stringify(q.options) : null,
        JSON.stringify(q.answer || defaultAnswer(q.type)),
        q.difficulty || 'medium',
        q.knowledgePoints ? JSON.stringify(q.knowledgePoints) : null,
        q.explanation || null, now, now
      )
      count++
    }

    return { imported: count }
  })

  // Export — all of the teacher's questions, serialized
  app.get('/api/questions/export', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const rows = db.prepare('SELECT * FROM questions WHERE teacher_id = ? ORDER BY created_at').all(userId)
    return rows.map((r: any) => serializeQuestion(r))
  })

  // Quality governance report — computed live, with persisted flags included in list/detail APIs after recompute.
  app.get('/api/questions/quality', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    return { report: buildQualityReport(db, userId, false) }
  })

  app.post('/api/questions/quality/recompute', auth, async (req) => {
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    return { report: buildQualityReport(db, userId, true) }
  })

  // Get
  app.get('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = getDb().prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!q) return reply.status(404).send({ error: 'Not found' })
    return { question: serializeQuestion(q) }
  })

  // Update
  app.put('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const existing = db.prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, userId) as QuestionRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const merged = {
      type: body.type !== undefined ? body.type : existing.type,
      title: body.title !== undefined ? body.title : existing.title,
      content: body.content !== undefined ? body.content : existing.content,
      options: body.options !== undefined ? body.options : parseJson<any[] | undefined>(existing.options, undefined),
      answer: body.answer !== undefined ? body.answer : parseJson(existing.answer, defaultAnswer(existing.type)),
      difficulty: body.difficulty !== undefined ? body.difficulty : existing.difficulty,
      knowledgePoints: body.knowledgePoints !== undefined ? body.knowledgePoints : parseJson<string[]>(existing.knowledge_points, []),
      explanation: body.explanation !== undefined ? body.explanation : existing.explanation,
    }

    const result = db.prepare('UPDATE questions SET type=?, title=?, content=?, options=?, answer=?, difficulty=?, knowledge_points=?, explanation=?, updated_at=? WHERE id=? AND teacher_id=?').run(
      merged.type,
      merged.title,
      merged.content,
      merged.options ? JSON.stringify(merged.options) : null,
      JSON.stringify(merged.answer),
      merged.difficulty,
      JSON.stringify(merged.knowledgePoints || []),
      merged.explanation || null,
      Date.now(),
      id,
      userId,
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })

    return { question: serializeQuestion(db.prepare('SELECT * FROM questions WHERE id = ? AND teacher_id = ?').get(id, userId)) }
  })

  // Delete
  app.delete('/api/questions/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req as AuthRequest).user.userId
    const result = getDb().prepare('DELETE FROM questions WHERE id = ? AND teacher_id = ?').run(id, userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })
}

function serializeQuestion(r: any) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    content: r.content,
    options: r.options ? parseJson(r.options, undefined) : undefined,
    answer: parseJson(r.answer, defaultAnswer(r.type)),
    difficulty: r.difficulty,
    knowledgePoints: r.knowledge_points ? parseJson(r.knowledge_points, []) : [],
    explanation: r.explanation || undefined,
    qualityIssues: r.quality_issues ? parseJson<string[]>(r.quality_issues, []) : [],
    qualityCheckedAt: r.quality_checked_at || undefined,
    difficultySuggestion: r.difficulty_suggestion || undefined,
    difficultySuggestionReason: r.difficulty_suggestion_reason || undefined,
    isKeyQuestion: Boolean(r.is_key_question),
    isErrorProne: Boolean(r.is_error_prone),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function buildQualityReport(db: Database.Database, userId: string, persist: boolean) {
  const checkedAt = Date.now()
  const rows = db.prepare('SELECT * FROM questions WHERE teacher_id = ? ORDER BY created_at DESC').all(userId) as QuestionRow[]
  const performanceByQuestion = collectQuestionPerformance(db, userId)
  const inspected = rows.map((row) => {
    const question = serializeQuestion(row)
    const issues = evaluateQualityIssues(question)
    const performance = performanceByQuestion.get(question.id)
    const difficultySuggestion = performance && performance.attempts >= MIN_CALIBRATION_ATTEMPTS && performance.suggestedDifficulty !== question.difficulty
      ? performance.suggestedDifficulty
      : undefined
    const difficultySuggestionReason = difficultySuggestion ? performance?.reason : undefined
    const isErrorProne = Boolean(performance && performance.attempts >= MIN_CALIBRATION_ATTEMPTS && performance.scoreRate < 60)
    const isKeyQuestion = isErrorProne

    return {
      question,
      issues,
      performance,
      difficultySuggestion,
      difficultySuggestionReason,
      isErrorProne,
      isKeyQuestion,
    }
  })

  if (persist) {
    const update = db.prepare('UPDATE questions SET quality_issues=?, quality_checked_at=?, difficulty_suggestion=?, difficulty_suggestion_reason=?, is_key_question=?, is_error_prone=?, updated_at=? WHERE id=? AND teacher_id=?')
    const tx = db.transaction(() => {
      inspected.forEach((item) => {
        update.run(
          JSON.stringify(item.issues),
          checkedAt,
          item.difficultySuggestion || null,
          item.difficultySuggestionReason || null,
          item.isKeyQuestion ? 1 : 0,
          item.isErrorProne ? 1 : 0,
          checkedAt,
          item.question.id,
          userId,
        )
      })
    })
    tx()
  }

  const questionSummaries = inspected.map((item) => qualityQuestionSummary(
    item.question,
    item.issues,
    item.performance,
    item.difficultySuggestion,
    item.difficultySuggestionReason,
    item.isKeyQuestion,
    item.isErrorProne,
    persist ? checkedAt : item.question.qualityCheckedAt,
  ))
  const issueQuestions = questionSummaries.filter((item) => item.qualityIssues.length > 0)
  const duplicateGroups = findDuplicateGroups(questionSummaries)
  const difficultySuggestions = questionSummaries.filter((item) => item.difficultySuggestion)
  const errorProneQuestions = questionSummaries.filter((item) => item.isErrorProne)

  return {
    checkedAt,
    summary: {
      total: questionSummaries.length,
      issueCount: issueQuestions.length,
      duplicateGroupCount: duplicateGroups.length,
      difficultySuggestionCount: difficultySuggestions.length,
      errorProneCount: errorProneQuestions.length,
      keyQuestionCount: questionSummaries.filter((item) => item.isKeyQuestion).length,
    },
    issueQuestions,
    duplicateGroups,
    difficultySuggestions,
    errorProneQuestions,
  }
}

function collectQuestionPerformance(db: Database.Database, userId: string) {
  const rows = db.prepare(`
    SELECT
      q.id as question_id,
      SUM(CASE WHEN sa.score IS NOT NULL AND COALESCE(sa.max_score, 0) > 0 THEN 1 ELSE 0 END) as attempts,
      SUM(CASE WHEN sa.score IS NOT NULL AND COALESCE(sa.max_score, 0) > 0 THEN sa.score ELSE 0 END) as score,
      SUM(CASE WHEN sa.score IS NOT NULL AND COALESCE(sa.max_score, 0) > 0 THEN sa.max_score ELSE 0 END) as max_score
    FROM questions q
    LEFT JOIN submission_answers sa ON sa.question_id = q.id
    LEFT JOIN submissions s ON s.id = sa.submission_id
    WHERE q.teacher_id = ? AND (s.id IS NULL OR s.status IN ('submitted', 'graded'))
    GROUP BY q.id
  `).all(userId) as Array<{ question_id: string; attempts: number | null; score: number | null; max_score: number | null }>

  const result = new Map<string, QuestionPerformance>()
  rows.forEach((row) => {
    const attempts = Number(row.attempts || 0)
    const maxScore = Number(row.max_score || 0)
    if (attempts <= 0 || maxScore <= 0) return
    const score = Number(row.score || 0)
    const scoreRate = Math.round((score / maxScore) * 100)
    const suggestedDifficulty = suggestDifficulty(scoreRate)
    result.set(row.question_id, {
      attempts,
      score,
      maxScore,
      scoreRate,
      suggestedDifficulty,
      reason: attempts + ' 次有效作答，平均得分率 ' + scoreRate + '%',
    })
  })
  return result
}

function qualityQuestionSummary(
  question: ReturnType<typeof serializeQuestion>,
  issues: string[],
  performance: QuestionPerformance | undefined,
  difficultySuggestion: Difficulty | undefined,
  difficultySuggestionReason: string | undefined,
  isKeyQuestion: boolean,
  isErrorProne: boolean,
  qualityCheckedAt: number | undefined,
) {
  return {
    id: question.id,
    type: question.type,
    title: question.title,
    content: question.content,
    difficulty: question.difficulty,
    knowledgePoints: question.knowledgePoints,
    qualityIssues: issues,
    qualityCheckedAt,
    difficultySuggestion,
    difficultySuggestionReason,
    isKeyQuestion,
    isErrorProne,
    attempts: performance?.attempts || 0,
    scoreRate: performance?.scoreRate,
  }
}

function evaluateQualityIssues(question: ReturnType<typeof serializeQuestion>) {
  const issues: string[] = []
  const title = String(question.title || '').trim()
  const content = String(question.content || '').trim()

  if (!title) issues.push('缺少标题')
  if (!content || content === '题目内容待补充，请根据源文件编辑。') issues.push('缺少题干')
  if (!hasAnswer(question)) issues.push('缺少答案')
  if (!Array.isArray(question.knowledgePoints) || question.knowledgePoints.length === 0) issues.push('缺少知识点')

  if (question.type === 'choice') {
    const options = Array.isArray(question.options) ? question.options : []
    if (options.length < 2) issues.push('选择题选项不足')
    if (options.some((option: any) => !String(option.content || '').trim())) issues.push('选择题存在空选项')
    if (question.answer?.type === 'choice' && question.answer.selectedOptionId) {
      const exists = options.some((option: any) => option.id === question.answer.selectedOptionId)
      if (!exists) issues.push('答案选项不存在')
    }
  }

  if (question.type === 'fillblank') {
    const blanks = question.answer?.type === 'fillblank' ? question.answer.blanks : []
    if (!Array.isArray(blanks) || blanks.length === 0 || blanks.every((item: string) => !String(item).trim())) issues.push('填空题答案为空')
  }

  if (question.type === 'essay' && question.answer?.type === 'essay' && !String(question.answer.referenceAnswer || '').trim()) {
    issues.push('问答题缺少参考答案')
  }

  if (question.type === 'match') {
    const pairs = question.answer?.type === 'match' ? question.answer.pairs : []
    if (!Array.isArray(pairs) || pairs.length === 0) issues.push('匹配题缺少配对答案')
  }

  if (question.type === 'ordering') {
    const orderedItems = question.answer?.type === 'ordering' ? question.answer.orderedItems : []
    if (!Array.isArray(orderedItems) || orderedItems.length === 0) issues.push('排序题缺少正确顺序')
  }

  return [...new Set(issues)]
}

function hasAnswer(question: ReturnType<typeof serializeQuestion>) {
  const answer = question.answer
  if (!answer || answer.type !== question.type) return false
  switch (answer.type) {
    case 'choice':
      return Boolean(answer.selectedOptionId)
    case 'truefalse':
      return typeof answer.value === 'boolean'
    case 'fillblank':
      return Array.isArray(answer.blanks) && answer.blanks.some((item: string) => String(item).trim())
    case 'essay':
      return Boolean(String(answer.referenceAnswer || '').trim())
    case 'match':
      return Array.isArray(answer.pairs) && answer.pairs.some((pair: any) => String(pair.left || '').trim() && String(pair.right || '').trim())
    case 'ordering':
      return Array.isArray(answer.orderedItems) && answer.orderedItems.length > 0
    default:
      return false
  }
}

function findDuplicateGroups(questions: ReturnType<typeof qualityQuestionSummary>[]) {
  const groups: Array<{ id: string; reason: string; similarity: number; questions: ReturnType<typeof qualityQuestionSummary>[] }> = []
  const exactBuckets = new Map<string, ReturnType<typeof qualityQuestionSummary>[]>()

  questions.forEach((question) => {
    const key = question.type + ':' + normalizeQuestionText(question)
    if (key.length <= question.type.length + 1) return
    const bucket = exactBuckets.get(key) || []
    bucket.push(question)
    exactBuckets.set(key, bucket)
  })

  let index = 1
  const exactPairKeys = new Set<string>()
  for (const bucket of exactBuckets.values()) {
    if (bucket.length < 2) continue
    bucket.forEach((a, ai) => {
      bucket.slice(ai + 1).forEach((b) => exactPairKeys.add(pairKey(a.id, b.id)))
    })
    groups.push({ id: 'exact-' + index++, reason: '完全重复', similarity: 1, questions: bucket })
  }

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const a = questions[i]
      const b = questions[j]
      if (a.type !== b.type) continue
      if (exactPairKeys.has(pairKey(a.id, b.id))) continue
      const aText = normalizeQuestionText(a)
      const bText = normalizeQuestionText(b)
      if (Math.min(aText.length, bText.length) < 18) continue
      const similarity = jaccard(ngrams(aText), ngrams(bText))
      if (similarity >= 0.88) {
        groups.push({
          id: 'similar-' + index++,
          reason: '文本相似度 ' + Math.round(similarity * 100) + '%',
          similarity,
          questions: [a, b],
        })
      }
    }
  }

  return groups.slice(0, 50)
}

function normalizeQuestionText(question: Pick<ReturnType<typeof qualityQuestionSummary>, 'title' | 'content'>) {
  return String((question.title || '') + ' ' + (question.content || ''))
    .toLowerCase()
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function ngrams(text: string) {
  const items = new Set<string>()
  if (text.length <= 2) {
    if (text) items.add(text)
    return items
  }
  for (let i = 0; i < text.length - 1; i++) items.add(text.slice(i, i + 2))
  return items
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  a.forEach((item) => { if (b.has(item)) intersection++ })
  return intersection / (a.size + b.size - intersection)
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

function suggestDifficulty(scoreRate: number): Difficulty {
  if (scoreRate >= 85) return 'easy'
  if (scoreRate >= 60) return 'medium'
  return 'hard'
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function defaultAnswer(type: string) {
  switch (type) {
    case 'choice': return { type: 'choice', selectedOptionId: '' }
    case 'truefalse': return { type: 'truefalse', value: true }
    case 'fillblank': return { type: 'fillblank', blanks: [''] }
    case 'essay': return { type: 'essay', referenceAnswer: '' }
    case 'match': return { type: 'match', pairs: [] }
    case 'ordering': return { type: 'ordering', orderedItems: [] }
    default: return { type: 'essay', referenceAnswer: '' }
  }
}
