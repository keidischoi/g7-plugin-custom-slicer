/*! custom-slicer 0.1.24 — 🖨️ 빠른 보내기 팝업 · AGPL-3.0-or-later · 소스: https://github.com/keidischoi/g7-plugin-custom-slicer
 *  다른 화면(출력 검사기 · 맞춤 3D …)의 「🖨️ 프린터로 보내기」 — 예전 웹 슬라이서(custom-web_slicer)와 같은 흐름을 이 플러그인이 맡음
 *    프린터 고르기 → 품질 · 색마다 필라멘트 · AMS 칸 · 채우기 · 서포트 · 브림 · 🧹 베드 비웠어요 → 「🔪 슬라이스하고 보내기」 → 프린터 라운지
 *  「↗ 자세히」 — 판 배치 · 칠하기 · 모든 설정이 있는 슬라이서로: 📐 출력 검사기의 「슬라이스」 탭 · 🔪 전용 슬라이서 화면(/print-slicer) 중 회원이 고름
 *  엔진(three-slicer, OrcaSlicer 를 WebAssembly 로 옮긴 것)은 처음 슬라이스할 때만 받음 · 모델은 서버로 안 감 */
import PCMod from './model-read.cjs'
import { bambuHeader, buildGcode3mf } from './gcode3mf.js'
import { pngBytes, renderThumb } from './thumb.js'
import { createSlicerClient } from 'three-slicer/client'
import { unzipModels } from './handoff.js'
import { estimateSeconds, matchPreset, hexDist } from './util.js'

const V = '0.1.24', API = '/api/plugins/custom-slicer', LOUNGE = '/api/plugins/custom-my_printer'
const PC = (PCMod && PCMod.read) ? PCMod : self.PCCore
const MAX_TOOLS = 8
const SEND_ADMIN_ONLY = true   // 「📤 보내기」는 시험하는 동안 관리자에게만 (실제 프린터에서 확인되면 false 로) — app.js 와 같이 바꿈

/* ───────── 작은 도구 ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString()
const dur = (s) => { s = Math.max(0, Math.round(s / 60)); const h = Math.floor(s / 60), m = s % 60; return h ? h + '시간' + (m ? ' ' + m + '분' : '') : Math.max(1, m) + '분' }
const scalar = (v) => (Array.isArray(v) ? v[0] : v)
function token() {
  let t = ''
  try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || '' } catch (e) {}
  if (!t) { try { t = localStorage.getItem('auth_token') || '' } catch (e) {} }
  t = String(t).replace(/^"+|"+$/g, '')
  return !t || t === 'undefined' || t === 'null' ? '' : t
}
function headers() {
  const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = token()
  if (t) h.Authorization = 'Bearer ' + t
  return h
}
function navTo(p) {
  try { if (window.G7Core && typeof G7Core.dispatch === 'function') { G7Core.dispatch({ handler: 'navigate', params: { path: p } }); return } } catch (e) {}
  location.href = p
}
/** 출력 검사기가 이 사이트에 켜져 있나 (헤더 메뉴 설정이 화면 HTML 에 실려 옴) */
function hasPrintCheck() {
  try { const n = window.G7Config && G7Config.appConfig && G7Config.appConfig.cextNav; return !!(n && n['custom-print_check'] && (n['custom-print_check'].cfg || {}).enabled !== false) || !!window.__pckLoader } catch (e) { return false }
}

/* ───────── 엔진 · 설정집 (처음 쓸 때만 받음) ───────── */
let ST = null, PROCS = null, FILS = null, client = null
async function engineData() {
  if (!ST) ST = await import('three-slicer/settings')
  if (!PROCS) PROCS = await ST.processPresets()
  if (!FILS) FILS = await ST.filamentPresets()
  return ST
}
const nameOf = (x) => (typeof x === 'string' ? x : x && x.name)

