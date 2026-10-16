// custom-slicer — 🎚️ 미리 보기 층 · 노즐 움직임 슬라이더 (Bambu Studio 처럼 3D 화면 위) · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)의 층 범위(layer-lo · layer-hi) · 노즐 움직임(move-range) 슬라이더는 오른쪽 설정 칸 맨 아래에 있어서
//  찾기 어려웠음. 0.1.22 3D 화면에 세로 층 슬라이더(손잡이 두 개: 아래 층 · 위 층) · 노즐 움직임 슬라이더(▶ 재생 · 한 칸씩)를 둠.
//  0.1.28 자리: 층 슬라이더는 왼쪽(벽에서 조금 띄움), 노즐(지금 층) 띠는 위 가운데, 🧰 도구는 오른쪽 벽에 딱 붙음.
//  뷰어의 원래 슬라이더 값을 바꿔서 움직이므로 보이는 모양 · 단축키(↑↓ · L · T)는 뷰어 그대로.

export const LAYER_CSS = `
/* 0.1.26 hidden 이 진짜로 숨기게 — 아래 display:flex 가 hidden 을 이겨서 준비 화면에서도 보였음 */
.slc-ly[hidden],.slc-mv[hidden]{display:none!important}
/* 0.1.28 층 슬라이더는 3D 화면 왼쪽(벽에서 조금 띄움) · 노즐(지금 층) 띠는 위 가운데 */
.slc-ly{position:absolute;top:18px;left:18px;bottom:46px;z-index:16;display:flex;flex-direction:column;align-items:center;gap:6px;width:46px;padding:8px 0;
  border-radius:14px;background:color-mix(in srgb,var(--_light-surface) 92%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px rgba(15,23,42,.10);backdrop-filter:blur(6px);user-select:none;touch-action:none}
/* 0.1.29 층 슬라이더는 바탕 없이(투명) — 판 · 모델을 가리지 않게. 글자 · 단추는 그림자로 어느 바탕에서도 읽힘 */
.slc-ly{background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}
.slc-ly .slc-ly-n,.slc-ly button{color:var(--_light-text);text-shadow:0 0 3px var(--_light-surface),0 0 2px var(--_light-surface),0 0 1px var(--_light-surface)}
.slc-ly .slc-ly-n small{color:var(--_light-text-muted)}
.slc-ly-tr::before{background:rgba(148,163,184,.45)!important}
.slc-ly button{display:grid;place-items:center;width:30px;height:24px;padding:0;border:0;border-radius:8px;background:none;color:var(--_light-text);font:700 11px system-ui,sans-serif;cursor:pointer}
.slc-ly button:hover{background:var(--_accent-soft);color:var(--_accent-ink)}
.slc-ly button.on{background:var(--_accent);color:#fff}
.slc-ly-n{font:700 11px system-ui,sans-serif;color:var(--_light-text);font-variant-numeric:tabular-nums;text-align:center;line-height:1.15}
.slc-ly-n small{display:block;font-weight:600;font-size:10px;color:var(--_light-text-muted)}
.slc-ly-tr{position:relative;flex:1;width:28px;cursor:pointer}
.slc-ly-tr::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:6px;margin-left:-3px;border-radius:3px;background:var(--_light-divider)}
.slc-ly-fill{position:absolute;left:50%;width:6px;margin-left:-3px;border-radius:3px;background:linear-gradient(180deg,#0ea5e9,#6366f1)}
.slc-ly-th{position:absolute;left:50%;width:22px;height:14px;margin:-7px 0 0 -11px;border-radius:7px;background:#fff;border:2px solid #0ea5e9;box-shadow:0 1px 4px rgba(15,23,42,.3);cursor:grab}
.slc-ly-th.lo{border-color:#6366f1}
.slc-ly-th:active{cursor:grabbing}
.slc-mv{position:absolute;top:14px;left:84px;right:84px;max-width:620px;margin:0 auto;z-index:16;display:flex;align-items:center;gap:6px;padding:6px 10px;
  border-radius:14px;background:color-mix(in srgb,var(--_light-surface) 92%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px rgba(15,23,42,.10);backdrop-filter:blur(6px)}
.slc-mv button{display:grid;place-items:center;flex:none;width:28px;height:26px;padding:0;border:0;border-radius:8px;background:none;color:var(--_light-text);font:700 12px system-ui,sans-serif;cursor:pointer}
.slc-mv button:hover{background:var(--_accent-soft);color:var(--_accent-ink)}
.slc-mv button.play{background:var(--_accent);color:#fff}
/* 0.1.30 노즐 띠도 층 슬라이더와 같은 모양 — 바탕 투명 · 같은 줄 · 같은 손잡이 (가로) */
.slc-mv{background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}
.slc-mv button,.slc-mv b{text-shadow:0 0 3px var(--_light-surface),0 0 2px var(--_light-surface),0 0 1px var(--_light-surface)}
.slc-mv-tr{position:relative;flex:1;min-width:60px;height:28px;cursor:pointer;touch-action:none}
.slc-mv-tr::before{content:"";position:absolute;top:50%;left:0;right:0;height:6px;margin-top:-3px;border-radius:3px;background:rgba(148,163,184,.45)}
.slc-mv-fill{position:absolute;top:50%;left:0;height:6px;margin-top:-3px;border-radius:3px;background:linear-gradient(90deg,#6366f1,#0ea5e9)}
.slc-mv-th{position:absolute;top:50%;width:14px;height:22px;margin:-11px 0 0 -7px;border-radius:7px;background:#fff;border:2px solid #0ea5e9;box-shadow:0 1px 4px rgba(15,23,42,.3);cursor:grab}
.slc-mv-th:active{cursor:grabbing}
/* 0.1.30 층 슬라이더 — 맨 위 · 맨 아래 손잡이가 위아래 숫자를 덮던 것: 줄 끝에 손잡이 반만큼 여백 */
.slc-ly-tr{margin:10px 0}
.slc-mv b{flex:none;min-width:86px;font:700 11.5px system-ui,sans-serif;color:var(--_light-text);font-variant-numeric:tabular-nums;text-align:right}
.slc-mv b small{font-weight:600;color:var(--_light-text-muted)}
`

