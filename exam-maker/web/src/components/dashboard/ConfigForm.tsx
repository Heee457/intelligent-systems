import { useState, useCallback } from 'react'
import type { SessionConfig } from '../../types'

type DifficultyPreset = '60/30/10' | '50/30/20' | 'custom'

const PRESETS: { value: DifficultyPreset; label: string; desc: string }[] = [
  { value: '60/30/10', label: '基础型', desc: '基础60% 中等30% 难10%' },
  { value: '50/30/20', label: '标准型', desc: '基础50% 中等30% 难20%' },
  { value: 'custom', label: '自定义', desc: '自由调整难度配比' },
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
  const [preset, setPreset] = useState<DifficultyPreset>(() => {
    if (values.difficulty === '基础60% 中等30% 难10%') return '60/30/10'
    if (values.difficulty === '基础50% 中等30% 难20%') return '50/30/20'
    return 'custom'
  })

  const [customEasy, setCustomEasy] = useState(60)
  const [customMedium, setCustomMedium] = useState(30)
  const [customHard, setCustomHard] = useState(10)

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

      {/* Scope */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">考试范围（可选）</label>
        <input
          type="text"
          value={values.scope}
          onChange={(e) => update({ scope: e.target.value })}
          placeholder="如：第一章至第三章"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>

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