/** 색 → 압출기 계획: 물체마다 한 색이면 색마다 압출기 하나 (칠한 다색은 한 색으로 — 「↗ 자세히」의 슬라이서는 칠한 색도 됨) */
function planOf(t) {
  const n = t.length / 9, col = t.colors, pal = t.palette, parts = t.parts
  const hexOf = (c) => (c && pal && pal[c - 1] ? pal[c - 1].hex : '#c9ced6')
  if (!col || !pal) return { k: 1, tool: null, hexes: ['#c9ced6'], painted: false, many: false, colored: false }
  const first = new Map(), ids = [], area = new Map()
  let painted = false
  for (let i = 0; i < n; i++) {
    const c = col[i] || 0, key = parts ? parts[i] : 0
    if (!first.has(key)) first.set(key, c); else if (first.get(key) !== c) painted = true
    if (!area.has(c)) { area.set(c, 0); ids.push(c) }
    area.set(c, area.get(c) + 1)
  }
  const many = ids.length > MAX_TOOLS
  if (painted || many || ids.length < 2) {
    const top = ids.slice().sort((a, b) => area.get(b) - area.get(a))[0]
    return { k: 1, tool: null, hexes: [hexOf(top)], painted, many, colored: true }
  }
  const idx = new Map(ids.map((c, i) => [c, i])), tool = new Uint8Array(n)
  for (let i = 0; i < n; i++) tool[i] = idx.get(col[i] || 0)
  return { k: ids.length, tool, hexes: ids.map(hexOf), painted: false, many: false, colored: true }
}
/** 바이너리 STL — 가운데(x·y)를 원점에, 바닥을 z 0 에 (엔진이 판 가운데에 놓음) · 압출기마다 삼각형을 모음 */
function toStl(t, plan) {
  const n = t.length / 9
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < t.length; i += 3) { const x = t[i], y = t[i + 1], z = t[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), counts = new Array(plan.k).fill(0)
  dv.setUint32(80, n, true)
  let w = 84
  for (let g = 0; g < plan.k; g++) {
    for (let f = 0; f < n; f++) {
      if (plan.tool && plan.tool[f] !== g) continue
      const o = f * 9
      w += 12   // 법선은 비움 (엔진이 계산)
      for (let v = 0; v < 3; v++) { dv.setFloat32(w, t[o + v * 3] - cx, true); dv.setFloat32(w + 4, t[o + v * 3 + 1] - cy, true); dv.setFloat32(w + 8, t[o + v * 3 + 2] - z0, true); w += 12 }
      w += 2; counts[g]++
    }
  }
  const splits = []
  let acc = 0
  for (let g = 0; g < plan.k - 1; g++) { acc += counts[g]; splits.push(acc) }
  return { buf, splits, tools: counts.map((_, i) => i), size: [x1 - x0, y1 - y0, z1 - z0] }
}

