/*! custom-slicer 0.1.2 — 🔪 슬라이서 화면 · AGPL-3.0-or-later · 소스: https://github.com/keidischoi/g7-plugin-custom-slicer
 *  엔진 · 화면: three-slicer (OrcaSlicer 를 WebAssembly 로 옮긴 것, AGPL) — <Viewport/>(판 배치 · 이동/회전/크기 · 칠하기 · 슬라이스 · G-code 미리 보기)
 *  + <SettingsPanel/>(OrcaSlicer 설정). 이 파일은 그 바깥 틀: 프린터 라운지의 내 프린터 · 📤 보내기 · .gcode.3mf · 다른 화면에서 넘겨받은 파일
 *  모델은 서버로 올라가지 않음 — 이 브라우저에서만 읽고 슬라이스 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Viewport from 'three-slicer/viewer'
import SettingsPanel from 'three-slicer/components'
import { printersByVendor, printerSettings, printerKeys, printerDefaultBedType, printerTechByVendor } from 'three-slicer/settings'
import { bambuHeader, buildGcode3mf } from './gcode3mf.js'
import { unzipModels } from './handoff.js'
import { estimateSeconds, maxZ, toolsOf, matchPreset, hexDist } from './util.js'
import { SPF, canRead, readProfile, applyProfile } from './profiles.js'
import { polish } from './polish.js'

const V = '0.1.2', API = '/api/plugins/custom-slicer', LOUNGE = '/api/plugins/custom-my_printer', SRC = 'https://github.com/keidischoi/g7-plugin-custom-slicer'
const SEND_ADMIN_ONLY = true   // 「📤 내 프린터로 보내기」는 시험하는 동안 관리자에게만 (실제 프린터에서 확인되면 false 로)
const LS_SET = 'slc-settings'
const h = React.createElement
const { useState, useEffect, useRef, useCallback } = React

/* ───────── 작은 도구 ───────── */
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString()
const dur = (s) => { s = Math.max(0, Math.round(s / 60)); const hh = Math.floor(s / 60), m = s % 60; return hh ? hh + '시간' + (m ? ' ' + m + '분' : '') : Math.max(1, m) + '분' }
function token() {
  let t = ''
  try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || '' } catch (e) {}
  if (!t) { try { t = localStorage.getItem('auth_token') || '' } catch (e) {} }
  t = String(t).replace(/^"+|"+$/g, '')
  return !t || t === 'undefined' || t === 'null' ? '' : t
}
function headers() {
  const o = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = token()
  if (t) o.Authorization = 'Bearer ' + t
  return o
}
function navTo(p) {
  try { if (window.G7Core && typeof G7Core.dispatch === 'function') { G7Core.dispatch({ handler: 'navigate', params: { path: p } }); return } } catch (e) {}
  location.href = p
}
/** 마지막 설정 (이 브라우저에만 — 다음에 열 때 같은 프린터 · 품질로) */
function loadSaved() {
  try { const v = JSON.parse(localStorage.getItem(LS_SET) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch (e) { return null }
}
function save(s) { try { localStorage.setItem(LS_SET, JSON.stringify(s)) } catch (e) {} }

/** 프린터 설정(제조사 프로필)을 판에 — 예전 프린터 키를 지우고 새로. 품질 · 필라멘트는 뷰어가 그 프린터의 기본으로 채움 */
export function applyPrinter(s, name) {
  const p = printerSettings(name)
  if (!p) return s
  const n = { ...s }
  for (const k of printerKeys) delete n[k]
  delete n.printer_settings_id; delete n.print_settings_id; delete n.filament_settings_id
  Object.assign(n, p, { printer_settings_id: name })
  const bt = printerDefaultBedType(name); if (bt) n.curr_bed_type = bt
  return n
}

/** .zip(자른 조각 모두 등) → 안의 모델 File 들 (판에 모두 올림), 그 밖은 그대로 */
async function expandFiles(list) {
  const out = []
  for (const f of list || []) {
    if (!f) continue
    if (/\.zip$/i.test(f.name || '')) {
      try { for (const x of await unzipModels(await f.arrayBuffer())) out.push(new File([x.data], x.name)) } catch (e) { /* 못 풀면 건너뜀 */ }
    } else out.push(f)
  }
  return out
}

/* ───────── 프린터 라운지 ───────── */
async function loadMe() {
  try {
    const r = await fetch(API + '/me', { headers: headers(), credentials: 'same-origin', cache: 'no-store' })
    const j = r.ok ? await r.json() : null
    return (j && j.data) || {}
  } catch (e) { return {} }
}
async function loadLounge() {
  try {
    const r = await fetch(LOUNGE + '/overview', { headers: headers(), credentials: 'same-origin' })
    if (!r.ok) return { logged: false, list: [] }
    const j = await r.json(), d = j && j.data
    return { logged: !!(d && d.logged_in), list: d && Array.isArray(d.mine) ? d.mine : [] }
  } catch (e) { return { logged: false, list: [] } }   // 프린터 라운지가 없거나 꺼짐
}
/** .gcode.3mf(Bambu) · .gcode 를 프린터 라운지로 — ams: 색마다 AMS 칸 번호 (없거나 'ext' 가 하나라도 있으면 외부 스풀) */
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
const stateTxt = (x) => ({ printing: '🟢 출력 중', paused: '⏸ 멈춤' })[x.state] || '쉬는 중 · 보낼 수 있어요'
const offWhy = (x) => (x.state === 'printing' ? '출력 중이라 지금은 못 보내요' : '연결 프로그램이 10분 넘게 소식이 없거나, 보내기를 지원하지 않는 연결이에요')

/** 뷰어 안의 3D 캔버스를 그림으로 (.gcode.3mf 의 plate_1.png) — 못 얻으면 null (그림 없이도 출력은 됨) */
async function snap(host) {
  try {
    let cv = null
    const walk = (n) => { if (!n || cv) return; if (n.shadowRoot) { cv = n.shadowRoot.querySelector('canvas'); walk(n.shadowRoot) } n.querySelectorAll && n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot && !cv) walk(c) }) }
    walk(host)
    if (!cv || !cv.width) return null
    const c2 = document.createElement('canvas'), Z = 512; c2.width = c2.height = Z
    const g = c2.getContext('2d'), k = Math.min(Z / cv.width, Z / cv.height), w = cv.width * k, hh = cv.height * k
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, Z, Z)
    g.drawImage(cv, (Z - w) / 2, (Z - hh) / 2, w, hh)
    const blob = await new Promise((ok) => c2.toBlob(ok, 'image/png'))
    if (!blob || blob.size < 2500) return null   // 빈 그림 (그리기 버퍼가 비어 있음)
    return new Uint8Array(await blob.arrayBuffer())
  } catch (e) { return null }
}

