// 사이트 언어 따라가기 — 한국어 사이트면 슬라이서(three-slicer, 영어) 글자를 한국어로 · 설정 이름은 「한국어 + 아래 작은 영어」 두 줄
// 사전: web/i18n/ko.json (OrcaSlicer 한국어 번역에서 이 화면에 나오는 말만 · AGPL-3.0) + 아래 EXTRA (OrcaSlicer 에 없는 뷰어 글자)
// React 가 그린 글자 마디의 값만 바꾸고(마디를 더하거나 빼지 않음), 영어는 data-en 속성 + CSS 로 보여 줌

/** 사이트 언어 — G7 이 고른 언어(g7_locale) → <html lang> → 브라우저. 'ko' 아니면 'en' */
export function siteLang() {
  let l = ''
  try { l = localStorage.getItem('g7_locale') || '' } catch (e) {}
  l = l || document.documentElement.getAttribute('lang') || navigator.language || 'ko'
  return /^ko/i.test(l) ? 'ko' : 'en'
}

/** OrcaSlicer 번역에 없는 뷰어 · 설정 칸 글자 */
export const EXTRA = {
  Preview: '미리 보기', Prepare: '준비', Technology: '방식', 'FFF (filament)': 'FFF (필라멘트)', 'SLA (resin)': 'SLA (레진)', Model: '모델', Quality: '품질',
  'Auto slice': '자동 슬라이스', 'Choose file': '파일 고르기', Open: '열기', 'Save as 3mf': '3MF 로 저장', 'Drag in a file or pick one': '파일을 끌어다 놓거나 고르세요',
  'Export G-code': 'G-code 내보내기', 'Export SL1': 'SL1 내보내기', Slice: '슬라이스', Slicing: '슬라이스 중', 'Slicing…': '슬라이스 중…', Cancel: '취소', Save: '저장', Load: '불러오기',
  'Save as template': '틀로 저장', Template: '틀', Templates: '틀', 'Nozzle Ø': '노즐 지름', Custom: '직접 입력', Bed: '베드', Nozzle: '노즐', Printer: '프린터', Filament: '필라멘트', Filaments: '필라멘트',
  Process: '출력 설정', all: '모두', simple: '간단', advanced: '고급', expert: '전문가', develop: '개발', 'Search settings…': '설정 찾기…', 'Search settings': '설정 찾기',
  Objects: '물체', Object: '물체', Plate: '판', Plates: '판', Layers: '레이어', Layer: '레이어', Time: '시간', Weight: '무게', Length: '길이', Cost: '비용', Legend: '범례',
  'Line type': '선 종류', Speed: '속도', Height: '높이', Width: '너비', Flow: '유량', Fan: '팬', Temperature: '온도', Tool: '도구', Color: '색', Colour: '색',
  Move: '옮기기', Rotate: '돌리기', Scale: '크기', 'Lay on face': '면으로 눕히기', Cut: '자르기', Paint: '칠하기', Arrange: '정렬', 'Auto orient': '자동 방향', Delete: '지우기', Duplicate: '복제',
  'Reset': '되돌리기', Undo: '실행 취소', Redo: '다시 실행', Close: '닫기', Apply: '적용', Add: '더하기', Remove: '빼기', None: '없음', Auto: '자동', 'GPU': 'GPU',
  '🖨 Printer': '🖨 프린터', '🧵 Filament': '🧵 필라멘트', '🗼 Prime tower': '🗼 프라임 타워', '⚙ Process': '⚙ 출력 설정', Motion: '움직임', 'Custom (defaults)': '직접 입력 (기본값)',
  'Prime tower': '프라임 타워', 'Ring — deterministic': '고리 — 늘 같은 모양', 'Real wipe tower — not reproducible yet': '실제 와이프 타워 — 아직 똑같이는 안 됨', 'Off — no tower': '끄기 — 타워 없음',
  'Purge into': '퍼지할 곳', 'The tower': '타워', "The model's infill": '모델 속 채우기', 'Beside the model': '모델 옆', 'Fixed coordinate': '정한 좌표', Export: '내보내기',
  'mm': 'mm', '°C': '°C', 'Supports': '서포트', 'Support painting': '서포트 칠하기', 'Seam painting': '재봉선 칠하기', 'Color painting': '색 칠하기',
}

let dict = null, loading = null
export function loadKo() {
  if (dict) return Promise.resolve(dict)
  if (!loading) loading = import('../i18n/ko.json').then((m) => { dict = Object.assign({}, m.default || m, EXTRA); return dict }).catch(() => { dict = Object.assign({}, EXTRA); return dict })
  return loading
}

export const LANG_CSS = `
.lbl[data-en]::after{content:attr(data-en);display:block;font-size:10.5px;font-weight:500;line-height:1.25;color:var(--_light-text-faint,#94a3b8);letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`

const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/
/** 숫자가 들어간 글자 — 「Custom (12)」 처럼 */
const PATTERNS = [[/^Custom \((\d+)\)$/, '직접 입력 ($1)'], [/^(\d+) objects?$/i, '물체 $1개'], [/^Plate (\d+)$/i, '판 $1']]
const look = (d, s) => { const t = s.trim(); if (!t) return null; let k = d[t]; if (!k) for (const [re, to] of PATTERNS) if (re.test(t)) { k = t.replace(re, to); break } return k ? s.replace(t, k) : null }

/** 마디 하나(그 아래 모두)를 번역 — 영어 원문은 마디에 기억해 두어 다시 바뀌면(React) 또 번역 */
function trNode(d, n) {
  if (n.nodeType === 3) {
    const v = n.nodeValue
    if (n.__ko === v) return
    const k = look(d, v)
    if (k == null) return
    const p = n.parentElement
    if (p && SKIP.test(p.tagName)) return
    n.__en = v; n.__ko = k; n.nodeValue = k
    // 설정 이름 — 영어도 아래 작은 글자로 (OrcaSlicer 영어 이름으로 찾는 회원)
    if (p && p.classList && p.classList.contains('lbl') && p.childNodes.length === 1) p.setAttribute('data-en', v.trim())
    return
  }
  if (n.nodeType !== 1 && n.nodeType !== 11) return
  if (n.nodeType === 1) {
    if (SKIP.test(n.tagName) || n.classList.contains('key')) return   // .key = 설정 키(line_width) 는 그대로
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = n.getAttribute(a); if (!v || n['__ko_' + a] === v) continue
      const k = look(d, v); if (k != null) { n['__ko_' + a] = k; n.setAttribute(a, k) }
    }
  }
  for (const c of n.childNodes) trNode(d, c)
}

/** 그림자 뿌리 하나를 번역하고, 뒤에 바뀌는 것(React 다시 그림)도 따라감 · 돌려주는 함수로 멈춤 */
export function translateRoot(root, d) {
  if (!root || root.__slcTr) return () => {}
  root.__slcTr = true
  if (!Array.from(root.children || []).some((el) => el.tagName === 'STYLE' && el.hasAttribute('data-slc-lang'))) {
    const st = document.createElement('style'); st.setAttribute('data-slc-lang', '1'); st.textContent = LANG_CSS; root.appendChild(st)
  }
  trNode(d, root)
  let busy = false
  const mo = new MutationObserver((list) => {
    if (busy) return
    busy = true
    try {
      for (const m of list) {
        if (m.type === 'characterData') trNode(d, m.target)
        else if (m.type === 'attributes') trNode(d, m.target)
        else m.addedNodes.forEach((x) => trNode(d, x))
      }
    } finally { busy = false }
  })
  mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] })
  return () => { mo.disconnect(); root.__slcTr = false }
}
