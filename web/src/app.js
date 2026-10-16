/*! custom-slicer 0.1.14 — 🔪 슬라이서 화면 · AGPL-3.0-or-later · 소스: https://github.com/keidischoi/g7-plugin-custom-slicer
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
import { siteLang } from './i18n.js'
import './colors3mf.js'   // 0.1.14 3MF 원본 색 (뷰어 불러오기 갈고리)
import { estimateSeconds, maxZ, toolsOf, matchPreset, hexDist, sizeOf } from './util.js'
import { SPF, canRead, readProfile, applyProfile, profileZip, profileGuess } from './profiles.js'
import { polish, setRule, DARK_CSS } from './polish.js'
import { savePlate, loadPlate, clearPlate } from './store.js'
import { plateInfo, sceneTheme } from './plate.js'
import { mountToolbar, stopSpin } from './toolbar.js'

const V = '0.1.14', API = '/api/plugins/custom-slicer', LOUNGE = '/api/plugins/custom-my_printer', SRC = 'https://github.com/keidischoi/g7-plugin-custom-slicer'
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

/** 0.1.10 고른 프린터(라운지 · 출력 검사기) → 설정. 같은 엔진 프린터가 있으면 그것, 없으면 일반 프린터(Klipper 0.4)에 그 프린터의 판 크기 · 높이
 *  돌려줌: { s, hit } — hit 은 맞춘 엔진 프린터 이름 · 'size' (판 크기만) · '' (못 맞춤) */
export const GENERIC = 'MyKlipper 0.4 nozzle'
export function fitPrinter(s, p) {
  const hit = p ? matchPreset(printersByVendor, p, printerTechByVendor) : null
  if (hit) return { s: s.printer_settings_id === hit[1] ? s : applyPrinter(s, hit[1]), hit: hit[1] }
  const sz = sizeOf(p)
  if (!sz || !(sz[0] > 20 && sz[1] > 20)) return { s, hit: '' }
  const n = applyPrinter(s, GENERIC)
  n.printable_area = [[0, 0], [sz[0], 0], [sz[0], sz[1]], [0, sz[1]]]   // 엔진 프린터 프로필과 같은 꼴
  if (sz[2] > 20) n.printable_height = sz[2]
  n.bed_exclude_area = []
  return { s: n, hit: 'size' }
}

/** 0.1.3 프로젝트 3MF(Bambu Studio 최신)의 사용자 G-code 에 이 엔진이 모르는 변수가 있으면 슬라이스가 「CUSTOM_GCODE_ERROR: <칸>: …」 로 멈춤 →
 *  그 칸만 이 슬라이서가 아는 프린터 기본값으로 (없으면 지워서 엔진 기본) — 나머지 프로젝트 설정은 그대로 */