/* ───────── 📤 보내기 창 ───────── */
function SendDialog({ R, lounge, pid0, onClose, onSent, popup }) {
  const sendable = lounge.list.filter((p) => p.can_send)
  const [pid, setPid] = useState(sendable.some((p) => +p.id === +pid0) ? +pid0 : sendable[0] ? +sendable[0].id : 0)
  const p = lounge.list.find((x) => +x.id === pid) || null
  const bb = !!p && (p.send_kind || 'bambu') === 'bambu'
  const ams = ((p && p.temps && p.temps.ams) || []).filter((a) => a.slot)
  const pickAms = () => R.tools.map((t) => {   // 색이 가장 가까운 AMS 칸으로 미리
    let best = ams[0], bd = Infinity
    ams.forEach((a) => { const d = hexDist(t.color, a.color); if (d < bd) { bd = d; best = a } })
    return best ? String(best.slot) : 'ext'
  })
  const [slots, setSlots] = useState(pickAms)
  useEffect(() => { setSlots(pickAms()) }, [pid])
  const [bed, setBed] = useState(false), [busy, setBusy] = useState(false), [up, setUp] = useState(0), [msg, setMsg] = useState(null)
  const go = async () => {
    if (!p || !bed || busy) return
    setBusy(true); setMsg(null); setUp(0)
    const r = await upload(p, R, bb && ams.length ? slots : null, setUp)
    setBusy(false); setMsg(r)
    if (r.ok && onSent) onSent(p, r)
  }
  const dlg = msg && msg.ok
    ? [h('p', { key: 'a', className: 'slc-dmsg ok' }, '✅ 「' + p.name + '」 로 보냈어요 — ' + msg.message),
      h('p', { key: 'b', className: 'slc-hint' }, '예상 ' + dur(R.seconds) + (R.guessed ? ' (어림)' : '') + ' · 필라멘트 ' + n1(R.weight) + ' g · 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.'),
      h('p', { key: 'c', className: 'slc-q' }, '프린터 라운지로 이동할까요?'),
      h('div', { key: 'd', className: 'slc-acts' },
        h('button', { type: 'button', className: 'slc-btn', onClick: onClose }, '여기 있기'),
        h('button', { type: 'button', className: 'slc-btn pri', onClick: () => { onClose(); if (popup) popup.close(); navTo('/my-printer') } }, '📡 프린터 라운지로 이동'))]
    : [h('p', { key: 'q', className: 'slc-q' }, '어느 프린터로 보낼까요?'),
      h('div', { key: 'e', className: 'slc-eps' }, lounge.list.map((x) => (x.can_send
        ? h('button', { key: x.id, type: 'button', className: 'slc-ep' + (+x.id === pid ? ' on' : ''), onClick: () => setPid(+x.id), disabled: busy }, h('b', null, '🖨️ ' + x.name), h('small', null, stateTxt(x)))
        : h('div', { key: x.id, className: 'slc-ep off' }, h('b', null, '🖨️ ' + x.name), h('small', null, offWhy(x)))))),
      p ? h('p', { key: 'h', className: 'slc-hint' }, bb ? '.gcode.3mf 를 프린터 라운지에 올리면, 연결 프로그램이 30초쯤 안에 받아 프린터로 올리고 출력을 시작해요.' : '.gcode 를 프린터 라운지에 올리면, 연결 프로그램이 받아 프린터로 올리고 출력을 시작해요.') : null,
      bb && ams.length ? h('div', { key: 'm', className: 'slc-ams' }, h('b', null, '🎨 필라멘트 칸'), R.tools.map((t, i) => h('label', { key: i, className: 'slc-amsrow' },
        h('i', { style: { background: t.color } }), h('span', null, (R.tools.length > 1 ? (i + 1) + '번 색' : '필라멘트') + ' · ' + t.type),
        h('select', { value: slots[i] || '', disabled: busy, onChange: (e) => { const v = slots.slice(); v[i] = e.target.value; setSlots(v) } },
          ams.map((a) => h('option', { key: a.slot, value: String(a.slot) }, 'AMS ' + a.slot + '번 — ' + (a.type || ''))),
          R.tools.length === 1 ? h('option', { value: 'ext' }, '외부 스풀') : null),
        h('b', { className: 'slc-amsdot', style: { background: ((ams.find((a) => String(a.slot) === slots[i]) || {}).color) || 'transparent' } })))) : null,
      h('label', { key: 'bed', className: 'slc-bed' }, h('input', { type: 'checkbox', checked: bed, disabled: busy, onChange: (e) => setBed(e.target.checked) }),
        h('span', null, '🧹 ', h('b', null, '베드를 비웠어요'), ' — 바닥판에 아무것도 없어요 (멀리서 출력 시작은 위험해요)')),
      busy ? h('div', { key: 'pr', className: 'slc-prog' }, h('i', { style: { width: Math.round(up * 100) + '%' } })) : null,
      msg && !msg.ok ? h('p', { key: 'er', className: 'slc-dmsg bad' }, '⚠️ ' + msg.message) : null,
      SEND_ADMIN_ONLY ? h('p', { key: 'ad', className: 'slc-hint' }, '🔒 보내기는 시험하는 동안 관리자에게만 보여요.') : null,
      h('div', { key: 'ac', className: 'slc-acts' },
        h('button', { type: 'button', className: 'slc-btn', onClick: onClose, disabled: busy }, '닫기'),
        h('button', { type: 'button', className: 'slc-btn pri', onClick: go, disabled: !p || !bed || busy }, busy ? '⏳ 올리는 중… ' + Math.round(up * 100) + '%' : '📤 보내기'))]
  return h('div', { className: 'slc-modal', onClick: (e) => { if (e.target === e.currentTarget && !busy) onClose() } },
    h('div', { className: 'slc-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': '내 프린터로 보내기' }, h('h3', null, '📤 내 프린터로 보내기'), dlg))
}

