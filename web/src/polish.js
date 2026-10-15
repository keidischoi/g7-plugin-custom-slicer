// custom-slicer — 뷰어 · 설정 칸 다듬기 · AGPL-3.0-or-later
//  three-slicer 의 <Viewport/> · <SettingsPanel/> 은 자기 그림자 DOM(Shadow DOM) 안에서 그려서 바깥 CSS 가 닿지 않음 →
//  그 그림자 뿌리마다 <style data-slc-polish> 하나를 넣어 입력칸 · 숫자칸 · 고르기 · 카드 · 단추를 출력 검사기 말씨(둥근 · 하늘색 · 정갈)로
const CHEV = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"
const LENS = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E\")"
const FIELD = [
  '.side-card select', '.side-card input[type=number]', '.side-card input[type=text]', '.side-card input:not([type])',
  '.sc-bed input', '.sc-num input', '.purge-grid input', '.bse-grid input',
  '.settings-panel input[type=text]', '.settings-panel input[type=number]', '.settings-panel input:not([type])', '.settings-panel select', '.settings-panel textarea',
  '.row input[type=text]', '.row input:not([type])', '.row select', '.row textarea', '.sp-builder select',
].join(',')
const on = (sfx) => FIELD.split(',').map((x) => x + sfx).join(',')
export const POLISH_CSS = `
/* custom-slicer — 출력 검사기 말씨: 둥근 칸 · 하늘색 초점 · 숫자는 오른쪽 정렬 · 줄 간격 넉넉히 */
${FIELD}{box-sizing:border-box;height:30px;padding:4px 10px;border:1px solid #d8e1ea;border-radius:9px;background-color:#fff;color:#0f172a;font:inherit;font-size:12.5px;line-height:1.2;
  font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s,box-shadow .15s;box-shadow:0 1px 1px rgba(15,23,42,.03)}
${on(':hover')}{border-color:#93d7f5}
${on(':focus')}{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.18)}
${on(':disabled')}{background-color:#f1f5f9;color:#94a3b8;cursor:not-allowed}
.side-card select,.settings-panel select,.row select,.sp-builder select{appearance:none;-webkit-appearance:none;padding-right:26px;background-image:${CHEV};background-repeat:no-repeat;background-position:right 9px center;background-size:10px 7px;cursor:pointer}
.side-card input[type=number],.settings-panel input[type=number],.sc-bed input,.sc-num input,.purge-grid input,.bse-grid input,.inputwrap input{text-align:right}
input[type=number]::-webkit-inner-spin-button{opacity:.35;margin-left:4px}
input[type=number]:hover::-webkit-inner-spin-button{opacity:.8}
.settings-panel textarea{height:auto;min-height:60px;padding:6px 10px;line-height:1.45;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
input[type=checkbox]{accent-color:#0ea5e9;width:15px;height:15px;cursor:pointer}
input[type=range]{accent-color:#0ea5e9}
.filament-row input[type=color]{width:30px;height:26px;border-radius:8px;border:1px solid #d8e1ea;padding:2px}
/* 오른쪽 카드 (프린터 · 필라멘트 · 물체 · 품질) */
.side-card{border-radius:16px;border-color:#e2e8f0;padding:12px 14px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 4px 14px rgba(15,23,42,.05)}
.sc-head{font-size:13.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px}
.sc-count{border-radius:99px;padding:1px 7px}
.sc-head-btns button{width:26px;height:26px;border-radius:8px;border-color:#d8e1ea;background:#fff;transition:all .15s}
.sc-head-btns button:hover:not(:disabled){border-color:#0ea5e9;color:#0369a1;background:#f0f9ff}
.sc-head-btns.sc-preset-btns button{width:auto;padding:0 10px;font-size:11.5px;font-weight:700}
.sc-info{padding:4px 0;font-size:12.5px;align-items:center;gap:8px}
.sc-info select,.sc-info input{max-width:62%}
.sc-model{max-width:62%;height:28px;font-size:12px}
.sc-bed input{width:66px;height:28px;padding:3px 8px}
.sc-num input{width:72px;height:28px;padding:3px 8px}
.purge-grid input,.bse-grid input{height:26px;padding:2px 6px;border-radius:7px}
.sc-fold>summary{padding:5px 0}
/* 설정 칸 (SettingsPanel) */
.sp-search{height:36px;padding:6px 12px 6px 34px;border:1px solid #d8e1ea;border-radius:12px;font-size:13px;background:#fff ${LENS} no-repeat 11px center/15px 15px;outline:none;transition:border-color .15s,box-shadow .15s}
.sp-search:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.18)}
.sp-builder{font-weight:700}
.sp-pages{gap:5px}
.sp-pages button{border-radius:99px;padding:5px 12px;font-size:12px;font-weight:700;border:1.5px solid #e2e8f0;background:#fff;color:#475569;transition:all .15s}
.sp-pages button:hover{border-color:#7dd3fc;color:#0369a1}
.sp-pages button.on{background:#ecfeff;color:#0284c7;border-color:#0ea5e9;box-shadow:0 2px 8px rgba(14,165,233,.18)}
.sp-modes button{border-radius:99px;padding:3px 10px;font-weight:700}
.settings-panel .sp-body h2,.settings-panel .sp-body h3{font-size:14px;font-weight:800;letter-spacing:-.01em;margin:14px 0 4px;padding-bottom:6px;border-bottom:2px solid #e0f2fe;color:#0f172a}
.row,.settings-panel .row{border-bottom:1px solid #eef2f6;padding:8px 2px;column-gap:10px}
.settings-panel .row:hover{background:linear-gradient(90deg,rgba(14,165,233,.05),transparent)}
.settings-panel .row .lbl{font-size:12.5px;font-weight:650;color:#0f172a}
.row .key{font-size:10.5px;color:#94a3b8;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
/* 좁은 옆 칸에서 이름이 「D…」로 잘리지 않게 — 이름 · 표시 한 줄, 그 아래 설정 키, 그 아래 오른쪽에 값 */
.settings-panel .row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"lbl badge" "key key" "widget widget";row-gap:4px}
.settings-panel .row .lbl{white-space:normal;overflow:visible;line-height:1.35}
.settings-panel .row .key{white-space:nowrap}
.settings-panel .row .inputwrap,.settings-panel .row>select,.settings-panel .row>input,.settings-panel .row>textarea{justify-self:end}
.settings-panel .row .inputwrap input:not([type=checkbox]):not([type=color]){width:112px}
.settings-panel .row>select,.settings-panel .row .inputwrap select{min-width:150px;max-width:100%}
.settings-panel .row>textarea{justify-self:stretch;max-width:none;width:100%}
.settings-panel .row .badge{font-size:10px;border-radius:99px;padding:1px 7px}
.inputwrap{gap:6px;color:#64748b;font-size:12px}
.reset-btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:2px 7px;cursor:pointer;color:#64748b;transition:all .15s}
.reset-btn:hover{border-color:#f59e0b;color:#b45309;background:#fffbeb}
.row.disabled{opacity:.45}
/* 0.1.4 프린터 칸 Load · Save 같은 작은 단추 (브라우저 기본 회색이던 것) */
.sc-mini{border:1px solid #d8e1ea;background:#fff;color:#0f172a;border-radius:8px;padding:3px 10px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s}
.sc-mini:hover:not(:disabled){border-color:#0ea5e9;color:#0369a1;background:#f0f9ff}
/* 0.1.6 판 가운데 📦 그림은 뺌 (글자 · 「Choose file」 단추는 그대로) */
.empty-hint .eh-icon{display:none !important}
/* 0.1.7 「Choose file」 아래 「☁️ 내 저장소에서」 — 같은 크기 · 테두리만 있는 단추 */
.empty-hint .slc-ehcloud{display:flex;align-items:center;justify-content:center;gap:6px;margin:8px auto 0;padding:7px 18px;min-width:140px;border:1.5px solid var(--_accent);border-radius:8px;background:color-mix(in srgb,var(--_light-surface) 85%,transparent);color:var(--_accent-ink);font:700 13px system-ui,sans-serif;cursor:pointer;pointer-events:auto;transition:background .15s,transform .15s}
.empty-hint .slc-ehcloud:hover{background:var(--_accent-soft);transform:translateY(-1px)}
/* 0.1.2 스크롤바는 안 보이게 — 휠 · 손가락으로는 그대로 움직임 */
*{scrollbar-width:none;-ms-overflow-style:none}
*::-webkit-scrollbar{display:none;width:0;height:0}
/* 판 위 안내 · 도구 띠 (밝은 판에 맞춤) */
.status,.status-bar{color:#475569}
/* 슬라이스 단추 */
.slice-btn{border-radius:12px;font-weight:800;letter-spacing:-.01em;background:linear-gradient(135deg,#0ea5e9,#6366f1);border:0;color:#fff;box-shadow:0 4px 14px rgba(14,165,233,.35);transition:transform .15s,box-shadow .15s}
.slice-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 18px rgba(14,165,233,.45)}
.slice-btn:disabled{background:#cbd5e1;box-shadow:none;color:#f8fafc}
.export-btn{border-radius:12px;font-weight:700}
.plate-tab,.tb-btn{border-radius:10px}
`

