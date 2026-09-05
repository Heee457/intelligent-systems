import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SessionConfig } from '../../types'
import { useQuestionStore } from '../../store/questionStore'
import TagInput from '../shared/TagInput'

type DifficultyPreset = '60/30/10' | '50/30/20' | 'custom'
type ContentBasis = NonNullable<SessionConfig['contentBasis']>

const PRESETS: { value: DifficultyPreset; label: string; desc: string }[] = [
  { value: '60/30/10', label: '基础型', desc: '基础60% 中等30% 难10%' },
  { value: '50/30/20', label: '标准型', desc: '基础50% 中等30% 难20%' },
  { value: 'custom', label: '自定义', desc: '自由调整难度配比' },
]

const BASIS_OPTIONS: { value: ContentBasis; label: string; desc: string }[] = [
  { value: 'upload', label: '上传资料优先', desc: '真题、讲义、教材目录' },
  { value: 'bank', label: '题库知识点', desc: '按已整理标签命题' },
  { value: 'mixed', label: '资料 + 题库', desc: '两类依据同时参考' },
]

const OUTPUT_FORMATS: { value: SessionConfig['outputFormat']; label: string }[] = [
  { value: 'latex', label: 'LaTeX' },
  { value: 'docx', label: 'Word (docx)' },
  { value: 'md', label: 'Markdown' },
]

function presetToDifficulty(preset: DifficultyPreset): string {
  switch (preset) {
    case '60/30/10':
      return '基础60% 中等30% 难10%'
    case '50/30/20':
      return '基础50% 中等30% 难20%'
    case 'custom':
      return '自定义'
  }
}

export interface ConfigFormValues {
  course: string
  scope: string
  contentBasis: ContentBasis
  coverageItems: string[]
  additionalRequirements: string
  difficulty: string
  nSets: number
  outputFormat: SessionConfig['outputFormat']
  verifyMode: SessionConfig['verifyMode']
}

interface ConfigFormProps {
  onChange: (values: ConfigFormValues) => void
  values: ConfigFormValues
}

