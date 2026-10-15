// custom-slicer — 🎛️ 슬라이서 프로필(custom-slicer_profiles) 연동 · AGPL-3.0-or-later
//  회원이 올린 프로필 파일을 받아 이 슬라이서 설정에 바로 적용 (주소로만 주고받음 — 그 플러그인 코드를 가져오지 않음)
//  읽는 꼴: Bambu Studio · OrcaSlicer 프리셋(.json · .bbscfg · .bbsflmt) · 묶음(.orca_printer · .orca_filament · .orca_bundle · .zip) · 프로젝트(.3mf — 판 설정)
//  못 읽는 꼴: PrusaSlicer .ini · Cura .curaprofile (다른 슬라이서의 설정 이름이라 옮기면 틀림)
import { applyPreset, presetOptionKeys, readPresetFile, normalizeProjectSettings, printerSettings, processPresets, filamentPresets } from 'three-slicer/settings'
import { unzipAll } from './handoff.js'
import { writePresetFile, settingScalar } from 'three-slicer/settings'
import { zipStore } from './gcode3mf.js'

export const SPF = '/api/plugins/custom-slicer_profiles'
export const READABLE = ['json', 'bbscfg', 'bbsflmt', 'orca_printer', 'orca_filament', 'orca_bundle', 'zip', '3mf']
export const canRead = (ext) => READABLE.includes(String(ext || '').toLowerCase().replace(/^\./, ''))
const ID_KEY = { machine: 'printer_settings_id', process: 'print_settings_id', filament: 'filament_settings_id' }
const TYPE_OF = { printer: 'machine', print: 'process', machine: 'machine', process: 'process', filament: 'filament' }

/** 받은 파일 → [{kind: 'project'|'machine'|'process'|'filament', settings, name}] */
export async function readProfile(buf, ext) {
  ext = String(ext || '').toLowerCase().replace(/^\./, '')
  if (!canRead(ext)) throw new Error('이 슬라이서 설정 파일(.' + ext + ')은 읽을 수 없어요 — Bambu Studio · OrcaSlicer 프로필만 바로 적용돼요.')
  const P = await processPresets(), F = await filamentPresets()
  const parent = (name) => printerSettings(name) || (P.settingsFor && P.settingsFor(name)) || (F.settingsFor && F.settingsFor(name)) || null
  const one = (raw) => {
    const kind = TYPE_OF[String(raw.type || '').toLowerCase()] || (raw.printable_area || raw.printer_model ? 'machine' : raw.filament_type ? 'filament' : 'process')
    const r = readPresetFile({ ...raw, type: kind }, { resolveParent: parent })
    return { kind, settings: r.settings || {}, name: String(raw.name || '') }
  }
  const td = new TextDecoder()
  if (['json', 'bbscfg', 'bbsflmt'].includes(ext)) {
    let raw
    try { raw = JSON.parse(td.decode(buf)) } catch (e) { throw new Error('프로필 파일을 읽지 못했어요 (JSON 이 아니에요).') }
    return [one(raw)]
  }
  const list = await unzipAll(buf, /\.(json|config)$/i, true)
  const proj = list.find((x) => /(^|\/)Metadata\/project_settings\.config$/i.test(x.name))
  if (proj) {
    let raw
    try { raw = JSON.parse(td.decode(proj.data)) } catch (e) { throw new Error('프로젝트 설정(project_settings.config)을 읽지 못했어요.') }
    return [{ kind: 'project', settings: normalizeProjectSettings(raw).settings || {}, name: String(raw.print_settings_id || raw.printer_settings_id || '') }]
  }
  const out = []
  for (const x of list) { if (!/\.json$/i.test(x.name)) continue; try { out.push(one(JSON.parse(td.decode(x.data)))) } catch (e) { /* 프리셋이 아닌 json */ } }
  if (!out.length) throw new Error('이 묶음 안에서 슬라이서 설정을 찾지 못했어요.')
  const order = { machine: 0, process: 1, filament: 2 }
  return out.sort((a, b) => order[a.kind] - order[b.kind])
}

/** 읽은 프로필을 설정에 — 프린터 → 품질 → 필라멘트 순서로, 그 종류의 키를 먼저 지우고 (예전 값이 남지 않게) */
export function applyProfile(s, parts) {
  let n = { ...s }
  for (const p of parts) {
    if (p.kind === 'project') { n = { ...n, ...p.settings }; continue }
    n = applyPreset(n, p.settings, presetOptionKeys(p.kind))
    if (p.name) n[ID_KEY[p.kind]] = p.name
  }
  return n
}

/* ───────── 0.1.6 ⬆️ 지금 설정을 슬라이서 프로필로 올리기 ───────── */

const at0 = (v) => (Array.isArray(v) ? v[0] : v)
/** 지금 설정 → OrcaSlicer 프리셋 묶음(.zip: 프린터 · 품질 · 필라멘트 .json) — Orca 「설정 가져오기」 · 이 슬라이서 「🎛️ 프로필」로 다시 열 수 있음 */
export function profileZip(s, title) {
  const enc = new TextEncoder(), safe = (x) => String(x || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
  const files = []
  for (const [type, idKey] of [['machine', 'printer_settings_id'], ['process', 'print_settings_id'], ['filament', 'filament_settings_id']]) {
    try {
      // 프린터는 원래 이름 그대로 (적용하면 같은 프린터가 골라지게) · 품질 · 필라멘트는 제목을 붙여 회원 프리셋으로
      const orig = String(at0(s[idKey]) || '') || type, name = type === 'machine' ? orig : (title ? title + ' · ' : '') + orig
      const f = writePresetFile(s, { type, name })
      files.push([type + ' - ' + safe(name) + '.json', enc.encode(JSON.stringify(f, null, 2))])
    } catch (e) { /* 그 종류의 키가 없음 */ }
  }
  if (!files.length) throw new Error('올릴 설정을 만들지 못했어요.')
  return new File([zipStore(files)], safe(title || 'profile') + '.zip', { type: 'application/zip' })
}
/** 올리기 칸 처음 값 — 지금 설정 · 라운지 프린터에서 */
export function profileGuess(s, lp) {
  const printer = lp ? ((lp.brand || '') + ' ' + (lp.model || '')).trim() || lp.name : String(s.printer_settings_id || '').replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, '')
  const fil = String(at0(s.filament_settings_id) || '').replace(/\s*@.*$/, '')
  const mat = String(at0(s.filament_type) || settingScalar(s, 'filament_type') || '')
  const layer = Number(at0(s.layer_height) || settingScalar(s, 'layer_height')) || null
  const nozzle = Number(at0(s.nozzle_diameter) || settingScalar(s, 'nozzle_diameter')) || null
  return { title: [printer, fil || mat, layer ? layer + 'mm' : ''].filter(Boolean).join(' · ').slice(0, 120), printer_name: printer, filament_name: fil, material: mat, nozzle, layer_height: layer }
}