/**
 * 0.1.3 페이지 흐름 — 뷰어는 원래 상자 안에 꽉 차서(.app-shell absolute) 오른쪽 칸(.sidebar-scroll)만 따로 스크롤함 →
 *  상자를 내용만큼 늘리고, 3D 화면 칸(.viewport-col) · 왼쪽 도구줄 · 위 띠만 사이트 헤더 밑(--slc-top)에 붙여 멈춤 ·
 *  오른쪽 칸은 페이지와 같이 스크롤 · 슬라이스 띠(.side-bottom)는 화면 아래에 붙음
 */
export const FLOW_CSS = `
.app-shell{position:relative !important;inset:auto !important;height:auto !important;min-height:calc(100vh - var(--slc-top,12px) - 16px)}
.topbar{position:sticky;top:var(--slc-top,12px);z-index:20}
.app-body{align-items:flex-start;overflow:visible !important;height:auto !important;flex:none !important}
.viewport-col,.left-rail{position:sticky !important;top:calc(var(--slc-top,12px) + 44px);height:calc(100vh - var(--slc-top,12px) - 44px - 16px) !important;align-self:flex-start}
.viewport-col{flex:1 1 auto;min-width:0}
.sidebar{height:auto !important;max-height:none !important;overflow:visible !important;align-self:stretch}
.sidebar-scroll{overflow:visible !important;height:auto !important;max-height:none !important;flex:none !important}
.side-bottom{position:sticky;bottom:0;z-index:10;background:var(--_light-surface);box-shadow:0 -6px 16px rgba(15,23,42,.06)}
`

