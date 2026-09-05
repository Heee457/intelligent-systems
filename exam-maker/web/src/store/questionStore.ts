import { create } from 'zustand'
import type { Question, QuestionType, Difficulty } from '../types'
import { useAuthStore } from './authStore'

interface QuestionFilter {
  type?: QuestionType
  difficulty?: Difficulty
  knowledgePoint?: string
  keyword?: string
}

export interface QualityQuestion {
  id: string
  type: QuestionType
  title: string
  content: string
  difficulty: Difficulty
  knowledgePoints: string[]
  qualityIssues: string[]
  qualityCheckedAt?: number
  difficultySuggestion?: Difficulty
  difficultySuggestionReason?: string
  isKeyQuestion: boolean
  isErrorProne: boolean
  attempts: number
  scoreRate?: number
}

export interface DuplicateGroup {
  id: string
  reason: string
  similarity: number
  questions: QualityQuestion[]
}

export interface QualityReport {
  checkedAt: number
  summary: {
    total: number
    issueCount: number
    duplicateGroupCount: number
    difficultySuggestionCount: number
    errorProneCount: number
    keyQuestionCount: number
  }
  issueQuestions: QualityQuestion[]
  duplicateGroups: DuplicateGroup[]
  difficultySuggestions: QualityQuestion[]
  errorProneQuestions: QualityQuestion[]
}

interface QuestionState {
  questions: Question[]
  loading: boolean
  error: string | null
  qualityReport: QualityReport | null
  qualityLoading: boolean

  fetchQuestions: (filter?: QuestionFilter) => Promise<void>
  addQuestion: (q: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Question | null>
  updateQuestion: (id: string, data: Partial<Question>) => Promise<void>
  deleteQuestion: (id: string) => Promise<void>
  deleteQuestions: (ids: string[]) => Promise<void>
  batchSetDifficulty: (ids: string[], difficulty: Difficulty) => Promise<void>
  importQuestions: (json: string) => Promise<number>
  exportQuestions: () => Promise<string>
  fetchQualityReport: () => Promise<void>
  recomputeQualityReport: () => Promise<void>
}

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
}

export const useQuestionStore = create<QuestionState>()((set, get) => ({
  questions: [],
  loading: false,
  error: null,
  qualityReport: null,
  qualityLoading: false,

  fetchQuestions: async (filter) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (filter?.type) params.set('type', filter.type)
      if (filter?.difficulty) params.set('difficulty', filter.difficulty)
      if (filter?.knowledgePoint) params.set('kp', filter.knowledgePoint)
      if (filter?.keyword) params.set('keyword', filter.keyword)

      const res = await fetch(API + '/api/questions?' + params, { headers: headers() })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      set({ questions: data.questions, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  addQuestion: async (q) => {
    const res = await fetch(API + '/api/questions', {
      method: 'POST', headers: headers(),
      body: JSON.stringify(q),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ questions: [data.question, ...s.questions] }))
    return data.question
  },

  updateQuestion: async (id, data) => {
    const res = await fetch(API + '/api/questions/' + id, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify(data),
    })
    if (!res.ok) return
    const payload = await res.json()
    set((s) => ({ questions: s.questions.map((q) => q.id === id ? payload.question : q) }))
  },

  deleteQuestion: async (id) => {
    await fetch(API + '/api/questions/' + id, { method: 'DELETE', headers: headers() })
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }))
  },

  deleteQuestions: async (ids) => {
    for (const id of ids) {
      await fetch(API + '/api/questions/' + id, { method: 'DELETE', headers: headers() })
    }
    set((s) => ({ questions: s.questions.filter((q) => !ids.includes(q.id)) }))
  },

  batchSetDifficulty: async (ids, difficulty) => {
    for (const id of ids) {
      await fetch(API + '/api/questions/' + id, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ difficulty }),
      })
    }
    set((s) => ({ questions: s.questions.map((q) => ids.includes(q.id) ? { ...q, difficulty } : q) }))
  },

  importQuestions: async (json) => {
    const parsed = JSON.parse(json)
    const res = await fetch(API + '/api/questions/import', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ questions: Array.isArray(parsed) ? parsed : parsed.questions }),
    })
    const data = await res.json()
    get().fetchQuestions()
    get().fetchQualityReport()
    return data.imported
  },

  exportQuestions: async () => {
    const res = await fetch(API + '/api/questions/export', { headers: headers() })
    const data = await res.json()
    return JSON.stringify(data, null, 2)
  },

  fetchQualityReport: async () => {
    set({ qualityLoading: true })
    try {
      const res = await fetch(API + '/api/questions/quality', { headers: headers() })
      if (!res.ok) throw new Error('Failed to fetch quality report')
      const data = await res.json()
      set({ qualityReport: data.report, qualityLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, qualityLoading: false })
    }
  },

  recomputeQualityReport: async () => {
    set({ qualityLoading: true })
    try {
      const res = await fetch(API + '/api/questions/quality/recompute', { method: 'POST', headers: headers(), body: JSON.stringify({}) })
      if (!res.ok) throw new Error('Failed to recompute quality report')
      const data = await res.json()
      set({ qualityReport: data.report, qualityLoading: false })
      await get().fetchQuestions()
    } catch (err) {
      set({ error: (err as Error).message, qualityLoading: false })
    }
  },
}))
