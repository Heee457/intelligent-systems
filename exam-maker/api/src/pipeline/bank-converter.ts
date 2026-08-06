import fs from 'fs/promises'
import path from 'path'
import { generateId } from '../utils/id'

// Mirrors the shared Question type structure for server-side generation
interface BankQuestion {
  id: string
  type: string
  title: string
  content: string
  options?: Array<{ id: string; label: string; content: string }>
  answer: Record<string, unknown>
  difficulty: string
  knowledgePoints: string[]
  explanation?: string
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

// Map Chinese type names to QuestionType enum values
const TYPE_MAP: Record<string, string> = {
  '填空题': 'fillblank',
  '选择题': 'choice',
  '判断题': 'truefalse',
  '问答题': 'essay',
  '解答题': 'essay',
  '证明题': 'essay',
  '计算题': 'essay',
  '匹配题': 'match',
  '排序题': 'ordering',
}

// Map Chinese difficulty to Difficulty enum values
const DIFFICULTY_MAP: Record<string, string> = {
  '简单': 'easy',
  '容易': 'easy',
  '中等': 'medium',
  '较难': 'hard',
  '难': 'hard',
  '困难': 'hard',
}

function mapType(chineseType: string): string {
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (chineseType.includes(key)) return value
  }
  return 'essay' // default
}

function mapDifficulty(chineseDiff: string): string {
  return DIFFICULTY_MAP[chineseDiff] || 'medium'
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

/**
 * Convert pipeline blueprint.jsonl entries into Question Bank format.
 * Reads the structured metadata from blueprint.jsonl and generates
 * skeleton questions that users can then edit/flesh out.
 */
export async function convertBlueprintToQuestions(
  buildDir: string,
): Promise<BankQuestion[]> {
  const blueprintPath = path.join(buildDir, 'blueprint.jsonl')
  let lines: string[] = []

  try {
    const content = await fs.readFile(blueprintPath, 'utf-8')
    lines = content.trim().split('\n').filter((l) => l.trim())
  } catch {
    return [] // No blueprint file — nothing to convert
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
    const question: BankQuestion = {
      id: generateId(),
      type: qType,
      title: `${entry.kp}（${entry.no}）`,
      content: `来源：${entry.src}\n\n原题号：${entry.no}\n分值：${entry.points} 分\n认知层次：${entry.cognition}\n题型：${entry.type}\n\n> 题目内容待补充，请根据源文件编辑。`,
      answer: defaultAnswer(qType),
      difficulty: mapDifficulty(entry.difficulty),
      knowledgePoints: [entry.kp],
      createdAt: now,
      updatedAt: now,
    }

    questions.push(question)
  }

  return questions
}

/**
 * Scan the build directory for paper files and extract question-level
 * information. Used as a supplement when blueprint.jsonl is not available.
 */
export async function extractQuestionsFromPapers(
  buildDir: string,
): Promise<BankQuestion[]> {
  const files = await fs.readdir(buildDir).catch(() => [] as string[])
  const paperFiles = files
    .filter((f) => /^paper-\d+\.tex$/i.test(f))
    .sort()

  if (paperFiles.length === 0) return []

  // Read the first paper's content to get question sections
  const firstPaper = paperFiles[0]
  const content = await fs.readFile(path.join(buildDir, firstPaper), 'utf-8')

  // Extract \section*{...} blocks as question groups
  const sectionRegex = /\\section\*\{(.+?)\}\s*\n\s*\n((?:.|\n)*?)(?=\\section\*|$)/g
  const questions: BankQuestion[] = []
  const now = Date.now()
  let match

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionTitle = match[1].trim()
    const sectionBody = match[2].trim()

    // Try to determine question type from section title
    let qType = 'essay'
    if (sectionTitle.includes('填空')) qType = 'fillblank'
    else if (sectionTitle.includes('选择')) qType = 'choice'
    else if (sectionTitle.includes('判断')) qType = 'truefalse'
    else if (sectionTitle.includes('解答') || sectionTitle.includes('证明') || sectionTitle.includes('计算')) qType = 'essay'
    else if (sectionTitle.includes('匹配')) qType = 'match'
    else if (sectionTitle.includes('排序')) qType = 'ordering'

    // Try to parse individual questions within the section
    const itemRegex = /(\d+)\.\s+((?:.|\n)*?)(?=\n\d+\.\s|\n*$)/g
    let itemMatch

    while ((itemMatch = itemRegex.exec(sectionBody)) !== null) {
      const itemNum = itemMatch[1]
      const itemContent = itemMatch[2].trim().replace(/\n/g, ' ').substring(0, 200)

      const question: BankQuestion = {
        id: generateId(),
        type: qType,
        title: `${sectionTitle.replace(/（.+?）/, '')} 第${itemNum}题`,
        content: `试卷来源：${firstPaper}\n\n${itemContent}...`,
        answer: defaultAnswer(qType),
        difficulty: 'medium',
        knowledgePoints: [],
        createdAt: now,
        updatedAt: now,
      }

      questions.push(question)
    }
  }

  return questions
}