/** host 아래 그림자 뿌리를 찾아 스타일을 넣음 (나중에 생기는 뿌리도 — 패널을 열 때) · opts.flow: 페이지 흐름 · 돌려주는 함수로 멈춤 */
export function polish(host, opts = {}) {
  if (!host || !POLISH_CSS) return () => {}
  const seen = new WeakSet()
  const put = (root) => {
    if (seen.has(root)) return
    seen.add(root)
    if (!Array.from(root.children).some((el) => el.tagName === 'STYLE' && el.hasAttribute('data-slc-polish'))) { const st = document.createElement('style'); st.setAttribute('data-slc-polish', '1'); st.textContent = POLISH_CSS + (opts.flow ? FLOW_CSS : ''); root.appendChild(st) }
    walk(root)
    try { new MutationObserver(() => walk(root)).observe(root, { childList: true, subtree: true }) } catch (e) {}
  }
  const walk = (n) => { if (!n) return; if (n.shadowRoot) put(n.shadowRoot); if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot) put(c.shadowRoot) }) }
  walk(host)
  let mo = null
  try { mo = new MutationObserver(() => walk(host)); mo.observe(host, { childList: true, subtree: true }) } catch (e) {}
  return () => { try { mo && mo.disconnect() } catch (e) {} }
}

