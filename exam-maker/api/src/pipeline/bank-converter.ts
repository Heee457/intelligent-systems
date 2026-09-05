import fs from 'fs/promises'
import path from 'path'
import { generateId } from '../utils/id'

export interface BankQuestion {
  id: string
  type: string
  title: string
  content: string
  options?: Array<{ id: string; label: string; content: string }>
  answer: Record<string, unknown>
  difficulty: string
  knowledgePoints: string[]
  explanation?: string
  score?: number
  createdAt: number
  updatedAt: number
}

interface BlueprintEntry {
  src: string
  no: string
  type: string
  points: number
  kp: string
  difficulty: string
  cognition: string
  stem_kind: string
}

type ExtractionSource = 'structured' | 'paper' | 'blueprint' | 'none'

type ExtractionResult = {
  source: ExtractionSource
  questions: BankQuestion[]
}

export interface BankQuestionGroup {
  index: number
  filename: string
  questions: BankQuestion[]
}

export type GroupExtractionResult = {
  source: ExtractionSource
  papers: BankQuestionGroup[]
}

const TYPE_MAP: Record<string, string> = {
  '填空题': 'fillblank',
  '填空': 'fillblank',
  '选择题': 'choice',
  '选择': 'choice',
  '判断题': 'truefalse',
  '判断': 'truefalse',
  '问答题': 'essay',
  '问答': 'essay',
  '解答题': 'essay',
  '解答': 'essay',
  '证明题': 'essay',
  '证明': 'essay',
  '计算题': 'essay',
  '计算': 'essay',
  '匹配题': 'match',
  '排序题': 'ordering',
}

const DIFFICULTY_MAP: Record<string, string> = {
  '简单': 'easy',
  '容易': 'easy',
  '基础': 'easy',
  '易': 'easy',
  '中等': 'medium',
  '标准': 'medium',
  '中': 'medium',
  '较难': 'hard',
  '难': 'hard',
  '困难': 'hard',
}

const SECTION_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function mapType(raw: unknown): string {
  const text = String(raw || '')
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (text.includes(key) || text === value) return value
  }
  return 'essay'
}

function mapDifficulty(raw: unknown): string {
  const text = String(raw || '')
  if (text === 'easy' || text === 'medium' || text === 'hard') return text
  for (const [key, value] of Object.entries(DIFFICULTY_MAP)) {
    if (text.includes(key)) return value
  }
  return 'medium'
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value == null) return ''
  return String(value).trim()
}

function numberValue(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function defaultAnswer(questionType: string): Record<string, unknown> {
  switch (questionType) {
    case 'choice': return { type: 'choice', selectedOptionId: '' }
    case 'truefalse': return { type: 'truefalse', value: true }
    case 'fillblank': return { type: 'fillblank', blanks: [''] }
    case 'essay': return { type: 'essay', referenceAnswer: '' }
    case 'match': return { type: 'match', pairs: [] }
    case 'ordering': return { type: 'ordering', orderedItems: [] }
    default: return { type: 'essay', referenceAnswer: '' }
  }
}

function normalizeAnswer(questionType: string, rawAnswer: unknown, fallbackText = ''): Record<string, unknown> {
  if (rawAnswer && typeof rawAnswer === 'object' && !Array.isArray(rawAnswer)) {
    const obj = rawAnswer as Record<string, unknown>
    if (typeof obj.type === 'string') return obj
  }

  const answerText = textValue(rawAnswer) || fallbackText.trim()
  if (!answerText) return defaultAnswer(questionType)

  switch (questionType) {
    case 'choice':
      return { type: 'choice', selectedOptionId: answerText }
    case 'truefalse':
      return { type: 'truefalse', value: /^(true|对|正确|是)$/i.test(answerText) }
    case 'fillblank':
      return { type: 'fillblank', blanks: [answerText] }
    case 'match':
      return { type: 'match', pairs: [] }
    case 'ordering':
      return { type: 'ordering', orderedItems: answerText.split(/[，,;；]/).map((item) => item.trim()).filter(Boolean) }
    default:
      return { type: 'essay', referenceAnswer: answerText }
  }
}

function normalizeOptions(value: unknown): Array<{ id: string; label: string; content: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const options = value
    .map((item, index) => {
      const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const label = textValue(raw.label) || String.fromCharCode(65 + index)
      const content = textValue(raw.content || raw.text || raw.value)
      if (!content) return null
      return { id: textValue(raw.id) || label.toLowerCase(), label, content }
    })
    .filter((item): item is { id: string; label: string; content: string } => item !== null)
  return options.length > 0 ? options : undefined
}

function stripComments(text: string): string {
  return text.replace(/(^|[^\\])%.*/gm, '$1')
}

function cleanTex(text: string): string {
  return stripComments(text)
    .replace(/\\begin\{center\}[\s\S]*?第\s*\d+\s*页[\s\S]*?\\end\{center\}/g, '')
    .replace(/\\vspace\{[^}]*\}/g, '')
    .replace(/\\hrule/g, '')
    .replace(/\\newpage/g, '')
    .replace(/\\noindent/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function plainText(tex: string): string {
  return cleanTex(tex)
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
    .replace(/\\item\[[^\]]*\]/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, (_match, arg) => arg ? String(arg) : ' ')
    .replace(/[{}$\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleFromContent(content: string, fallback: string): string {
  const text = plainText(content)
  return text ? text.slice(0, 40) : fallback
}

function sectionNumber(title: string, index: number): string {
  const match = title.match(/^([一二三四五六七八九十]+)、/)
  return match?.[1] || SECTION_NUMBERS[index] || String(index + 1)
}

function sectionBlocks(tex: string) {
  const blocks: Array<{ title: string; body: string; index: number }> = []
  const regex = /\\section\*\{([^}]*)\}([\s\S]*?)(?=\\section\*\{|\\end\{document\}|$)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(tex)) !== null) {
    blocks.push({ title: match[1].trim(), body: match[2], index: blocks.length })
  }
  return blocks
}

function questionItems(sectionBody: string) {
  const items: Array<{ number: string; body: string }> = []
  const regex = /\\textbf\{(\d+)\.\}([\s\S]*?)(?=(?:\\vspace\{[^}]*\}\s*)?(?:\\noindent\s*)?\\textbf\{\d+\.\}|$)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(sectionBody)) !== null) {
    const body = cleanTex(match[2])
    if (body) items.push({ number: match[1], body })
  }
  return items
}

