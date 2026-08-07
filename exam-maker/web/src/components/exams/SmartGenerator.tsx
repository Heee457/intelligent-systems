import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../../store/examStore'
import type { QuestionType, Difficulty, RuleSection } from '../../types'

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'choice', label: '选择题' },
  { value: 'truefalse', label: '判断题' },
  { value: 'fillblank', label: '填空题' },
  { value: 'essay', label: '问答题' },
  { value: 'match', label: '匹配题' },
  { value: 'ordering', label: '排序题' },
]

const DIFFICULTIES: { value: Difficulty | ''; label: string }[] = [
  { value: '', label: '不限' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

export default function SmartGenerator() {
  const navigate = useNavigate()
  const { generateExamFromRule } = useExamStore()
  const [name, setName] = useState('')
  const [sections, setSections] = useState<RuleSection[]>([
    { type: 'choice', count: 10, scorePerQuestion: 5, difficulty: 'medium' },
  ])

  const totalScore = sections.reduce((sum, s) => sum + s.count * s.scorePerQuestion, 0)

  const updateSection = (i: number, data: Partial<RuleSection>) => {
    const next = [...sections]
    next[i] = { ...next[i], ...data }
    setSections(next)
  }

  const removeSection = (i: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, j) => j !== i))
  }

  const handleGenerate = async () => {
    if (!name.trim()) return
    const cleanSections = sections.map((s) => {
      const sec = { ...s }
      if (!sec.difficulty) delete sec.difficulty
      if (!sec.knowledgePoints?.length) delete sec.knowledgePoints
      return sec
    })
    const exam = await generateExamFromRule({ name, sections: cleanSections, totalScore })
    if (exam) navigate(`/exams/${exam.id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：高难度期末卷" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
      </div>

      <h3 className="font-semibold mb-3">智能规则配置</h3>
      <div className="space-y-3 mb-6">
        {sections.map((sec, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center gap-3">
              <select value={sec.type} onChange={(e) => updateSection(i, { type: e.target.value as QuestionType })} className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg bg-white">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input type="number" value={sec.count} onChange={(e) => updateSection(i, { count: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="数量" />
              <span className="text-xs text-gray-500">道 ×</span>
              <input type="number" value={sec.scorePerQuestion} onChange={(e) => updateSection(i, { scorePerQuestion: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} placeholder="分值" />
              <span className="text-xs text-gray-500">分/题</span>
              <div className="flex-1" />
              <span className="text-sm text-gray-500">= {sec.count * sec.scorePerQuestion}分</span>
              {sections.length > 1 && (
                <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">难度:</span>
              <select value={sec.difficulty ?? ''} onChange={(e) => updateSection(i, { difficulty: (e.target.value || undefined) as Difficulty | undefined })} className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-xs">
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <span className="text-gray-500">知识点:</span>
              <input
                value={sec.knowledgePoints?.join(', ') ?? ''}
                onChange={(e) => updateSection(i, { knowledgePoints: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : undefined })}
                placeholder="逗号分隔，如：函数,几何"
                className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-200"
              />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setSections([...sections, { type: 'choice', count: 5, scorePerQuestion: 5 }])} className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 inline-block">
        + 添加规则
      </button>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <span className="text-lg font-semibold">总分: {totalScore}</span>
        <button onClick={handleGenerate} disabled={!name.trim()} className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          智能生成试卷
        </button>
      </div>
    </div>
  )
}
