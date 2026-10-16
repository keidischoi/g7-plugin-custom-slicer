// custom-slicer — 🧩 여러 물체 3MF 를 하나로 합칠지 묻기 · AGPL-3.0-or-later
//  3MF 안에 물체가 여럿이면(부품이 맞물린 모델) 끌어 놓기 · 열기 때 「하나로 합치기 / 따로 두기」를 물음.
//  합치면 부품의 원래 자리 그대로 한 물체가 되어 같이 옮겨지고 돌려짐. 따로 두면 0.1.43 처럼 원래 모양대로 판 빈자리에 놓되 물체는 따로.
//  칠한(paint) 물체가 있으면 칠한 정보가 물체마다라 합치지 않음. 「다음부터 묻지 않기」를 고르면 이 브라우저에 기억 (🧰 도구 줄의 단추로 다시 묻게 할 수 있음)
//  build.mjs 가 뷰어 불러오기(파일마다 물체 목록 De)에 globalThis.__slcMerge 갈고리를 넣음.

const LS = 'slc-merge'
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

/** 물체 목록 합치기 — 삼각형(모델 좌표)을 이어 붙임 · 이름은 파일 이름 · 첫 물체의 번호(프로젝트 정보)를 씀 */
export function mergeList(list, name) {
  const total = list.reduce((a, k) => a + k.modelPos.length, 0), pos = new Float32Array(total)
  let o = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const k of list) {
    pos.set(k.modelPos, o); o += k.modelPos.length
    const b = k.bbox; if (b) { x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY); x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY) }
  }
  return [{ ...list[0], name: name || list[0].name, modelPos: pos, paint: null, baked: null, bbox: Number.isFinite(x0) ? { minX: x0, minY: y0, maxX: x1, maxY: y1 } : list[0].bbox }]
}

/** 뷰어 갈고리 — file: 올린 파일 · list: 그 파일의 물체들 [{ name, modelPos, objectid, paint, bbox, baked, project }] */
async function hook(file, list) {
  try {
    if (!file || !/\.3mf$/i.test(file.name || '') || !Array.isArray(list) || list.length < 2) return list
    if (list.some((k) => k.paint || !k.modelPos)) return list   // 칠한 물체는 합치지 않음
    const p = pref(), choice = p === 'merge' || p === 'keep' ? p : await ask(file.name, list.length)
    return choice === 'merge' ? mergeList(list, String(file.name).replace(/\.3mf$/i, '')) : list
  } catch (e) { return list }
}
globalThis.__slcMerge = hook

/** 🧰 「다시 묻기」 — 기억한 선택을 지움 */
export function resetMergePref() { setPref('') }
export const mergePref = pref