function answerItems(sectionBody: string) {
  const items: Array<{ number: string; body: string }> = []
  const blockRegex = /\\begin\{answer\}([\s\S]*?)\\end\{answer\}/g
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = blockRegex.exec(sectionBody)) !== null) {
    const answerBody = blockMatch[1]
    const match = answerBody.match(/\\textbf\{(\d+)\.\}([\s\S]*)/)
    if (!match) continue
    const body = cleanTex(match[2])
    items.push({ number: match[1], body })
  }
  return items
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

function splitQuestionAndAnswer(tex: string) {
  const uncommented = stripComments(tex)
  const marker = findAnswerMarker(uncommented)
  if (marker < 0) return { questionTex: uncommented, answerTex: '' }
  return {
    questionTex: uncommented.slice(0, marker),
    answerTex: uncommented.slice(marker),
  }
}

async function readBlueprintMap(buildDir: string): Promise<Map<string, BlueprintEntry>> {
  const blueprintPath = path.join(buildDir, 'blueprint.jsonl')
  const map = new Map<string, BlueprintEntry>()
  try {
    const content = await fs.readFile(blueprintPath, 'utf-8')
    for (const line of content.trim().split('\n').filter((item) => item.trim())) {
      try {
        const entry = JSON.parse(line) as BlueprintEntry
        if (entry.no) map.set(entry.no, entry)
      } catch {
        // Ignore malformed rows; generated paper parsing can still proceed.
      }
    }
  } catch {
    // Blueprint is optional.
  }
  return map
}

