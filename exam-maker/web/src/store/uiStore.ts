import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  selectedQuestionId: string | null
  selectedExamId: string | null

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  selectQuestion: (id: string | null) => void
  selectExam: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  selectedQuestionId: null,
  selectedExamId: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectQuestion: (id) => set({ selectedQuestionId: id }),
  selectExam: (id) => set({ selectedExamId: id }),
}))
