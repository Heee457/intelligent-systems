import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/index'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateId } from '../utils/id'

type AuthRequest = FastifyRequest & { user: NonNullable<FastifyRequest['user']> }

type GenerateSection = {
  type: string
  count: number
  scorePerQuestion: number
  difficulty?: string
  knowledgePoints?: string[]
}

type GenerateBody = {
  name: string
  sections: GenerateSection[]
  totalScore?: number
  scope?: string
  knowledgePoints?: string[]
  autoSupplement?: boolean
}

type RemedialMode = 'practice' | 'retake'

type RemedialBody = {
  publishId: string
  mode?: RemedialMode
  knowledgePoints?: string[] | string
  maxQuestions?: number
  title?: string
}

type KnowledgePerformance = {
  knowledgePoint: string
  answerCount: number
  questionIds: Set<string>
  score: number
  maxScore: number
  lostScore: number
  avgScoreRate: number
}

type QuestionPerformance = {
  attempts: number
  scoreRate: number
  lostScore: number
}

const auth = { preHandler: [requireAuth, requireRole('teacher')] }

export async function examRoutes(app: FastifyInstance) {
  // List — the teacher's exams, newest first
  app.get('/api/exams', auth, async (req) => {
    const rows = getDb().prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY updated_at DESC').all((req as AuthRequest).user.userId)
    return rows.map(serializeExam)
  })

  // Create
  app.post('/api/exams', auth, async (req) => {
    const db = getDb()
    const now = Date.now()
    const id = generateId()
    const body = req.body as Record<string, any>

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, source, session_id, paper_index, is_recommended, scope, knowledge_points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      (req as AuthRequest).user.userId,
      body.title,
      JSON.stringify(body.questions || []),
      body.totalScore || 0,
      body.status || 'draft',
      body.source || 'manual',
      body.sessionId || null,
      body.paperIndex || null,
      body.isRecommended ? 1 : 0,
      body.scope || null,
      body.knowledgePoints ? JSON.stringify(body.knowledgePoints) : null,
      now,
      now,
    )

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)) }
  })

  // Get
  app.get('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const e = getDb().prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, (req as AuthRequest).user.userId)
    if (!e) return reply.status(404).send({ error: 'Not found' })
    return { exam: serializeExam(e) }
  })

  // Update
  app.put('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId

    const existing = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId) as any
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    if (examHasPublishRecord(db, id) && mutatesExamContent(body)) {
      return reply.status(409).send({ error: '已发布试卷不能直接修改内容，请复制为新版本后再编辑' })
    }
    const merged = {
      title: body.title !== undefined ? body.title : existing.title,
      questions: body.questions !== undefined ? body.questions : parseJson(existing.questions, []),
      totalScore: body.totalScore !== undefined ? body.totalScore : existing.total_score,
      status: body.status !== undefined ? body.status : existing.status,
      source: body.source !== undefined ? body.source : (existing.source || 'manual'),
      sessionId: body.sessionId !== undefined ? body.sessionId : existing.session_id,
      paperIndex: body.paperIndex !== undefined ? body.paperIndex : existing.paper_index,
      isRecommended: body.isRecommended !== undefined ? body.isRecommended : Boolean(existing.is_recommended),
      scope: body.scope !== undefined ? body.scope : existing.scope,
      knowledgePoints: body.knowledgePoints !== undefined ? body.knowledgePoints : parseJson(existing.knowledge_points, []),
    }

    const result = db.prepare('UPDATE exams SET title=?, questions=?, total_score=?, status=?, source=?, session_id=?, paper_index=?, is_recommended=?, scope=?, knowledge_points=?, updated_at=? WHERE id=? AND teacher_id=?').run(
      merged.title,
      JSON.stringify(merged.questions),
      merged.totalScore,
      merged.status,
      merged.source,
      merged.sessionId || null,
      merged.paperIndex || null,
      merged.isRecommended ? 1 : 0,
      merged.scope || null,
      JSON.stringify(merged.knowledgePoints || []),
      Date.now(),
      id,
      userId,
    )
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })

    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId)) }
  })

  // Delete
  app.delete('/api/exams/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = getDb().prepare('DELETE FROM exams WHERE id = ? AND teacher_id = ?').run(id, (req as AuthRequest).user.userId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // Smart generate from rule — pick questions by type/difficulty, then knowledge points/range, with fallback fill.
  app.post('/api/exams/generate', auth, async (req) => {
    const body = req.body as GenerateBody
    const db = getDb()
    const now = Date.now()
    const userId = (req as AuthRequest).user.userId
    const examQuestions: any[] = []
    const warnings: string[] = []
    const usedQuestionIds = new Set<string>()

    for (const section of body.sections || []) {
      const count = Math.max(0, Number(section.count) || 0)
      if (!section.type || count === 0) continue

      let query = 'SELECT * FROM questions WHERE teacher_id = ? AND type = ?'
      const params: any[] = [userId, section.type]

      if (section.difficulty) {
        query += ' AND difficulty = ?'
        params.push(section.difficulty)
      }

      const pool = (db.prepare(query).all(...params) as any[]).filter((question) => !usedQuestionIds.has(question.id) && hasUsableQuestion(question))
      const sectionKps = normalizeList(section.knowledgePoints)
      const globalKps = normalizeList(body.knowledgePoints)
      const desiredKps = sectionKps.length > 0 ? sectionKps : globalKps
      const scopeTokens = tokenizeScope(body.scope)

      const strict = desiredKps.length > 0
        ? pool.filter((question) => matchesKnowledgePoints(question, desiredKps))
        : scopeTokens.length > 0
          ? pool.filter((question) => matchesScope(question, scopeTokens))
          : pool

      const picked = takeRandom(strict, count)
      if (picked.length < count && desiredKps.length > 0 && scopeTokens.length > 0) {
        const supplement = takeRandom(
          pool.filter((question) => !picked.some((item) => item.id === question.id) && matchesScope(question, scopeTokens)),
          count - picked.length,
        )
        picked.push(...supplement)
      }
      if (picked.length < count) {
        const fallback = takeRandom(
          pool.filter((question) => !picked.some((item) => item.id === question.id)),
          count - picked.length,
        )
        picked.push(...fallback)
      }

      if (picked.length < count && body.autoSupplement) {
        const need = count - picked.length
        for (let i = 0; i < need; i += 1) {
          const supplement = createSupplementQuestion(db, userId, section, body, examQuestions.length + picked.length + 1)
          picked.push(supplement)
        }
        warnings.push(sectionSummary(section) + '：题库不足，已自动补题 ' + need + ' 道，请人工复核后发布。')
      } else if (picked.length < count) {
        warnings.push(sectionSummary(section) + '：需要 ' + count + ' 道，当前题库仅能提供 ' + picked.length + ' 道可用题。')
      } else if (strict.length < count && (desiredKps.length > 0 || scopeTokens.length > 0)) {
        warnings.push(sectionSummary(section) + '：目标知识点或范围匹配不足，已从同题型题库补齐。')
      }

      picked.forEach((q: any) => {
        usedQuestionIds.add(q.id)
        examQuestions.push({
          questionId: q.id,
          score: Math.max(1, Number(section.scorePerQuestion) || 1),
          order: examQuestions.length + 1,
        })
      })
    }

    const id = generateId()
    const totalScore = examQuestions.reduce((s: number, q: any) => s + q.score, 0)
    const knowledgePoints = normalizeList(body.knowledgePoints)

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, source, session_id, paper_index, is_recommended, scope, knowledge_points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      userId,
      body.name,
      JSON.stringify(examQuestions),
      totalScore,
      'draft',
      'smart',
      null,
      null,
      0,
      body.scope || null,
      JSON.stringify(knowledgePoints),
      now,
      now,
    )

    const created = serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id))
    return { exam: created, warnings, blueprint: buildExamQuality(db, userId, created).blueprint }
  })

  app.get('/api/exams/:id/quality', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const row = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return { report: buildExamQuality(db, userId, serializeExam(row)) }
  })

  app.get('/api/exams/:id/preview', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const row = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const exam = serializeExam(row)
    return { exam, questions: hydrateExamQuestions(db, userId, exam) }
  })

  app.get('/api/exams/:id/versions', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const row = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId) as any
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const groupId = row.version_group_id || row.id
    const rows = db.prepare('SELECT * FROM exams WHERE teacher_id = ? AND (version_group_id = ? OR id = ?) ORDER BY version_number DESC, created_at DESC').all(userId, groupId, groupId)
    return { versions: rows.map(serializeExam) }
  })

  app.post('/api/exams/:id/versions', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const existing = db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(id, userId) as any
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    const groupId = existing.version_group_id || existing.id
    const currentMax = db.prepare('SELECT MAX(COALESCE(version_number, 1)) as max_version FROM exams WHERE teacher_id = ? AND (version_group_id = ? OR id = ?)').get(userId, groupId, groupId) as any
    const nextVersion = Math.max(1, Number(currentMax?.max_version) || 1) + 1
    const now = Date.now()
    const newId = generateId()
    const title = String(body.title || existing.title + '（修订 v' + nextVersion + '）').trim()
    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, source, session_id, paper_index, is_recommended, scope, knowledge_points, version_group_id, version_number, parent_exam_id, locked_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      newId,
      userId,
      title,
      existing.questions,
      existing.total_score,
      'draft',
      existing.source || 'manual',
      existing.session_id || null,
      existing.paper_index || null,
      0,
      existing.scope || null,
      existing.knowledge_points || null,
      groupId,
      nextVersion,
      existing.id,
      null,
      now,
      now,
    )
    return { exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(newId)) }
  })

  // Generate a follow-up draft from a published exam's weak knowledge points.
  app.post('/api/exams/remedial', auth, async (req, reply) => {
    const body = req.body as RemedialBody
    const db = getDb()
    const userId = (req as AuthRequest).user.userId
    const mode = normalizeRemedialMode(body.mode)
    const maxQuestions = normalizeRemedialCount(body.maxQuestions, mode)

    if (!body.publishId) return reply.status(400).send({ error: 'publishId is required' })

    const publish = db.prepare(`
      SELECT ep.*, e.title as exam_title, e.questions as exam_questions
      FROM exam_publish ep
      JOIN exams e ON e.id = ep.exam_id
      WHERE ep.id = ? AND ep.teacher_id = ?
    `).get(body.publishId, userId) as any
    if (!publish) return reply.status(404).send({ error: 'Publish not found' })

    const knowledgeStats = collectKnowledgePerformance(db, body.publishId)
    const requestedKps = normalizeList(body.knowledgePoints)
    const targetKps = requestedKps.length > 0
      ? requestedKps
      : knowledgeStats
        .filter((item) => item.avgScoreRate < 80)
        .sort((a, b) => a.avgScoreRate - b.avgScoreRate || b.lostScore - a.lostScore)
        .slice(0, 3)
        .map((item) => item.knowledgePoint)

    if (targetKps.length === 0) {
      return reply.status(400).send({ error: '没有可用于生成的薄弱知识点' })
    }

    const originalQuestionIds = new Set(parseJson<Array<{ questionId: string }>>(publish.exam_questions, []).map((item) => item.questionId))
    const questionPerformance = collectQuestionPerformance(db, body.publishId)
    const allQuestions = db.prepare('SELECT * FROM questions WHERE teacher_id = ?').all(userId) as any[]
    const matched = allQuestions.filter((question) => hasUsableQuestion(question) && matchesKnowledgePoints(question, targetKps))
    const sorted = sortRemedialCandidates(matched, questionPerformance, originalQuestionIds, targetKps)
    const primary = mode === 'retake' ? sorted.filter((question) => !originalQuestionIds.has(question.id)) : sorted
    const fallback = mode === 'retake' ? sorted.filter((question) => originalQuestionIds.has(question.id)) : []
    const picked = [...primary, ...fallback.filter((question) => !primary.some((item) => item.id === question.id))].slice(0, maxQuestions)

    const warnings: string[] = []
    if (matched.length === 0) warnings.push('目标知识点在题库中没有可用题目。')
    if (picked.length < maxQuestions) warnings.push('目标知识点题量不足，已生成 ' + picked.length + '/' + maxQuestions + ' 道。')
    if (mode === 'retake' && primary.length < maxQuestions && fallback.length > 0) warnings.push('重测卷题量不足，已补入原考试中的相关题。')

    const scorePerQuestion = mode === 'retake' ? 10 : 5
    const examQuestions = picked.map((question, index) => ({
      questionId: question.id,
      score: scorePerQuestion,
      order: index + 1,
    }))
    const now = Date.now()
    const id = generateId()
    const defaultTitle = publish.title + (mode === 'retake' ? ' - 重测试卷' : ' - 补救练习')
    const scope = '来源：' + publish.title + '；知识点：' + targetKps.join('、')

    db.prepare('INSERT INTO exams (id, teacher_id, title, questions, total_score, status, source, session_id, paper_index, is_recommended, scope, knowledge_points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      userId,
      body.title?.trim() || defaultTitle,
      JSON.stringify(examQuestions),
      examQuestions.reduce((sum, item) => sum + item.score, 0),
      'draft',
      mode === 'retake' ? 'retake' : 'remedial',
      null,
      null,
      0,
      scope,
      JSON.stringify(targetKps),
      now,
      now,
    )

    return {
      exam: serializeExam(db.prepare('SELECT * FROM exams WHERE id = ?').get(id)),
      mode,
      knowledgePoints: targetKps,
      warnings,
    }
  })
}

