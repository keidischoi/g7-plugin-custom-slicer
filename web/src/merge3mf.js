// custom-slicer — 🧩 여러 물체 3MF 를 하나로 합칠지 묻기 · AGPL-3.0-or-later
//  3MF 안에 물체가 여럿이면(부품이 맞물린 모델) 끌어 놓기 · 열기 때 「하나로 합치기 / 따로 두기」를 물음.
//  합치면 부품의 원래 자리 그대로 한 물체가 되어 같이 옮겨지고 돌려짐. 따로 두면 0.1.43 처럼 원래 모양대로 판 빈자리에 놓되 물체는 따로.
//  0.1.45 합칠 때 다색 그대로 — 부품마다 그 필라멘트로 면을 칠해 둠 (부품에 칠한 것도 이어 붙임). 「다음부터 묻지 않기」를 고르면 이 브라우저에 기억 (🧰 도구 줄의 단추로 다시 묻게 할 수 있음)
//  build.mjs 가 뷰어 불러오기(파일마다 물체 목록 De)에 globalThis.__slcMerge 갈고리를 넣음.

import { read3mfColors } from './colors3mf.js'

const LS = 'slc-merge'
/** 3MF 칠하기 글자 (OrcaSlicer TriangleSelector) — 칠하지 않은 통 면 하나의 상태 n: 1 → "4", 2 → "8", 3 이상 → (n-3) 16진수 + "C" */
export const encState = (n) => (n === 1 ? '4' : n === 2 ? '8' : (n - 3).toString(16).toUpperCase() + 'C')
const pref = () => { try { return localStorage.getItem(LS) || '' } catch (e) { return '' } }
const setPref = (v) => { try { localStorage.setItem(LS, v) } catch (e) {} }

/** 묻는 창 — 'merge' | 'keep' */
function ask(name, n) {
  return new Promise((resolve) => {
    const dark = document.documentElement.classList.contains('dark')
    const bg = dark ? '#0f172a' : '#fff', fg = dark ? '#e2e8f0' : '#0f172a', mute = dark ? '#94a3b8' : '#64748b', line = dark ? '#334155' : '#e2e8f0'
    const wrap = document.createElement('div')
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true')
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,23,42,.45);font:14px system-ui,"Malgun Gothic",sans-serif'
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    wrap.innerHTML = '<div style="width:min(420px,calc(100vw - 32px));padding:20px 20px 16px;border-radius:16px;background:' + bg + ';color:' + fg + ';border:1px solid ' + line + ';box-shadow:0 20px 50px rgba(0,0,0,.3)">' +
      '<div style="font-weight:800;font-size:16px;margin-bottom:6px">🧩 ' + esc('여러 물체가 든 3MF 예요') + '</div>' +
      '<div style="color:' + mute + ';line-height:1.55;margin-bottom:14px">' + esc(name) + ' — ' + esc('물체') + ' ' + n + esc('개') + '<br>' +
      esc('하나로 합치면 부품이 붙은 모양 그대로 한 물체가 되어 같이 옮기고 돌려요. 따로 두면 모양은 그대로 놓되 물체마다 따로 움직여요.') + '</div>' +
      '<label style="display:flex;align-items:center;gap:6px;color:' + mute + ';font-size:12.5px;margin-bottom:14px;cursor:pointer"><input type="checkbox" data-m="remember" style="margin:0"> ' + esc('다음부터 묻지 않기 (이 브라우저)') + '</label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" data-m="keep" style="padding:9px 14px;border-radius:10px;border:1px solid ' + line + ';background:transparent;color:' + fg + ';font:700 13.5px system-ui,sans-serif;cursor:pointer">' + esc('따로 두기') + '</button>' +
      '<button type="button" data-m="merge" style="padding:9px 14px;border-radius:10px;border:0;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font:800 13.5px system-ui,sans-serif;cursor:pointer">' + esc('하나로 합치기') + '</button></div></div>'
    document.body.appendChild(wrap)
    const done = (v) => { if (wrap.querySelector('[data-m=remember]').checked) setPref(v); wrap.remove(); removeEventListener('keydown', key, true); resolve(v) }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('keep') } else if (e.key === 'Enter') { e.stopPropagation(); done('merge') } }
    addEventListener('keydown', key, true)
    wrap.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) done(b.getAttribute('data-m')) })
    setTimeout(() => { const m = wrap.querySelector('[data-m=merge]'); if (m) m.focus() }, 0)
  })
}

