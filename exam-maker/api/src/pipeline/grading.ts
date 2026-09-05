function normalize(str: string): string {
  return str.replace(/\s+/g, '').replace(/[，,。.]/g, '').toLowerCase()
}

function answerToText(answer: Record<string, any> | null | undefined): string {
  if (!answer) return ''
  if (typeof answer === 'string') return answer
  if (Array.isArray(answer)) return answer.map((item) => answerToText(item)).join(' ')

  switch (answer.type) {
    case 'choice':
      return String(answer.selectedOptionId || '')
    case 'truefalse':
      return answer.value === true ? '正确' : answer.value === false ? '错误' : ''
    case 'fillblank':
      return (answer.blanks || []).map((item: unknown) => String(item || '')).join(' ')
    case 'essay':
      return String(answer.referenceAnswer || '')
    case 'match':
      return (answer.pairs || []).map((pair: any) => String(pair.left || '') + ' ' + String(pair.right || '')).join(' ')
    case 'ordering':
      return (answer.orderedItems || []).map((item: unknown) => String(item || '')).join(' ')
    default:
      return Object.values(answer).map((item) => typeof item === 'string' ? item : '').join(' ')
  }
}

function countBlankMarkers(text: string): number {
  const commandBlanks = (text.match(/\\(?:underline|blank|fillin)\s*(?:\{[^}]*\})?/g) || []).length
  const lineBlanks = (text.match(/(?:_{2,}|＿{2,}|-{4,}|—{2,}|…{2,})/g) || []).length
  return commandBlanks + lineBlanks
}

export function inferFillBlankCount(title: unknown, content: unknown, fallbackCount = 1): number {
  const markerCount = countBlankMarkers([title, content].map((item) => String(item || "")).join("\n"))
  if (markerCount > 0) return markerCount
  const fallback = Number(fallbackCount)
  return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : 1
}

function tokenizeForSuggestion(text: string): string[] {
  const cleaned = text
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}$\\]/g, ' ')
    .replace(/[，。！？；：、,.!?;:\[\]()（）]/g, ' ')
    .toLowerCase()

  const tokens = cleaned.match(/[a-z0-9]{2,}|[\u4e00-\u9fa5]{2,}/g) || []
  return Array.from(new Set(tokens)).slice(0, 24)
}

export function formatAnswerForReview(answer: Record<string, any> | null | undefined): string {
  const text = answerToText(answer).trim()
  return text || '未作答'
}

export function suggestManualGrade(
  questionType: string,
  correctAnswer: Record<string, any>,
  studentAnswer: Record<string, any> | null,
  maxScore: number,
): { score: number; confidence: number; feedback: string; matchedKeywords: string[]; missingKeywords: string[] } {
  if (!studentAnswer || !answerToText(studentAnswer).trim()) {
    return { score: 0, confidence: 0.95, feedback: '学生未作答，建议 0 分。', matchedKeywords: [], missingKeywords: tokenizeForSuggestion(answerToText(correctAnswer)).slice(0, 6) }
  }

  if (questionType !== 'essay') {
    const result = gradeAnswer(questionType, correctAnswer, studentAnswer, maxScore)
    const feedback = result.isCorrect === 1
      ? '客观题答案匹配，建议给满分。'
      : result.score > 0
        ? '答案部分匹配，建议按自动评分结果复核。'
        : '答案与参考答案不匹配，建议 0 分。'
    return { score: result.score, confidence: 0.9, feedback, matchedKeywords: [], missingKeywords: [] }
  }

  const referenceText = answerToText(correctAnswer)
  const studentText = answerToText(studentAnswer)
  const referenceTokens = tokenizeForSuggestion(referenceText)
  const studentTokens = tokenizeForSuggestion(studentText)

  if (referenceTokens.length === 0) {
    const lengthRatio = Math.min(1, studentText.trim().length / 120)
    const score = Math.round(maxScore * lengthRatio * 0.6 * 10) / 10
    return {
      score,
      confidence: 0.35,
      feedback: '参考答案较少，建议按学生作答完整度人工复核。',
      matchedKeywords: [],
      missingKeywords: [],
    }
  }

  const matchedKeywords = referenceTokens.filter((token) => studentTokens.some((item) => item.includes(token) || token.includes(item)))
  const missingKeywords = referenceTokens.filter((token) => !matchedKeywords.includes(token)).slice(0, 8)
  const coverage = matchedKeywords.length / referenceTokens.length
  const lengthRatio = Math.min(1, studentText.trim().length / Math.max(40, referenceText.trim().length * 0.45))
  const rawScore = maxScore * (coverage * 0.75 + lengthRatio * 0.25)
  const score = Math.max(0, Math.min(maxScore, Math.round(rawScore * 10) / 10))
  const confidence = Math.round(Math.min(0.9, Math.max(0.35, 0.35 + coverage * 0.5)) * 100) / 100

  const feedback = coverage >= 0.75
    ? '核心要点覆盖较充分，建议接近满分，仍需核对论证过程。'
    : coverage >= 0.4
      ? '覆盖了部分关键要点，建议中等给分并关注缺失点。'
      : '关键要点覆盖不足，建议低分并人工确认是否有等价表述。'

  return { score, confidence, feedback, matchedKeywords: matchedKeywords.slice(0, 8), missingKeywords }
}

