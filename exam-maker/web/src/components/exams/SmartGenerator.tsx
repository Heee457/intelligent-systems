import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../../store/examStore'
import { useQuestionStore } from '../../store/questionStore'
import type { QuestionType, Difficulty, RuleSection, Exam } from '../../types'

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

function splitTags(value: string) {
  return value.split(/[，,;；\n]/).map((item) => item.trim()).filter(Boolean)
}

export default function SmartGenerator() {
  const navigate = useNavigate()
  const { generateExamFromRule } = useExamStore()
  const { questions, fetchQuestions } = useQuestionStore()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [manualKnowledge, setManualKnowledge] = useState('')
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [createdExam, setCreatedExam] = useState<Exam | null>(null)
  const [autoSupplement, setAutoSupplement] = useState(false)
  const [sections, setSections] = useState<RuleSection[]>([
    { type: 'fillblank', count: 6, scorePerQuestion: 3 },
    { type: 'essay', count: 4, scorePerQuestion: 10 },
  ])

  useEffect(() => { fetchQuestions() }, [fetchQuestions])

  const availableKnowledge = useMemo(() => {
    const set = new Set<string>()
    questions.forEach((question) => question.knowledgePoints.forEach((kp) => set.add(kp)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN')).slice(0, 40)
  }, [questions])

  const knowledgePoints = useMemo(() => {
    return Array.from(new Set([...selectedKnowledge, ...splitTags(manualKnowledge)]))
  }, [selectedKnowledge, manualKnowledge])

  const totalScore = sections.reduce((sum, s) => sum + s.count * s.scorePerQuestion, 0)

  const blueprintRows = useMemo(() => {
    return sections.map((section, index) => {
      const targets = section.knowledgePoints?.length ? section.knowledgePoints : knowledgePoints
      const matched = questions.filter((question) => {
        if (question.type !== section.type) return false
        if (section.difficulty && question.difficulty !== section.difficulty) return false
        if (targets.length > 0) {
          return targets.some((target) => question.knowledgePoints.some((kp) => kp.includes(target) || target.includes(kp)))
        }
        if (scope.trim()) {
          const tokens = splitTags(scope).length > 0 ? splitTags(scope) : scope.split(/\s+/).filter(Boolean)
          return tokens.some((token) => [question.title, question.content, ...question.knowledgePoints].join(' ').includes(token))
        }
        return true
      }).length
      return {
        index: index + 1,
        type: TYPES.find((item) => item.value === section.type)?.label || section.type,
        difficulty: DIFFICULTIES.find((item) => item.value === (section.difficulty || ''))?.label || '不限',
        knowledge: targets.join('、') || scope || '不限',
        required: section.count,
        matched,
        score: section.count * section.scorePerQuestion,
      }
    })
  }, [sections, questions, knowledgePoints, scope])

  const updateSection = (i: number, data: Partial<RuleSection>) => {
    const next = [...sections]
    next[i] = { ...next[i], ...data }
    setSections(next)
  }

  const removeSection = (i: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, j) => j !== i))
  }

  const toggleKnowledge = (kp: string) => {
    setSelectedKnowledge((prev) => prev.includes(kp) ? prev.filter((item) => item !== kp) : [...prev, kp])
  }

  const handleGenerate = async () => {
    if (!name.trim()) return
    setWarnings([])
    setCreatedExam(null)
    const cleanSections = sections.map((s) => {
      const sec = { ...s }
      if (!sec.difficulty) delete sec.difficulty
      return sec
    })
    const exam = await generateExamFromRule({
      name: name.trim(),
      scope: scope.trim() || undefined,
      knowledgePoints,
      sections: cleanSections,
      totalScore,
      autoSupplement,
    })
    if (!exam) return
    const latestWarnings = useExamStore.getState().generationWarnings
    if (latestWarnings.length > 0) {
      setWarnings(latestWarnings)
      setCreatedExam(exam)
      return
    }
    navigate('/exams/' + exam.id)
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">试卷名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：线性代数期末模拟卷" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">范围</label>
          <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="如：矩阵、行列式、线性方程组" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">知识点</label>
          {knowledgePoints.length > 0 && <span className="text-xs text-gray-400">已选 {knowledgePoints.length} 个</span>}
        </div>
        {availableKnowledge.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {availableKnowledge.map((kp) => {
              const active = selectedKnowledge.includes(kp)
              const cls = 'text-xs px-2.5 py-1 rounded-full border transition-colors ' + (active
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')
              return (
                <button
                  key={kp}
                  type="button"
                  onClick={() => toggleKnowledge(kp)}
                  className={cls}
                >
                  {kp}
                </button>
              )
            })}
          </div>
        )}
        <input
          value={manualKnowledge}
          onChange={(e) => setManualKnowledge(e.target.value)}
          placeholder="补充知识点，逗号分隔"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">题型规则</h3>
        <div className="space-y-3 mb-4">
          {sections.map((sec, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <select value={sec.type} onChange={(e) => updateSection(i, { type: e.target.value as QuestionType })} className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg bg-white">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input type="number" value={sec.count} onChange={(e) => updateSection(i, { count: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} />
              <span className="text-xs text-gray-500">道 ×</span>
              <input type="number" value={sec.scorePerQuestion} onChange={(e) => updateSection(i, { scorePerQuestion: Math.max(1, Number(e.target.value)) })} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none" min={1} />
              <span className="text-xs text-gray-500">分/题</span>
              <select value={sec.difficulty ?? ''} onChange={(e) => updateSection(i, { difficulty: (e.target.value || undefined) as Difficulty | undefined })} className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg bg-white">
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input
                value={(sec.knowledgePoints || []).join('，')}
                onChange={(e) => updateSection(i, { knowledgePoints: splitTags(e.target.value) })}
                placeholder="本规则知识点"
                className="min-w-40 flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none"
              />
              <span className="ml-auto text-sm text-gray-500">{sec.count * sec.scorePerQuestion} 分</span>
              {sections.length > 1 && (
                <button type="button" onClick={() => removeSection(i)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setSections([...sections, { type: 'choice', count: 5, scorePerQuestion: 5 }])} className="text-sm text-indigo-600 hover:text-indigo-800 inline-block">
          + 添加规则
        </button>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">双向细目表预览</h3>
          <span className="text-xs text-gray-400">知识点 × 题型 × 难度 × 分值</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-white"><tr><th className="px-4 py-2">规则</th><th>知识点/范围</th><th>题型</th><th>难度</th><th>计划</th><th>题库匹配</th><th>分值</th></tr></thead>
            <tbody>
              {blueprintRows.map((row) => (
                <tr key={row.index} className="border-t border-gray-100">
                  <td className="px-4 py-2">{row.index}</td>
                  <td>{row.knowledge}</td>
                  <td>{row.type}</td>
                  <td>{row.difficulty}</td>
                  <td>{row.required}</td>
                  <td className={row.matched < row.required ? 'text-amber-600' : 'text-green-600'}>{row.matched}</td>
                  <td>{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={autoSupplement} onChange={(e) => setAutoSupplement(e.target.checked)} className="accent-indigo-500" />
        题库不足时自动补题并继续组卷（生成草稿题，发布前需复核）
      </label>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">题库数量不足</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            当前试卷已生成，但可能不完全符合筛选条件。
            {createdExam && createdExam.totalScore !== totalScore && (
              <span>实际生成 {createdExam.totalScore} 分，计划 {totalScore} 分。</span>
            )}
          </p>
          {createdExam && (
            <button type="button" onClick={() => navigate('/exams/' + createdExam.id)} className="mt-3 text-xs px-3 py-1 rounded bg-amber-100 text-amber-800 hover:bg-amber-200">
              查看已生成试卷
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div>
          <span className="text-lg font-semibold">计划总分: {totalScore}</span>
          {createdExam && warnings.length > 0 && (
            <span className="ml-3 text-sm text-amber-700">实际生成: {createdExam.totalScore} 分</span>
          )}
        </div>
        <button onClick={handleGenerate} disabled={!name.trim()} className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          生成试卷
        </button>
      </div>
    </div>
  )
}