/* ───────── 팝업 하나 ───────── */
export function open(root, opts = {}) {
  const S = {
    file: null, tris: null, info: null, plan: null, thumb: null, zip: null,
    lounge: [], loggedIn: false, pid: 0, admin: false,
    printer: '', process: '', fil: [], infill: 15, support: false, brim: false,
    busy: false, prog: 0, result: null, err: '', step: 'wait', ams: [], bed: false, phase: '', up: 0, done: null,
  }
  const close = () => { if (opts.close) opts.close() }
  const loungeP = () => S.lounge.find((x) => +x.id === S.pid) || null
  const processList = () => { try { return (PROCS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) { return [] } }
  const filamentLists = () => {
    let rec = [], all = []
    try { rec = (FILS.recommendedFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
    try { all = (FILS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
    return { rec, all: all.filter((x) => !rec.includes(x)) }
  }
  const printerEntry = () => { for (const k of Object.keys(ST.printersByVendor)) if (ST.printersByVendor[k][S.printer]) return ST.printersByVendor[k][S.printer]; return null }
  const defaultProcess = () => { const list = processList(), e = printerEntry(); if (e && list.includes(e[3])) return e[3]; return list.find((x) => /0\.20mm Standard/i.test(x)) || list[0] || '' }
  const defaultFilament = () => { const { rec, all } = filamentLists(), pool = rec.length ? rec : all; return pool.find((x) => /PLA Basic/i.test(x)) || pool.find((x) => /PLA/i.test(x)) || pool[0] || '' }
  const bedSize = () => {
    try {
      const s = ST.printerSettings(S.printer) || {}, pts = (Array.isArray(s.printable_area) ? s.printable_area : String(s.printable_area || '').split(',')).map((p) => String(p).split('x').map(Number))
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Number(scalar(s.printable_height)) || 250]
    } catch (e) { return null }
  }
  const setStatus = (t) => { const el = root.querySelector('[data-status]'); if (el) { el.textContent = t; el.hidden = !t } }

  async function openFile(f) {
    S.err = ''; S.result = null; S.file = f; S.tris = null; S.plan = null; S.thumb = null; S.info = null
    try {
      const t = await PC.read(f.name, await f.arrayBuffer())
      S.tris = t; S.plan = planOf(t)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (let i = 0; i < t.length; i += 3) { if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i]; if (t[i + 1] < y0) y0 = t[i + 1]; if (t[i + 1] > y1) y1 = t[i + 1]; if (t[i + 2] < z0) z0 = t[i + 2]; if (t[i + 2] > z1) z1 = t[i + 2] }
      S.info = { tris: t.length / 9, size: [x1 - x0, y1 - y0, z1 - z0] }
      const pal = t.palette, col = t.colors
      S.thumb = renderThumb(t, (fi) => (col && pal && col[fi] && pal[col[fi] - 1] ? pal[col[fi] - 1].hex : null), 512)
    } catch (e) { S.tris = null; S.err = '파일을 읽지 못했어요: ' + ((e && e.message) || e) }
  }
  function setPrinter(name) {
    S.printer = name; S.process = defaultProcess(); S.result = null
    S.fil = (S.plan ? S.plan.hexes : ['#c9ced6']).map(() => defaultFilament())
  }
  /** AMS 칸 — 색이 가장 가까운 칸으로 미리 */
  function amsDefaults() {
    const p = loungeP(), ams = ((p && p.temps && p.temps.ams) || []).filter((a) => a.slot), hexes = S.plan ? S.plan.hexes : ['#c9ced6']
    S.ams = hexes.map((h) => {
      let best = ams[0], bd = Infinity
      ams.forEach((a) => { const d = hexDist(h, a.color); if (d < bd) { bd = d; best = a } })
      return best ? String(best.slot) : 'ext'
    })
  }
  function pick(id) {
    const p = S.lounge.find((x) => +x.id === +id)
    if (!p || !p.can_send) return
    const m = matchPreset(ST.printersByVendor, p, ST.printerTechByVendor)
    if (!m) { S.err = '「' + (p.name || '') + '」 와 맞는 슬라이서 프린터 설정을 못 찾았어요 — 아래 「↗ 자세히」의 슬라이서에서 직접 골라 주세요.'; draw(); return }
    S.err = ''; S.pid = +p.id; setPrinter(m[1]); amsDefaults()
    S.step = !S.tris && S.zip ? 'file' : 'set'; draw()
  }

  function settingsMap() {
    let s = { ...ST.printerSettings(S.printer) }
    if (S.process) s = ST.applyPreset(s, PROCS.settingsFor(S.process), PROCS.keys)
    const fps = (S.fil.length ? S.fil : ['']).map((nm) => (nm && FILS.settingsFor(nm)) || {})
    s = ST.applyPreset(s, fps[0], FILS.keys)
    if (fps.length > 1) {   // 압출기마다 재료 — 필라멘트 설정은 압출기 순서대로 배열
      for (const key of FILS.keys) {
        const vals = fps.map((p) => scalar(p[key]))
        if (vals.every((v) => v === undefined)) continue
        const d = vals.find((v) => v !== undefined)
        s[key] = vals.map((v) => (v === undefined ? d : v))
      }
    }
    s.filament_colour = S.plan ? S.plan.hexes.slice() : ['#c9ced6']
    s.sparse_infill_density = S.infill + '%'
    s.enable_support = !!S.support
    if (S.support) s.support_type = 'tree(auto)'
    s.brim_type = S.brim ? 'outer_only' : 'no_brim'
    if (S.brim) s.brim_width = 5
    return s
  }
  async function slice() {
    S.busy = true; S.prog = 0; S.err = ''; S.result = null
    try {
      const plan = S.plan, stl = toStl(S.tris, plan), bed = bedSize()
      if (bed && (stl.size[0] > bed[0] + 0.5 || stl.size[1] > bed[1] + 0.5 || stl.size[2] > bed[2] + 0.5)) throw new Error('모델(' + stl.size.map((v) => Math.round(v)).join('×') + 'mm)이 이 프린터 출력 공간(' + bed.map((v) => Math.round(v)).join('×') + 'mm)보다 커요 — 「↗ 자세히」에서 돌리거나 줄여 보세요.')
      const s = settingsMap()
      const p = { ...ST.deriveKernelParams(s), gcode_stats_block: true, gcode_config_block: true, gcode_role_tags: true }
      if (plan.k >= 2) Object.assign(p, { extruder_count: plan.k, mm_group_split: stl.splits[0], mm_group_splits: stl.splits, mm_group_tools: stl.tools, wipe_tower_real: true })
      if (!client) client = createSlicerClient()
      const chunks = []
      const r = await client.slice(stl.buf, p, {
        onProgress: (d, t) => { S.prog = t ? d / t : 0; setStatus('🔪 슬라이스 중… ' + Math.round(S.prog * 100) + '%'); const bar = root.querySelector('.slc-prog i'); if (bar) bar.style.width = Math.round(S.prog * 100) + '%' },
        onLayer: (l) => { if (l.gcode) chunks.push(l.gcode) },
      })
      if (r.error) throw new Error(String(r.error))
      const st = r.stats || {}
      if ((r.warnings || []).includes('over_bed_model')) throw new Error('모델이 바닥판 밖으로 나가요 — 더 작은 모델이거나 다른 프린터를 골라 주세요.')
      const mmBy = Array.isArray(st.filament_mm_by_tool) && st.filament_mm_by_tool.length ? st.filament_mm_by_tool : [st.filament_mm || 0]
      const dens = (i) => Number(scalar(Array.isArray(s.filament_density) ? s.filament_density[i] : s.filament_density)) || 1.24
      const tools = mmBy.map((mm, i) => ({ mm, g: mm * Math.PI * 0.875 * 0.875 * dens(i) / 1000, density: dens(i), type: String(scalar(Array.isArray(s.filament_type) ? s.filament_type[i] : s.filament_type) || 'PLA'), color: (plan.hexes[i] || '#c9ced6').toUpperCase() }))
      const bambu = /^Bambu Lab /.test(S.printer)
      const body = chunks.length ? chunks.join('') : String(r.gcode || '')
      if (!body) throw new Error('엔진이 G-code 를 만들지 못했어요.')
      const seconds = st.time_estimate > 0 ? st.time_estimate : estimateSeconds(body, plan.k > 1 ? 50 : 0)
      const gcode = (bambu ? bambuHeader({ seconds, layers: st.layers || 0, maxZ: stl.size[2], tools }) : '') + body
      const base = (S.file.name || 'model').replace(/\.(stl|obj|3mf)$/i, '') || 'model'
      const thumb = S.thumb ? await pngBytes(S.thumb) : null
      const weight = tools.reduce((a, t) => a + t.g, 0)
      S.result = { gcode, tools, bambu, seconds, guessed: !(st.time_estimate > 0), layers: st.layers || 0, base, weight,
        gcode3mf: bambu ? buildGcode3mf({ gcode, thumb, seconds, weight, tools, settings: s, printer: S.printer }) : null }
    } catch (e) {
      S.err = (e && e.message) || String(e)
      if (/terminated|memory|OOM|out of bounds/i.test(S.err)) { S.err += ' — 메모리가 모자랐을 수 있어요 (큰 모델 · 휴대폰). 컴퓨터에서 해 보세요.'; try { client && client.terminate() } catch (e2) {} client = null }
    }
    S.busy = false; setStatus('')
  }
  function upload(p, R, ams, onProg) {
    return new Promise((done) => {
      const bb = (p.send_kind || 'bambu') === 'bambu', fd = new FormData()
      const blob = bb && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
      fd.append('file', blob, R.base.replace(/[^\w.-]+/g, '_').slice(0, 60) + (bb && R.gcode3mf ? '.gcode.3mf' : '.gcode'))
      fd.append('bed_clear', '1'); fd.append('plate', '1')
      if (bb && ams && ams.length && !ams.includes('ext')) { fd.append('use_ams', '1'); fd.append('ams_map', JSON.stringify(ams.map((v) => +v - 1))) } else fd.append('use_ams', '0')
      const x = new XMLHttpRequest()
      x.open('POST', LOUNGE + '/printers/' + p.id + '/send-file'); x.withCredentials = true
      Object.entries(headers()).forEach(([k, v]) => x.setRequestHeader(k, v))
      const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/); if (m) x.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(m[1]))
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total) }
      x.onload = () => {
        let d = {}; try { d = JSON.parse(x.responseText || '{}') } catch (e) {}
        const ok = x.status >= 200 && x.status < 300 && d.success !== false
        done({ ok, message: ok ? (d.message || '보냈어요.') : (x.status === 413 ? '파일이 너무 커요 — 서버의 올리기 한도를 넘었어요.' : d.message || (x.status === 401 ? '로그인이 필요해요.' : '보내지 못했어요 (' + x.status + ').')) })
      }
      x.onerror = () => done({ ok: false, message: '연결이 끊겼어요 — 다시 해 주세요.' })
      x.send(fd)
    })
  }
  async function go() {
    const p = loungeP()
    if (!p || !S.tris || !S.bed || S.busy || S.step === 'work') return
    S.err = ''; S.step = 'work'; S.phase = 'slice'; draw()
    await slice()
    if (!S.result) { S.step = 'set'; draw(); return }
    S.phase = 'upload'; S.up = 0; S.busy = true; draw()
    const R = S.result, bb = (p.send_kind || 'bambu') === 'bambu'
    const amsOn = bb && ((p.temps && p.temps.ams) || []).some((a) => a.slot)
    const r = await upload(p, R, amsOn ? S.ams : null, (v) => { S.up = v; const bar = root.querySelector('.slc-prog i'); if (bar) bar.style.width = Math.round(v * 100) + '%'; setStatus('📤 프린터 라운지에 올리는 중… ' + Math.round(v * 100) + '%') })
    S.busy = false
    if (!r.ok) { S.err = r.message; S.step = 'set'; draw(); return }
    S.done = { name: p.name, message: r.message, seconds: R.seconds, weight: R.weight, guessed: R.guessed }
    S.step = 'sent'; setStatus(''); draw()
  }
  /** 「↗ 자세히」 — 지금 파일 · 프린터를 들고 출력 검사기의 「슬라이스」 탭 또는 전용 슬라이서 화면으로 */
  function detail(where) {
    // 🔪 전용 슬라이서: 이 화면 위 큰 창 (크기 단추) · 📐 출력 검사기: 그 화면의 「슬라이스」 탭으로 (파일 · 프린터를 들고)
    const p = loungeP()
    const files = S.file ? [S.file] : S.zip ? S.zip.list.map((x) => new File([x.data], x.name)) : []
    window.__slcCarry = { files, printer: p ? { brand: p.brand || '', model: p.model || '', name: p.name || '' } : null, label: S.file ? S.file.name : S.zip ? S.zip.name : '', at: Date.now() }
    if (where !== 'pck' && typeof opts.big === 'function') { const c = window.__slcCarry; window.__slcCarry = null; close(); opts.big({ files: c.files, printer: c.printer }); return }
    close()
    navTo(where === 'pck' ? '/print-check/slice' : '/print-slicer')
  }

  function stateTxt(x) { return ({ printing: '🟢 출력 중', paused: '⏸ 멈춤' })[x.state] || '쉬는 중 · 보낼 수 있어요' }
  function offWhy(x) { return x.can_send ? '' : x.state === 'printing' ? '출력 중이라 지금은 못 보내요' : '연결 프로그램이 10분 넘게 소식이 없거나, 보내기를 지원하지 않는 연결이에요' }
  function filSelect(i) {
    const { rec, all } = filamentLists(), cur = S.fil[i] || ''
    const o = (n) => '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'
    return '<select data-fil="' + i + '">' + (rec.length ? '<optgroup label="이 프린터 추천">' + rec.map(o).join('') + '</optgroup>' : '') + (all.length ? '<optgroup label="전체">' + all.map(o).join('') + '</optgroup>' : '') + '</select>'
  }
  function draw() {
    const p = loungeP(), P = S.plan, I = S.info, st = S.step
    let h = '<div class="slc-q-wrap">'
    if (I && S.file && st !== 'sent') {
      h += '<div class="slc-qfile"><div class="slc-qthumb" data-thumb></div><div><b title="' + esc(S.file.name) + '">' + esc(S.file.name) + '</b><small>' + n1(I.size[0]) + ' × ' + n1(I.size[1]) + ' × ' + n1(I.size[2]) + ' mm' + (P && P.k > 1 ? ' · ' + P.k + '색' : '') + '</small>' +
        (P && P.k > 1 ? '<span class="slc-sw">' + P.hexes.map((c) => '<i style="background:' + esc(c) + '"></i>').join('') + '</span>' : '') +
        (P && P.painted ? '<span class="slc-warn">🎨 칠한 다색은 여기서는 한 색으로 — 칠한 색 그대로는 「↗ 자세히」에서</span>' : '') + '</div></div>'
    }
    if (S.err) h += '<p class="slc-err">⚠️ ' + esc(S.err) + '</p>'
    if (st === 'wait') h += '<p class="slc-qwait">📦 파일을 준비하는 중…</p>'
    else if (st === 'load') h += '<p class="slc-qwait">🔎 보낼 수 있는 프린터를 확인하는 중…</p>'
    else if (st === 'fail') h += '<div class="slc-acts"><button type="button" class="slc-btn" data-x>닫기</button></div>'
    else if (st === 'none') {
      h += (S.testOnly ? '<p class="slc-q">🔒 내 프린터로 보내기는 지금 시험 중이에요</p><p class="slc-hint">아래 「↗ 자세히」의 슬라이서에서 슬라이스해 .gcode · .gcode.3mf 로 내려받을 수 있어요.</p>' : '<p class="slc-q">지금 보낼 수 있는 프린터가 없어요</p>') + (S.testOnly ? '<div class="slc-acts"><button type="button" class="slc-btn" data-x>닫기</button></div>' : '') + (S.testOnly ? '' :
        (S.lounge.length ? '<div class="slc-eps">' + S.lounge.map((x) => '<div class="slc-ep off"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(offWhy(x)) + '</small></div>').join('') + '</div>'
          : '<p class="slc-hint">' + (S.loggedIn ? '프린터 라운지에 내 프린터를 등록하고 연결 프로그램을 켜면 여기서 바로 보낼 수 있어요.' : '로그인하면 프린터 라운지의 내 프린터로 보낼 수 있어요.') + ' 내려받기만 하려면 「↗ 자세히」의 슬라이서를 쓰세요.</p>') +
        '<div class="slc-acts"><button type="button" class="slc-btn" data-x>닫기</button><button type="button" class="slc-btn pri" data-lounge>📡 프린터 라운지로 가기</button></div>')
    } else if (st === 'printers') {
      h += '<p class="slc-q">어느 프린터로 보낼까요?</p><div class="slc-eps">' + S.lounge.map((x) => (x.can_send
        ? '<button type="button" class="slc-ep" data-ep="' + x.id + '"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(stateTxt(x)) + '</small></button>'
        : '<div class="slc-ep off"><b>🖨️ ' + esc(x.name) + '</b><small>' + esc(offWhy(x)) + '</small></div>')).join('') + '</div>'
    } else if (st === 'file' && S.zip) {
      h += '<p class="slc-q">📦 「' + esc(S.zip.name) + '」 안의 모델 ' + S.zip.list.length + '개 — 어느 것을 보낼까요? <small class="slc-hint">(모두 한 판에 올리려면 「↗ 자세히」)</small></p><div class="slc-chips">' +
        S.zip.list.map((x, i) => '<button type="button" class="slc-chip" data-zip="' + i + '">' + esc(x.name) + ' <small>' + n1(x.data.length / 1048576) + 'MB</small></button>').join('') + '</div>'
    } else if (st === 'set' && p) {
      const procs = processList(), ams = ((p.temps && p.temps.ams) || []).filter((a) => a.slot), bb = (p.send_kind || 'bambu') === 'bambu'
      h += '<p class="slc-q">🖨️ 「' + esc(p.name) + '」 · <span class="slc-hint">' + esc(S.printer) + '</span></p>' +
        '<label class="slc-lb">품질 (층 높이)</label><div class="slc-chips">' + procs.map((n) => '<button type="button" class="slc-chip sm' + (n === S.process ? ' on' : '') + '" data-proc="' + esc(n) + '">' + esc(n.replace(/\s*@.*$/, '')) + '</button>').join('') + '</div>' +
        '<label class="slc-lb">필라멘트' + (bb && ams.length ? ' · AMS 칸' : '') + '</label><div class="slc-fils">' + (P ? P.hexes : ['#c9ced6']).map((c, i) => '<div class="slc-fil">' +
          (P && P.colored ? '<span class="slc-mc"><i style="background:' + esc(c) + '"></i>' + (P.k > 1 ? (i + 1) + '번 색' : '모델 색') + '</span>' : '') + filSelect(i) +
          (bb && ams.length ? '<select data-ams="' + i + '">' + ams.map((a) => '<option value="' + a.slot + '"' + (String(a.slot) === S.ams[i] ? ' selected' : '') + '>AMS ' + a.slot + ' — ' + esc(a.type || '') + '</option>').join('') +
            ((P ? P.k : 1) === 1 ? '<option value="ext"' + (S.ams[i] === 'ext' ? ' selected' : '') + '>외부 스풀</option>' : '') + '</select><b class="slc-amsdot" style="background:' + esc(((ams.find((a) => String(a.slot) === S.ams[i]) || {}).color) || '#ccc') + '"></b>' : '') + '</div>').join('') + '</div>' +
        '<div class="slc-row"><label class="slc-lb">채우기 <select data-infill>' + [5, 10, 15, 20, 25, 30, 40, 50, 100].map((v) => '<option value="' + v + '"' + (v === S.infill ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></label>' +
          '<label class="slc-tg"><input type="checkbox" data-support' + (S.support ? ' checked' : '') + '> 서포트</label><label class="slc-tg"><input type="checkbox" data-brim' + (S.brim ? ' checked' : '') + '> 브림</label></div>' +
        '<label class="slc-bed"><input type="checkbox" data-bed' + (S.bed ? ' checked' : '') + '> <span>🧹 <b>베드를 비웠어요</b> — 바닥판에 아무것도 없어요 (멀리서 출력 시작은 위험해요)</span></label>' +
        (SEND_ADMIN_ONLY ? '<p class="slc-hint">🔒 시험하는 동안 관리자에게만 보여요.</p>' : '') +
        '<div class="slc-acts"><button type="button" class="slc-btn" data-back>← 프린터 다시 고르기</button><button type="button" class="slc-btn pri" data-go' + (S.bed ? '' : ' disabled') + '>🔪 슬라이스하고 보내기</button></div>'
    } else if (st === 'work') {
      const v = S.phase === 'upload' ? S.up : S.prog
      h += '<p class="slc-q">' + (S.phase === 'upload' ? '📤 「' + esc(p ? p.name : '') + '」 로 보내는 중…' : '🔪 슬라이스하는 중… (처음 한 번은 엔진을 받느라 조금 걸려요)') + '</p><div class="slc-prog"><i style="width:' + Math.round((v || 0) * 100) + '%"></i></div>'
    } else if (st === 'sent' && S.done) {
      const D = S.done
      h += '<div class="slc-qok"><b>✅ 「' + esc(D.name) + '」 로 보냈어요</b><p>' + esc(D.message) + '</p><p class="slc-hint">예상 ' + dur(D.seconds) + (D.guessed ? ' (어림)' : '') + ' · 필라멘트 ' + n1(D.weight) + ' g · 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.</p></div>' +
        '<p class="slc-q">프린터 라운지로 이동할까요?</p><div class="slc-acts"><button type="button" class="slc-btn" data-x>여기 있기</button><button type="button" class="slc-btn pri" data-lounge>📡 프린터 라운지로 이동</button></div>'
    }
    // ↗ 자세히 — 판 배치 · 칠하기 · 모든 설정 (출력 검사기 탭 · 전용 화면 중 고름)
    if ((S.file || S.zip) && ['printers', 'none', 'set', 'file'].includes(st)) {
      h += '<div class="slc-more"><span>↗ 자세히 <small>판 배치 · 돌리기 · 칠하기 · 모든 설정 · 층별 미리 보기</small></span><div>' +
        (hasPrintCheck() ? '<button type="button" class="slc-btn sm" data-more="pck">📐 출력 검사기에서</button>' : '') +
        '<button type="button" class="slc-btn sm" data-more="page">🔪 전용 슬라이서에서</button></div></div>'
    }
    root.innerHTML = h + '<p class="slc-status" data-status hidden></p></div>'
    const th = root.querySelector('[data-thumb]'); if (th && S.thumb) { S.thumb.className = 'slc-cv'; th.appendChild(S.thumb) }
  }

  root.addEventListener('change', (e) => {
    const t = e.target
    if (t.matches('[data-fil]')) S.fil[+t.getAttribute('data-fil')] = t.value
    else if (t.matches('[data-ams]')) { S.ams[+t.getAttribute('data-ams')] = t.value; draw() }
    else if (t.matches('[data-infill]')) S.infill = +t.value
    else if (t.matches('[data-support]')) S.support = t.checked
    else if (t.matches('[data-brim]')) S.brim = t.checked
    else if (t.matches('[data-bed]')) { S.bed = t.checked; const g = root.querySelector('[data-go]'); if (g) g.disabled = !S.bed }
  })
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return
    if (b.hasAttribute('data-ep')) pick(b.getAttribute('data-ep'))
    else if (b.hasAttribute('data-proc')) { S.process = b.getAttribute('data-proc'); draw() }
    else if (b.hasAttribute('data-zip')) { const x = S.zip && S.zip.list[+b.getAttribute('data-zip')]; if (x) openFile(new File([x.data], x.name)).then(() => { if (S.tris) { S.fil = S.plan.hexes.map(() => defaultFilament()); amsDefaults(); S.step = 'set' } draw() }) }
    else if (b.hasAttribute('data-back')) { S.err = ''; S.step = 'printers'; draw() }
    else if (b.hasAttribute('data-go')) go()
    else if (b.hasAttribute('data-more')) detail(b.getAttribute('data-more'))
    else if (b.hasAttribute('data-lounge')) { close(); navTo('/my-printer') }
    else if (b.hasAttribute('data-x')) close()
  })

  ;(async () => {
    draw()
    let list = []
    try { list = (await Promise.resolve(opts.files)) || [] } catch (e) { S.err = (e && e.message) || String(e); S.step = 'fail'; draw(); return }
    const f = list[0]
    if (!f) { S.err = '파일이 오지 않았어요 — 원래 화면에서 다시 눌러 주세요.'; S.step = 'fail'; draw(); return }
    S.step = 'load'; draw()
    try { await engineData() } catch (e) { S.err = '슬라이서 설정을 불러오지 못했어요: ' + ((e && e.message) || e); S.step = 'fail'; draw(); return }
    const [me, lounge] = await Promise.all([
      fetch(API + '/me', { headers: headers(), credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.data) || {}, () => ({})),
      fetch(LOUNGE + '/overview', { headers: headers(), credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.data) || {}, () => ({})),
    ])
    S.admin = !!me.admin; S.loggedIn = !!lounge.logged_in
    S.lounge = Array.isArray(lounge.mine) ? lounge.mine : []
    if (SEND_ADMIN_ONLY && !S.admin) { S.testOnly = true; S.lounge = S.lounge.map((x) => ({ ...x, can_send: false })) }   // 시험 중 — 회원에게는 보내기 대신 「↗ 자세히」(슬라이스 · 내려받기)
    if (/\.zip$/i.test(f.name || '')) {
      try {
        const zl = await unzipModels(await f.arrayBuffer())
        if (!zl.length) { S.err = '「' + f.name + '」 안에 STL · 3MF · OBJ 가 없어요.'; S.step = 'fail'; draw(); return }
        if (zl.length === 1) await openFile(new File([zl[0].data], zl[0].name)); else S.zip = { name: f.name, list: zl }
      } catch (e) { S.err = 'ZIP 을 풀지 못했어요: ' + ((e && e.message) || e); S.step = 'fail'; draw(); return }
    } else await openFile(list.length > 1 ? list[0] : f)
    if (!S.tris && !S.zip) { S.step = 'fail'; draw(); return }
    S.step = S.lounge.some((p) => p.can_send) ? 'printers' : 'none'
    // 부른 화면이 고른 프린터(출력 검사기)와 같은 라운지 프린터가 보낼 수 있으면 바로 설정으로
    if (opts.printer && S.step === 'printers') {
      const want = matchPreset(ST.printersByVendor, opts.printer, ST.printerTechByVendor)
      const same = want && S.lounge.find((p) => p.can_send && (matchPreset(ST.printersByVendor, p, ST.printerTechByVendor) || [])[1] === want[1])
      if (same) { pick(same.id); return }
    }
    draw()
  })()
  return { version: V }
}
window.__slcQuick = { version: V, open }
