import type { Question, GenerationRule, ExamQuestion, RuleSection } from '../types'

// Fisher-Yates 洗牌
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function matchSection(pool: Question[], section: RuleSection): Question[] {
  let filtered = pool.filter((q) => q.type === section.type)

  if (section.difficulty) {
    filtered = filtered.filter((q) => q.difficulty === section.difficulty)
  }

  if (section.knowledgePoints && section.knowledgePoints.length > 0) {
    filtered = filtered.filter((q) =>
      section.knowledgePoints!.some((kp) =>
        q.knowledgePoints.some((qkp) => qkp.includes(kp)),
      ),
    )
  }

  return shuffle(filtered).slice(0, section.count)
}

export function generateExam(
  rule: GenerationRule,
  pool: Question[],
): { examQuestions: ExamQuestion[]; totalScore: number } {
  let order = 1
  const examQuestions: ExamQuestion[] = []

  for (const section of rule.sections) {
    const matched = matchSection(pool, section)
    for (const q of matched) {
      examQuestions.push({
        questionId: q.id,
        score: section.scorePerQuestion,
        order: order++,
      })
    }
  }

  const totalScore = examQuestions.reduce((sum, eq) => sum + eq.score, 0)

  return { examQuestions, totalScore }
}
