/*! model-read.cjs — 출력 검사기(custom-print_check, MIT · 같은 저작자)의 계산 핵심을 가져옴 (원본 0.2.0) · 이 플러그인 안에서는 AGPL-3.0-or-later 로 함께 배포 (브라우저 · node 검사 같은 코드)
 * 파일 읽기(STL · OBJ · 3MF) → 삼각형 [x1,y1,z1, x2,…] (mm)
 *   0.3.16 물체: 3MF 에 물체(바디 · 부품)가 둘 넘으면 삼각형마다 물체 — tris.parts (Uint16, n = partList[n-1]) · tris.partList [{name}]
 *   0.2.0 다색: 삼각형마다 색 — tris.colors (Uint16, 0 = 색 없음 / n = palette[n-1]) · tris.palette [{hex, name}]
 *     3MF: Bambu Studio · Orca(칠하기 paint_color · 부품/물체 필라멘트 · filament_colour), PrusaSlicer(mmu_segmentation · 볼륨 extruder · extruder_colour),
 *          표준 3MF 재료(basematerials · colorgroup) / OBJ: 꼭짓점 색 / STL: 바이너리 면 색(VisCAM · Materialise)
 * 분석: 크기 · 부피 · 겉넓이 · 열린 모서리 · 부품 수 · 오버행 · 바닥 면적 · 6방향 중 좋은 방향 · 프린터에 들어가나 · 무게 · 비용 · 시간
 *   0.2.0 색별 넓이 · 부피, 층마다 색 바꿈 수(colorPlan) · 버림(퍼지) · 바꾸는 시간 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 필라멘트 번호에 색이 없을 때 (Bambu AMS 기본 색과 비슷하게) */
  var EXT_COLORS = ['#F2F2F2', '#1F1F1F', '#E53935', '#1E88E5', '#43A047', '#FDD835', '#FB8C00', '#8E24AA', '#00ACC1', '#EC407A', '#6D4C41', '#90A4AE', '#C0CA33', '#5E35B1', '#26A69A', '#F4511E'];

  /** 색 모음 — 같은 색 · 이름은 한 칸 */
  function Palette() { this.list = []; this.map = {}; }
  Palette.prototype.add = function (hex, name) {
    hex = normHex(hex); var k = hex + '|' + (name || '');
    if (!this.map[k]) { this.list.push({ hex: hex, name: name || hex }); this.map[k] = this.list.length; }
    return this.map[k];
  };
  function normHex(h) {
    var s = String(h || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/(.)/g, '$1$1');
    if (/^[0-9a-f]{8}$/i.test(s)) s = s.slice(0, 6);   // #RRGGBBAA → 투명도는 버림
    return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : '#9CA3AF';
  }
  function hexRgb(h) { var n = parseInt(normHex(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function attach(t, colors, pal) {
    if (!colors || !pal || !pal.list.length) return t;
    var used = {}, k = 0;
    for (var i = 0; i < colors.length; i++) if (colors[i] && !used[colors[i]]) { used[colors[i]] = 1; k++; }
    if (k < 1) return t;
    t.colors = colors; t.palette = pal.list;
    return t;
  }

  // ───────── 읽기 ─────────
  function isAsciiStl(buf) {
    var u = new Uint8Array(buf, 0, Math.min(buf.byteLength, 512));
    var head = ''; for (var i = 0; i < u.length; i++) head += String.fromCharCode(u[i]);
    if (!/^\s*solid/i.test(head)) return false;
    // 바이너리인데 머리말이 solid 로 시작하는 파일도 있음 → 크기로 확인
    if (buf.byteLength >= 84) {
      var n = new DataView(buf).getUint32(80, true);
      if (84 + n * 50 === buf.byteLength) return false;
    }
    return /facet|vertex/i.test(new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096))));
  }
  function parseStl(buf) {
    if (isAsciiStl(buf)) {
      var txt = new TextDecoder().decode(buf), out = [], re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, m;
      while ((m = re.exec(txt))) out.push(+m[1], +m[2], +m[3]);
      return new Float32Array(out.slice(0, out.length - (out.length % 9)));
    }
    var dv = new DataView(buf), n = dv.getUint32(80, true);
    if (84 + n * 50 > buf.byteLength) n = Math.floor((buf.byteLength - 84) / 50);
    var t = new Float32Array(n * 9), o = 84, attr = new Uint16Array(n);
    for (var i = 0; i < n; i++) {
      o += 12;
      for (var k = 0; k < 9; k++) { t[i * 9 + k] = dv.getFloat32(o, true); o += 4; }
      attr[i] = dv.getUint16(o, true);
      o += 2;
    }
    // 0.2.0 면 색 — Materialise(머리말 COLOR=, 15번째 비트 0 = 색 있음, R 아래) · VisCAM/SolidView(15번째 비트 1 = 색 있음, B 아래)
    var head = ''; for (i = 0; i < 80; i++) head += String.fromCharCode(dv.getUint8(i));
    var mat = /COLOR=/.test(head), pal = new Palette(), cols = new Uint16Array(n), valid = 0, seen = {};
    for (i = 0; i < n; i++) {
      var a = attr[i]; if (!a) continue;
      var ok = mat ? !(a & 0x8000) : !!(a & 0x8000); if (!ok) continue;
      var lo = a & 31, mid = (a >> 5) & 31, hi = (a >> 10) & 31, r = mat ? lo : hi, b = mat ? hi : lo;
      var hex = '#' + [r, mid, b].map(function (c) { var v = Math.round(c * 255 / 31).toString(16); return v.length < 2 ? '0' + v : v; }).join('').toUpperCase();
      cols[i] = pal.add(hex, hex); valid++; seen[hex] = 1;
    }
    // 색 정보가 반 넘게 있고 두 색 이상일 때만 (아무 값이나 들어 있는 파일이 많음)
    return valid >= n / 2 && Object.keys(seen).length > 1 && Object.keys(seen).length <= 64 ? attach(t, cols, pal) : t;
  }
  function parseObj(text) {
    var v = [], vc = [], out = [], fc = [];
    text.split(/\r?\n/).forEach(function (line) {
      var p = line.trim().split(/\s+/);
      if (p[0] === 'v') { v.push([+p[1], +p[2], +p[3]]); vc.push(p.length >= 7 ? [+p[4], +p[5], +p[6]] : null); }
      else if (p[0] === 'f') {
        var idx = p.slice(1).map(function (s) { var n = parseInt(s.split('/')[0], 10); return n < 0 ? v.length + n : n - 1; });
        for (var i = 1; i + 1 < idx.length; i++) {
          var tri = [idx[0], idx[i], idx[i + 1]], c = [0, 0, 0], has = 0;
          tri.forEach(function (j) { var q = v[j] || [0, 0, 0]; out.push(q[0], q[1], q[2]); if (vc[j]) { has++; c[0] += vc[j][0]; c[1] += vc[j][1]; c[2] += vc[j][2]; } });
          fc.push(has === 3 ? c.map(function (x) { return x / 3; }) : null);
        }
      }
    });
    var t = new Float32Array(out);
    // 0.2.0 꼭짓점 색 (0~1 또는 0~255) → 6단계로 묶고 많이 쓴 8색까지
    if (!fc.some(Boolean)) return t;
    var big = fc.some(function (c) { return c && (c[0] > 1 || c[1] > 1 || c[2] > 1); }), cnt = {}, keyOf = [];
    fc.forEach(function (c, i) {
      if (!c) return;
      var q = c.map(function (x) { var y = big ? x / 255 : x; return Math.max(0, Math.min(5, Math.round(y * 5))) * 51; });
      var k = '#' + q.map(function (x) { var s = x.toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
      keyOf[i] = k; cnt[k] = (cnt[k] || 0) + 1;
    });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 8);
    if (top.length < 2) return t;
    var pal = new Palette(), cols = new Uint16Array(fc.length);
    top.forEach(function (h) { pal.add(h, h); });
    keyOf.forEach(function (k, i) {
      if (!k) return;
      var best = top[0], bd = Infinity, rgb = hexRgb(k);
      top.forEach(function (h) { var q = hexRgb(h), d = (q[0] - rgb[0]) * (q[0] - rgb[0]) + (q[1] - rgb[1]) * (q[1] - rgb[1]) + (q[2] - rgb[2]) * (q[2] - rgb[2]); if (d < bd) { bd = d; best = h; } });
      cols[i] = pal.add(best, best);
    });
    return attach(t, cols, pal);
  }
  /** 3MF = zip. 압축 풀기는 브라우저 · node 의 DecompressionStream @return Promise<[{name, text}]> */
  function unzipEntry(buf, test) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('3MF(zip) 파일이 아니에요.'));
    var cd = dv.getUint32(eocd + 16, true), count = dv.getUint16(eocd + 10, true), found = [];
    // 0.3.15 ZIP64 — Fusion 360 · lib3mf · 일부 Bambu Studio 는 작은 파일도 ZIP64 로 묶음 (목록 자리 · 개수가 FFFF… 로 적히고 진짜 값은 따로)
    var u64 = function (o) { return dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; };
    if (eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
      var z = u64(eocd - 12);
      if (z + 56 <= buf.byteLength && dv.getUint32(z, true) === 0x06064b50) { count = u64(z + 32); cd = u64(z + 48); }
    }
    if (cd + 46 > buf.byteLength) return Promise.reject(new Error('3MF(zip) 목록을 읽지 못했어요. 파일이 덜 받아졌거나 깨졌을 수 있어요.'));
    var p = cd;
    for (var e = 0; e < count; e++) {
      if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      // ZIP64 덧붙임 칸(0x0001) — FFFFFFFF 로 적힌 것만 차례로 (원래 크기 · 압축 크기 · 자리)
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || off === 0xFFFFFFFF) {
        for (var x = p + 46 + nlen, xe = x + xlen; x + 4 <= xe; x += 4 + dv.getUint16(x + 2, true)) {
          if (dv.getUint16(x, true) !== 1) continue;
          var q = x + 4;
          if (usize === 0xFFFFFFFF) { usize = u64(q); q += 8; }
          if (csize === 0xFFFFFFFF) { csize = u64(q); q += 8; }
          if (off === 0xFFFFFFFF) { off = u64(q); }
          break;
        }
      }
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (test(name)) found.push({ name: name, method: method, csize: csize, off: off });
      p += 46 + nlen + xlen + clen;
    }
    return Promise.all(found.map(function (f) {
      var lh = f.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return { name: f.name, text: new TextDecoder().decode(data) };
      if (f.method !== 8 || typeof DecompressionStream === 'undefined') return Promise.reject(new Error('이 브라우저에서는 3MF 압축을 풀 수 없어요. STL 로 내보내 주세요.'));
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([data]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function (ab) { return { name: f.name, text: new TextDecoder().decode(ab) }; });
    }));
  }
  function mat(str) {
    var a = String(str || '').trim().split(/\s+/).map(Number);
    return a.length === 12 ? a : null;   // 3MF: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32
  }
  function apply(m, x, y, z) {
    return m ? [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]] : [x, y, z];
  }
  function attr(s, name) { var m = s.match(new RegExp('(?:^|\\s)' + name.replace(/[:.]/g, '\\$&') + '="([^"]*)"')); return m ? m[1] : null; }

  /**
   * 0.2.0 Bambu · Orca paint_color / PrusaSlicer mmu_segmentation — 삼각형을 나눠 칠한 정보(16진 비트열, 뒤에서부터 읽음)
   *  마디: 2비트 나눔(0 = 잎) · 잎이면 2비트 상태(3 이면 4비트 더해 +3) · 나눔이면 2비트 특별 변 + (나눔+1)개 자식
   *  @return 가장 넓게 칠한 상태 (0 = 안 칠함 → 물체 필라멘트, n = n번 필라멘트)
   */
  function paintState(s) {
    s = String(s || ''); if (!s) return 0;
    var i = s.length - 1, pos = 0, cur = 0, w = {}, guard = 0;
    function bit() { if (pos === 0) { cur = i >= 0 ? parseInt(s.charAt(i--), 16) || 0 : 0; } var b = (cur >> pos) & 1; pos = (pos + 1) & 3; return b; }
    function two() { var a = bit(); return a | (bit() << 1); }
    (function node(weight, depth) {
      if (++guard > 4096) return;
      var split = two();
      if (split === 0 || depth > 10) {
        var st = two(); if (st === 3) st = 3 + (bit() | (bit() << 1) | (bit() << 2) | (bit() << 3));
        w[st] = (w[st] || 0) + weight; return;
      }
      two();
      for (var c = 0; c <= split; c++) node(weight / (split + 1), depth + 1);
    })(1, 0);
    var best = 0, bw = -1;
    Object.keys(w).forEach(function (k) { if (w[k] > bw) { bw = w[k]; best = +k; } });
    return best;
  }

  function parse3mf(buf) {
    var want = function (n) { return /^3D\/.*\.model$/i.test(n) || /^Metadata\/(model_settings|project_settings|Slic3r_PE_model|Slic3r_PE)\.config$/i.test(n); };
    return unzipEntry(buf, want).then(function (files) {
      var models = files.filter(function (f) { return /\.model$/i.test(f.name); });
      if (!models.length) throw new Error('3MF 안에 모델이 없어요.');
      var cfg = {}; files.forEach(function (f) { var k = f.name.replace(/^Metadata\//i, '').toLowerCase(); if (k !== f.name.toLowerCase()) cfg[k] = f.text; });
      var pal = new Palette(), objects = {}, groups = {}, builds = [], main = '/3D/3dmodel.model';

      // 필라멘트 색 — Bambu · Orca project_settings.config(JSON) · PrusaSlicer Slic3r_PE.config(; extruder_colour = #..;#..)
      var fil = [];
      try { var js = JSON.parse(cfg['project_settings.config'] || 'null'); if (js && Array.isArray(js.filament_colour)) fil = js.filament_colour; } catch (e) {}
      if (!fil.length && cfg['slic3r_pe.config']) {
        var mm = cfg['slic3r_pe.config'].match(/^;\s*extruder_colour\s*=\s*(.*)$/m) || cfg['slic3r_pe.config'].match(/^;\s*filament_colour\s*=\s*(.*)$/m);
        if (mm) fil = mm[1].split(';').map(function (x) { return x.trim(); });
      }
      function extColor(e) { e = Math.max(1, e | 0); return pal.add(fil[e - 1] && /#?[0-9a-f]{6}/i.test(fil[e - 1]) ? fil[e - 1] : EXT_COLORS[(e - 1) % EXT_COLORS.length], e + '번 필라멘트'); }

      // 물체 · 부품마다 필라멘트 — Bambu/Orca model_settings.config, PrusaSlicer Slic3r_PE_model.config(볼륨 = 삼각형 범위)
      var objExt = {}, partExt = {}, volExt = {}, sliced = !!(cfg['model_settings.config'] || cfg['slic3r_pe_model.config']);
      var getExt = function (body) { var m = body.match(/<metadata[^>]*key="extruder"[^>]*value="(\d+)"/i); return m ? +m[1] : 0; };
      // 0.3.16 물체 · 부품 이름
      var objName = {}, partName = {};
      var unesc = function (s) { return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').slice(0, 60); };
      var getName = function (body) { var m = body.match(/<metadata[^>]*key="name"[^>]*value="([^"]*)"/i); return m ? unesc(m[1]) : ''; };
      String(cfg['model_settings.config'] || '').replace(/<object\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/object>/gi, function (_, id, body) {
        var parts = body.replace(/<part\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/part>/gi, function (__, pid, pb) { var e = getExt(pb); if (e) partExt[id + '/' + pid] = e; var nm = getName(pb); if (nm) partName[id + '/' + pid] = nm; return ''; });
        var e = getExt(parts); if (e) objExt[id] = e; var on = getName(parts); if (on) objName[id] = on; return '';
      });
      String(cfg['slic3r_pe_model.config'] || '').replace(/<object\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/object>/gi, function (_, id, body) {
        var vols = []; var rest = body.replace(/<volume\b[^>]*firstid="(\d+)"[^>]*lastid="(\d+)"[^>]*>([\s\S]*?)<\/volume>/gi, function (__, a, b, vb) { var e = getExt(vb); if (e) vols.push([+a, +b, e]); return ''; });
        var e = getExt(rest); if (e) objExt[id] = e; if (vols.length) volExt[id] = vols; return '';
      });

      models.forEach(function (f) {
        var xml = f.text, path = '/' + f.name.replace(/^\/+/, '');
        var unit = (xml.match(/<model[^>]*\bunit="(\w+)"/i) || [])[1] || 'millimeter';
        var scale = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }[unit] || 1;
        // 표준 재료 · 색 묶음
        xml.replace(/<(?:\w+:)?basematerials\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?basematerials>/gi, function (_, id, body) {
          var g = []; body.replace(/<(?:\w+:)?base\b([^>]*)\/?>/gi, function (__, at) { g.push(pal.add(attr(at, 'displaycolor') || '#9CA3AF', attr(at, 'name') || '')); return ''; }); groups[path + '#' + id] = g; return '';
        });
        xml.replace(/<(?:\w+:)?colorgroup\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?colorgroup>/gi, function (_, id, body) {
          var g = []; body.replace(/<(?:\w+:)?color\b([^>]*)\/?>/gi, function (__, at) { var c = attr(at, 'color'); g.push(pal.add(c, normHex(c))); return ''; }); groups[path + '#' + id] = g; return '';
        });
        var re = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi, m;
        while ((m = re.exec(xml))) {
          var id = attr(m[1], 'id'), body = m[2], v = [], tri = [], tc = [], comps = [];
          var rv = /<vertex\b([^>]*)\/?>/gi, q;
          while ((q = rv.exec(body))) v.push(+attr(q[1], 'x') * scale, +attr(q[1], 'y') * scale, +attr(q[1], 'z') * scale);
          var rt = /<triangle\b([^>]*)\/?>/gi;
          while ((q = rt.exec(body))) {
            var at = q[1];
            tri.push(+attr(at, 'v1'), +attr(at, 'v2'), +attr(at, 'v3'));
            var pc = attr(at, 'paint_color') || attr(at, 'slic3rpe:mmu_segmentation'), pid = attr(at, 'pid'), p1 = attr(at, 'p1');
            tc.push(pc ? { paint: paintState(pc) } : pid != null || p1 != null ? { pid: pid, p1: p1 } : null);
          }
          var rc = /<component\b([^>]*)\/?>/gi;
          while ((q = rc.exec(body))) {
            var cp = attr(q[1], 'p:path');
            comps.push({ key: (cp ? '/' + cp.replace(/^\/+/, '') : path) + '#' + attr(q[1], 'objectid'), oid: attr(q[1], 'objectid'), m: mat(attr(q[1], 'transform')) });
          }
          objects[path + '#' + id] = { id: id, path: path, v: v, t: tri, tc: tc, comps: comps, pid: attr(m[1], 'pid'), pindex: attr(m[1], 'pindex'), name: unesc(attr(m[1], 'name')) };
        }
        if (path.toLowerCase() === main.toLowerCase() || !builds.length) {
          var rb = /<item\b([^>]*)\/?>/gi;
          while ((m = rb.exec(xml))) { var bp = attr(m[1], 'p:path'); builds.push({ key: (bp ? '/' + bp.replace(/^\/+/, '') : path) + '#' + attr(m[1], 'objectid'), id: attr(m[1], 'objectid'), m: mat(attr(m[1], 'transform')) }); }
        }
      });
      var out = [], cols = [], parts = [], partNames = [];
      function matColor(o, pid, idx) {
        var g = groups[o.path + '#' + pid]; if (!g) return 0;
        var k = idx == null ? 0 : +idx; return g[k] || g[0] || 0;
      }
      function emit(key, ms, depth, ctx) {
        var o = objects[key]; if (!o || depth > 8) return;
        var baseExt = ctx.part || ctx.obj || objExt[o.id] || 0, vols = depth === 0 ? volExt[o.id] : null, part = 0;
        if (o.t.length) { partNames.push(ctx.name || o.name || ''); part = partNames.length; }   // 0.3.16 그물이 있는 물체 하나 = 물체 하나
        for (var i = 0; i < o.t.length; i++) {
          var j = o.t[i] * 3, p = [o.v[j], o.v[j + 1], o.v[j + 2]];
          for (var k = 0; k < ms.length; k++) p = apply(ms[k], p[0], p[1], p[2]);
          out.push(p[0], p[1], p[2]);
          if (i % 3 === 0) {
            var f = i / 3, c = o.tc[f], col = 0, ext = baseExt;
            if (vols) vols.forEach(function (r) { if (f >= r[0] && f <= r[1]) ext = r[2]; });
            if (c && c.paint) col = extColor(c.paint);
            else if (c && (c.pid != null || c.p1 != null)) col = matColor(o, c.pid != null ? c.pid : o.pid, c.p1 != null ? c.p1 : o.pindex);
            else if (o.pid != null && groups[o.path + '#' + o.pid]) col = matColor(o, o.pid, o.pindex);
            if (!col && (ext || sliced)) col = extColor(ext || 1);
            cols.push(col); parts.push(part);
          }
        }
        o.comps.forEach(function (c) { emit(c.key, [c.m].concat(ms), depth + 1, { obj: ctx.obj, part: partExt[ctx.id + '/' + c.oid] || ctx.part, id: ctx.id, name: partName[ctx.id + '/' + c.oid] || (objects[c.key] && objects[c.key].name) || ctx.name }); });
      }
      if (builds.length) builds.forEach(function (b) { emit(b.key, [b.m], 0, { obj: objExt[b.id] || 0, part: 0, id: b.id, name: (objects[b.key] && objects[b.key].t.length ? '' : objName[b.id]) || '' }); });
      else Object.keys(objects).forEach(function (k) { emit(k, [], 0, { obj: objExt[objects[k].id] || 0, part: 0, id: objects[k].id, name: '' }); });
      if (!out.length) throw new Error('3MF 안에 삼각형이 없어요.');
      var t = new Float32Array(out), used = {};
      cols.forEach(function (c) { if (c) used[c] = 1; });
      var res = Object.keys(used).length ? attach(t, Uint16Array.from(cols), pal) : t;
      if (partNames.length > 1) { res.parts = Uint16Array.from(parts); res.partList = partNames.map(function (nm, i) { return { name: nm || '물체 ' + (i + 1) }; }); }
      return res;
    });
  }
  /** 파일 → Promise<Float32Array> (다색이면 .colors · .palette) */
  function read(name, buf) {
    var e = String(name).split('.').pop().toLowerCase();
    try {
      if (e === 'stl') return Promise.resolve(parseStl(buf));
      if (e === 'obj') return Promise.resolve(parseObj(new TextDecoder().decode(buf)));
      if (e === '3mf') return parse3mf(buf);
    } catch (err) { return Promise.reject(err); }
    return Promise.reject(new Error('STL · OBJ · 3MF 만 검사할 수 있어요.'));
  }

  // ───────── 분석 ─────────
  var AXES = [['z', 1], ['z', -1], ['x', 1], ['x', -1], ['y', 1], ['y', -1]];
  var AXIS_NAME = { 'z1': '그대로', 'z-1': '뒤집어서', 'x1': '오른쪽 면이 위로', 'x-1': '왼쪽 면이 위로', 'y1': '뒷면이 위로', 'y-1': '앞면이 위로' };
  var IDX = { x: 0, y: 1, z: 2 };

  function analyze(t, opt) {
    opt = opt || {};
    var n = t.length / 9 | 0, cos = Math.cos((opt.overhangAngle || 45) * Math.PI / 180);
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], vol = 0, area = 0, degenerate = 0;
    var nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n), fa = new Float32Array(n);
    var fmin = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], fmax = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (var i = 0; i < n; i++) {
      var o = i * 9, ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      var px = uy * vz - uz * vy, py = uz * vx - ux * vz, pz = ux * vy - uy * vx, l = Math.sqrt(px * px + py * py + pz * pz);
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      if (l < 1e-12) { degenerate++; continue; }
      fa[i] = l / 2; area += l / 2; nx[i] = px / l; ny[i] = py / l; nz[i] = pz / l;
      var xs = [ax, bx, cx], ys = [ay, by, cy], zs = [az, bz, cz], all = [xs, ys, zs];
      for (var a = 0; a < 3; a++) {
        var lo = Math.min(all[a][0], all[a][1], all[a][2]), hi = Math.max(all[a][0], all[a][1], all[a][2]);
        fmin[a][i] = lo; fmax[a][i] = hi; if (lo < min[a]) min[a] = lo; if (hi > max[a]) max[a] = hi;
      }
    }
    if (!isFinite(min[0])) throw new Error('삼각형이 없어요.');
    var size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

    // 열린 모서리 · 부품 수 (0.001mm 로 꼭짓점 맞춤)
    var vid = new Map(), next = 0, ids = new Int32Array(n * 3);
    for (i = 0; i < n * 3; i++) {
      var key = Math.round(t[i * 3] * 1000) + ',' + Math.round(t[i * 3 + 1] * 1000) + ',' + Math.round(t[i * 3 + 2] * 1000);
      var id = vid.get(key); if (id === undefined) { id = next++; vid.set(key, id); }
      ids[i] = id;
    }
    var edges = new Map(), parent = new Int32Array(next);
    for (i = 0; i < next; i++) parent[i] = i;
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (i = 0; i < n; i++) {
      var a0 = ids[i * 3], a1 = ids[i * 3 + 1], a2 = ids[i * 3 + 2];
      [[a0, a1], [a1, a2], [a2, a0]].forEach(function (e) {
        var k = e[0] < e[1] ? e[0] * 4294967296 + e[1] : e[1] * 4294967296 + e[0];
        edges.set(k, (edges.get(k) || 0) + 1);
      });
      var r0 = find(a0), r1 = find(a1), r2 = find(a2); parent[r1] = r0; parent[find(r2)] = r0;
    }
    var open = 0, nonManifold = 0;
    edges.forEach(function (c) { if (c === 1) open++; else if (c > 2) nonManifold++; });
    var roots = new Set(); for (i = 0; i < n * 3; i++) roots.add(find(ids[i]));

    // 6방향
    var orients = AXES.map(function (ax) {
      var k = IDX[ax[0]], s = ax[1], bed = s > 0 ? min[k] : -max[k], over = 0, bedArea = 0, overZ = 0;
      for (var f = 0; f < n; f++) {
        if (!fa[f]) continue;
        var dn = (k === 0 ? nx[f] : k === 1 ? ny[f] : nz[f]) * s, fl = s > 0 ? fmin[k][f] : -fmax[k][f];
        var onBed = fl - bed < 0.2;
        if (dn < -0.985 && onBed) bedArea += fa[f];
        else if (dn < -cos && !onBed) { over += fa[f] * -dn; overZ += fa[f] * -dn * (fl - bed); }
      }
      var dims = k === 2 ? [size[0], size[1], size[2]] : k === 0 ? [size[1], size[2], size[0]] : [size[0], size[2], size[1]];
      return { key: ax[0] + s, name: AXIS_NAME[ax[0] + s], dims: dims, height: dims[2], overhang: over, overhangPct: area ? over / area * 100 : 0, supportVol: overZ, bedArea: bedArea };
    });

    // 0.2.0 색별 넓이 · 부피 (부품마다 다른 색이면 부피, 칠한 겉면이면 넓이가 맞음)
    var colors = [];
    if (t.colors && t.palette) {
      var ca = {}, cv = {};
      for (i = 0; i < n; i++) {
        var c = t.colors[i] || 0; o = i * 9;
        ca[c] = (ca[c] || 0) + fa[i];
        cv[c] = (cv[c] || 0) + (t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6])) / 6;
      }
      Object.keys(ca).forEach(function (k) {
        if (+k === 0 || !ca[k]) return;
        var pe = t.palette[+k - 1] || { hex: '#9CA3AF', name: '?' };
        colors.push({ id: +k, hex: pe.hex, name: pe.name, area: ca[k], areaPct: area ? ca[k] / area * 100 : 0, volume: Math.abs(cv[k] || 0) });
      });
      colors.sort(function (p, q) { return q.area - p.area; });
    }

    // 0.3.16 물체마다 — 삼각형 수 · 넓이 · 부피 · 가장 넓은 색
    var bodies = [];
    if (t.parts && t.partList) {
      var ba = {}, bv = {}, bn = {}, bc = {};
      for (i = 0; i < n; i++) {
        var b = t.parts[i] || 0; o = i * 9;
        ba[b] = (ba[b] || 0) + fa[i]; bn[b] = (bn[b] || 0) + 1;
        bv[b] = (bv[b] || 0) + (t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6])) / 6;
        if (t.colors && t.colors[i]) { var m = bc[b] || (bc[b] = {}); m[t.colors[i]] = (m[t.colors[i]] || 0) + fa[i]; }
      }
      t.partList.forEach(function (pl, ix) {
        var id = ix + 1; if (!bn[id]) return;
        var top = 0, ta = -1; Object.keys(bc[id] || {}).forEach(function (k) { if (bc[id][k] > ta) { ta = bc[id][k]; top = +k; } });
        bodies.push({ id: id, name: pl.name, triangles: bn[id], area: ba[id], volume: Math.abs(bv[id] || 0), hex: top && t.palette && t.palette[top - 1] ? t.palette[top - 1].hex : '' });
      });
    }

    return { bodies: bodies, triangles: n, degenerate: degenerate, size: size, min: min, max: max, volume: Math.abs(vol), area: area, open: open, nonManifold: nonManifold, parts: roots.size,
      watertight: open === 0 && nonManifold === 0, orients: orients, normals: { x: nx, y: ny, z: nz }, colors: colors, multi: colors.length > 1 };
  }

  /**
   * 0.2.0 다색 — 이 방향 · 층 높이로 놓았을 때 층마다 색이 몇 개인지
   *  바꿈 수 ≈ Σ(층의 색 − 1) + 앞 층과 겹치는 색이 없을 때 1 (AMS 는 앞 층 마지막 색으로 다음 층을 시작)
   *  한 층에 한 색뿐이면 높이별로 바꾸는 곳(pauses) — 한 색 프린터에서 「일시 정지 · 필라멘트 바꾸기」로 출력 가능
   * @return {swaps, maxPerLayer, multiLayers, layers, pauses: [{z, from, to}], used: [색 id]} | null
   */
  function colorPlan(t, key, layer) {
    if (!t || !t.colors || !t.palette) return null;
    var ax = { x: 0, y: 1, z: 2 }[String(key || 'z1').charAt(0)], sg = /-1$/.test(key) ? -1 : 1, n = t.length / 9 | 0, lo = Infinity, hi = -Infinity, i, k;
    layer = layer || 0.2;
    for (i = 0; i < n * 3; i++) { var z = t[i * 3 + ax] * sg; if (z < lo) lo = z; if (z > hi) hi = z; }
    var L = Math.max(1, Math.ceil((hi - lo) / layer) + 1), ids = [], diff = {};
    for (i = 0; i < n; i++) {
      var c = t.colors[i]; if (!c) continue;
      if (!diff[c]) { diff[c] = new Int32Array(L + 1); ids.push(c); }
      var o = i * 9, za = t[o + ax] * sg, zb = t[o + 3 + ax] * sg, zc = t[o + 6 + ax] * sg;
      var a0 = Math.floor((Math.min(za, zb, zc) - lo) / layer + 1e-6), a1 = Math.floor((Math.max(za, zb, zc) - lo) / layer - 1e-6);
      a0 = Math.max(0, Math.min(L - 1, a0)); a1 = Math.max(a0, Math.min(L - 1, a1));
      diff[c][a0]++; diff[c][a1 + 1]--;
    }
    if (ids.length < 2) return { swaps: 0, maxPerLayer: ids.length, multiLayers: 0, layers: L, pauses: [], used: ids };
    var run = {}, prev = null, swaps = 0, maxK = 0, multi = 0, pauses = [];
    ids.forEach(function (c) { run[c] = 0; });
    for (var l = 0; l < L; l++) {
      var here = [];
      for (k = 0; k < ids.length; k++) { run[ids[k]] += diff[ids[k]][l]; if (run[ids[k]] > 0) here.push(ids[k]); }
      if (!here.length) continue;
      if (here.length > maxK) maxK = here.length;
      if (here.length > 1) multi++;
      swaps += here.length - 1;
      if (prev && !here.some(function (x) { return prev.indexOf(x) >= 0; })) {
        swaps++;
        if (here.length === 1 && prev.length === 1) pauses.push({ z: Math.round(l * layer * 100) / 100, from: prev[0], to: here[0] });
      }
      prev = here;
    }
    return { swaps: swaps, maxPerLayer: maxK, multiLayers: multi, layers: L, pauses: maxK <= 1 ? pauses : [], used: ids };
  }

  /** 프린터에 들어가나 — 바닥에서 90° 돌려도 됨. scale = 들어가게 줄일 비율(1 이하) */
  function fit(dims, build) {
    if (!build || !build[0]) return null;
    var a = [dims[0], dims[1]], b = [build[0], build[1] || build[0]], h = build[2] || Infinity;
    var ok1 = a[0] <= b[0] && a[1] <= b[1], ok2 = a[1] <= b[0] && a[0] <= b[1];
    var r = function (x, y) { return y > 0 ? x / y : Infinity; };
    var sxy = Math.max(Math.min(r(b[0], a[0]), r(b[1], a[1])), Math.min(r(b[0], a[1]), r(b[1], a[0])));
    var s = Math.min(sxy, r(h, dims[2]), 1);
    return { fits: (ok1 || ok2) && dims[2] <= h, rotate: !ok1 && ok2, scale: s };
  }

  /** 가장 좋은 방향 — 들어가는 것 먼저, 오버행 적은 것, 바닥 면적 넓은 것, 낮은 것 */
  function best(orients, build) {
    // 0.3.16 바닥에 거의 안 닿는 방향(동전을 세운 것처럼)은 오버행이 적어도 추천하지 않음 — 닿는 넓이가 가장 넓은 방향의 20% 가 안 되면 뒤로
    var maxBed = Math.max.apply(null, orients.map(function (o) { return o.bedArea || 0; }));
    var shaky = function (o) { return maxBed > 1 && (o.bedArea || 0) < maxBed * 0.2 ? 1 : 0; };
    return orients.slice().sort(function (p, q) {
      var fp = build ? (fit(p.dims, build).fits ? 0 : 1) : 0, fq = build ? (fit(q.dims, build).fits ? 0 : 1) : 0;
      if (fp !== fq) return fp - fq;
      if (shaky(p) !== shaky(q)) return shaky(p) - shaky(q);
      if (Math.abs(p.overhang - q.overhang) > 1) return p.overhang - q.overhang;
      if (Math.abs(p.bedArea - q.bedArea) > 1) return q.bedArea - p.bedArea;
      return p.height - q.height;
    })[0];
  }

  var MATERIALS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, PA: 1.14, PC: 1.2, 'PLA-CF': 1.3, RESIN: 1.12,
    // 0.2.0 레진 종류
    'ABS-LIKE': 1.15, WASHABLE: 1.1, CLEAR: 1.13, TOUGH: 1.16, FLEX: 1.1,
    // 0.3.8 레진 더
    'HIGH-CLEAR': 1.12, '8K': 1.13, PLANT: 1.1, 'HIGH-TEMP': 1.2, CASTABLE: 1.1, 'NYLON-LIKE': 1.12,
    // 0.3.8 필라멘트 더
    'PLA+': 1.24, 'PLA-SILK': 1.24, 'PLA-MATTE': 1.3, 'PLA-WOOD': 1.15, 'PETG-CF': 1.25, 'PET-CF': 1.29, 'ABS-GF': 1.08, TPE: 1.2, 'PA-CF': 1.06, 'PC-ABS': 1.1, HIPS: 1.04, PVA: 1.23, PP: 0.9, PEEK: 1.3 };

  /**
   * 대략 추정 — FDM: 벽(겉넓이 × 벽 두께) + 채움(안쪽 × 채움%) + 서포트(오버행 아래 공간 × 15%)
   *              시간 = 쓰는 플라스틱 ÷ 초당 압출량 × 1.25 + 층 바꿈 2초
   *            레진: 무게 = 부피 × 밀도, 시간 = 층 수 × (노출 + 올림) 초
   */
  function estimate(a, o, p) {
    p = p || {};
    var resin = !!p.resin, dens = MATERIALS[p.material] || (resin ? 1.12 : 1.24), layer = p.layer || (resin ? 0.05 : 0.2);
    if (resin) {
      // 0.2.0 속 비우기(hollow) — 벽 두께만큼만 채움 (빼낼 구멍은 슬라이서에서)
      var solid = p.hollow ? Math.min(a.volume, a.area * (p.hollowWall || 2)) : a.volume;
      var gR = solid / 1000 * dens * 1.08;   // 서포트 · 버림 8%
      var layers = Math.ceil(o.height / layer);
      return { grams: gR, cost: gR / 1000 * (p.pricePerKg || 0), seconds: layers * ((p.exposure || 2.5) + (p.lift || 5)), layers: layers, ml: gR / dens, model: gR, purge: 0, swaps: 0 };
    }
    var shell = Math.min(a.volume, a.area * (p.wall || 0.84)), infill = Math.max(0, a.volume - shell) * ((p.infill == null ? 15 : p.infill) / 100);
    var support = p.supports === false ? 0 : o.supportVol * 0.15, plastic = shell + infill + support;
    var g = plastic / 1000 * dens, lyr = Math.ceil(o.height / layer);
    // 0.2.0 다색 — 바꿀 때마다 버리는 양(퍼지 · 프라임 타워) · 바꾸는 시간
    var sw = Math.max(0, p.swaps || 0), purge = sw * (p.purgeGrams == null ? 0.5 : p.purgeGrams);
    return { grams: g + purge, cost: (g + purge) / 1000 * (p.pricePerKg || 0), seconds: plastic / (p.flow || 8) * 1.25 + lyr * 2 + sw * (p.swapSeconds == null ? 50 : p.swapSeconds),
      layers: lyr, support: support / 1000 * dens, model: g, purge: purge, swaps: sw };
  }

  /** 방향 — 앱 미리 보기와 같은 돌림 (z1 = 그대로) */
  var ROT = {
    'z1': function (x, y, z) { return [x, y, z]; }, 'z-1': function (x, y, z) { return [x, -y, -z]; },
    'x1': function (x, y, z) { return [y, z, x]; }, 'x-1': function (x, y, z) { return [y, -z, -x]; },
    'y1': function (x, y, z) { return [x, -z, y]; }, 'y-1': function (x, y, z) { return [x, z, -y]; }
  };
  /** 방향대로 돌리고 판 가운데 · 바닥(z=0)에 놓은 삼각형 */
  function placed(t, key) {
    var rot = ROT[key] || ROT.z1, n = t.length / 3, out = new Float32Array(t.length), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], i, k;
    for (i = 0; i < n; i++) { var p = rot(t[i * 3], t[i * 3 + 1], t[i * 3 + 2]); for (k = 0; k < 3; k++) { out[i * 3 + k] = p[k]; if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }
    var cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
    for (i = 0; i < n; i++) { out[i * 3] -= cx; out[i * 3 + 1] -= cy; out[i * 3 + 2] -= mn[2]; }
    return out;
  }

  /**
   * 0.2.0 서포트 미리 보기 (대략) — 오버행 면 아래로 기둥을 세움
   *  p = 이미 놓인 삼각형(placed), 오버행 면 위에 격자(spacing mm) 점 → 아래로 내려가 처음 만나는 면(모델) 또는 판(z=0)
   *  @return {cols: Float32Array [x, y, 위 z, 아래 z, 모델에 닿음(1)/판(0)] …, count, onModel, length(합 mm), spacing}
   */
  function supports(p, opt) {
    opt = opt || {};
    var n = p.length / 9 | 0, cos = Math.cos((opt.overhangAngle || 45) * Math.PI / 180), sp = opt.spacing || 3, maxCols = opt.max || 6000, minLen = 0.6, i;
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (i = 0; i < n * 3; i++) { var x = p[i * 3], y = p[i * 3 + 1]; if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; }
    if (!isFinite(mn[0])) return { cols: new Float32Array(0), count: 0, onModel: 0, length: 0, spacing: sp };
    // 위를 보는 면 (오버행 바로 밑에 닿아 있는 면 — 그 사이엔 기둥이 필요 없음)
    var up = new Uint8Array(n);
    for (i = 0; i < n; i++) { var q0 = i * 9; up[i] = ((p[q0 + 3] - p[q0]) * (p[q0 + 7] - p[q0 + 1]) - (p[q0 + 4] - p[q0 + 1]) * (p[q0 + 6] - p[q0])) > 0 ? 1 : 0; }
    // 삼각형을 XY 칸에 넣어 아래쪽 찾기를 빠르게
    var cell = Math.max(2, Math.min(20, Math.sqrt((mx[0] - mn[0]) * (mx[1] - mn[1]) / Math.max(1, n)) * 4)), gw = Math.ceil((mx[0] - mn[0]) / cell) + 1, gh = Math.ceil((mx[1] - mn[1]) / cell) + 1, grid = new Array(gw * gh);
    for (i = 0; i < n; i++) {
      var o = i * 9, x0 = Math.min(p[o], p[o + 3], p[o + 6]), x1 = Math.max(p[o], p[o + 3], p[o + 6]), y0 = Math.min(p[o + 1], p[o + 4], p[o + 7]), y1 = Math.max(p[o + 1], p[o + 4], p[o + 7]);
      for (var gx = Math.floor((x0 - mn[0]) / cell); gx <= Math.floor((x1 - mn[0]) / cell); gx++) for (var gy = Math.floor((y0 - mn[1]) / cell); gy <= Math.floor((y1 - mn[1]) / cell); gy++) { var gi = gy * gw + gx; (grid[gi] || (grid[gi] = [])).push(i); }
    }
    /** (x, y) 에서 삼각형 f 의 높이 (밖이면 NaN) */
    function zAt(f, x, y) {
      var o = f * 9, ax = p[o], ay = p[o + 1], bx = p[o + 3], by = p[o + 4], cx = p[o + 6], cy = p[o + 7];
      var d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-12) return NaN;
      var l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return NaN;
      return l1 * p[o + 2] + l2 * p[o + 5] + l3 * p[o + 8];
    }
    var tops = [], seen = {};
    for (i = 0; i < n; i++) {
      o = i * 9;
      var ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
      var nz = ux * vy - uy * vx, l = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz) || 1;
      if (nz / l >= -cos || Math.min(p[o + 2], p[o + 5], p[o + 8]) <= 0.2) continue;
      x0 = Math.min(p[o], p[o + 3], p[o + 6]); x1 = Math.max(p[o], p[o + 3], p[o + 6]); y0 = Math.min(p[o + 1], p[o + 4], p[o + 7]); y1 = Math.max(p[o + 1], p[o + 4], p[o + 7]);
      var any = false;
      for (var X = Math.ceil(x0 / sp) * sp; X <= x1; X += sp) for (var Y = Math.ceil(y0 / sp) * sp; Y <= y1; Y += sp) {
        var z = zAt(i, X, Y); if (z !== z) continue;
        any = true; var key = Math.round(X / sp) + ',' + Math.round(Y / sp) + ',' + Math.round(z);
        if (!seen[key]) { seen[key] = 1; tops.push(X, Y, z); }
      }
      // 격자보다 작은 오버행 면은 가운데 한 점
      if (!any) { var mxp = (p[o] + p[o + 3] + p[o + 6]) / 3, myp = (p[o + 1] + p[o + 4] + p[o + 7]) / 3, mzp = (p[o + 2] + p[o + 5] + p[o + 8]) / 3, k2 = 'c' + Math.round(mxp / sp) + ',' + Math.round(myp / sp) + ',' + Math.round(mzp); if (!seen[k2]) { seen[k2] = 1; tops.push(mxp, myp, mzp); } }
    }
    var count = tops.length / 3, step = count > maxCols ? Math.ceil(count / maxCols) : 1, cols = [], onModel = 0, total = 0;
    for (var c = 0; c < count; c += step) {
      var tx = tops[c * 3], ty = tops[c * 3 + 1], tz = tops[c * 3 + 2], best = 0, hit = 0;
      var cand = grid[Math.floor((ty - mn[1]) / cell) * gw + Math.floor((tx - mn[0]) / cell)] || [];
      for (var j = 0; j < cand.length; j++) { var zz = zAt(cand[j], tx, ty); if (zz === zz && zz > best && (zz < tz - 0.3 || (up[cand[j]] && zz <= tz + 0.05))) { best = zz; hit = 1; } }
      if (tz - best < minLen) continue;
      cols.push(tx, ty, tz, best, hit); onModel += hit; total += tz - best;
    }
    return { cols: new Float32Array(cols), count: cols.length / 5, onModel: onModel, length: total, spacing: sp * step };
  }

  /** 0.2.0 층 단면 — z 높이에서 자른 선분 [x1,y1,x2,y2, …] (placed 삼각형) */
  function slice(p, z) {
    var n = p.length / 9 | 0, out = [];
    for (var i = 0; i < n; i++) {
      var o = i * 9, pts = [];
      for (var e = 0; e < 3; e++) {
        var a = o + e * 3, b = o + ((e + 1) % 3) * 3, za = p[a + 2] - z, zb = p[b + 2] - z;
        if ((za < 0) !== (zb < 0)) { var k = za / (za - zb); pts.push(p[a] + (p[b] - p[a]) * k, p[a + 1] + (p[b + 1] - p[a + 1]) * k); }
      }
      if (pts.length === 4) out.push(pts[0], pts[1], pts[2], pts[3]);
    }
    return new Float32Array(out);
  }

  function duration(s) { s = Math.round(s / 60); var h = Math.floor(s / 60), m = s % 60; return h ? h + '시간' + (m ? ' ' + m + '분' : '') : Math.max(1, m) + '분'; }

  return { read: read, parseStl: parseStl, parseObj: parseObj, parse3mf: parse3mf, analyze: analyze, fit: fit, best: best, estimate: estimate, duration: duration, MATERIALS: MATERIALS,
    colorPlan: colorPlan, paintState: paintState, EXT_COLORS: EXT_COLORS, ROT: ROT, placed: placed, supports: supports, slice: slice, unzip: unzipEntry };   // unzip: 0.9.0 G-code 보기가 .gcode.3mf 를 풀 때 씀
});
