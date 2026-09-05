import { create } from 'zustand'
import type { Exam, GenerationRule } from '../types'
import { useAuthStore } from './authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

interface ExamState {
  exams: Exam[]
  loading: boolean
  generationWarnings: string[]

  fetchExams: () => Promise<void>
  createExam: (title: string) => Promise<Exam | null>
  deleteExam: (id: string) => Promise<void>
  updateExam: (id: string, data: Partial<Exam>) => Promise<void>
  addQuestionToExam: (examId: string, questionId: string, score: number) => Promise<void>
  removeQuestionFromExam: (examId: string, questionId: string) => Promise<void>
  generateExamFromRule: (rule: GenerationRule) => Promise<Exam | null>
  createExamVersion: (id: string, title?: string) => Promise<Exam | null>
  generateRemedialExam: (payload: { publishId: string; mode: 'practice' | 'retake'; knowledgePoints: string[]; maxQuestions?: number }) => Promise<Exam | null>
}

export const useExamStore = create<ExamState>()((set, get) => ({
  exams: [],
  loading: false,
  generationWarnings: [],

  fetchExams: async () => {
    set({ loading: true })
    const res = await fetch(`${API}/api/exams`, { headers: headers() })
    const data = await res.json()
    set({ exams: Array.isArray(data) ? data : data.exams || [], loading: false })
  },

  createExam: async (title) => {
    const res = await fetch(`${API}/api/exams`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ title, questions: [], totalScore: 0 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams] }))
    return data.exam
  },

  deleteExam: async (id) => {
    await fetch(`${API}/api/exams/${id}`, { method: 'DELETE', headers: headers() })
    set((s) => ({ exams: s.exams.filter((e) => e.id !== id) }))
  },

  updateExam: async (id, data) => {
    const res = await fetch(API + '/api/exams/' + id, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => null)
      throw new Error(error?.error || '试卷更新失败')
    }
    const payload = await res.json().catch(() => null)
    const updated = payload?.exam ? payload.exam : { ...data, updatedAt: Date.now() }
    set((s) => ({ exams: s.exams.map((e) => e.id === id ? { ...e, ...updated } : e) }))
  },

  addQuestionToExam: async (examId, questionId, score) => {
    const exam = get().exams.find((e) => e.id === examId)
    if (!exam) return
    const questions = [...exam.questions, { questionId, score, order: exam.questions.length + 1 }]
    const totalScore = questions.reduce((s, q) => s + q.score, 0)
    await get().updateExam(examId, { questions, totalScore })
  },

  removeQuestionFromExam: async (examId, questionId) => {
    const exam = get().exams.find((e) => e.id === examId)
    if (!exam) return
    const questions = exam.questions.filter((q) => q.questionId !== questionId).map((q, i) => ({ ...q, order: i + 1 }))
    const totalScore = questions.reduce((s, q) => s + q.score, 0)
    await get().updateExam(examId, { questions, totalScore })
  },

  generateExamFromRule: async (rule) => {
    const res = await fetch(`${API}/api/exams/generate`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(rule),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams], generationWarnings: data.warnings || [] }))
    return data.exam
  },
  createExamVersion: async (id, title) => {
    const res = await fetch(API + '/api/exams/' + id + '/versions', {
      method: 'POST', headers: headers(),
      body: JSON.stringify(title ? { title } : {}),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams] }))
    return data.exam
  },
  generateRemedialExam: async (payload) => {
    const res = await fetch(`${API}/api/exams/remedial`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    const data = await res.json()
    set((s) => ({ exams: [data.exam, ...s.exams], generationWarnings: data.warnings || [] }))
    return data.exam
  },
}))
