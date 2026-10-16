// custom-slicer — 🎚️ 미리 보기 층 · 노즐 움직임 슬라이더 (Bambu Studio 처럼 3D 화면 위) · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)의 층 범위(layer-lo · layer-hi) · 노즐 움직임(move-range) 슬라이더는 오른쪽 설정 칸 맨 아래에 있어서
//  찾기 어려웠음. 0.1.22 3D 화면에 세로 층 슬라이더(손잡이 두 개: 아래 층 · 위 층) · 노즐 움직임 슬라이더(▶ 재생 · 한 칸씩)를 둠.
//  0.1.27 자리: 층 슬라이더는 왼쪽, 노즐(지금 층) 띠는 아래, 🧰 도구는 오른쪽 벽.
//  뷰어의 원래 슬라이더 값을 바꿔서 움직이므로 보이는 모양 · 단축키(↑↓ · L · T)는 뷰어 그대로.

export const LAYER_CSS = `
/* 0.1.26 hidden 이 진짜로 숨기게 — 아래 display:flex 가 hidden 을 이겨서 준비 화면에서도 보였음 */
.slc-ly[hidden],.slc-mv[hidden]{display:none!important}
/* 0.1.27 층 슬라이더는 3D 화면 왼쪽 · 노즐(지금 층) 띠는 아래 · 🧰 도구는 오른쪽 벽에 그대로 */
.slc-ly{position:absolute;top:14px;left:10px;bottom:46px;z-index:16;display:flex;flex-direction:column;align-items:center;gap:6px;width:46px;padding:8px 0;
  border-radius:14px;background:color-mix(in srgb,var(--_light-surface) 92%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px rgba(15,23,42,.10);backdrop-filter:blur(6px);user-select:none;touch-action:none}
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
.slc-mv{position:absolute;bottom:48px;left:66px;right:66px;z-index:16;display:flex;align-items:center;gap:6px;padding:6px 10px;
  border-radius:14px;background:color-mix(in srgb,var(--_light-surface) 92%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px rgba(15,23,42,.10);backdrop-filter:blur(6px)}
.slc-mv button{display:grid;place-items:center;flex:none;width:28px;height:26px;padding:0;border:0;border-radius:8px;background:none;color:var(--_light-text);font:700 12px system-ui,sans-serif;cursor:pointer}
.slc-mv button:hover{background:var(--_accent-soft);color:var(--_accent-ink)}
.slc-mv button.play{background:var(--_accent);color:#fff}
.slc-mv input{flex:1;min-width:60px;accent-color:#0ea5e9;cursor:pointer}
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
    '<input type="range" min="0" max="0" value="0" aria-label="' + esc('노즐 움직임 — 위 층에서 노즐이 어디까지 갔는지') + '"><b></b>'
  col.appendChild(ly); col.appendChild(mv)
  for (const el of [ly, mv]) for (const ev of ['pointerdown', 'mousedown', 'wheel', 'click']) el.addEventListener(ev, (e) => e.stopPropagation())

  const q = (id) => root.querySelector('[data-testid="' + id + '"]')
  const tr = ly.querySelector('.slc-ly-tr'), fill = ly.querySelector('.slc-ly-fill'), thHi = ly.querySelector('[data-th=hi]'), thLo = ly.querySelector('[data-th=lo]')
  const nHi = ly.querySelector('[data-n=hi]'), nLo = ly.querySelector('[data-n=lo]'), one = ly.querySelector('[data-ly=one]')
  const mr = mv.querySelector('input'), mb = mv.querySelector('b'), play = mv.querySelector('[data-mv=play]')
  let timer = 0, mrHold = false   // mrHold: 노즐 슬라이더를 끄는 중 (값을 덮어쓰지 않음)
  mr.addEventListener('pointerdown', () => { mrHold = true }); window.addEventListener('pointerup', () => { mrHold = false })
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
    // 0.1.27 자리 — 노즐 띠: 아래 안내 줄 위, 왼쪽 「슬라이스 정보」 상자와 오른쪽 판 고르기(1 · +) 사이 (좁으면 정보 상자 위로) ·
    //  슬라이스 완료 띠(페이지 쪽)와 겹치면 그 위로 / 층 슬라이더: 왼쪽, 정보 상자 · 노즐 띠 위에서 끝남 · 3D 칸 아래가 화면 밖이면 화면 안까지만
    const cr = col.getBoundingClientRect(), vis = (e) => (e && e.offsetParent && !e.hidden ? e.getBoundingClientRect() : null)
    const sr = vis(root.querySelector('.stats-card')), pr = vis(root.querySelector('.plate-bar'))
    const offscreen = Math.max(0, Math.round(cr.bottom - window.innerHeight))
    let mL = (sr ? Math.round(sr.right - cr.left) : 10) + 8, mR = (pr && pr.left > cr.left + cr.width / 2 ? Math.round(cr.right - pr.left) : 10) + 8, mB = 48 + offscreen
    const vt = vis(col.querySelector('.slc-vt'))   // 🧰 도구 줄이 띠 높이까지 내려와 있으면 그 왼쪽에서 끝남
    if (vt && vt.bottom > cr.bottom - mB - 44) mR = Math.max(mR, Math.round(cr.right - vt.left) + 8)
    if (cr.width - mL - mR < 280) { mL = 66; mR = vt && vt.bottom > cr.bottom - (sr ? cr.bottom - sr.top : 48) - 52 ? Math.round(cr.right - vt.left) + 8 : 10; mB = (sr ? Math.round(cr.bottom - sr.top) : 48) + 8 + (sr ? 0 : offscreen) }
    mB = Math.max(mB, 48 + offscreen)   // 3D 칸 아래가 화면 밖이면 보이는 곳까지 올림
    const dk = document.querySelector('.slc-dock'), dr = dk ? dk.getBoundingClientRect() : null
    if (dr && dr.height && dr.top < cr.bottom - mB && dr.bottom > cr.bottom - mB - 44 && dr.left < cr.right - mR && dr.right > cr.left + mL) mB = Math.round(cr.bottom - dr.top) + 8
    if (mv.__p !== mL + ',' + mR + ',' + mB) { mv.__p = mL + ',' + mR + ',' + mB; mv.style.left = mL + 'px'; mv.style.right = mR + 'px'; mv.style.bottom = mB + 'px' }
    let lyB = Math.max(46 + offscreen, m ? mB + 52 : 0)
    if (sr) lyB = Math.max(lyB, Math.round(cr.bottom - sr.top) + 8)
    if (m && mL > 60 && sr) lyB = Math.max(lyB, Math.round(cr.bottom - sr.top) + 8)
    if (mL === 66) lyB = Math.max(46 + offscreen, sr ? Math.round(cr.bottom - sr.top) + 8 : 0)
    if (ly.__b !== lyB) { ly.__b = lyB; ly.style.bottom = lyB + 'px' }
    const max = Number(hi.max) || 0, a = Number(lo.value) || 0, b = Number(hi.value) || 0
    const pos = (v) => (max > 0 ? (1 - v / max) * 100 : 100) + '%'
    thHi.style.top = pos(b); thLo.style.top = pos(a)
    fill.style.top = pos(b); fill.style.bottom = (max > 0 ? (a / max) * 100 : 0) + '%'
    nHi.innerHTML = (b + 1) + '<small>/' + (max + 1) + '</small>'; nLo.textContent = String(a + 1)
    const sb = q('single-layer-btn'); one.classList.toggle('on', !!(sb && /\bon\b|active/.test(sb.className)) || (a === b && max > 0))
    if (m) {
      if (mr.max !== m.max) mr.max = m.max
      if (!mrHold) mr.value = m.value
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
  mr.addEventListener('input', () => { const m = q('move-range'); if (m) setVal(m, mr.value); stopPlay(); sync() })
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
