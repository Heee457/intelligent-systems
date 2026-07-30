import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Exam, ExamQuestion, GenerationRule, HistoryEntry } from '../types'
import { generateId } from '../utils/id'
import { generateExam } from '../utils/examGenerator'
import { useQuestionStore } from './questionStore'

interface ExamState {
  exams: Exam[]
  history: HistoryEntry[]

  createExam: (title: string) => Exam
  deleteExam: (id: string) => void
  duplicateExam: (id: string) => Exam | undefined
  updateExam: (id: string, data: Partial<Exam>) => void

  addQuestionToExam: (examId: string, questionId: string, score: number) => void
  removeQuestionFromExam: (examId: string, questionId: string) => void
  reorderExamQuestions: (examId: string, questionIds: string[]) => void
  setQuestionScore: (examId: string, questionId: string, score: number) => void

  generateExamFromRule: (rule: GenerationRule) => Exam

  clearHistory: () => void
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      exams: [],
      history: [],

      createExam: (title) => {
        const now = Date.now()
        const exam: Exam = {
          id: generateId(),
          title,
          questions: [],
          totalScore: 0,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ exams: [...s.exams, exam] }))
        return exam
      },

      deleteExam: (id) =>
        set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),

      duplicateExam: (id) => {
        const existing = get().exams.find((e) => e.id === id)
        if (!existing) return undefined
        const now = Date.now()
        const copy: Exam = {
          ...existing,
          id: generateId(),
          title: existing.title + ' (副本)',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ exams: [...s.exams, copy] }))
        return copy
      },

      updateExam: (id, data) =>
        set((s) => ({
          exams: s.exams.map((e) =>
            e.id === id ? { ...e, ...data, updatedAt: Date.now() } : e,
          ),
        })),

      addQuestionToExam: (examId, questionId, score) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const eq: ExamQuestion = {
              questionId,
              score,
              order: e.questions.length + 1,
            }
            const questions = [...e.questions, eq]
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      removeQuestionFromExam: (examId, questionId) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = e.questions
              .filter((q) => q.questionId !== questionId)
              .map((q, i) => ({ ...q, order: i + 1 }))
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      reorderExamQuestions: (examId, questionIds) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = questionIds
              .map((qid, i) => {
                const eq = e.questions.find((q) => q.questionId === qid)
                return eq ? { ...eq, order: i + 1 } : null
              })
              .filter(Boolean) as ExamQuestion[]
            return { ...e, questions, updatedAt: Date.now() }
          }),
        })),

      setQuestionScore: (examId, questionId, score) =>
        set((s) => ({
          exams: s.exams.map((e) => {
            if (e.id !== examId) return e
            const questions = e.questions.map((q) =>
              q.questionId === questionId ? { ...q, score } : q,
            )
            return {
              ...e,
              questions,
              totalScore: questions.reduce((sum, q) => sum + q.score, 0),
              updatedAt: Date.now(),
            }
          }),
        })),

      generateExamFromRule: (rule) => {
        const pool = useQuestionStore.getState().questions
        const { examQuestions, totalScore } = generateExam(rule, pool)
        const now = Date.now()
        const exam: Exam = {
          id: generateId(),
          title: rule.name,
          questions: examQuestions,
          totalScore,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        const entry: HistoryEntry = {
          id: generateId(),
          examTitle: rule.name,
          rule,
          createdAt: now,
        }
        set((s) => ({
          exams: [...s.exams, exam],
          history: [...s.history, entry],
        }))
        return exam
      },

      clearHistory: () => set({ history: [] }),
    }),
    { name: 'exam-maker-exams' },
  ),
)