/** 그림자 뿌리에 이름 붙은 스타일 하나를 넣거나(css) 뺌(빈 값) — 화면 상태에 따라 켜고 끄는 규칙 */
export function setRule(host, id, css) {
  const walk = (n) => {
    if (!n) return
    if (n.shadowRoot) {
      // 0.1.6 그림자 뿌리에서는 :scope 가 아무것도 가리키지 않아 예전 스타일을 못 찾았음(어두운 칸이 밝은 테마에서도 남던 까닭) → 바로 아래 자식에서 찾음
      const r = n.shadowRoot, old = Array.from(r.children).find((el) => el.tagName === 'STYLE' && el.getAttribute('data-slc-rule') === id)
      if (css && !old) { const st = document.createElement('style'); st.setAttribute('data-slc-rule', id); st.textContent = css; r.appendChild(st) } else if (!css && old) old.remove()
      walk(r)
    }
    if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot) walk(c) })
  }
  walk(host)
}

/** 0.1.4 어두운 테마 — POLISH_CSS 의 밝은 색(흰 칸 · 연한 테두리)을 어두운 색으로 (사이트 테마를 바꾸면 바로 따라감 — app.js 가 켜고 끔) */
export const DARK_CSS = `
${FIELD}{background-color:#0f172a;color:#e2e8f0;border-color:#334155;box-shadow:none}
${on(':hover')}{border-color:#0e7490}
${on(':disabled')}{background-color:#172033;color:#64748b}
.side-card select,.settings-panel select,.row select,.sp-builder select{background-image:${CHEV.replace('%2364748b', '%2394a3b8')}}
.side-card{border-color:#334155;box-shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25)}
.sc-head-btns button{background:#1e293b;border-color:#334155;color:#e2e8f0}
.sc-head-btns button:hover:not(:disabled){background:#0b3a55;border-color:#38bdf8;color:#7dd3fc}
.filament-row input[type=color]{border-color:#334155}
.sp-search{background-color:#0f172a;color:#e2e8f0;border-color:#334155}
.sp-pages button{background:#1e293b;border-color:#334155;color:#cbd5e1}
.sp-pages button:hover{border-color:#0e7490;color:#7dd3fc}
.sp-pages button.on{background:#0b3a55;color:#7dd3fc;border-color:#38bdf8}
.settings-panel .sp-body h2,.settings-panel .sp-body h3{color:#e2e8f0;border-bottom-color:#0b3a55}
.row,.settings-panel .row{border-bottom-color:#243147}
.settings-panel .row:hover{background:linear-gradient(90deg,rgba(56,189,248,.08),transparent)}
.settings-panel .row .lbl{color:#e2e8f0}
.row .key{color:#64748b}
.reset-btn{background:#1e293b;border-color:#334155;color:#94a3b8}
.reset-btn:hover{background:#3a2a10;border-color:#f59e0b;color:#fcd34d}
.status,.status-bar{color:#94a3b8}
.sc-mini{background:#1e293b;border-color:#334155;color:#e2e8f0}
.sc-mini:hover:not(:disabled){background:#0b3a55;border-color:#38bdf8;color:#7dd3fc}
.slice-btn:disabled{background:#334155;color:#94a3b8}
.side-bottom{background:#1e293b;box-shadow:0 -6px 16px rgba(0,0,0,.35)}
`
