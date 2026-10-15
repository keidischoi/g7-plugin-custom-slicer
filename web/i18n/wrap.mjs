// 빌드 때 한글 글자(따옴표 문자열)를 __T('…') 로 감싸서, 영어 사이트면 web/i18n/en.js 의 영어로 — 코드를 하나하나 고치지 않고 사이트 언어를 따라감
// 주석 · 정규식 · 템플릿(`…`, ${} 없는 것만 감쌈)을 구별하는 작은 토큰 읽기. wrapKo(src) → { code, found: [글자…], skipped: [${} 있는 템플릿…] }
const HANGUL = /[가-힣「」]/
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', ''])

export function wrapKo(src) {
  let out = '', i = 0, prev = ''
  const found = [], skipped = []
  const n = src.length
  const lastWord = () => { const m = out.match(/([A-Za-z_$][\w$]*)\s*$/); return m ? m[1] : '' }
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; out += src.slice(i, e); i = e; continue }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out += src.slice(i, e); i = e; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++ }
      const lit = src.slice(i, j + 1)
      // 객체 키(뒤에 :) · import 경로는 그대로
      const after = src.slice(j + 1).match(/^\s*(.)/)
      const isKey = after && after[1] === ':' && /[{,]\s*$/.test(out)
      if (HANGUL.test(lit) && !isKey && !/\b(import|from)\s*$/.test(out)) { out += '__T(' + lit + ')'; found.push(Function('return ' + lit)()) } else out += lit
      i = j + 1; prev = 'x'; continue
    }
    if (c === '`') {
      let j = i + 1, depth = 0, hasExpr = false
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (depth === 0 && src[j] === '`') break
        if (src[j] === '$' && src[j + 1] === '{') { depth++; hasExpr = true; j += 2; continue }
        if (depth > 0 && src[j] === '}') { depth--; j++; continue }
        j++
      }
      const lit = src.slice(i, j + 1)
      // CSS 템플릿 — 한글이 주석에만 있으면 그대로
      if (HANGUL.test(lit.replace(/\/\*[\s\S]*?\*\//g, '')) && !hasExpr && !/[\w$)\]]\s*$/.test(out)) { out += '__T(' + lit + ')'; found.push(Function('return ' + lit)()) }
      else { out += lit; if (HANGUL.test(lit)) skipped.push(lit.slice(0, 80)) }
      i = j + 1; prev = 'x'; continue
    }
    if (c === '/') {
      const p = out.replace(/\s+$/, '').slice(-1), w = lastWord()
      if (REGEX_BEFORE.has(p) || w === 'return' || w === 'typeof' || w === 'case') {
        let j = i + 1, cls = false
        while (j < n) { const x = src[j]; if (x === '\\') { j += 2; continue } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; else if (x === '\n') break; j++ }
        j++; while (j < n && /[a-z]/i.test(src[j])) j++
        out += src.slice(i, j); i = j; continue
      }
    }
    out += c; i++
  }
  return { code: out, found, skipped }
}
