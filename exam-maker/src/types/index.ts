// —— 基础枚举类型 ——
export type Difficulty = 'easy' | 'medium' | 'hard'

export type QuestionType =
  | 'choice'
  | 'truefalse'
  | 'fillblank'
  | 'essay'
  | 'match'
  | 'ordering'

// —— 题目相关 ——
export interface ChoiceOption {
  id: string
  label: string // A, B, C, D
  content: string
}

export interface MatchPair {
  id: string
  left: string
  right: string
}

export type Answer =
  | { type: 'choice'; selectedOptionId: string }
  | { type: 'truefalse'; value: boolean }
  | { type: 'fillblank'; blanks: string[] }
  | { type: 'essay'; referenceAnswer: string }
  | { type: 'match'; pairs: Array<{ left: string; right: string }> }
  | { type: 'ordering'; orderedItems: string[] }

export interface Question {
  id: string
  type: QuestionType
  title: string // 简短标题，列表展示用
  content: string // 题干内容
  options?: ChoiceOption[] // choice 专用
  matchPairs?: MatchPair[] // match 专用
  orderingItems?: string[] // ordering 专用
  answer: Answer
  difficulty: Difficulty
  knowledgePoints: string[] // 扁平标签
  explanation?: string // 解析
  createdAt: number
  updatedAt: number
}

// —— 试卷相关 ——
export interface ExamQuestion {
  questionId: string
  score: number
  order: number
}

export interface Exam {
  id: string
  title: string
  questions: ExamQuestion[]
  totalScore: number
  status: 'draft' | 'published'
  createdAt: number
  updatedAt: number
}

// —— 组卷规则 ——
export interface RuleSection {
  type: QuestionType
  count: number
  scorePerQuestion: number
  difficulty?: Difficulty
  knowledgePoints?: string[]
}

export interface GenerationRule {
  name: string
  sections: RuleSection[]
  totalScore: number
}

// —— 历史记录 ——
export interface HistoryEntry {
  id: string
  examTitle: string
  rule: GenerationRule
  createdAt: number
}