function normalizeRemedialMode(value: unknown): RemedialMode {
  return value === 'retake' ? 'retake' : 'practice'
}

function normalizeRemedialCount(value: unknown, mode: RemedialMode) {
  const fallback = mode === 'retake' ? 10 : 8
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(30, Math.max(1, Math.floor(n)))
}

function collectKnowledgePerformance(db: ReturnType<typeof getDb>, publishId: string): KnowledgePerformance[] {
  const rows = db.prepare(`
    SELECT
      sa.question_id,
      sa.score,
      sa.max_score,
      q.knowledge_points
    FROM submission_answers sa
    JOIN submissions s ON sa.submission_id = s.id
    JOIN questions q ON sa.question_id = q.id
    WHERE s.publish_id = ? AND s.status IN ('submitted','graded')
  `).all(publishId) as any[]

  const map = new Map<string, Omit<KnowledgePerformance, 'lostScore' | 'avgScoreRate'>>()
  for (const row of rows) {
    const points = parseJson<string[]>(row.knowledge_points, [])
    const kps = points.length > 0 ? points : ['未标注']
    const score = Number(row.score) || 0
    const maxScore = Number(row.max_score) || 0
    for (const kp of kps) {
      const item = map.get(kp) || { knowledgePoint: kp, answerCount: 0, questionIds: new Set<string>(), score: 0, maxScore: 0 }
      item.answerCount += 1
      item.questionIds.add(row.question_id)
      item.score += score
      item.maxScore += maxScore
      map.set(kp, item)
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    lostScore: Math.round((item.maxScore - item.score) * 10) / 10,
    avgScoreRate: item.maxScore > 0 ? Math.round(item.score / item.maxScore * 100) : 0,
  }))
}

