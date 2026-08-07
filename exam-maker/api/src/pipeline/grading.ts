function normalize(str: string): string {
  return str.replace(/\s+/g, '').replace(/[，,。.]/g, '').toLowerCase()
}

export function gradeAnswer(
  questionType: string,
  correctAnswer: Record<string, any>,
  studentAnswer: Record<string, any> | null,
  maxScore: number
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
      const studentBlanks = studentAnswer.blanks || []
      let correctCount = 0
      for (let i = 0; i < correctBlanks.length; i++) {
        if (i < studentBlanks.length && normalize(studentBlanks[i]) === normalize(correctBlanks[i])) {
          correctCount++
        }
      }
      const score = correctBlanks.length > 0 ? (correctCount / correctBlanks.length) * maxScore : 0
      const isCorrect = correctCount === correctBlanks.length ? 1 : correctCount > 0 ? null : 0
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
    const result = gradeAnswer(question?.type || 'essay', question?.answer || {}, studentAnswer, eq.score)

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
