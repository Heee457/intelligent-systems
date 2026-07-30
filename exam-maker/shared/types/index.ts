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

// —— API: 会话配置 ——
export interface SessionConfig {
  course?: string
  scope?: string
  difficulty: string        // "基础60% 中等30% 难10%"
  nSets: number             // 默认 8
  outputFormat: 'latex' | 'docx' | 'md'
  verifyMode: 'auto' | 'computational' | 'conceptual' | 'mixed'
}

// —— API: 会话状态 ——
export type SessionStatus =
  | 'CREATED' | 'RUNNING' | 'AWAIT_BLUEPRINT'
  | 'AWAIT_TEMPLATE' | 'AWAIT_SELECTION'
  | 'COMPLETED' | 'DONE' | 'FAILED' | 'CANCELLED'

export interface SessionFile {
  name: string
  path: string
  size: number
  createdAt: number
}

export interface BlueprintRow {
  kp: string
  basic: number
  medium: number
  hard: number
  total: number
  frequency: number
  required: boolean
  sampleQuestions: string[]
}

export interface BlueprintData {
  rows: BlueprintRow[]
  difficultySummary: { basic: number; medium: number; hard: number } // 百分比
  totalScore: number
}

export interface TemplateData {
  sections: Array<{
    type: string
    count: number
    scorePer: number
    totalScore: number
    notes?: string
  }>
  totalTime: number
  headerStyle: string
}

export interface PaperData {
  index: number
  filename: string
  formats: string[]  // ['tex','pdf','docx','md']
  verifyPassed: string
  difficulty: { basic: number; medium: number; hard: number }
  coverage: string
  selected: boolean
}

export interface Session {
  id: string
  workDir: string
  buildDir: string
  config: SessionConfig
  status: SessionStatus
  currentStep: number        // 0-6
  stepDetail: string
  files: SessionFile[]
  blueprint?: BlueprintData
  template?: TemplateData
  papers: PaperData[]
  createdAt: number
  updatedAt: number
}

// —— API: WebSocket 消息 ——
export type WsMessage =
  | { type: 'step'; step: number; detail: string }
  | { type: 'log'; message: string }
  | { type: 'artifact'; file: SessionFile }
  | { type: 'confirm'; point: 'blueprint' | 'template' | 'selection'; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete'; session: Session }

// —— API: 请求/响应类型 ——
export interface CreateSessionResponse {
  id: string
  session: Session
}

export interface ConfirmRequest {
  action: 'approve' | 'reject' | 'modify'
  point: 'blueprint' | 'template' | 'selection'
  feedback?: string
  modifications?: unknown
}

export interface ApiError {
  error: string
  detail?: string
}