/** 물체 목록 합치기 — 삼각형(모델 좌표)을 이어 붙임 · 이름은 파일 이름 · 첫 물체의 번호(프로젝트 정보)를 씀.
 *  0.1.45 다색 그대로 — exts[i] 가 있으면 i 번째 부품의 면을 모두 그 필라멘트(1부터)로 칠함 (부품에 이미 칠한 면은 그대로 · 면 번호는 이어 붙인 만큼 밀어 줌) */
export function mergeList(list, name, exts) {
  const total = list.reduce((a, k) => a + k.modelPos.length, 0), pos = new Float32Array(total)
  let o = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const k of list) {
    pos.set(k.modelPos, o); o += k.modelPos.length
    const b = k.bbox; if (b) { x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY); x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY) }
  }
  let paint = null
  if ((exts && exts.some((e) => e > 0)) || list.some((k) => k.paint)) {
    paint = { color: new Map(), supports: new Map(), seam: new Map(), fuzzy: new Map() }
    let f0 = 0
    list.forEach((k, i) => {
      const n = k.modelPos.length / 9, own = k.paint || null
      if (own) for (const key of Object.keys(paint)) if (own[key] && own[key].forEach) own[key].forEach((v, f) => paint[key].set(f0 + f, v))
      const e = exts && exts[i]
      if (e > 0) { const code = encState(e); for (let f = 0; f < n; f++) if (!paint.color.has(f0 + f)) paint.color.set(f0 + f, code) }
      f0 += n
    })
  }
  return [{ ...list[0], name: name || list[0].name, modelPos: pos, paint, baked: null, bbox: Number.isFinite(x0) ? { minX: x0, minY: y0, maxX: x1, maxY: y1 } : list[0].bbox }]
}

/** 뷰어 갈고리 — file: 올린 파일 · list: 그 파일의 물체들 [{ name, modelPos, objectid, paint, bbox, baked, project }] */
async function hook(file, list) {
  try {
    if (!file || !/\.3mf$/i.test(file.name || '') || !Array.isArray(list) || list.length < 2) return list
    if (list.some((k) => !k.modelPos)) return list
    const p = pref(), choice = p === 'merge' || p === 'keep' ? p : await ask(file.name, list.length)
    if (choice !== 'merge') return list
    // 0.1.45 부품마다 필라멘트 — 프로젝트(Bambu · Orca)는 물체 정보의 extruder, 아니면 3MF 의 부품 색 → 임시 번호(색 차례) · 색 갈고리가 나중에 실제 칸으로 바꿈
    const meta = list[0].project && list[0].project.objectMeta
    let exts = list.map((k) => { const m = meta && meta.get && meta.get(k.objectid); const e = Number(m && m.extruder); return Number.isInteger(e) && e >= 1 ? e : 0 })
    let parts = null
    if (!exts.some((e) => e > 0)) {
      const map = await read3mfColors(file), cols = list.map((k) => map[k.objectid] || null), uniq = [...new Set(cols.filter(Boolean))]
      if (uniq.length > 1 || (uniq.length === 1 && cols.some((c) => !c))) {
        exts = cols.map((c) => (c ? uniq.indexOf(c) + 1 : 0))
        let f0 = 0; parts = list.map((k, i) => { const r = { start: f0, count: k.modelPos.length / 9, color: cols[i] }; f0 += r.count; return r })
      } else exts = null
    }
    const out = mergeList(list, String(file.name).replace(/\.3mf$/i, ''), exts)
    globalThis.__slcLastMerge = parts ? { file, objectid: list[0].objectid, parts } : null   // colors3mf.js 의 색 갈고리가 받아 실제 필라멘트 칸으로
    return out
  } catch (e) { return list }
}
globalThis.__slcMerge = hook

/** 🧰 「다시 묻기」 — 기억한 선택을 지움 */
export function resetMergePref() { setPref('') }
export const mergePref = pref