export const GCODE_ERR = /CUSTOM_GCODE_ERROR:\s*([a-z0-9_]+)\s*:/i
/** 0.1.5 「settings could not be loaded: Invalid value provided for parameter bed_mesh_max: 0x0」 처럼 설정값 하나가 틀린 경우 */
export const PARAM_ERR = /Invalid value provided for parameter\s+([a-z0-9_]+)/i
export function badKey(msg) { const p = PARAM_ERR.exec(msg); if (p) return p[1]; const g = GCODE_ERR.exec(msg); return g && g[1] !== 'settings' ? g[1] : '' }
export function fixGcode(s, key) {
  const base = printerSettings(String(s.printer_settings_id || '')) || {}, n = { ...s }
  if (base[key] != null && String(base[key]) !== String(s[key])) n[key] = base[key]
  else delete n[key]
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
function SendDialog({ R, lounge, pid0, onClose, onSent, popup, onShare }) {
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
      onShare ? h('div', { key: 'sh', className: 'slc-share' }, h('b', null, '🎛️ 이 설정을 슬라이서 프로필에도 올릴까요?'), h('small', null, '설정 파일 · 판 사진을 채운 작성 화면으로 가요 — 확인하고 올리면 다른 회원이 같은 프린터 · 필라멘트로 바로 쓸 수 있어요 (모델은 안 올라가요).'),
        h('span', null, h('button', { type: 'button', className: 'slc-btn pri', onClick: () => { onClose(); onShare() } }, '⬆️ 프로필 쓰러 가기'))) : null,
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
function ProfileDialog({ settings, lounge, pid, onClose, onApply, onUpload, canUpload }) {
  const lp = lounge.list.find((x) => +x.id === +pid)
  const base = String(settings.printer_settings_id || '').replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, '')
  const [q, setQ] = useState(''), [who, setWho] = useState(lp ? lp.model || lp.name : base.replace(/^Bambu Lab /, ''))
  const [items, setItems] = useState(null), [busy, setBusy] = useState(0), [err, setErr] = useState(''), [wide, setWide] = useState(false)
  const timer = useRef(0)
  useEffect(() => {
    let on = true; setItems(null)
    const p = new URLSearchParams({ per: '24', sort: 'popular' }); if (who) p.set('printer', who); if (q) p.set('q', q)
    const get = (qs) => fetch(SPF + '/profiles?' + qs, { headers: headers(), credentials: 'same-origin' }).then((r) => r.json()).then((j) => (j && j.data && j.data.items) || [], () => [])
    get(p).then((l) => {
      if (!on) return
      if (l.length || !who) { setWide(false); setItems(l); return }
      const p2 = new URLSearchParams(p); p2.delete('printer')   // 이 프린터 것이 없으면 모든 프린터
      get(p2).then((l2) => { if (on) { setWide(true); setItems(l2) } })
    })
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
      wide && items && items.length ? h('p', { className: 'slc-hint' }, '「' + who + '」 프로필이 아직 없어 모든 프린터의 인기 프로필을 보여요 — 프린터가 다르면 오른쪽 프린터 칸 값은 그대로 두고 품질 · 필라멘트만 참고하세요.') : null,
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
      h('div', { className: 'slc-acts' }, onUpload ? h('button', { type: 'button', className: 'slc-btn pri', onClick: onUpload, disabled: !canUpload, title: !canUpload ? '판에 모델을 먼저 올려 주세요 — 모델 없이 만든 설정은 올릴 수 없어요' : '지금 슬라이서 설정 · 판 사진을 채운 「프로필 올리기」 작성 화면으로 가요 — 확인하고 올리세요' }, '⬆️ 지금 설정으로 프로필 쓰기') : null, h('a', { className: 'slc-btn', href: '/slicer-profiles', target: '_blank', rel: 'noopener' }, '슬라이서 프로필 ↗'), h('button', { type: 'button', className: 'slc-btn', onClick: onClose }, '닫기'))))
}

/* ───────── 0.1.8 「프로필 올리기」 작성 폼 팝업 (슬라이서 프로필 0.2.2+ 가 그 안에 그림) ───────── */
function SpfFormPop({ onClose, onDone }) {
  const box = useRef(null)
  useEffect(() => {
    const pre = window.__spfPrefill; window.__spfPrefill = null
    let on = true
    window.G7SlicerProfiles.form(box.current, pre || {}, { done: (id, msg) => { if (on) onDone(id, msg) } }).catch((e) => { if (on && box.current) box.current.textContent = '⚠️ ' + ((e && e.message) || e) })
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => { on = false; document.removeEventListener('keydown', key); try { window.G7SlicerProfiles.close() } catch (e) {} }
  }, [])
  return h('div', { className: 'slc-modal slc-spfpop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'slc-spfbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '슬라이서 프로필 올리기' },
      h('div', { className: 'slc-spfhd' }, h('b', null, '🎛️ 슬라이서 프로필 올리기'), h('small', null, '확인하고 아래 「올리기」 — 슬라이서 작업은 그대로 남아요'), h('button', { type: 'button', className: 'slc-x', 'aria-label': '닫기', onClick: onClose }, '✕')),
      h('div', { className: 'slc-spfbody', ref: box }, h('p', { className: 'slc-hint' }, '불러오는 중…'))))
}

