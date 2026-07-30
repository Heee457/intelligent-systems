import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Question, QuestionType, Difficulty } from '../types'
import { generateId } from '../utils/id'

interface QuestionFilter {
  type?: QuestionType
  difficulty?: Difficulty
  knowledgePoint?: string
  keyword?: string
}

interface QuestionState {
  questions: Question[]

  // CRUD
  addQuestion: (q: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>) => Question
  updateQuestion: (id: string, data: Partial<Question>) => void
  deleteQuestion: (id: string) => void
  deleteQuestions: (ids: string[]) => void
  getQuestion: (id: string) => Question | undefined

  // 批量修改
  batchSetDifficulty: (ids: string[], difficulty: Difficulty) => void
  batchAddKnowledgePoint: (ids: string[], kp: string) => void
  batchRemoveKnowledgePoint: (ids: string[], kp: string) => void

  // 过滤搜索
  getFilteredQuestions: (filter: QuestionFilter) => Question[]

  // 导入导出
  exportQuestions: () => string
  importQuestions: (json: string) => number
}

export const useQuestionStore = create<QuestionState>()(
  persist(
    (set, get) => ({
      questions: [],

      addQuestion: (q) => {
        const now = Date.now()
        const question: Question = { ...q, id: generateId(), createdAt: now, updatedAt: now }
        set((s) => ({ questions: [...s.questions, question] }))
        return question
      },

      updateQuestion: (id, data) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === id ? { ...q, ...data, updatedAt: Date.now() } : q,
          ),
        })),

      deleteQuestion: (id) =>
        set((s) => ({ questions: s.questions.filter((q) => q.id !== id) })),

      deleteQuestions: (ids) =>
        set((s) => ({ questions: s.questions.filter((q) => !ids.includes(q.id)) })),

      getQuestion: (id) => get().questions.find((q) => q.id === id),

      batchSetDifficulty: (ids, difficulty) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id) ? { ...q, difficulty, updatedAt: Date.now() } : q,
          ),
        })),

      batchAddKnowledgePoint: (ids, kp) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id) && !q.knowledgePoints.includes(kp)
              ? { ...q, knowledgePoints: [...q.knowledgePoints, kp], updatedAt: Date.now() }
              : q,
          ),
        })),

      batchRemoveKnowledgePoint: (ids, kp) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            ids.includes(q.id)
              ? { ...q, knowledgePoints: q.knowledgePoints.filter((p) => p !== kp), updatedAt: Date.now() }
              : q,
          ),
        })),

      getFilteredQuestions: (filter) => {
        let result = get().questions
        if (filter.type) result = result.filter((q) => q.type === filter.type)
        if (filter.difficulty) result = result.filter((q) => q.difficulty === filter.difficulty)
        if (filter.knowledgePoint)
          result = result.filter((q) =>
            q.knowledgePoints.some((kp) => kp.includes(filter.knowledgePoint!)),
          )
        if (filter.keyword) {
          const kw = filter.keyword.toLowerCase()
          result = result.filter(
            (q) =>
              q.title.toLowerCase().includes(kw) || q.content.toLowerCase().includes(kw),
          )
        }
        return result
      },

      exportQuestions: () => JSON.stringify(get().questions, null, 2),

      importQuestions: (json) => {
        const parsed = JSON.parse(json) as Question[]
        set((s) => {
          const existingIds = new Set(s.questions.map((q) => q.id))
          const newQuestions = parsed.filter((q) => !existingIds.has(q.id))
          return { questions: [...s.questions, ...newQuestions] }
        })
        return parsed.filter((q) => !get().questions.map((x) => x.id).includes(q.id)).length
      },
    }),
    { name: 'exam-maker-questions' },
  ),
)
