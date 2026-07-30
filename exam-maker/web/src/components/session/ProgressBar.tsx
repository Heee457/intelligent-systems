import type { SessionStatus } from '../../types'

/* ---------- step definitions ---------- */
interface StepDef {
  index: number
  name: string
  isConfirm: boolean
}

const STEPS: StepDef[] = [
  { index: 0, name: '解析资料', isConfirm: false },
  { index: 1, name: '生成细目表', isConfirm: false },
  { index: 2, name: '确认细目表', isConfirm: true },
  { index: 3, name: '确认模板', isConfirm: true },
  { index: 4, name: '生成模板', isConfirm: false },
  { index: 5, name: '编译试卷', isConfirm: false },
  { index: 6, name: '选题确认', isConfirm: true },
]

/** Maps a confirmation-step index to the status value that means "awaiting confirmation". */
const AWAIT_STATUS: Record<number, SessionStatus> = {
  2: 'AWAIT_BLUEPRINT',
  3: 'AWAIT_TEMPLATE',
  6: 'AWAIT_SELECTION',
}

/* ---------- helpers ---------- */
type StepState = 'completed' | 'current' | 'awaiting' | 'future'

function stepState(index: number, currentStep: number, status: SessionStatus): StepState {
  if (index < currentStep) return 'completed'
  if (index === currentStep) {
    const expected = AWAIT_STATUS[index]
    if (expected && status === expected) return 'awaiting'
    return 'current'
  }
  return 'future'
}

/* ---------- circle style map ---------- */
const CIRCLE: Record<StepState, string> = {
  completed: 'bg-green-500 text-white',
  current: 'bg-indigo-500 text-white ring-2 ring-indigo-200',
  awaiting: 'bg-amber-500 text-white ring-2 ring-amber-200',
  future: 'bg-gray-200 text-gray-500',
}

const CONNECTOR: Record<StepState, string> = {
  completed: 'bg-green-400',
  current: 'bg-indigo-400',
  awaiting: 'bg-amber-400',
  future: 'bg-gray-200',
}

/* ---------- component ---------- */
interface ProgressBarProps {
  currentStep: number
  status: SessionStatus
}

export default function ProgressBar({ currentStep, status }: ProgressBarProps) {
  return (
    <div className="flex items-center w-full">
      {STEPS.map((step, idx) => {
        const state = stepState(step.index, currentStep, status)

        return (
          <div key={step.index} className="flex items-center flex-1 last:flex-none">
            {/* ---- step circle + label ---- */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-colors shrink-0 ${CIRCLE[state]}`}
              >
                {state === 'completed' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : state === 'awaiting' ? (
                  <span className="text-xs leading-none">⏸</span>
                ) : (
                  <span className="text-xs leading-none">{step.index}</span>
                )}
              </div>
              <span
                className={`text-[11px] leading-tight text-center whitespace-nowrap ${
                  state === 'future' ? 'text-gray-400' : 'text-gray-700'
                }`}
              >
                {step.name}
              </span>
            </div>

            {/* ---- connector line ---- */}
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${CONNECTOR[state]}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