/* ───────── 🎛️ 슬라이서 프로필 고르기 (custom-slicer_profiles) ───────── */
function ProfileDialog({ settings, lounge, pid, onClose, onApply }) {
  const lp = lounge.list.find((x) => +x.id === +pid)
  const base = String(settings.printer_settings_id || '').replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, '')
  const [q, setQ] = useState(''), [who, setWho] = useState(lp ? lp.model || lp.name : base.replace(/^Bambu Lab /, ''))
  const [items, setItems] = useState(null), [busy, setBusy] = useState(0), [err, setErr] = useState('')
  const timer = useRef(0)
  useEffect(() => {
    let on = true; setItems(null)
    const p = new URLSearchParams({ per: '24', sort: 'popular' }); if (who) p.set('printer', who); if (q) p.set('q', q)
    fetch(SPF + '/profiles?' + p, { headers: headers(), credentials: 'same-origin' }).then((r) => r.json()).then((j) => { if (on) setItems((j && j.data && j.data.items) || []) }, () => { if (on) setItems([]) })
    return () => { on = false }
  }, [who, q])
  const use = async (it) => {
    setBusy(it.id); setErr('')
    try {
      const r = await fetch(SPF + '/profiles/' + it.id + '/download', { headers: headers(), credentials: 'same-origin' })
      if (r.status === 401) throw new Error('로그인하면 받을 수 있어요.')
      if (!r.ok) throw new Error('프로필을 받지 못했어요 (' + r.status + ').')
      onApply(it.title, await readProfile(await r.arrayBuffer(), it.file_ext))
    } catch (e) { setErr((e && e.message) || String(e)) }
    setBusy(0)
  }
  return h('div', { className: 'slc-modal', onClick: (e) => { if (e.target === e.currentTarget && !busy) onClose() } },
    h('div', { className: 'slc-dlg slc-dlg--wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': '슬라이서 프로필' },
      h('h3', null, '🎛️ 슬라이서 프로필 — 회원들이 써 본 설정'),
      h('div', { className: 'slc-pfind' },
        h('input', { type: 'search', placeholder: '찾기 (예: PLA · 실크 · 0.2mm)', onInput: (e) => { clearTimeout(timer.current); const v = e.target.value.trim(); timer.current = setTimeout(() => setQ(v), 300) } }),
        who ? h('button', { type: 'button', className: 'slc-chip on', title: '이 프린터 것만 — 누르면 모든 프린터', onClick: () => setWho('') }, '🖨️ ' + who + ' ✕') : null),
      err ? h('p', { className: 'slc-dmsg bad' }, '⚠️ ' + err) : null,
      items === null ? h('p', { className: 'slc-hint' }, '불러오는 중…')
        : !items.length ? h('p', { className: 'slc-hint' }, '맞는 프로필이 없어요. ', h('a', { href: '/slicer-profiles', target: '_blank', rel: 'noopener' }, '슬라이서 프로필 둘러보기 ›'))
          : h('div', { className: 'slc-plist' }, items.map((it) => {
            const ok = canRead(it.file_ext), rate = it.worked + it.failed ? Math.round(it.worked * 100 / (it.worked + it.failed)) : null
            return h('div', { key: it.id, className: 'slc-pcard' + (ok ? '' : ' off') },
              h('div', { className: 'slc-pmain' }, h('b', null, it.title),
                h('small', null, [it.printer_name, it.filament_name || it.material, it.nozzle ? it.nozzle + 'mm 노즐' : '', it.layer_height ? it.layer_height + 'mm 층' : ''].filter(Boolean).join(' · ')),
                h('span', { className: 'slc-ptags' }, h('i', null, it.slicer_name), h('i', null, '.' + it.file_ext), rate !== null ? h('i', { className: 'ok' }, '👍 ' + rate + '%') : null, it.stars ? h('i', null, '★ ' + it.stars) : null, h('i', null, '⬇ ' + it.downloads))),
              ok ? h('button', { type: 'button', className: 'slc-btn pri', disabled: !!busy, onClick: () => use(it) }, busy === it.id ? '⏳' : '적용')
                : h('a', { className: 'slc-btn', href: '/slicer-profiles/' + it.id, target: '_blank', rel: 'noopener', title: '이 꼴(' + it.slicer_name + ')은 여기서 못 읽어요 — 그 슬라이서에서 쓰세요' }, '보기 ↗'))
          })),
      h('p', { className: 'slc-hint' }, 'Bambu Studio · OrcaSlicer 프로필(.json · .3mf · .orca_*)은 바로 적용돼요. 프로젝트 3MF 는 설정만 가져와요 (모델은 판에 올리지 않음).'),
      h('div', { className: 'slc-acts' }, h('a', { className: 'slc-btn', href: '/slicer-profiles', target: '_blank', rel: 'noopener' }, '슬라이서 프로필 ↗'), h('button', { type: 'button', className: 'slc-btn', onClick: onClose }, '닫기'))))
}