export default function ConfigForm({ onChange, values }: ConfigFormProps) {
  const questions = useQuestionStore(s => s.questions)
  const fetchQuestions = useQuestionStore(s => s.fetchQuestions)
  const questionLoading = useQuestionStore(s => s.loading)
  const [preset, setPreset] = useState<DifficultyPreset>(() => {
    if (values.difficulty === '基础60% 中等30% 难10%') return '60/30/10'
    if (values.difficulty === '基础50% 中等30% 难20%') return '50/30/20'
    return 'custom'
  })

  const [customEasy, setCustomEasy] = useState(60)
  const [customMedium, setCustomMedium] = useState(30)
  const [customHard, setCustomHard] = useState(10)

  useEffect(() => {
    if (questions.length === 0) fetchQuestions()
  }, [fetchQuestions])

  const candidateKnowledgePoints = useMemo(() => {
    const set = new Set<string>()
    questions.forEach((question) => question.knowledgePoints.forEach((kp) => { if (kp.trim()) set.add(kp.trim()) }))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN')).slice(0, 18)
  }, [questions])

  const update = useCallback(
    (patch: Partial<ConfigFormValues>) => {
      onChange({ ...values, ...patch })
    },
    [values, onChange],
  )

  const handlePresetChange = useCallback(
    (p: DifficultyPreset) => {
      setPreset(p)
      if (p !== 'custom') {
        update({ difficulty: presetToDifficulty(p) })
      } else {
        const total = customEasy + customMedium + customHard
        const norm = total > 0
          ? `基础${Math.round((customEasy / total) * 100)}% 中等${Math.round((customMedium / total) * 100)}% 难${Math.round((customHard / total) * 100)}%`
          : '基础60% 中等30% 难10%'
        update({ difficulty: norm })
      }
    },
    [update, customEasy, customMedium, customHard],
  )

  const handleCustomSlider = useCallback(
    (field: 'easy' | 'medium' | 'hard', value: number) => {
      let e = customEasy
      let m = customMedium
      let h = customHard
      if (field === 'easy') e = value
      else if (field === 'medium') m = value
      else h = value
      const total = e + m + h
      const norm = total > 0
        ? `基础${Math.round((e / total) * 100)}% 中等${Math.round((m / total) * 100)}% 难${Math.round((h / total) * 100)}%`
        : '基础60% 中等30% 难10%'
      setCustomEasy(e)
      setCustomMedium(m)
      setCustomHard(h)
      update({ difficulty: norm })
    },
    [update, customEasy, customMedium, customHard],
  )

  const toggleCoverageItem = (item: string) => {
    const current = values.coverageItems || []
    update({ coverageItems: current.includes(item) ? current.filter((kp) => kp !== item) : [...current, item] })
  }

  return (
    <div className="space-y-5">
      {/* Course name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">课程名称</label>
        <input
          type="text"
          value={values.course}
          onChange={(e) => update({ course: e.target.value })}
          placeholder="如：高等数学"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>

      {/* Basis */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">命题依据</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {BASIS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ contentBasis: option.value })}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                values.contentBasis === option.value
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs mt-0.5 opacity-80">{option.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Coverage */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="block text-sm font-medium text-gray-700">覆盖内容</label>
          <span className="text-xs text-gray-400">已选 {values.coverageItems.length}</span>
        </div>
        {candidateKnowledgePoints.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-2">
            {candidateKnowledgePoints.map((kp) => {
              const selected = values.coverageItems.includes(kp)
              return (
                <button
                  key={kp}
                  type="button"
                  onClick={() => toggleCoverageItem(kp)}
                  className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    selected
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {kp}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-2">{questionLoading ? '知识点加载中...' : '题库暂无知识点'}</p>
        )}
        <TagInput
          tags={values.coverageItems}
          onChange={(coverageItems) => update({ coverageItems })}
          placeholder="手动添加知识点，如：矩阵的秩"
        />
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">高级设置</summary>
        <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">补充要求</label>
        <textarea
          value={values.additionalRequirements}
          onChange={(e) => update({ additionalRequirements: e.target.value })}
          placeholder="如：只考第二章矩阵；不要行列式计算；偏重证明题"
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none bg-white"
        />
      </details>

      {/* Difficulty preset */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">难度配比</label>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePresetChange(p.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                preset === p.value
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-xs mt-0.5 opacity-80">{p.desc}</div>
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3">
            <SliderField
              label="基础题"
              value={customEasy}
              onChange={(v) => handleCustomSlider('easy', v)}
            />
            <SliderField
              label="中等题"
              value={customMedium}
              onChange={(v) => handleCustomSlider('medium', v)}
            />
            <SliderField
              label="难题"
              value={customHard}
              onChange={(v) => handleCustomSlider('hard', v)}
            />
            <div className="text-xs text-gray-500 text-right">
              当前配比：{Math.round((customEasy / (customEasy + customMedium + customHard || 1)) * 100)}%
              / {Math.round((customMedium / (customEasy + customMedium + customHard || 1)) * 100)}%
              / {Math.round((customHard / (customEasy + customMedium + customHard || 1)) * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* N sets */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">生成套数</label>
        <select
          value={values.nSets}
          onChange={(e) => update({ nSets: Number(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-white"
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} 套
            </option>
          ))}
        </select>
      </div>

      {/* Output format */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">输出格式</label>
        <div className="flex gap-2">
          {OUTPUT_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              type="button"
              onClick={() => update({ outputFormat: fmt.value })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                values.outputFormat === fmt.value
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Verify mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">验证模式</label>
        <select
          value={values.verifyMode}
          onChange={(e) => update({ verifyMode: e.target.value as SessionConfig['verifyMode'] })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-white"
        >
          <option value="auto">自动验证</option>
          <option value="computational">计算型</option>
          <option value="conceptual">概念型</option>
          <option value="mixed">综合型</option>
        </select>
      </div>
    </div>
  )
}

/* ---- Slider sub-component ---- */
function SliderField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-12">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500"
      />
      <span className="text-xs text-gray-500 w-10 text-right">{value}%</span>
    </div>
  )
}
