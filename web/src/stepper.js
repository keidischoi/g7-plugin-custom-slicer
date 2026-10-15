// 숫자 칸 옆 ▲▼ 단추 — 슬라이서(그림자 뿌리 안) 숫자 칸에 붙임. 누르고 있으면 계속 · Shift 는 10배
// 값은 React 가 보는 방식(값 세터 + input 이벤트)으로 바꿔서 슬라이서 설정에 그대로 들어감

const NUM = /^\s*-?(\d+\.?\d*|\.\d+)\s*%?\s*$/
const TARGET = '.inputwrap input:not([type]), .inputwrap input[type=text], input[type=number]'

export const STEP_CSS = `
.slc-stepw{position:relative;display:inline-flex;align-items:center}
.slc-step{display:inline-flex;flex-direction:column;margin-left:3px;border:1px solid var(--vp-line,#cbd5e1);border-radius:8px;overflow:hidden;background:var(--vp-card,#fff);flex:0 0 auto}
.slc-step[hidden]{display:none}
.slc-step button{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:20px;height:13px;font-size:8px;line-height:1;color:var(--vp-mute,#64748b);cursor:pointer;user-select:none}
.slc-step button+button{border-top:1px solid var(--vp-line,#cbd5e1)}
.slc-step button:hover{background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff}
.slc-step button:active{filter:brightness(.9)}
input[type=number].slc-stepped::-webkit-inner-spin-button,input[type=number].slc-stepped::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
input[type=number].slc-stepped{-moz-appearance:textfield;appearance:textfield}
`

const setVal = (el, v) => {
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  d.set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 한 번 누를 때 바뀌는 크기 — step 속성이 있으면 그것, 없으면 소수 자리로 (0.42 → 0.01 · 35 → 1) */
const stepOf = (el, raw) => {
  const s = parseFloat(el.getAttribute('step'))
  if (s > 0) return s
  const m = String(raw).match(/\.(\d+)/)
  return m ? Math.pow(10, -Math.min(m[1].length, 3)) : 1
}

export function bump(el, dir, big) {
  const raw = String(el.value == null ? '' : el.value)
  if (raw.trim() !== '' && !NUM.test(raw)) return
  const pct = /%\s*$/.test(raw), n = parseFloat(raw) || 0, st = stepOf(el, raw) * (big ? 10 : 1)
  const dec = Math.max(0, (String(st).split('.')[1] || '').length, ((raw.match(/\.(\d+)/) || [])[1] || '').length)
  let v = +(n + dir * st).toFixed(Math.min(dec, 4))
  const min = parseFloat(el.getAttribute('min')), max = parseFloat(el.getAttribute('max'))
  if (!isNaN(min)) v = Math.max(min, v); else if (n >= 0 && v < 0) v = 0   // 음수가 아니던 값은 0 아래로 안 내려감
  if (!isNaN(max)) v = Math.min(max, v)
  setVal(el, v.toFixed(Math.min(dec, 4)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + (pct ? '%' : ''))
}

const show = (el) => { const b = el.__slcStep; if (b) b.hidden = el.disabled || (el.type !== 'number' && String(el.value).trim() !== '' && !NUM.test(String(el.value))) }

function attach(el) {
  if (el.__slcStep || el.closest('.slc-step')) return
  const box = document.createElement('span')
  box.className = 'slc-step'
  box.innerHTML = '<button type="button" tabindex="-1" aria-label="+">▲</button><button type="button" tabindex="-1" aria-label="-">▼</button>'
  let t = null
  const stop = () => { clearTimeout(t); clearInterval(t); t = null }
  box.querySelectorAll('button').forEach((b, i) => {
    const dir = i ? -1 : 1
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (el.disabled) return
      bump(el, dir, e.shiftKey)
      stop(); t = setTimeout(() => { t = setInterval(() => bump(el, dir, e.shiftKey), 70) }, 380)
    })
    ;['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop))
  })
  el.__slcStep = box
  if (el.type === 'number') el.classList.add('slc-stepped')
  el.insertAdjacentElement('afterend', box)
  el.addEventListener('input', () => show(el))
  // ↑↓ 키도 (글 칸에서)
  if (el.type !== 'number') el.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { if (!NUM.test(String(el.value))) return; e.preventDefault(); bump(el, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey) } })
  show(el)
}

/** 그림자 뿌리(또는 요소) 아래 숫자 칸에 ▲▼ 붙이기 — 여러 번 불러도 한 번만 */
export function steppers(root) {
  if (!root || !root.querySelectorAll) return
  root.querySelectorAll(TARGET).forEach((el) => { if (el.__slcStep && !el.__slcStep.isConnected) el.__slcStep = null; attach(el); show(el) })
}