/* ───────── 화면 ───────── */
function App({ files, popup, compact, printer, from }) {
  const [settings, setSettingsRaw] = useState(() => loadSaved() || {})
  const setSettings = useCallback((u) => setSettingsRaw((s) => { const n = typeof u === 'function' ? u(s) : u; save(n); return n }), [])
  const [me, setMe] = useState({}), [lounge, setLounge] = useState({ logged: false, list: [] }), [pid, setPid] = useState(0)
  const [res, setRes] = useState(null), [err, setErr] = useState(''), [note, setNote] = useState(''), [send, setSend] = useState(false), [sent, setSent] = useState('')
  const [ready, setReady] = useState(null)   // 넘겨받은 파일 (zip 은 풀어서) — 준비되면 뷰어를 그림 (뷰어는 files 를 처음 한 번만 받음)
  const [spf, setSpf] = useState(false), [prof, setProf] = useState(false), [applied, setApplied] = useState('')
  const [size, setSize] = useState(() => (popup && popup.current ? popup.current() : ''))
  const stage = useRef(null), names = useRef([]), cur = useRef(settings)
  cur.current = settings

  useEffect(() => { let on = true; expandFiles(files).then((l) => { if (on) { names.current = l.map((f) => f.name); setReady(l) } }); return () => { on = false } }, [])
  useEffect(() => {
    let on = true
    Promise.all([loadMe(), loadLounge()]).then(([m, L]) => {
      if (!on) return
      setMe(m); setLounge(L)
      const want = printer ? matchPreset(printersByVendor, printer, printerTechByVendor) : null
      const same = want && L.list.find((p) => { const m = matchPreset(printersByVendor, p, printerTechByVendor); return m && m[1] === want[1] })
      const ok = same || L.list.find((p) => p.can_send) || L.list[0]
      if (!ok) return
      setPid(+ok.id)
      if (want) return   // 부른 화면(출력 검사기)이 고른 프린터가 먼저
      const hit = matchPreset(printersByVendor, ok, printerTechByVendor)
      if (hit && !cur.current.printer_settings_id) setSettings((s) => applyPrinter(s, hit[1]))   // 처음 쓰면 내 프린터의 설정으로 (저장된 것이 있으면 그대로)
    })
    return () => { on = false }
  }, [])
  // 출력 검사기에서 고른 프린터 → 같은 엔진 프린터로 (못 찾으면 그대로 두고 알림)
  useEffect(() => {
    if (!printer) return
    const hit = matchPreset(printersByVendor, printer, printerTechByVendor)
    if (hit) setSettings((s) => (s.printer_settings_id === hit[1] ? s : applyPrinter(s, hit[1])))
    else if (printer.model || printer.name) setNote('「' + (printer.name || printer.model) + '」 와 같은 슬라이서 프린터 설정이 없어요 — 오른쪽 프린터 칸에서 골라 주세요.')
  }, [])
  useEffect(() => { setRes(null) }, [settings])   // 설정이 바뀌면 뷰어도 결과를 버림
  // 🎛️ 슬라이서 프로필 플러그인이 켜져 있나 (목록 하나만 물어봄)
  useEffect(() => { fetch(SPF + '/profiles?per=6&lite=1', { headers: headers(), credentials: 'same-origin' }).then((r) => setSpf(r.ok), () => setSpf(false)) }, [])
  // 뷰어 · 설정 칸(그림자 DOM) 안 입력칸 · 숫자칸 · 카드를 출력 검사기 말씨로 다듬음
  useEffect(() => polish(stage.current), [ready])

  const pickLounge = (p) => {
    setPid(+p.id); setNote('')
    const hit = matchPreset(printersByVendor, p, printerTechByVendor)
    if (hit) setSettings((s) => (s.printer_settings_id === hit[1] ? s : applyPrinter(s, hit[1])))
    else setNote('「' + (p.name || '') + '」 와 같은 프린터 설정을 못 찾았어요 — 오른쪽 프린터 칸에서 제조사 · 모델을 골라 주세요.')
  }
  const onSliced = useCallback(async ({ plate, stats, gcode }) => {
    setErr('')
    try {
      const st = stats || {}, s = cur.current
      const printer = String(s.printer_settings_id || '')
      const tools = toolsOf(st, s)
      const body = String(gcode || '')
      if (!body) return
      const seconds = st.time_estimate > 0 ? st.time_estimate : estimateSeconds(body, tools.length > 1 ? 50 : 0)   // 다색이면 엔진이 시간을 비워 둠 → G-code 로 어림
      const bambu = /^Bambu Lab /.test(printer)
      const full = (bambu ? bambuHeader({ seconds, layers: st.layers || 0, maxZ: maxZ(body), tools }) : '') + body
      const base = ((names.current[0] || 'model').replace(/\.(stl|obj|3mf|amf|ply)$/i, '') || 'model') + (plate > 0 ? '_plate' + (plate + 1) : '')
      const weight = tools.reduce((a, t) => a + t.g, 0)
      const thumb = bambu ? await snap(stage.current) : null
      setRes({ gcode: full, tools, bambu, seconds, guessed: !(st.time_estimate > 0), layers: st.layers || 0, base, weight, printer,
        gcode3mf: bambu ? buildGcode3mf({ gcode: full, thumb, seconds, weight, tools, settings: s, printer }) : null })
    } catch (e) { setErr('결과를 정리하지 못했어요: ' + ((e && e.message) || e)) }
  }, [])
  const onEvent = useCallback((name, v) => {
    if (name === 'objects' && Array.isArray(v)) { names.current = v.map((o) => o.name).filter(Boolean); if (!v.length) setRes(null) }
  }, [])
  const download = (kind) => {
    const R = res; if (!R) return
    const blob = kind === '3mf' && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
    const a = document.createElement('a'), u = URL.createObjectURL(blob)
    a.href = u; a.download = R.base + (kind === '3mf' && R.gcode3mf ? '.gcode.3mf' : '.gcode'); document.body.appendChild(a); a.click()
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u) }, 1500)
  }
  const canSee = !SEND_ADMIN_ONLY || !!me.admin
  const canSend = lounge.list.some((p) => p.can_send)
  const R = res

  const bar = h('div', { className: 'slc-bar' },
    h('div', { className: 'slc-bar-l' },
      popup ? h('b', { className: 'slc-title' }, '🔪 슬라이스 · 보내기') : compact ? null : h('b', { className: 'slc-title' }, '🖨️ 내 프린터'),
      from ? h('span', { className: 'slc-from' }, from) : null,
      lounge.list.length
        ? h('div', { className: 'slc-chips' }, lounge.list.map((p) => h('button', { key: p.id, type: 'button', className: 'slc-chip' + (+p.id === pid ? ' on' : ''), title: '이 프린터의 설정으로 바꿔요', onClick: () => pickLounge(p) }, '🖨️ ' + p.name, p.can_send ? h('em', null, ' 📤') : null)))
        : h('span', { className: 'slc-hint' }, lounge.logged ? ['프린터 라운지에 내 프린터를 등록하면 바로 고르고 보낼 수 있어요. ', h('a', { key: 'a', href: '/my-printer' }, '프린터 라운지 ›')] : '로그인하면 프린터 라운지의 내 프린터로 바로 보낼 수 있어요.'),
      spf ? h('button', { type: 'button', className: 'slc-btn', title: '회원들이 올린 프린터 × 필라멘트 설정을 골라 바로 적용해요 (🎛️ 슬라이서 프로필)', onClick: () => setProf(true) }, '🎛️ 슬라이서 프로필') : null,
      applied ? h('span', { className: 'slc-from', title: applied }, '🎛️ ' + applied) : null),
    h('div', { className: 'slc-bar-r' },
      R ? h('span', { className: 'slc-sum' }, '⏱ ' + dur(R.seconds) + (R.guessed ? ' (어림)' : '') + ' · 🧵 ' + n1(R.weight) + ' g · 층 ' + R.layers.toLocaleString()) : h('span', { className: 'slc-hint' }, '모델을 올리고 오른쪽 아래 「Slice」를 누르세요'),
      R && canSee && lounge.list.length ? h('button', { type: 'button', className: 'slc-btn pri', disabled: !canSend, title: canSend ? '' : '지금 보낼 수 있는 프린터가 없어요 (연결 프로그램 · 관리자 설정 「출력 파일 보내기」)', onClick: () => setSend(true) }, '📤 프린터로 보내기', SEND_ADMIN_ONLY ? h('small', { className: 'slc-adm' }, ' 🔒') : null) : null,
      R && R.gcode3mf ? h('button', { type: 'button', className: 'slc-btn', onClick: () => download('3mf'), 'data-cls-save': '슬라이스 결과 (.gcode.3mf)', 'data-cls-save-label': '내 저장소에 저장', 'data-cls-save-class': 'slc-btn' }, '⬇️ .gcode.3mf') : null,
      R ? h('button', { type: 'button', className: 'slc-btn', onClick: () => download('gcode'), 'data-cls-save': 'G-code (.gcode)', 'data-cls-save-label': '내 저장소에 저장', 'data-cls-save-class': 'slc-btn' }, '⬇️ .gcode') : null,
      popup && popup.size ? h('div', { className: 'slc-sizes', role: 'group', 'aria-label': '창 크기' }, [['m', '◱', '보통 — 가운데 창'], ['l', '◳', '크게 — 화면 가장자리까지'], ['full', '⛶', '전체 화면']].map(([k, ic, t]) => h('button', { key: k, type: 'button', className: 'slc-size' + (size === k ? ' on' : ''), title: t, 'aria-label': t, 'aria-pressed': size === k, onClick: () => setSize(popup.size(k)) }, ic))) : null,
      popup ? h('button', { type: 'button', className: 'slc-x', 'aria-label': '닫기', onClick: popup.close }, '✕') : null))

  const viewer = ready ? h(Viewport, {
    settings, setSettings, files: ready.length ? ready : undefined, onSliced, onEvent,
    processPanel: h(SettingsPanel, { settings, setSettings, embedded: true }),
    features: { versionBadge: false, shortcuts: !compact, logs: false },
  }) : h('p', { className: 'slc-wait' }, '📦 파일을 준비하는 중…')

  const page = !popup && !compact
  return h('div', { className: 'slc' + (popup ? ' slc--pop' : '') + (compact ? ' slc--compact' : '') + (page ? ' slc--page' : '') },
    page ? h('header', { className: 'slc-hero' }, h('div', { className: 'slc-hero-bg', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { className: 'slc-hero-ic' }, '🔪'),
      h('div', null, h('h1', null, '슬라이서'), h('p', null, 'STL · 3MF · OBJ 를 판에 올려 옮기고 · 돌리고 · 칠하고, OrcaSlicer 설정으로 슬라이스해 층마다 미리 보고 내 프린터로 바로 보내요.')),
      h('span', { className: 'slc-badge' }, '🔒 모델은 이 브라우저에서만 — 서버로 안 가요')) : null,
    bar,
    err ? h('p', { className: 'slc-err' }, '⚠️ ' + err, h('button', { type: 'button', onClick: () => setErr('') }, '✕')) : null,
    note ? h('p', { className: 'slc-note' }, note, h('button', { type: 'button', onClick: () => setNote('') }, '✕')) : null,
    sent ? h('p', { className: 'slc-sent' }, '✅ ' + sent + ' ', h('a', { href: '/my-printer' }, '프린터 라운지에서 상태 보기 ›'), h('button', { type: 'button', onClick: () => setSent('') }, '✕')) : null,
    h('div', { className: 'slc-stage', ref: stage }, viewer),
    h('footer', { className: 'slc-foot' }, '설정 칸은 OrcaSlicer 와 같은 이름(영어)이에요. 이 슬라이서는 ', h('b', null, 'AGPL-3.0'), ' 오픈소스예요 — ', h('a', { href: SRC, target: '_blank', rel: 'noopener' }, '소스 보기'),
      ' · 엔진 ', h('a', { href: 'https://github.com/kimgh06/Three_Slicer', target: '_blank', rel: 'noopener' }, 'three-slicer'), ' (OrcaSlicer 를 브라우저로 옮긴 것). 결과는 Bambu Studio · OrcaSlicer 와 조금 다를 수 있으니 처음 쓰는 프린터는 첫 층을 지켜봐 주세요.'),
    prof ? h(ProfileDialog, { settings, lounge, pid, onClose: () => setProf(false), onApply: (title, parts) => { setSettings((s) => applyProfile(s, parts)); setApplied(title); setProf(false); setNote('🎛️ 「' + title + '」 설정을 적용했어요 — 오른쪽 칸에서 확인하고 「Slice」를 누르세요.') } }) : null,
    send && R ? h(SendDialog, { R, lounge, pid0: pid, popup, onClose: () => setSend(false), onSent: (p) => setSent('「' + p.name + '」 로 보냈어요 — 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.') }) : null)
}

