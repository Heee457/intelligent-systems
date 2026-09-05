import { describe, expect, it } from 'vitest'
import { extractAnswerDocumentFromPaperTex } from './step5-generate'

describe('step5 answer artifact fallback', () => {
  it('extracts a standalone answer document from a paper appendix', () => {
    const bs = String.fromCharCode(92)
    const paperTex = [
      '% ===== 答案环境（用于参考答案与解析）=====',
      bs + 'newenvironment{answer}',
      '  {' + bs + 'par' + bs + 'noindent{' + bs + 'bfseries 【答案与解析】}}',
      '  {' + bs + 'par}',
      bs + 'begin{document}',
      bs + 'section*{一、填空题}',
      bs + 'textbf{1.} 设 x=1，则 x+1=' + bs + 'underline{' + bs + 'qquad}。',
      bs + 'newpage',
      bs + 'begin{center}',
      '{' + bs + 'Large' + bs + 'bfseries 参考答案与解析}',
      bs + 'end{center}',
      bs + 'section*{一、填空题}',
      bs + 'begin{answer}',
      bs + 'textbf{1.} 42',
      bs + 'end{answer}',
      bs + 'end{document}',
    ].join('\n')

    const answerDoc = extractAnswerDocumentFromPaperTex(paperTex)

    expect(answerDoc).not.toBeNull()
    expect(answerDoc).toContain(bs + 'documentclass[12pt]{ctexart}')
    expect(answerDoc).toContain(bs + 'section*{一、填空题}')
    expect(answerDoc).toContain('42')
    expect(answerDoc).not.toContain('设 x=1')
  })
})