import { viewOf } from './plate.js'

const done = new WeakSet()
const setVal = (inp, v) => {   // React 가 쥔 입력칸 값 바꾸기 — 값을 넣고 input 알림
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  d.set.call(inp, String(v)); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }))
}

/** root: 뷰어 그림자 뿌리 · col: .viewport-col — 미리 보기일 때만 보임 (한 번만 붙음) */
export function mountLayers(root, col) {
  if (!root || !col || done.has(col)) return
  done.add(col)
  if (!root.querySelector('style[data-slc-layers]')) { const st = document.createElement('style'); st.setAttribute('data-slc-layers', '1'); st.textContent = LAYER_CSS; root.appendChild(st) }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const btn = (k, v, tip, label) => '<button type="button" data-' + k + '="' + v + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + label + '</button>'
  const ly = document.createElement('div'); ly.className = 'slc-ly'; ly.hidden = true
  ly.innerHTML = btn('ly', 'up', '위 층 하나 올리기 (↑)', '▲') +
    '<div class="slc-ly-n" data-n="hi"></div><div class="slc-ly-tr"><div class="slc-ly-fill"></div><div class="slc-ly-th hi" data-th="hi" title="' + esc('위 층 — 여기까지 보임') + '"></div><div class="slc-ly-th lo" data-th="lo" title="' + esc('아래 층 — 여기부터 보임') + '"></div></div>' +
    '<div class="slc-ly-n" data-n="lo"></div>' + btn('ly', 'down', '위 층 하나 내리기 (↓)', '▼') + btn('ly', 'one', '한 층만 보기 (L)', esc('한 층'))
  const mv = document.createElement('div'); mv.className = 'slc-mv'; mv.hidden = true
  mv.innerHTML = btn('mv', 'prev', '노즐 한 칸 뒤로', '◀') + btn('mv', 'play', '노즐 움직임 재생 · 멈춤', '▶') + btn('mv', 'next', '노즐 한 칸 앞으로', '▶|') +
    '<div class="slc-mv-tr" role="slider" aria-label="' + esc('노즐 움직임 — 위 층에서 노즐이 어디까지 갔는지') + '"><div class="slc-mv-fill"></div><div class="slc-mv-th"></div></div><b></b>'
  col.appendChild(ly); col.appendChild(mv)
  for (const el of [ly, mv]) for (const ev of ['pointerdown', 'mousedown', 'wheel', 'click']) el.addEventListener(ev, (e) => e.stopPropagation())

  const q = (id) => root.querySelector('[data-testid="' + id + '"]')
  const tr = ly.querySelector('.slc-ly-tr'), fill = ly.querySelector('.slc-ly-fill'), thHi = ly.querySelector('[data-th=hi]'), thLo = ly.querySelector('[data-th=lo]')
  const nHi = ly.querySelector('[data-n=hi]'), nLo = ly.querySelector('[data-n=lo]'), one = ly.querySelector('[data-ly=one]')
  const mtr = mv.querySelector('.slc-mv-tr'), mfill = mv.querySelector('.slc-mv-fill'), mth = mv.querySelector('.slc-mv-th'), mb = mv.querySelector('b'), play = mv.querySelector('[data-mv=play]')
  let timer = 0
  const stopPlay = () => { clearInterval(timer); timer = 0; play.classList.remove('play'); play.textContent = '▶' }

  const sync = () => {
    const lo = q('layer-lo'), hi = q('layer-hi'), m = q('move-range')
    // 0.1.24 미리 보기 탭일 때만 — 준비 탭에서도 뷰어가 슬라이더를 쥐고 있어서 위 물체 도구줄 · 오른쪽 🧰 도구와 겹쳤음
    const pv = root.querySelector('[data-testid="mode-preview"]')
    // 0.1.26 두 번 확인 — 미리 보기 탭이 켜져 있고 · 3D 화면이 실제로 길(툴패스)을 보이고 있을 때만 (준비 화면에서는 늘 숨김)
    const vw = viewOf(), paths = !vw || !vw.toolpathGroup || vw.toolpathGroup.visible
    const on = !!(lo && hi) && !!(pv && pv.classList.contains('on')) && paths
    col.classList.toggle('slc-pv', on); ly.hidden = !on; mv.hidden = !(on && m)
    if (!on) { stopPlay(); return }
    // 0.1.28 자리 — 노즐 띠는 위 가운데(CSS) / 층 슬라이더는 왼쪽 「슬라이스 정보」 상자 위에서 끝남 · 3D 칸 아래가 화면 밖이면 화면 안까지만
    const cr = col.getBoundingClientRect(), vis = (e) => (e && e.offsetParent && !e.hidden ? e.getBoundingClientRect() : null)
    const sr = vis(root.querySelector('.stats-card'))
    const offscreen = Math.max(0, Math.round(cr.bottom - window.innerHeight))
    const lyB = Math.max(46 + offscreen, sr ? Math.round(cr.bottom - sr.top) + 10 : 0)
    if (ly.__b !== lyB) { ly.__b = lyB; ly.style.bottom = lyB + 'px' }
    const max = Number(hi.max) || 0, a = Number(lo.value) || 0, b = Number(hi.value) || 0
    const pos = (v) => (max > 0 ? (1 - v / max) * 100 : 100) + '%'
    thHi.style.top = pos(b); thLo.style.top = pos(a)
    fill.style.top = pos(b); fill.style.bottom = (max > 0 ? (a / max) * 100 : 0) + '%'
    nHi.innerHTML = (b + 1) + '<small>/' + (max + 1) + '</small>'; nLo.textContent = String(a + 1)
    const sb = q('single-layer-btn'); one.classList.toggle('on', !!(sb && /\bon\b|active/.test(sb.className)) || (a === b && max > 0))
    if (m) {
      const mmax = Number(m.max) || 0, p = mmax > 0 ? (Number(m.value) / mmax) * 100 : 100
      mth.style.left = p + '%'; mfill.style.width = p + '%'; mtr.setAttribute('aria-valuenow', m.value); mtr.setAttribute('aria-valuemax', m.max)
      mb.innerHTML = esc('이동') + ' ' + (Number(m.value) + 1).toLocaleString() + '<small> / ' + (Number(m.max) + 1).toLocaleString() + '</small>'
    }
  }
  setInterval(sync, 150)

  // 세로 층 슬라이더 — 손잡이 끌기 · 줄을 누르면 가까운 손잡이가 옴
  let drag = null
  const valAt = (y) => { const r = tr.getBoundingClientRect(), hi = q('layer-hi'), max = Number(hi && hi.max) || 0; return Math.round((1 - Math.min(1, Math.max(0, (y - r.top) / r.height))) * max) }
  const put = (which, v) => {
    const lo = q('layer-lo'), hi = q('layer-hi'); if (!lo || !hi) return
    if (which === 'hi') setVal(hi, Math.max(v, Number(lo.value) || 0))
    else setVal(lo, Math.min(v, Number(hi.value) || 0))
    sync()
  }
  tr.addEventListener('pointerdown', (e) => {
    const lo = q('layer-lo'), hi = q('layer-hi'); if (!lo || !hi) return
    const v = valAt(e.clientY), t = e.target.getAttribute('data-th')
    drag = t || (Math.abs(v - Number(hi.value)) <= Math.abs(v - Number(lo.value)) ? 'hi' : 'lo')
    put(drag, v); try { tr.setPointerCapture(e.pointerId) } catch (er) {}
    e.preventDefault()
  })
  tr.addEventListener('pointermove', (e) => { if (drag) put(drag, valAt(e.clientY)) })
  const end = () => { drag = null }
  tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end)
  tr.addEventListener('wheel', (e) => { const hi = q('layer-hi'); if (!hi) return; e.preventDefault(); put('hi', Math.min(Number(hi.max), Math.max(0, Number(hi.value) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1)))) }, { passive: false })
  ly.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return
    try { b.blur() } catch (er) {}
    const hi = q('layer-hi'), k = b.getAttribute('data-ly')
    if (k === 'up' && hi) put('hi', Math.min(Number(hi.max), Number(hi.value) + 1))
    else if (k === 'down' && hi) put('hi', Math.max(0, Number(hi.value) - 1))
    else if (k === 'one') { const sb = q('single-layer-btn'); if (sb) sb.click(); setTimeout(sync, 30) }
  })

  // 노즐 움직임 — 위 층 안에서 노즐이 어디까지 갔는지 · ▶ 재생은 끝까지 가면 멈춤
  let mdrag = false
  const mput = (x) => { const m = q('move-range'); if (!m) return; const r = mtr.getBoundingClientRect(); setVal(m, Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * (Number(m.max) || 0))); sync() }
  mtr.addEventListener('pointerdown', (e) => { mdrag = true; stopPlay(); mput(e.clientX); try { mtr.setPointerCapture(e.pointerId) } catch (er) {} e.preventDefault() })
  mtr.addEventListener('pointermove', (e) => { if (mdrag) mput(e.clientX) })
  mtr.addEventListener('pointerup', () => { mdrag = false }); mtr.addEventListener('pointercancel', () => { mdrag = false })
  mtr.addEventListener('wheel', (e) => { const m = q('move-range'); if (!m) return; e.preventDefault(); stopPlay(); setVal(m, Math.min(Number(m.max), Math.max(0, Number(m.value) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1)))); sync() }, { passive: false })
  mv.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return
    try { b.blur() } catch (er) {}
    const m = q('move-range'); if (!m) return
    const k = b.getAttribute('data-mv'), max = Number(m.max) || 0
    if (k === 'prev') { stopPlay(); setVal(m, Math.max(0, Number(m.value) - 1)) }
    else if (k === 'next') { stopPlay(); setVal(m, Math.min(max, Number(m.value) + 1)) }
    else if (k === 'play') {
      if (timer) { stopPlay(); return }
      if (Number(m.value) >= max) setVal(m, 0)
      play.classList.add('play'); play.textContent = '❚❚'
      const step = Math.max(1, Math.round(max / 240))   // 끝까지 약 8초
      timer = setInterval(() => { const mm = q('move-range'); if (!mm) { stopPlay(); return } const v = Math.min(Number(mm.max), Number(mm.value) + step); setVal(mm, v); sync(); if (v >= Number(mm.max)) stopPlay() }, 33)
    }
    sync()
  })
  sync()
}