/* ───────── 붙이기 ───────── */
const roots = new Map()
/** el 에 슬라이서를 그림 — opts: {files: File[], popup: {close()}, compact, printer: {brand, model, name} (부른 화면이 고른 프린터), from: 위 띠에 보일 말} */
function mount(el, opts = {}) {
  if (!el) return null
  unmount(el)
  const r = createRoot(el)
  r.render(h(App, { files: opts.files || [], popup: opts.popup || null, compact: !!opts.compact, printer: opts.printer || null, from: opts.from || '' }))
  roots.set(el, r)
  return { unmount: () => unmount(el) }
}
function unmount(el) { const r = roots.get(el); if (r) { try { r.unmount() } catch (e) {} roots.delete(el) } }
// 화면에서 빠진 자리는 정리 (다른 화면으로 가거나 탭을 바꿈) — 뷰어의 단축키 · 엔진이 남지 않게
try { new MutationObserver(() => { for (const el of Array.from(roots.keys())) if (!el.isConnected) unmount(el) }).observe(document.documentElement, { childList: true, subtree: true }) } catch (e) {}

/** 이 플러그인 화면(/print-slicer) — data-slc-app 자리 */
function tick() {
  document.querySelectorAll('[data-slc-app]').forEach((el) => {
    if (roots.has(el)) return
    const c = window.G7Slicer && typeof window.G7Slicer.takeCarry === 'function' ? window.G7Slicer.takeCarry() : null   // 팝업의 「↗ 자세히」로 들고 온 파일
    mount(el, c ? { files: c.files, printer: c.printer } : {})
  })
}
window.__slcApp = { version: V, mount, unmount, tick }
tick()
