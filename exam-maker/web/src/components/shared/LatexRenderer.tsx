import katex from 'katex'
import type { ReactNode } from 'react'

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean }

type LatexRendererProps = {
  content?: string | null
  className?: string
  inline?: boolean
}

const DELIMITERS = [
  { open: '\\[', close: '\\]', display: true },
  { open: '$$', close: '$$', display: true },
  { open: '\\(', close: '\\)', display: false },
  { open: '$', close: '$', display: false },
]

function isEscaped(text: string, index: number) {
  let count = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count += 1
  return count % 2 === 1
}

function findClosing(text: string, start: number, close: string) {
  for (let i = start; i < text.length; i++) {
    if (isEscaped(text, i)) continue
    if (text.startsWith(close, i)) return i
  }
  return -1
}

function findNextDelimiter(text: string, start: number) {
  for (let i = start; i < text.length; i++) {
    if (isEscaped(text, i)) continue
    for (const delimiter of DELIMITERS) {
      if (delimiter.open === '$' && text.startsWith('$$', i)) continue
      if (text.startsWith(delimiter.open, i)) {
        return { index: i, ...delimiter }
      }
    }
  }
  return null
}

function tokenizeLatex(text: string): Segment[] {
  const segments: Segment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const next = findNextDelimiter(text, cursor)
    if (!next) {
      segments.push({ kind: 'text', value: text.slice(cursor) })
      break
    }

    if (next.index > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, next.index) })
    }

    const mathStart = next.index + next.open.length
    const closeIndex = findClosing(text, mathStart, next.close)
    if (closeIndex < 0) {
      segments.push({ kind: 'text', value: text.slice(next.index) })
      break
    }

    segments.push({ kind: 'math', value: text.slice(mathStart, closeIndex), display: next.display })
    cursor = closeIndex + next.close.length
  }

  return segments
}

function normalizeTextSegment(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\\begin\{(?:enumerate|itemize)\}/g, '\n')
    .replace(/\\end\{(?:enumerate|itemize)\}/g, '\n')
    .replace(/\\item\[([^\]]+)\]/g, '\n$1 ')
    .replace(/\\item\b/g, '\n• ')
    .replace(/\\textbf\{([^{}]*)\}/g, '$1')
    .replace(/\\emph\{([^{}]*)\}/g, '$1')
    .replace(/\\underline\{\\qquad(?:\\qquad)*\}/g, '________')
    .replace(/\\qquad/g, '    ')
    .replace(/\\quad/g, '  ')
    .replace(/\\\\(?:\[[^\]]*\])?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

function renderMath(value: string, display: boolean, key: string): ReactNode {
  const html = katex.renderToString(value.trim(), {
    displayMode: display,
    throwOnError: false,
    strict: false,
    trust: false,
    output: 'html',
  })

  if (display) {
    return (
      <div
        key={key}
        className="latex-display"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <span
      key={key}
      className="latex-inline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function latexToPlainText(content?: string | null) {
  if (!content) return ''

  return tokenizeLatex(content)
    .map((segment) => segment.kind === 'math' ? segment.value : normalizeTextSegment(segment.value))
    .join(' ')
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
    .replace(/\\item\[([^\]]+)\]/g, '$1 ')
    .replace(/\\item\b/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, (_match, arg) => arg ? String(arg) : ' ')
    .replace(/[{}$\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function LatexRenderer({ content, className = '', inline = false }: LatexRendererProps) {
  if (!content) return null

  const Wrapper = inline ? 'span' : 'div'
  const segments = tokenizeLatex(content)

  return (
    <Wrapper className={['latex-renderer', className].filter(Boolean).join(' ')}>
      {segments.map((segment, index) => {
        if (segment.kind === 'math') {
          return renderMath(segment.value, segment.display, 'math-' + index)
        }
        return <span key={'text-' + index}>{normalizeTextSegment(segment.value)}</span>
      })}
    </Wrapper>
  )
}