function collectQuestionPerformance(db: ReturnType<typeof getDb>, publishId: string) {
  const rows = db.prepare(`
    SELECT
      sa.question_id,
      COUNT(sa.id) as attempts,
      SUM(COALESCE(sa.score, 0)) as score,
      SUM(COALESCE(sa.max_score, 0)) as max_score
    FROM submission_answers sa
    JOIN submissions s ON sa.submission_id = s.id
    WHERE s.publish_id = ? AND s.status IN ('submitted','graded')
    GROUP BY sa.question_id
  `).all(publishId) as any[]

  const map = new Map<string, QuestionPerformance>()
  rows.forEach((row) => {
    const maxScore = Number(row.max_score) || 0
    const score = Number(row.score) || 0
    map.set(row.question_id, {
      attempts: Number(row.attempts) || 0,
      scoreRate: maxScore > 0 ? Math.round(score / maxScore * 100) : 0,
      lostScore: Math.round((maxScore - score) * 10) / 10,
    })
  })
  return map
}

function examHasPublishRecord(db: ReturnType<typeof getDb>, examId: string) {
  return Boolean(db.prepare('SELECT 1 FROM exam_publish WHERE exam_id = ? LIMIT 1').get(examId))
}

function mutatesExamContent(body: Record<string, any>) {
  return ['title', 'questions', 'totalScore', 'scope', 'knowledgePoints'].some((key) => body[key] !== undefined)
}