/* ───────── 화면 ───────── */
function App({ files, popup, compact, printer, from }) {
  const [settings, setSettingsRaw] = useState(() => loadSaved() || {})
  const setSettings = useCallback((u) => setSettingsRaw((s) => { const n = typeof u === 'function' ? u(s) : u; save(n); return n }), [])
  const [me, setMe] = useState({}), [lounge, setLounge] = useState({ logged: false, list: [] }), [pid, setPid] = useState(0)
  const [res, setRes] = useState(null), [err, setErr] = useState(''), [note, setNote] = useState(''), [send, setSend] = useState(false), [sent, setSent] = useState('')
  const [ready, setReady] = useState(null)   // 넘겨받은 파일 (zip 은 풀어서) — 준비되면 뷰어를 그림 (뷰어는 files 를 처음 한 번만 받음)
  const [sliceReq, setSliceReq] = useState(0), fixes = useRef([])   // 0.1.3 G-code 칸을 고친 뒤 다시 슬라이스
  // 0.1.6 ☁️ 웹저장소 연결이 슬라이서보다 늦게 불러와져도 단추가 나오게 (10초까지 지켜봄)
  const [hasCloud, setHasCloud] = useState(() => !!(window.G7Cloud && window.G7Cloud.pick))
  useEffect(() => { if (hasCloud) return; let n = 0; const t = setInterval(() => { if (window.G7Cloud && window.G7Cloud.pick) { setHasCloud(true); clearInterval(t) } else if (++n > 40) clearInterval(t) }, 250); return () => clearInterval(t) }, [])
  const [objCount, setObjCount] = useState(0)   // 0.1.8 판에 올린 모델 수 (0 이면 프로필 쓰기를 막음)
  const [spfPop, setSpfPop] = useState(false), [spfDone, setSpfDone] = useState(0)   // 0.1.8 「프로필 올리기」 작성 폼 팝업 · 올린 프로필 번호
  const [spf, setSpf] = useState(false), [prof, setProf] = useState(false), [applied, setApplied] = useState('')
  const [size, setSize] = useState(() => (popup && popup.current ? popup.current() : ''))
  const stage = useRef(null), names = useRef([]), cur = useRef(settings)
  cur.current = settings

  // 0.1.4 판 임시 저장 — 새로고침해도 모델이 남게 (이 브라우저에만 · 자리마다 따로)
  const slot = compact ? 'tab' : popup ? 'big' : 'page', kept = useRef([])
  const keep = (list, replace) => { kept.current = replace ? list.slice() : kept.current.concat(list); savePlate(slot, kept.current) }
  useEffect(() => {
    let on = true
    expandFiles(files).then(async (l) => {
      if (!on) return
      if (l.length) keep(l, true)
      else {
        const back = await loadPlate(slot)
        if (!on) return
        if (back.length) { l = back; kept.current = back.slice(); setNote('🗂 지난번 판을 다시 불러왔어요 — 모델 ' + back.length + '개 (옮기거나 돌린 것은 처음 상태로). 비우려면 판에서 지우세요.') }
      }
      names.current = l.map((x) => x.name); setReady(l)
    })
    return () => { on = false }
  }, [])
  // 뷰어에 직접 끌어 놓거나 「Open」으로 연 파일도 임시 저장에 더함 (그림자 DOM 안의 파일 칸 · 끌어 놓기를 엿봄)
  useEffect(() => {
    if (!ready) return
    const hooked = new WeakSet()
    const onChange = (e) => { const t = e.target; if (t && t.type === 'file' && /stl/i.test(t.accept || '') && t.files && t.files.length && !t.__slcOurs) keep(Array.from(t.files)) }
    const onDrop = (e) => { const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) keep(Array.from(fl).filter((x) => /\.(stl|3mf|obj|amf|ply)$/i.test(x.name))) }
    const hook = () => {
      const walk = (n) => { if (!n) return; if (n.shadowRoot && !hooked.has(n.shadowRoot)) { hooked.add(n.shadowRoot); n.shadowRoot.addEventListener('change', onChange, true); n.shadowRoot.addEventListener('drop', onDrop, true) } if (n.shadowRoot) walk(n.shadowRoot); if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot) walk(c) }) }
      walk(stage.current)
    }
    hook(); const t = setInterval(hook, 1500); setTimeout(() => clearInterval(t), 15000)
    return () => clearInterval(t)
  }, [ready])
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
      if (!cur.current.printer_settings_id) setSettings((s) => fitPrinter(s, ok).s)   // 처음 쓰면 내 프린터의 설정으로 (저장된 것이 있으면 그대로)
    })
    return () => { on = false }
  }, [])
  // 출력 검사기에서 고른 프린터 → 같은 엔진 프린터로 (못 찾으면 그대로 두고 알림)
  const printerKey = printer ? [printer.brand, printer.model, printer.name, String(sizeOf(printer) || '')].join('|') : ''
  useEffect(() => {
    if (!printer) return
    const r = fitPrinter(cur.current, printer)
    if (r.hit) setSettings(r.s)
    if (r.hit === 'size') setNote('「' + (printer.name || printer.model) + '」 와 같은 슬라이서 프린터가 없어 일반 프린터에 판 크기(' + sizeOf(printer).filter(Boolean).join('×') + ' mm)만 맞췄어요 — 오른쪽에서 바꿀 수 있어요.')
    else if (!r.hit && (printer.model || printer.name)) setNote('「' + (printer.name || printer.model) + '」 와 같은 슬라이서 프린터 설정이 없어요 — 오른쪽 프린터 칸에서 골라 주세요.')
    else setNote('')
    const lp = lounge.list.find((x) => { const a = matchPreset(printersByVendor, x, printerTechByVendor), b = matchPreset(printersByVendor, printer, printerTechByVendor); return a && b && a[1] === b[1] })
    if (lp) setPid(+lp.id)
  }, [printerKey])
  useEffect(() => { setRes(null) }, [settings])   // 설정이 바뀌면 뷰어도 결과를 버림
  // 0.1.5 🧱 바닥판 — 출력 검사기와 같은 판 그림 (프린터 제조사 · 판 종류)
  useEffect(() => { plateInfo(String(settings.printer_settings_id || ''), String(settings.curr_bed_type || '')) }, [settings.printer_settings_id, settings.curr_bed_type])
  // 🎛️ 슬라이서 프로필 플러그인이 켜져 있나 (목록 하나만 물어봄)
  useEffect(() => { fetch(SPF + '/profiles?per=6&lite=1', { headers: headers(), credentials: 'same-origin' }).then((r) => setSpf(r.ok), () => setSpf(false)) }, [])
  // 뷰어 · 설정 칸(그림자 DOM) 안 입력칸 · 숫자칸 · 카드를 출력 검사기 말씨로 다듬음
  useEffect(() => polish(stage.current, { flow: !popup, ko: siteLang() === 'ko' }), [ready])   // 0.1.11 사이트 언어
  // 0.1.7 판 가운데 「Choose file」 바로 아래 「☁️ 내 저장소에서」 (웹저장소 연결이 켜져 있을 때) — 뷰어가 빈 판 안내를 다시 그려도 다시 붙음
  const openRef = useRef(null)   // 아래 cloudOpen 을 가리킴 (그 함수가 뒤에 있어서)
  useEffect(() => {
    if (!ready || !hasCloud) return
    const put = () => {
      let hint = null
      const walk = (n) => { if (!n || hint) return; if (n.shadowRoot) { hint = n.shadowRoot.querySelector('.empty-hint'); walk(n.shadowRoot) } if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot && !hint) walk(c) }) }
      walk(stage.current)
      if (!hint || hint.querySelector('.slc-ehcloud')) return
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slc-ehcloud'
      b.title = '내 저장소에서 가져오기 — 웹저장소(구글 드라이브 · 원드라이브 · 드롭박스 · WebDAV)의 STL · 3MF · OBJ · ZIP 을 판에 올려요'
      b.setAttribute('aria-label', '내 저장소에서 가져오기')
      // 0.1.9 아이콘만 — 사이트의 다른 「내 저장소에서」와 같은 그림 (구글이 연결돼 있으면 구글 드라이브, 아니면 구름)
      const C = window.G7Cloud || {}, icons = C.icons || {}
      let ready = {}; try { ready = (C.cfg && C.cfg().ready) || {} } catch (e) {}
      b.innerHTML = (ready.google && icons.google) || icons.cloud || (ready.onedrive && icons.onedrive) || '<span aria-hidden="true">☁️</span>'
      for (const ev of ['pointerdown', 'mousedown']) b.addEventListener(ev, (e) => e.stopPropagation())
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openRef.current && openRef.current() })
      const pick = hint.querySelector('.eh-btn')
      if (pick) pick.insertAdjacentElement('afterend', b); else hint.appendChild(b)
    }
    put(); const t = setInterval(put, 1000)
    return () => clearInterval(t)
  }, [ready, hasCloud])
  // 0.1.5 🧰 보기 도구 (출력 검사기와 같은 세로 도구) — 뷰어가 다시 그려도 다시 붙음
  useEffect(() => {
    if (!ready) return
    const ctx = {
      shot: async () => { const png = await snap(stage.current); if (!png) { setErr('사진을 만들지 못했어요 — 판을 한 번 돌린 뒤 다시 눌러 주세요.'); return } const a = document.createElement('a'), u = URL.createObjectURL(new Blob([png], { type: 'image/png' })); a.href = u; a.download = ((names.current[0] || 'plate').replace(/\.[^.]+$/, '')) + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(u) }, 1500) },
      full: () => { const el = wrap.current || stage.current; try { if (document.fullscreenElement) document.exitFullscreen(); else if (popup && popup.size) popup.size('full'); else el.requestFullscreen && el.requestFullscreen() } catch (e) {} },
    }
    const put = () => mountToolbar(stage.current, ctx)
    put(); const t = setInterval(put, 1200)
    return () => { clearInterval(t); stopSpin() }
  }, [ready])
  // 0.1.4 사이트 테마(밝게 · 어둡게)를 따라 뷰어 · 설정 칸 색을 바꿈 — <html class="dark"> 를 지켜봄
  useEffect(() => {
    if (!ready) return
    const apply = () => { const dark = document.documentElement.classList.contains('dark'); if (wrap.current) wrap.current.setAttribute('data-slc-theme', dark ? 'dark' : 'light'); setRule(stage.current, 'dark', dark ? DARK_CSS : ''); sceneTheme(dark) }
    apply(); const t = setTimeout(apply, 1500)
    let mo = null; try { mo = new MutationObserver(apply); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] }) } catch (e) {}
    return () => { clearTimeout(t); try { mo && mo.disconnect() } catch (e) {} }
  }, [ready])
  // 0.1.4 프린터 칸의 「Model」 줄은 뺌 — 위의 내 프린터 칩이 고름 (프린터 라운지에 프린터가 없으면 그대로 둠: 그때는 거기서만 고를 수 있어서)
  useEffect(() => {
    if (!ready) return
    const css = lounge.list.length ? '.sc-info:has(select[data-testid="printer-model"]){display:none !important}' : ''
    setRule(stage.current, 'nomodel', css); const t = setTimeout(() => setRule(stage.current, 'nomodel', css), 1500)
    return () => clearTimeout(t)
  }, [ready, lounge.list.length])
  // 0.1.3 화면을 올리면 3D 뷰어가 사이트 헤더 바로 밑에 붙어 멈춤 (헤더 높이를 재서 --slc-top)
  const wrap = useRef(null)
  useEffect(() => {
    if (popup) return
    let last = -1, t = 0
    /** 0.1.4 화면 위에 고정된 띠(사이트 헤더 · 그 밑 메뉴 줄 …)가 어디서 끝나나 — 위에서부터 4px 씩 내려가며 그 자리의 요소가
     *  고정(fixed) · 붙음(sticky) 띠 안에 있으면 계속 (헤더가 두 줄이어도 맨 아랫줄 밑) · 이 슬라이서 안의 요소는 셈하지 않음 */
    const fixedBar = (el) => {
      for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        if (wrap.current && wrap.current.contains(n)) return false
        const cs = getComputedStyle(n)
        if (cs.position === 'fixed' || cs.position === 'sticky') { const r = n.getBoundingClientRect(); return r.width >= innerWidth * 0.4 && r.height <= innerHeight * 0.4 }
      }
      return false
    }
    const top = () => {
      let b = 0
      try {
        const xs = [innerWidth * 0.5, innerWidth * 0.3, innerWidth * 0.7]
        for (let y = 2; y < Math.min(320, innerHeight * 0.45); y += 4) {
          const hit = xs.some((x) => { const e = document.elementFromPoint(x, y); return e && fixedBar(e) })
          if (hit) b = y; else if (y > b + 12) break   // 띠 사이 작은 틈(12px)까지는 이어 봄
        }
      } catch (e) {}
      return Math.round(b) + 10
    }
    const apply = () => { t = 0; const v = top(); if (v !== last && wrap.current) { last = v; wrap.current.style.setProperty('--slc-top', v + 'px') } }
    const soon = () => { if (!t) t = setTimeout(apply, 120) }
    apply(); addEventListener('scroll', soon, { passive: true }); addEventListener('resize', soon)
    return () => { removeEventListener('scroll', soon); removeEventListener('resize', soon); clearTimeout(t) }
  }, [])

  const pickLounge = (p) => {
    setPid(+p.id); setNote('')
    const r = fitPrinter(cur.current, p)
    if (r.hit) setSettings(r.s)
    if (r.hit === 'size') setNote('「' + (p.name || '') + '」 와 같은 슬라이서 프린터가 없어 일반 프린터에 판 크기(' + sizeOf(p).filter(Boolean).join('×') + ' mm)만 맞췄어요 — 오른쪽에서 바꿀 수 있어요.')
    else if (!r.hit) setNote('「' + (p.name || '') + '」 와 같은 프린터 설정을 못 찾았어요 — 오른쪽 프린터 칸에서 제조사 · 모델을 골라 주세요.')
  }
  const onSliced = useCallback(async ({ plate, stats, gcode }) => {
    setErr(''); fixes.current = []
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
  // 0.1.8 뷰어는 알림을 {type, value} 하나로 줌 (예전엔 (이름, 값) 으로 받아 모델 수 · 오류 자동 고침 · 판 비우기가 하나도 안 들었음)
  const onEvent = useCallback((ev, v2) => {
    const name = typeof ev === 'string' ? ev : ev && ev.type, v = typeof ev === 'string' ? v2 : ev && ev.value
    if (name === 'error' && v) {
      const msg = String((v && (v.message || v.error)) || v), key = badKey(msg)
      if (key && fixes.current.length < 8 && !fixes.current.includes(key)) {
        fixes.current.push(key)
        setSettings((x) => fixGcode(x, key))
        setNote('🔧 「' + key + '」 설정값을 이 슬라이서가 읽지 못해 이 프린터의 기본값으로 바꾸고 다시 슬라이스해요. 다른 설정은 그대로예요.')
        setTimeout(() => setSliceReq((x) => x + 1), 500)
      }
      return
    }
    if (name === 'objects' && Array.isArray(v) && !v.length) { kept.current = []; clearPlate(slot) }
    if (name === 'objects' && Array.isArray(v)) setObjCount(v.length)
    if (name === 'objects' && Array.isArray(v)) { names.current = v.map((o) => o.name).filter(Boolean); if (!v.length) setRes(null) }
  }, [])
  /** ☁️ 웹저장소 연결(custom-cloud_storage)이 켜져 있나 */
  const cloud = () => (hasCloud && window.G7Cloud && typeof window.G7Cloud.pick === 'function' ? window.G7Cloud : null)
  /** 뷰어에 파일을 더함 — 뷰어는 처음 한 번만 files 를 받아서, 그다음은 뷰어의 「Open」과 같은 숨은 파일 칸으로 (판에 있는 것에 더해짐) */
  const addFiles = (list) => {
    try {
      let inp = null
      const walk = (n) => { if (!n || inp) return; if (n.shadowRoot) { inp = Array.from(n.shadowRoot.querySelectorAll('input[type=file]')).find((x) => /stl/i.test(x.accept || '')) || null; walk(n.shadowRoot) } if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot && !inp) walk(c) }) }
      walk(stage.current)
      if (!inp) throw new Error('뷰어를 찾지 못했어요')
      const dt = new DataTransfer(); list.forEach((x) => dt.items.add(x))
      inp.files = dt.files; inp.__slcOurs = true
      inp.dispatchEvent(new Event('change', { bubbles: true }))
      inp.__slcOurs = false; keep(list)
      if (!names.current.length) names.current = list.map((x) => x.name)
    } catch (e) { setErr('파일을 판에 올리지 못했어요: ' + ((e && e.message) || e)) }
  }
  const cloudOpen = async () => {
    const C = cloud(); if (!C) return
    try {
      const got = await C.pick({ accept: '.stl,.3mf,.obj,.amf,.ply,.zip', multiple: true })
      const list = await expandFiles((Array.isArray(got) ? got : [got]).filter(Boolean).map((x) => (x instanceof File ? x : new File([x.blob || x], x.name || 'model.stl'))))
      if (list.length) { addFiles(list); setNote('☁️ 내 저장소에서 ' + list.length + '개를 판에 올렸어요.') }
    } catch (e) { if (e && !/취소|cancel/i.test(String(e.message || e))) setErr('☁️ ' + ((e && e.message) || e)) }
  }
  openRef.current = cloudOpen
  const cloudSave = (kind) => {
    const C = cloud(), R = res; if (!C || !R) return
    const blob = kind === '3mf' && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' }), name = R.base + (kind === '3mf' && R.gcode3mf ? '.gcode.3mf' : '.gcode')
    Promise.resolve(C.save(blob, name, blob.type || 'application/octet-stream', { choose: true })).then(() => setNote('☁️ 「' + name + '」 을(를) 내 저장소에 저장했어요.'), (e) => { if (e && !/취소|cancel/i.test(String(e.message || e))) setErr('☁️ ' + ((e && e.message) || e)) })
  }
  /** 0.1.6 ⬆️ 슬라이서 프로필로 — 바로 올리지 않고 「프로필 올리기」 작성 폼에 파일 · 칸 · 판 사진을 채워 넘김 (회원이 확인 · 입력하고 올림) */
  const share = async () => {
    if (!objCount) { setErr('판에 모델이 없어요 — 모델을 올리고(가능하면 슬라이스까지 해 본 뒤) 프로필을 써 주세요.'); return }
    const lp = lounge.list.find((x) => +x.id === +pid) || null, g = profileGuess(cur.current, lp)
    let file
    try { file = profileZip(cur.current, g.title) } catch (e) { setErr('프로필 파일을 만들지 못했어요: ' + ((e && e.message) || e)); return }
    const png = await snap(stage.current)
    window.__spfPrefill = { ...g, slicer: 'orca', file, photos: png ? [new File([png], 'slicer-screen.png', { type: 'image/png' })] : [], from: '🔪 3dsSlicer', at: Date.now(),
      description: (res ? '예상 ' + dur(res.seconds) + (res.guessed ? ' (어림)' : '') + ' · 필라멘트 ' + n1(res.weight) + ' g · ' + res.layers + '층\n\n' : '') + '🔪 3dsSlicer 에서 만든 설정 — OrcaSlicer 프리셋 묶음(.zip: 프린터 · 품질 · 필라멘트 .json). OrcaSlicer 「설정 가져오기」나 3dsSlicer 「🎛️ 슬라이서 프로필」로 바로 쓸 수 있어요.' }
    // 0.1.8 슬라이서 프로필 0.2.2+ 는 작성 폼을 이 화면 위 팝업에 그림 — 페이지를 옮기지 않아 판 · 큰 창 · 출력 검사기 탭이 그대로
    if (window.G7SlicerProfiles && typeof window.G7SlicerProfiles.form === 'function') { setSpfPop(true); return }
    if (popup && popup.close) popup.close()
    navTo('/slicer-profiles/new')   // 예전 판(0.2.1)은 작성 화면으로 옮겨 감
  }
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
      cloud() ? h('button', { type: 'button', className: 'slc-btn', title: '내 웹저장소(구글 드라이브 · 원드라이브 · 드롭박스)의 STL · 3MF · OBJ 를 판에 올려요', onClick: cloudOpen }, '☁️ 내 저장소에서') : null,
      spf ? h('button', { type: 'button', className: 'slc-btn', title: '회원들이 올린 프린터 × 필라멘트 설정을 골라 바로 적용해요 (🎛️ 슬라이서 프로필)', onClick: () => setProf(true) }, '🎛️ 슬라이서 프로필') : null,
      applied ? h('span', { className: 'slc-from', title: applied }, '🎛️ ' + applied) : null),
    h('div', { className: 'slc-bar-r' },
      R ? h('span', { className: 'slc-sum' }, '⏱ ' + dur(R.seconds) + (R.guessed ? ' (어림)' : '') + ' · 🧵 ' + n1(R.weight) + ' g · 층 ' + R.layers.toLocaleString()) : h('span', { className: 'slc-hint' }, '모델을 올리고 오른쪽 아래 「Slice」를 누르세요'),
      R && canSee ? h('button', { type: 'button', className: 'slc-btn pri', disabled: !canSend, title: canSend ? '' : (lounge.list.length ? '지금 보낼 수 있는 프린터가 없어요 (연결 프로그램 · 관리자 설정 「출력 파일 보내기」)' : '프린터 라운지에 내 프린터를 등록하면 보낼 수 있어요'), onClick: () => setSend(true) }, '📤 프린터로 보내기', SEND_ADMIN_ONLY ? h('small', { className: 'slc-adm' }, ' 🔒') : null) : null,
      R && R.gcode3mf ? h('button', { type: 'button', className: 'slc-btn', onClick: () => download('3mf') }, '⬇️ .gcode.3mf') : null,
      R ? h('button', { type: 'button', className: 'slc-btn', onClick: () => download('gcode') }, '⬇️ .gcode') : null,
      R && cloud() ? h('button', { type: 'button', className: 'slc-btn', title: '슬라이스 결과를 내 웹저장소(구글 드라이브 · 원드라이브 · 드롭박스)에 저장', onClick: () => cloudSave(R.gcode3mf ? '3mf' : 'gcode') }, '☁️ 저장') : null,
      popup && popup.size ? h('div', { className: 'slc-sizes', role: 'group', 'aria-label': '창 크기' }, [['m', '◱', '보통 — 가운데 창'], ['l', '◳', '크게 — 화면 가장자리까지'], ['full', '⛶', '전체 화면']].map(([k, ic, t]) => h('button', { key: k, type: 'button', className: 'slc-size' + (size === k ? ' on' : ''), title: t, 'aria-label': t, 'aria-pressed': size === k, onClick: () => setSize(popup.size(k)) }, ic))) : null,
      popup ? h('button', { type: 'button', className: 'slc-x', 'aria-label': '닫기', onClick: popup.close }, '✕') : null))

  const viewer = ready ? h(Viewport, {
    settings, setSettings, files: ready.length ? ready : undefined, onSliced, onEvent, sliceRequest: sliceReq,
    onExport: (file, filename) => { try { const C = cloud(); if (C && typeof C.offer === 'function') C.offer(file, filename) } catch (e) {} return false },
    processPanel: h(SettingsPanel, { settings, setSettings, embedded: true }),
    features: { versionBadge: false, shortcuts: true, logs: false },   // 0.1.13 탭 안(compact)도 단축키 — 아래 keyGate 가 슬라이서를 쓰는 중일 때만 보냄
  }) : h('p', { className: 'slc-wait' }, '📦 파일을 준비하는 중…')

  const page = !popup && !compact
  // 0.1.13 탭(내 프린터 등) 안의 슬라이서 — 마지막으로 누른 곳이 슬라이서 안일 때만 뷰어 단축키(Delete · 화살표 · m/r/s …)를 보냄.
  //  다른 칸을 쓰는 동안에는 막아서 그 화면의 키를 뺏지 않음 (Esc · Tab 과 글 쓰는 칸은 늘 그대로)
  useEffect(() => {
    if (!compact) return undefined
    let active = false
    const down = (e) => { const st = stage.current; active = !!(st && (e.composedPath ? e.composedPath().indexOf(st) >= 0 : st.contains(e.target))) }
    const VKEY = /^(Delete|Backspace|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/
    const gate = (e) => {
      if (active) return
      const t = e.composedPath ? e.composedPath()[0] : e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const k = String(e.key || '')
      const viewerKey = VKEY.test(k) || ((e.ctrlKey || e.metaKey) ? /^[rcvxkda]$/i.test(k) : /^[mgrszbltcfh1-9]$/i.test(k))
      if (viewerKey) e.stopImmediatePropagation()
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', gate, true)
    return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', gate, true) }
  }, [compact])
  return h('div', { ref: wrap, className: 'slc' + (popup ? ' slc--pop' : '') + (compact ? ' slc--compact' : '') + (page ? ' slc--page' : '') },
    page ? h('header', { className: 'slc-hero' }, h('div', { className: 'slc-hero-bg', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { className: 'slc-hero-ic' }, '🔪'),
      h('div', null, h('h1', null, '슬라이서'), h('p', null, 'STL · 3MF · OBJ 를 판에 올려 옮기고 · 돌리고 · 칠하고, OrcaSlicer 설정으로 슬라이스해 층마다 미리 보고 내 프린터로 바로 보내요.')),
      h('span', { className: 'slc-badge' }, '🔒 모델은 이 브라우저에서만 — 서버로 안 가요')) : null,
    bar,
    err ? h('p', { className: 'slc-err' }, '⚠️ ' + err, h('button', { type: 'button', onClick: () => setErr('') }, '✕')) : null,
    note ? h('p', { className: 'slc-note' }, note, spfDone && /프로필|profile/i.test(note) ? h('a', { href: '/slicer-profiles/' + spfDone, target: '_blank', rel: 'noopener', style: { marginLeft: 6 } }, '올린 프로필 보기 ↗') : null, h('button', { type: 'button', onClick: () => setNote('') }, '✕')) : null,
    sent ? h('p', { className: 'slc-sent' }, '✅ ' + sent + ' ', h('a', { href: '/my-printer' }, '프린터 라운지에서 상태 보기 ›'), h('button', { type: 'button', onClick: () => setSent('') }, '✕')) : null,
    h('div', { className: 'slc-stage', ref: stage }, viewer),
    // 0.1.4 슬라이스 결과 띠 — 페이지 흐름에서는 위 띠가 스크롤로 사라지므로 화면 아래에 붙여 늘 보이게 (큰 창은 위 띠 그대로)
    R && !popup ? h('div', { className: 'slc-dock', role: 'region', 'aria-label': '슬라이스 결과' },
      h('span', { className: 'slc-dsum' }, h('b', null, '✅ 슬라이스 완료'), ' ⏱ ' + dur(R.seconds) + (R.guessed ? ' (어림)' : '') + ' · 🧵 ' + n1(R.weight) + ' g · 층 ' + R.layers.toLocaleString()),
      h('span', { className: 'slc-dbtns' },
        canSee ? h('button', { type: 'button', className: 'slc-btn pri', disabled: !canSend, title: canSend ? '프린터 라운지의 내 프린터로 보내요' : (lounge.list.length ? '지금 보낼 수 있는 프린터가 없어요 (연결 프로그램 · 관리자 설정 「출력 파일 보내기」)' : '프린터 라운지에 내 프린터를 등록하면 보낼 수 있어요'), onClick: () => setSend(true) }, '📤 프린터로 보내기', SEND_ADMIN_ONLY ? h('small', { className: 'slc-adm' }, ' 🔒') : null) : null,
        R.gcode3mf ? h('button', { type: 'button', className: 'slc-btn', onClick: () => download('3mf') }, '⬇️ .gcode.3mf') : null,
        h('button', { type: 'button', className: 'slc-btn', onClick: () => download('gcode') }, '⬇️ .gcode'),
        cloud() ? h('button', { type: 'button', className: 'slc-btn', onClick: () => cloudSave(R.gcode3mf ? '3mf' : 'gcode') }, '☁️ 저장') : null)) : null,
    h('footer', { className: 'slc-foot' },
      h('p', null, '설정 이름은 한국어 · 그 아래 작은 글씨는 OrcaSlicer 영어 이름이에요. 결과는 Bambu Studio · OrcaSlicer 와 조금 다를 수 있으니 처음 쓰는 프린터는 첫 층을 지켜봐 주세요.'),
      h('p', null, '이 슬라이서는 ', h('b', null, 'AGPL-3.0'), ' 오픈소스예요 — ', h('a', { href: SRC, target: '_blank', rel: 'noopener' }, '소스 보기'), ' · 엔진 ', h('a', { href: 'https://github.com/kimgh06/Three_Slicer', target: '_blank', rel: 'noopener' }, 'three-slicer'), ' (OrcaSlicer 를 브라우저로 옮긴 것) · © three-slicer · OrcaSlicer 기여자 · 보증 없음')),
    spfPop ? h(SpfFormPop, { onClose: () => setSpfPop(false), onDone: (id, msg) => { setSpfPop(false); setNote('🎛️ ' + msg + ' — 다른 회원이 「잘 됐어요」로 평가할 수 있어요.'); setSpfDone(id) } }) : null,
    prof ? h(ProfileDialog, { canUpload: objCount > 0, onUpload: lounge.logged ? () => { setProf(false); share() } : null, settings, lounge, pid, onClose: () => setProf(false), onApply: (title, parts) => { setSettings((s) => applyProfile(s, parts)); setApplied(title); setProf(false); setNote('🎛️ 「' + title + '」 설정을 적용했어요 — 오른쪽 칸에서 확인하고 「Slice」를 누르세요.') } }) : null,
    send && R ? h(SendDialog, { R, lounge, pid0: pid, popup, onShare: spf && lounge.logged ? () => share() : null, onClose: () => setSend(false), onSent: (p) => setSent('「' + p.name + '」 로 보냈어요 — 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.') }) : null)
}

/* ───────── 붙이기 ───────── */
const roots = new Map()
/** el 에 슬라이서를 그림 — opts: {files: File[], popup: {close()}, compact, printer: {brand, model, name} (부른 화면이 고른 프린터), from: 위 띠에 보일 말} */
function mount(el, opts = {}) {
  if (!el) return null
  unmount(el)
  const r = createRoot(el)
  const props = { files: opts.files || [], popup: opts.popup || null, compact: !!opts.compact, printer: opts.printer || null, from: opts.from || '' }
  r.render(h(App, props))
  roots.set(el, r); propsOf.set(el, props)
  return { unmount: () => unmount(el) }
}
const propsOf = new WeakMap()
/** 0.1.10 붙인 슬라이서의 프린터만 바꿈 — 출력 검사기에서 프린터를 고르면 오른쪽 설정이 바로 따라감 (판 · 모델은 그대로) */
function setPrinter(el, printer) {
  const r = roots.get(el), p = propsOf.get(el); if (!r || !p) return false
  const n = { ...p, printer: printer || null }; propsOf.set(el, n); r.render(h(App, n)); return true
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
window.__slcApp = { version: V, mount, unmount, tick, setPrinter }
tick()
