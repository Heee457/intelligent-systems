import { useState } from 'react'
import ManualSelector from '../components/exams/ManualSelector'
import SmartGenerator from '../components/exams/SmartGenerator'

type Tab = 'manual' | 'smart'

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'manual', label: '手动组卷', desc: '从题库中手动挑选题目，自由排序' },
  { key: 'smart', label: '智能组卷', desc: '按范围、知识点、难度和题型自动组合试卷' },
]

export default function ExamGenerator() {
  const [tab, setTab] = useState<Tab>('manual')

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500 -mt-4 mb-6">{TABS.find((t) => t.key === tab)!.desc}</p>

      {tab === 'manual' && <ManualSelector />}
      {tab === 'smart' && <SmartGenerator />}
    </div>
  )
}
