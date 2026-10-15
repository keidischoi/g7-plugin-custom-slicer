// __T('한글') — 영어 사이트면 en.js 의 영어로 (없으면 한글 그대로) · 「」 는 “” 로. 빌드(wrap.mjs)가 한글 문자열마다 이걸 부르게 감쌈
import EN from './en.js'
let lang = ''
function isEn() {
  if (!lang) {
    let l = ''
    try { l = localStorage.getItem('g7_locale') || '' } catch (e) {}
    l = l || (typeof document !== 'undefined' && document.documentElement.getAttribute('lang')) || (typeof navigator !== 'undefined' && navigator.language) || 'ko'
    lang = /^ko/i.test(l) ? 'ko' : 'en'
  }
  return lang === 'en'
}
export function __T(s) {
  if (!isEn()) return s
  const e = EN[s]
  return (e == null ? s : e).replace(/「/g, '“').replace(/」/g, '”')
}