function hasUsableQuestion(row: any) {
  const content = String(row.content || '').trim()
  if (!content || content === '题目内容待补充，请根据源文件编辑。') return false
  const answer = parseJson<Record<string, any> | null>(row.answer, null)
  if (!answer || answer.type !== row.type) return false
  if (answer.type === 'choice') return Boolean(answer.selectedOptionId)
  if (answer.type === 'fillblank') return Array.isArray(answer.blanks) && answer.blanks.some((item: string) => String(item).trim())
  if (answer.type === 'essay') return Boolean(String(answer.referenceAnswer || '').trim())
  if (answer.type === 'truefalse') return typeof answer.value === 'boolean'
  if (answer.type === 'match') return Array.isArray(answer.pairs) && answer.pairs.length > 0
  if (answer.type === 'ordering') return Array.isArray(answer.orderedItems) && answer.orderedItems.length > 0
  return false
}

function sortRemedialCandidates(
  questions: any[],
  performance: Map<string, QuestionPerformance>,
  originalQuestionIds: Set<string>,
  targetKps: string[],
) {
  const difficultyRank: Record<string, number> = { hard: 0, medium: 1, easy: 2 }
  return [...questions].sort((a, b) => {
    const pa = performance.get(a.id)
    const pb = performance.get(b.id)
    const weakA = pa ? pa.scoreRate : 101
    const weakB = pb ? pb.scoreRate : 101
    if (weakA !== weakB) return weakA - weakB
    const overlap = countKnowledgeOverlap(b, targetKps) - countKnowledgeOverlap(a, targetKps)
    if (overlap !== 0) return overlap
    const originalRank = Number(originalQuestionIds.has(b.id)) - Number(originalQuestionIds.has(a.id))
    if (originalRank !== 0) return originalRank
    const difficulty = (difficultyRank[a.difficulty] ?? 1) - (difficultyRank[b.difficulty] ?? 1)
    if (difficulty !== 0) return difficulty
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
}

function countKnowledgeOverlap(row: any, targets: string[]) {
  const kps = questionKnowledgePoints(row)
  return targets.filter((target) => kps.some((kp) => kp.includes(target) || target.includes(kp))).length
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[，,;；\n]/).map((item) => item.trim()).filter(Boolean)
  return []
}

function tokenizeScope(scope: unknown): string[] {
  if (typeof scope !== 'string') return []
  return scope
    .split(/[，,;；、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

function questionKnowledgePoints(row: any): string[] {
  return parseJson<string[]>(row.knowledge_points, [])
}

function matchesKnowledgePoints(row: any, targets: string[]) {
  const kps = questionKnowledgePoints(row)
  return targets.some((target) => kps.some((kp) => kp.includes(target) || target.includes(kp)))
}

function matchesScope(row: any, tokens: string[]) {
  const haystack = [row.title, row.content, ...questionKnowledgePoints(row)].join(' ')
  return tokens.some((token) => haystack.includes(token))
}

function takeRandom<T>(items: T[], count: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count)
}

function sectionSummary(section: GenerateSection) {
  const typeLabels: Record<string, string> = {
    choice: '选择题',
    truefalse: '判断题',
    fillblank: '填空题',
    essay: '问答题',
    match: '匹配题',
    ordering: '排序题',
  }
  const difficultyLabels: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
  }
  const type = typeLabels[section.type] || section.type
  return type + (section.difficulty ? '（' + (difficultyLabels[section.difficulty] || section.difficulty) + '）' : '')
}

function createSupplementQuestion(db: ReturnType<typeof getDb>, userId: string, section: GenerateSection, body: GenerateBody, index: number) {
  const now = Date.now()
  const id = generateId()
  const kps = normalizeList(section.knowledgePoints).length > 0 ? normalizeList(section.knowledgePoints) : normalizeList(body.knowledgePoints)
  const kp = kps[0] || tokenizeScope(body.scope)[0] || '综合知识点'
  const type = section.type || 'essay'
  const difficulty = section.difficulty || 'medium'
  const answer = defaultGeneratedAnswer(type)
  const options = type === 'choice'
    ? [
      { id: 'a', label: 'A', content: '正确表述' },
      { id: 'b', label: 'B', content: '干扰表述一' },
      { id: 'c', label: 'C', content: '干扰表述二' },
      { id: 'd', label: 'D', content: '干扰表述三' },
    ]
    : null
  const title = '自动补题 ' + index + '：' + kp
  const content = generatedQuestionContent(type, kp)
  db.prepare('INSERT INTO questions (id, teacher_id, type, title, content, options, answer, difficulty, knowledge_points, explanation, quality_issues, quality_checked_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    id,
    userId,
    type,
    title,
    content,
    options ? JSON.stringify(options) : null,
    JSON.stringify(answer),
    difficulty,
    JSON.stringify(kps.length > 0 ? kps : [kp]),
    '系统自动补题草稿，请教师发布前复核题干、答案和解析。',
    JSON.stringify(['自动补题草稿，建议人工复核']),
    now,
    now,
    now,
  )
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
}

function generatedQuestionContent(type: string, kp: string) {
  if (type === 'choice') return '围绕“' + kp + '”选择正确表述。'
  if (type === 'truefalse') return '判断：下列关于“' + kp + '”的表述是否正确。'
  if (type === 'fillblank') return '请填写“' + kp + '”中的关键结论。'
  if (type === 'match') return '请匹配“' + kp + '”相关概念与含义。'
  if (type === 'ordering') return '请排列“' + kp + '”相关步骤的正确顺序。'
  return '请说明“' + kp + '”的核心概念、方法和典型应用。'
}

function defaultGeneratedAnswer(type: string) {
  if (type === 'choice') return { type: 'choice', selectedOptionId: 'a' }
  if (type === 'truefalse') return { type: 'truefalse', value: true }
  if (type === 'fillblank') return { type: 'fillblank', blanks: ['关键结论'] }
  if (type === 'match') return { type: 'match', pairs: [{ left: '概念', right: '含义' }] }
  if (type === 'ordering') return { type: 'ordering', orderedItems: ['步骤一', '步骤二'] }
  return { type: 'essay', referenceAnswer: '围绕知识点展开说明，答案需包含定义、关键步骤和结论。' }
}

function hydrateExamQuestions(db: ReturnType<typeof getDb>, userId: string, exam: any) {
  if (exam.questions.length === 0) return []
  const ids = exam.questions.map((item: any) => item.questionId)
  const rows = db.prepare('SELECT * FROM questions WHERE teacher_id = ? AND id IN (' + ids.map(() => '?').join(',') + ')').all(userId, ...ids) as any[]
  return exam.questions.map((item: any) => {
    const row = rows.find((question) => question.id === item.questionId)
    return {
      ...item,
      question: row ? serializeQuestionForExam(row) : null,
    }
  })
}

function serializeQuestionForExam(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    options: row.options ? parseJson(row.options, undefined) : undefined,
    answer: parseJson(row.answer, defaultGeneratedAnswer(row.type)),
    difficulty: row.difficulty,
    knowledgePoints: parseJson(row.knowledge_points, []),
    explanation: row.explanation || undefined,
    qualityIssues: row.quality_issues ? parseJson(row.quality_issues, []) : [],
  }
}

function buildExamQuality(db: ReturnType<typeof getDb>, userId: string, exam: any) {
  const hydrated = hydrateExamQuestions(db, userId, exam)
  const issues: Array<{ level: 'error' | 'warning'; message: string; questionOrder?: number; questionId?: string }> = []
  const seen = new Map<string, number>()
  const blueprintMap = new Map<string, { knowledgePoint: string; questionCount: number; score: number; types: Record<string, number>; difficulties: Record<string, number> }>()

  if (exam.questions.length === 0) issues.push({ level: 'error', message: '试卷还没有题目' })
  const total = exam.questions.reduce((sum: number, item: any) => sum + Number(item.score || 0), 0)
  if (Math.round(total * 100) / 100 !== Math.round(Number(exam.totalScore || 0) * 100) / 100) {
    issues.push({ level: 'warning', message: '题目分值合计与试卷总分不一致' })
  }

  hydrated.forEach((item: any, index: number) => {
    const order = item.order || index + 1
    const question = item.question
    if (!question) {
      issues.push({ level: 'error', message: '第 ' + order + ' 题在题库中不存在', questionOrder: order, questionId: item.questionId })
      return
    }
    if (Number(item.score) <= 0) issues.push({ level: 'error', message: '第 ' + order + ' 题分值必须大于 0', questionOrder: order, questionId: question.id })
    if (!String(question.title || '').trim()) issues.push({ level: 'error', message: '第 ' + order + ' 题缺少标题', questionOrder: order, questionId: question.id })
    if (!String(question.content || '').trim() || question.content === '题目内容待补充，请根据源文件编辑。') issues.push({ level: 'error', message: '第 ' + order + ' 题缺少题干', questionOrder: order, questionId: question.id })
    if (!hasUsableSerializedQuestion(question)) issues.push({ level: 'error', message: '第 ' + order + ' 题缺少可用答案', questionOrder: order, questionId: question.id })
    if (!question.explanation) issues.push({ level: 'warning', message: '第 ' + order + ' 题缺少解析', questionOrder: order, questionId: question.id })
    const key = normalizeQuestionKey(question.title + ' ' + question.content)
    if (key && seen.has(key)) {
      issues.push({ level: 'warning', message: '第 ' + order + ' 题与第 ' + seen.get(key) + ' 题疑似重复', questionOrder: order, questionId: question.id })
    } else if (key) {
      seen.set(key, order)
    }
    const kps = question.knowledgePoints.length > 0 ? question.knowledgePoints : ['未标注']
    kps.forEach((kp: string) => {
      const row = blueprintMap.get(kp) || { knowledgePoint: kp, questionCount: 0, score: 0, types: {}, difficulties: {} }
      row.questionCount += 1
      row.score += Number(item.score) || 0
      row.types[question.type] = (row.types[question.type] || 0) + 1
      row.difficulties[question.difficulty] = (row.difficulties[question.difficulty] || 0) + 1
      blueprintMap.set(kp, row)
    })
  })

  const errorCount = issues.filter((item) => item.level === 'error').length
  const warningCount = issues.filter((item) => item.level === 'warning').length
  return {
    canPublish: errorCount === 0,
    summary: { errorCount, warningCount, questionCount: exam.questions.length, totalScore: total },
    issues,
    blueprint: Array.from(blueprintMap.values()).sort((a, b) => b.score - a.score || a.knowledgePoint.localeCompare(b.knowledgePoint, 'zh-CN')),
  }
}

function hasUsableSerializedQuestion(question: any) {
  const answer = question.answer as any
  if (!answer || answer.type !== question.type) return false
  if (answer.type === 'choice') return Boolean(answer.selectedOptionId)
  if (answer.type === 'fillblank') return Array.isArray(answer.blanks) && answer.blanks.some((item: string) => String(item).trim())
  if (answer.type === 'essay') return Boolean(String(answer.referenceAnswer || '').trim())
  if (answer.type === 'truefalse') return typeof answer.value === 'boolean'
  if (answer.type === 'match') return Array.isArray(answer.pairs) && answer.pairs.length > 0
  if (answer.type === 'ordering') return Array.isArray(answer.orderedItems) && answer.orderedItems.length > 0
  return false
}

function normalizeQuestionKey(value: string) {
  return value.replace(/s+/g, '').replace(/[，。！？,.!?]/g, '').toLowerCase()
}

function serializeExam(r: any): any {
  return {
    id: r.id,
    title: r.title,
    questions: parseJson(r.questions, []),
    totalScore: r.total_score,
    status: r.status,
    source: r.source || 'manual',
    sessionId: r.session_id || undefined,
    paperIndex: r.paper_index ?? undefined,
    isRecommended: Boolean(r.is_recommended),
    scope: r.scope || undefined,
    knowledgePoints: parseJson(r.knowledge_points, []),
    versionGroupId: r.version_group_id || r.id,
    versionNumber: r.version_number || 1,
    parentExamId: r.parent_exam_id || undefined,
    lockedAt: r.locked_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
