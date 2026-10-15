// custom-slicer — 🎛️ 슬라이서 프로필(custom-slicer_profiles) 연동 · AGPL-3.0-or-later
//  회원이 올린 프로필 파일을 받아 이 슬라이서 설정에 바로 적용 (주소로만 주고받음 — 그 플러그인 코드를 가져오지 않음)
//  읽는 꼴: Bambu Studio · OrcaSlicer 프리셋(.json · .bbscfg · .bbsflmt) · 묶음(.orca_printer · .orca_filament · .orca_bundle · .zip) · 프로젝트(.3mf — 판 설정)
//  못 읽는 꼴: PrusaSlicer .ini · Cura .curaprofile (다른 슬라이서의 설정 이름이라 옮기면 틀림)
import { applyPreset, presetOptionKeys, readPresetFile, normalizeProjectSettings, printerSettings, processPresets, filamentPresets } from 'three-slicer/settings'
import { unzipAll } from './handoff.js'

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