function normalizeGeneratedQuestion(raw: Record<string, unknown>, now: number): BankQuestion | null {
  const qType = mapType(raw.type || raw.questionType)
  const content = textValue(raw.content || raw.stem || raw.question)
  if (!content) return null

  const answerText = textValue(raw.referenceAnswer || raw.solution || raw.explanation)
  const options = normalizeOptions(raw.options)
  return {
    id: textValue(raw.id) || generateId(),
    type: qType,
    title: textValue(raw.title) || titleFromContent(content, '未命名题目'),
    content,
    options,
    answer: normalizeAnswer(qType, raw.answer, answerText),
    difficulty: mapDifficulty(raw.difficulty),
    score: numberValue(raw.score || raw.points || raw.point || raw.scorePerQuestion),
    knowledgePoints: Array.isArray(raw.knowledgePoints)
      ? raw.knowledgePoints.map(textValue).filter(Boolean)
      : Array.isArray(raw.knowledge_points)
        ? raw.knowledge_points.map(textValue).filter(Boolean)
        : [],
    explanation: answerText || textValue(raw.explanation) || undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export async function convertStructuredQuestionGroups(buildDir: string): Promise<BankQuestionGroup[]> {
  const files = await fs.readdir(buildDir).catch(() => [] as string[])
  const questionFiles = files
    .filter((file) => /^paper-\d+-questions\.json$/i.test(file))
    .sort()
  const now = Date.now()
  const groups: BankQuestionGroup[] = []

  for (const file of questionFiles) {
    try {
      const match = file.match(/^paper-(\d+)-questions\.json$/i)
      const index = match ? Number(match[1]) : groups.length + 1
      const data = JSON.parse(await fs.readFile(path.join(buildDir, file), 'utf-8'))
      const rows = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : []
      const questions: BankQuestion[] = []
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const question = normalizeGeneratedQuestion(row as Record<string, unknown>, now)
        if (question) questions.push(question)
      }
      if (questions.length > 0) {
        groups.push({ index, filename: 'paper-' + index, questions })
      }
    } catch {
      // Keep scanning other files.
    }
  }

  return groups
}

export async function convertStructuredQuestions(buildDir: string): Promise<BankQuestion[]> {
  return (await convertStructuredQuestionGroups(buildDir)).flatMap((group) => group.questions)
}

function paperIndexFromFile(file: string, fallback: number): number {
  const match = file.match(/^paper-(\d+)\.tex$/i)
  return match ? Number(match[1]) : fallback
}

async function extractQuestionsFromPaperFile(
  buildDir: string,
  paperFile: string,
  blueprint: Map<string, BlueprintEntry>,
  now: number,
): Promise<BankQuestion[]> {
  const tex = await fs.readFile(path.join(buildDir, paperFile), 'utf-8')
  const { questionTex, answerTex } = splitQuestionAndAnswer(tex)
  const answers = new Map<string, string>()
  const questions: BankQuestion[] = []

  sectionBlocks(answerTex).forEach((section, sectionIdx) => {
    const secNo = sectionNumber(section.title, sectionIdx)
    answerItems(section.body).forEach((item) => {
      answers.set(secNo + '.' + item.number, item.body)
    })
  })

  sectionBlocks(questionTex).forEach((section, sectionIdx) => {
    const secNo = sectionNumber(section.title, sectionIdx)
    questionItems(section.body).forEach((item) => {
      const no = secNo + '.' + item.number
      const meta = blueprint.get(no)
      const qType = mapType(meta?.type || section.title)
      const answerText = answers.get(no) || ''
      const content = item.body
      const title = meta?.kp ? meta.kp + '（' + no + '）' : titleFromContent(content, section.title + ' 第' + item.number + '题')

      questions.push({
        id: generateId(),
        type: qType,
        title,
        content,
        answer: normalizeAnswer(qType, answerText, answerText),
        difficulty: mapDifficulty(meta?.difficulty),
        score: numberValue(meta?.points),
        knowledgePoints: meta?.kp ? [meta.kp] : [],
        explanation: answerText || undefined,
        createdAt: now,
        updatedAt: now,
      })
    })
  })

  return questions
}

export async function extractQuestionGroupsFromPapers(buildDir: string): Promise<BankQuestionGroup[]> {
  const files = await fs.readdir(buildDir).catch(() => [] as string[])
  const paperFiles = files
    .filter((file) => /^paper-\d+\.tex$/i.test(file))
    .sort()

  if (paperFiles.length === 0) return []

  const blueprint = await readBlueprintMap(buildDir)
  const now = Date.now()
  const groups: BankQuestionGroup[] = []

  for (let i = 0; i < paperFiles.length; i++) {
    const paperFile = paperFiles[i]
    const index = paperIndexFromFile(paperFile, i + 1)
    const questions = await extractQuestionsFromPaperFile(buildDir, paperFile, blueprint, now)
    if (questions.length > 0) {
      groups.push({ index, filename: 'paper-' + index, questions })
    }
  }

  return groups
}

export async function extractQuestionsFromPapers(buildDir: string): Promise<BankQuestion[]> {
  return (await extractQuestionGroupsFromPapers(buildDir)).flatMap((group) => group.questions)
}

export async function convertBlueprintToQuestions(buildDir: string): Promise<BankQuestion[]> {
  const blueprintPath = path.join(buildDir, 'blueprint.jsonl')
  let lines: string[] = []

  try {
    const content = await fs.readFile(blueprintPath, 'utf-8')
    lines = content.trim().split('\n').filter((line) => line.trim())
  } catch {
    return []
  }

  const now = Date.now()
  const questions: BankQuestion[] = []

  for (const line of lines) {
    let entry: BlueprintEntry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    const qType = mapType(entry.type)
    questions.push({
      id: generateId(),
      type: qType,
      title: entry.kp + '（' + entry.no + '）',
      content: '来源：' + entry.src + '\n\n原题号：' + entry.no + '\n分值：' + entry.points + ' 分\n认知层次：' + entry.cognition + '\n题型：' + entry.type + '\n\n> 题目内容待补充，请根据源文件编辑。',
      answer: defaultAnswer(qType),
      difficulty: mapDifficulty(entry.difficulty),
      score: numberValue(entry.points),
      knowledgePoints: [entry.kp],
      createdAt: now,
      updatedAt: now,
    })
  }

  return questions
}

export async function extractQuestionGroupsFromBuildDir(buildDir: string): Promise<GroupExtractionResult> {
  const structured = await convertStructuredQuestionGroups(buildDir)
  if (structured.length > 0) return { source: 'structured', papers: structured }

  const paperGroups = await extractQuestionGroupsFromPapers(buildDir)
  if (paperGroups.length > 0) return { source: 'paper', papers: paperGroups }

  const blueprintQuestions = await convertBlueprintToQuestions(buildDir)
  if (blueprintQuestions.length > 0) {
    return { source: 'blueprint', papers: [{ index: 1, filename: 'paper-1', questions: blueprintQuestions }] }
  }

  return { source: 'none', papers: [] }
}

export async function extractQuestionsFromBuildDir(buildDir: string): Promise<ExtractionResult> {
  const result = await extractQuestionGroupsFromBuildDir(buildDir)
  return { source: result.source, questions: result.papers.flatMap((group) => group.questions) }
}