export function gradeAnswer(
  questionType: string,
  correctAnswer: Record<string, any>,
  studentAnswer: Record<string, any> | null,
  maxScore: number,
  blankCount?: number,
): { score: number; maxScore: number; isCorrect: number | null } {
  if (!studentAnswer) {
    return { score: 0, maxScore, isCorrect: 0 }
  }

  switch (questionType) {
    case 'choice': {
      const correct = correctAnswer.selectedOptionId === studentAnswer.selectedOptionId
      return { score: correct ? maxScore : 0, maxScore, isCorrect: correct ? 1 : 0 }
    }

    case 'truefalse': {
      const correct = correctAnswer.value === studentAnswer.value
      return { score: correct ? maxScore : 0, maxScore, isCorrect: correct ? 1 : 0 }
    }

    case 'fillblank': {
      const correctBlanks = correctAnswer.blanks || []
      const expectedCount = Number.isFinite(Number(blankCount)) && Number(blankCount) > 0
        ? Math.floor(Number(blankCount))
        : correctBlanks.length
      const effectiveCorrectBlanks = expectedCount > 0 ? correctBlanks.slice(0, expectedCount) : correctBlanks
      const studentBlanks = studentAnswer.blanks || []
      let correctCount = 0
      for (let i = 0; i < effectiveCorrectBlanks.length; i++) {
        if (i < studentBlanks.length && normalize(studentBlanks[i]) === normalize(effectiveCorrectBlanks[i])) {
          correctCount++
        }
      }
      const score = effectiveCorrectBlanks.length > 0 ? (correctCount / effectiveCorrectBlanks.length) * maxScore : 0
      const isCorrect = correctCount === effectiveCorrectBlanks.length ? 1 : correctCount > 0 ? null : 0
      return { score: Math.round(score * 10) / 10, maxScore, isCorrect }
    }

    case 'match': {
      const correctPairs = correctAnswer.pairs || []
      const studentPairs = studentAnswer.pairs || []
      let matchCount = 0
      for (const cp of correctPairs) {
        const sp = studentPairs.find((p: any) => p.left === cp.left)
        if (sp && sp.right === cp.right) matchCount++
      }
      const score = correctPairs.length > 0 ? (matchCount / correctPairs.length) * maxScore : 0
      return { score: Math.round(score * 10) / 10, maxScore, isCorrect: matchCount === correctPairs.length ? 1 : 0 }
    }

    case 'ordering': {
      const correct = correctAnswer.orderedItems || []
      const student = studentAnswer.orderedItems || []
      if (correct.length === 0) return { score: maxScore, maxScore, isCorrect: 1 }
      const match = JSON.stringify(correct) === JSON.stringify(student)
      return { score: match ? maxScore : 0, maxScore, isCorrect: match ? 1 : 0 }
    }

    case 'essay':
    default: {
      // Essay questions marked for manual grading
      return { score: 0, maxScore, isCorrect: null }
    }
  }
}

export function autoGradeSubmission(
  examQuestions: Array<{ questionId: string; score: number; order: number }>,
  questionsMap: Map<string, any>,
  studentAnswers: Record<string, any>
): { totalScore: number; totalPoints: number; answers: Array<{ questionId: string; questionOrder: number; answer: any; score: number; maxScore: number; isCorrect: number | null; gradedBy: string }> } {
  let totalScore = 0
  let totalPoints = 0
  const answers: any[] = []

  for (const eq of examQuestions) {
    const question = questionsMap.get(eq.questionId)
    const studentAnswer = studentAnswers[eq.questionId] || null
    const answerBlankCount = Array.isArray(question?.answer?.blanks) ? question.answer.blanks.length : 1
    const blankCount = question?.type === 'fillblank' ? inferFillBlankCount(question?.title, question?.content, answerBlankCount) : undefined
    const result = gradeAnswer(question?.type || 'essay', question?.answer || {}, studentAnswer, eq.score, blankCount)

    totalScore += result.score
    totalPoints += eq.score

    answers.push({
      questionId: eq.questionId,
      questionOrder: eq.order,
      answer: JSON.stringify(studentAnswer),
      score: result.score,
      maxScore: eq.score,
      isCorrect: result.isCorrect,
      gradedBy: result.isCorrect === null ? 'manual' : 'auto',
    })
  }

  return { totalScore, totalPoints, answers }
}
