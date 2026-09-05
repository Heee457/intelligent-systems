import { useState, useCallback } from 'react'
import type { PaperData } from '../../types'

/* ---------- types ---------- */
interface PaperSelectorProps {
  sessionId: string
  papers: PaperData[]
  onSelectionChange?: (selectedIndexes: number[]) => void
}

const FORMAT_LABELS: Record<string, string> = {
  tex: 'TeX',
  pdf: 'PDF',
  docx: 'DOCX',
  md: 'MD',
}

const FORMAT_COLORS: Record<string, string> = {
  tex: 'text-blue-600 bg-blue-50 border-blue-200',
  pdf: 'text-red-600 bg-red-50 border-red-200',
  docx: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  md: 'text-gray-600 bg-gray-50 border-gray-200',
}

function paperFormats(paper: PaperData): string[] {
  return Array.isArray(paper.formats) && paper.formats.length > 0 ? paper.formats : ['tex']
}

function defaultSelectedPapers(papers: PaperData[]) {
  const selected = papers.filter((paper) => paper.selected).map((paper) => paper.index)
  if (selected.length > 0) return new Set(selected)
  return new Set(papers[0] ? [papers[0].index] : [])
}

function paperDifficulty(paper: PaperData) {
  return paper.difficulty || { basic: 0, medium: 0, hard: 0 }
}

/* ---------- component ---------- */
export default function PaperSelector({ sessionId, papers, onSelectionChange }: PaperSelectorProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => defaultSelectedPapers(papers),
  )
  const [downloading, setDownloading] = useState(false)

  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        if (next.size > 1) next.delete(index)
      } else next.add(index)
      onSelectionChange?.(Array.from(next))
      return next
    })
  }, [onSelectionChange])

  const selectedPapers = papers.filter((p) => selected.has(p.index))

  /* ---------- download helpers ---------- */
  const downloadFile = useCallback(
    (filename: string) => {
      const a = document.createElement('a')
      a.href = `/api/sessions/${sessionId}/files/${filename}`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
    [sessionId],
  )

  const downloadSelected = useCallback(() => {
    setDownloading(true)
    let delay = 0
    for (const paper of selectedPapers) {
      for (const fmt of paperFormats(paper)) {
        setTimeout(() => downloadFile(`${paper.filename}.${fmt}`), delay)
        delay += 300
      }
    }
    setTimeout(() => setDownloading(false), delay)
  }, [selectedPapers, downloadFile])

  const downloadAll = useCallback(() => {
    setDownloading(true)
    let delay = 0
    for (const paper of papers) {
      for (const fmt of paperFormats(paper)) {
        setTimeout(() => downloadFile(`${paper.filename}.${fmt}`), delay)
        delay += 300
      }
    }
    setTimeout(() => setDownloading(false), delay)
  }, [papers, downloadFile])

  /* ---------- coverage display ---------- */
  const coverageColor = (val: string) => {
    const n = parseFloat(val)
    if (!Number.isFinite(n)) return 'text-gray-500'
    if (n >= 90) return 'text-green-600'
    if (n >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  /* ---------- render ---------- */
  if (papers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
        暂无试卷数据
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          试卷列表
          <span className="text-sm font-normal text-gray-400 ml-2">({papers.length} 套)</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadSelected}
            disabled={selectedPapers.length === 0 || downloading}
            className="px-4 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            下载选中 ({selectedPapers.length})
          </button>
          <button
            onClick={downloadAll}
            disabled={downloading}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? '下载中...' : '全部下载'}
          </button>
        </div>
      </div>

      {/* grid */}
      <div className="divide-y divide-gray-100">
        {papers.map((paper) => {
          const isSelected = selected.has(paper.index)
          const difficulty = paperDifficulty(paper)
          const coverage = paper.coverage || '未知'
          const verifyPassed = paper.verifyPassed || '未验证'
          const displayIndex = paper.index > 0 ? paper.index : paper.index + 1
          return (
            <div
              key={paper.index}
              className={`px-5 py-4 flex items-center gap-4 transition-colors ${
                isSelected ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
              }`}
            >
              {/* checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(paper.index)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-300"
              />

              {/* info */}
              <div className="flex-1 min-w-0 grid grid-cols-5 gap-4 text-sm">
                {/* name */}
                <div className="font-medium text-gray-900 truncate">
                  第 {displayIndex} 套
                </div>

                {/* coverage */}
                <div className={coverageColor(coverage)}>
                  覆盖 {coverage}
                </div>

                {/* difficulty breakdown */}
                <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                  <span className="text-green-600">{difficulty.basic}%</span>
                  <span className="text-gray-300">/</span>
                  <span className="text-blue-600">{difficulty.medium}%</span>
                  <span className="text-gray-300">/</span>
                  <span className="text-red-600">{difficulty.hard}%</span>
                </div>

                {/* verify */}
                <div>
                  {verifyPassed === 'true' || verifyPassed === 'passed' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      验算通过
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      {verifyPassed}
                    </span>
                  )}
                </div>

                {/* download links */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {paperFormats(paper).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => downloadFile(`${paper.filename}.${fmt}`)}
                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors hover:opacity-80 ${FORMAT_COLORS[fmt] || 'text-gray-600 bg-gray-50 border-gray-200'}`}
                    >
                      {FORMAT_LABELS[fmt] || fmt.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* filename hint */}
                <div className="text-[10px] text-gray-400 truncate col-span-5 -mt-1">
                  {paper.filename}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
