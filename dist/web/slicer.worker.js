import{b as Ir,c as Lr}from"./c-A6JG6KAZ.js";import"./c-JPQCGHAY.js";function St(r){let e=[];return r?.over_bed_model&&e.push("over_bed_model"),e}function Or(r){return r&&!r.error&&(r.warnings=St(r.stats)),r}var kt=["t_pass1_ms","t_surface_ms","t_support_ms","t_emit_ms"],At=["t_contours_ms","t_sample_ms","t_tree_ms","t_raster_ms","t_emit_ms"];function Et(r,e){let o=Math.max(0,Number(e)||0),t=Number(r?.layers)||0,d=Number(r?.path_segments)||0,a=(r?.sla?At:kt).map(x=>Number(r?.[x])).filter(Number.isFinite);return{ms:o,kernelMs:a.length?a.reduce((x,n)=>x+n,0):null,layersPerSecond:o>0?t*1e3/o:0,msPerMsegment:d>0?o/(d/1e6):null}}function Me(r,e){return r&&!r.error&&(r.throughput=Et(r.stats,e)),r}var re="fn tid(g: vec3<u32>) -> u32 { return g.x + g.y * 16776960u; }",Pt=`
fn opaque(a: f32) -> f32 { return bitcast<f32>(bitcast<u32>(a) ^ dfZero); }
fn two_sum(a: f32, b: f32) -> vec2<f32> { let s = opaque(a + b); let bb = opaque(s - a); return vec2<f32>(s, opaque(a - opaque(s - bb)) + opaque(b - bb)); }
fn quick_two_sum(a: f32, b: f32) -> vec2<f32> { let s = opaque(a + b); return vec2<f32>(s, b - opaque(s - a)); }
fn df_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  var s = two_sum(a.x, b.x); let t = two_sum(a.y, b.y);
  s.y = s.y + t.x; s = quick_two_sum(s.x, s.y); s.y = s.y + t.y; return quick_two_sum(s.x, s.y); }
fn df_neg(a: vec2<f32>) -> vec2<f32> { return vec2<f32>(-a.x, -a.y); }
fn df_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> { return df_add(a, df_neg(b)); }
fn two_prod(a: f32, b: f32) -> vec2<f32> { let p = opaque(a * b); return vec2<f32>(p, fma(a, b, -p)); }
fn df_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> { var p = two_prod(a.x, b.x); p.y = p.y + (a.x * b.y + a.y * b.x); return quick_two_sum(p.x, p.y); }
fn df_div(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let q1 = opaque(a.x / b.x); var r = df_sub(a, df_mul(b, vec2<f32>(q1, 0.0)));
  let q2 = opaque(r.x / b.x); r = df_sub(r, df_mul(b, vec2<f32>(q2, 0.0)));
  let q3 = opaque(r.x / b.x); return df_add(quick_two_sum(q1, q2), vec2<f32>(q3, 0.0)); }
// nearest integer of a df value below 2^31 in magnitude, ties away from zero (llround)
fn df_round_i32(a: vec2<f32>) -> i32 {
  let hiInt = round(a.x);
  let rest = two_sum(opaque(a.x - hiInt), a.y);
  let r = rest.x + rest.y;
  var fl = floor(r); let fr = opaque(r - fl);
  if (fr > 0.5 || (fr == 0.5 && r > 0.0)) { fl = fl + 1.0; }
  return i32(hiInt) + i32(fl);
}`,We=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;                  // triangles, layers, emit
@group(0) @binding(1) var<storage, read> tris: array<f32>;
@group(0) @binding(2) var<storage, read> zs: array<vec2<f32>>;     // each layer's z as hi + lo
@group(0) @binding(3) var<storage, read_write> counts: array<u32>; // count mode: per triangle; emit mode: its first segment
@group(0) @binding(4) var<storage, read_write> segPoints: array<vec4<i32>>;   // x0 y0 x1 y1 (1e-6 mm)
@group(0) @binding(5) var<storage, read_write> segKeys: array<vec4<i32>>;     // the chain keys of both ends (1e-3 mm)
@group(0) @binding(6) var<storage, read_write> segLayer: array<u32>;
@group(0) @binding(7) var<uniform> dfZero: u32;
${Pt}
${re}
fn vBelow(v: f32, L: u32) -> bool { let z = zs[L]; return v < z.x || (v == z.x && z.y > 0.0); }   // v < z exactly
fn zBelow(L: u32, v: f32) -> bool { let z = zs[L]; return z.x < v || (z.x == v && z.y < 0.0); }   // z < v exactly
fn vtx(t: u32, k: u32) -> vec3<f32> { let b = t * 9u + k * 3u; return vec3<f32>(tris[b], tris[b + 1u], tris[b + 2u]); }
fn df(v: f32) -> vec2<f32> { return vec2<f32>(v, 0.0); }
fn dfSign(a: vec2<f32>) -> f32 { if (a.x != 0.0) { return a.x; } return a.y; }
struct Cut { ok: bool, x0: vec2<f32>, y0: vec2<f32>, x1: vec2<f32>, y1: vec2<f32> }
fn cut(t: u32, L: u32) -> Cut {
  var r: Cut; r.ok = false;
  var cx: array<vec2<f32>, 2>; var cy: array<vec2<f32>, 2>; var n = 0u;
  let z = zs[L];
  for (var e = 0u; e < 3u; e = e + 1u) {
    let s = vtx(t, e); let en = vtx(t, (e + 1u) % 3u);
    let crosses = (vBelow(s.z, L) && !vBelow(en.z, L)) || (vBelow(en.z, L) && !vBelow(s.z, L));
    if (crosses) {
      if (n < 2u) {
        let f = df_div(df_sub(z, df(s.z)), df_sub(df(en.z), df(s.z)));
        cx[n] = df_add(df(s.x), df_mul(f, df_sub(df(en.x), df(s.x))));
        cy[n] = df_add(df(s.y), df_mul(f, df_sub(df(en.y), df(s.y))));
      }
      n = n + 1u;
    }
  }
  if (n != 2u) { return r; }
  let a = vtx(t, 0u); let b = vtx(t, 1u); let c = vtx(t, 2u);
  let e1x = df_sub(df(b.x), df(a.x)); let e1y = df_sub(df(b.y), df(a.y)); let e1z = df_sub(df(b.z), df(a.z));
  let e2x = df_sub(df(c.x), df(a.x)); let e2y = df_sub(df(c.y), df(a.y)); let e2z = df_sub(df(c.z), df(a.z));
  let nx = df_sub(df_mul(e1y, e2z), df_mul(e1z, e2y));
  let ny = df_sub(df_mul(e1z, e2x), df_mul(e1x, e2z));
  let dx = df_sub(cx[1], cx[0]); let dy = df_sub(cy[1], cy[0]);
  let along = df_sub(df_mul(dy, nx), df_mul(dx, ny));
  r.ok = true;
  if (dfSign(along) < 0.0) { r.x0 = cx[1]; r.y0 = cy[1]; r.x1 = cx[0]; r.y1 = cy[0]; }
  else { r.x0 = cx[0]; r.y0 = cy[0]; r.x1 = cx[1]; r.y1 = cy[1]; }
  return r;
}
fn firstLayer(zmin: f32) -> u32 {   // lower_bound: the first layer whose z is not below zmin
  var lo = 0u; var hi = P.y;
  while (lo < hi) { let mid = (lo + hi) / 2u; if (zBelow(mid, zmin)) { lo = mid + 1u; } else { hi = mid; } }
  return lo;
}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = tid(g); if (t >= P.x) { return; }
  let a = vtx(t, 0u); let b = vtx(t, 1u); let c = vtx(t, 2u);
  let zmin = min(a.z, min(b.z, c.z)); let zmax = max(a.z, max(b.z, c.z));
  var L = firstLayer(zmin); var k = 0u;
  var out = 0u; if (P.z == 1u) { out = counts[t]; }
  loop {
    if (L >= P.y || !zBelow(L, zmax)) { break; }
    let r = cut(t, L);
    if (r.ok) {
      if (P.z == 1u) {
        let s = out + k;
        let m = df(1000000.0); let q = df(1000.0);
        segPoints[s] = vec4<i32>(df_round_i32(df_mul(r.x0, m)), df_round_i32(df_mul(r.y0, m)), df_round_i32(df_mul(r.x1, m)), df_round_i32(df_mul(r.y1, m)));
        segKeys[s] = vec4<i32>(df_round_i32(df_mul(r.x0, q)), df_round_i32(df_mul(r.y0, q)), df_round_i32(df_mul(r.x1, q)), df_round_i32(df_mul(r.y1, q)));
        segLayer[s] = L;
      }
      k = k + 1u;
    }
    L = L + 1u;
  }
  if (P.z == 0u) { counts[t] = k; }
}`,Cr=`
fn mix(h0: u32, v: u32) -> u32 { var h = h0 ^ (v * 0x9E3779B1u); h = (h ^ (h >> 16u)) * 0x85EBCA6Bu; h = (h ^ (h >> 13u)) * 0xC2B2AE35u; return h ^ (h >> 16u); }`,Ue=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments, table mask
@group(0) @binding(1) var<storage, read> segPoints: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read> segLayer: array<u32>;
@group(0) @binding(3) var<storage, read_write> owner: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> headForward: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> headBackward: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> next: array<u32>;
@group(0) @binding(7) var<storage, read_write> dead: array<u32>;
${Cr}
${re}
fn startIsLow(p: vec4<i32>) -> bool { return p.x < p.z || (p.x == p.z && p.y < p.w); }
fn place(s: u32) -> vec4<i32> { let p = segPoints[s]; if (startIsLow(p)) { return p; } return vec4<i32>(p.z, p.w, p.x, p.y); }
fn samePlace(a: u32, b: u32) -> bool { return segLayer[a] == segLayer[b] && all(place(a) == place(b)); }
fn zeroLength(s: u32) -> bool { let p = segPoints[s]; return p.x == p.z && p.y == p.w; }
@compute @workgroup_size(256) fn insert(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x || zeroLength(s)) { return; }
  let pl = place(s);
  var slot = mix(mix(mix(mix(mix(0u, segLayer[s]), bitcast<u32>(pl.x)), bitcast<u32>(pl.y)), bitcast<u32>(pl.z)), bitcast<u32>(pl.w)) & P.y;
  loop {
    let o = atomicLoad(&owner[slot]);
    if (o == 0u) { let r = atomicCompareExchangeWeak(&owner[slot], 0u, s + 1u); if (r.exchanged) { break; } continue; }
    if (samePlace(o - 1u, s)) { break; }
    slot = (slot + 1u) & P.y;
  }
  if (startIsLow(segPoints[s])) { next[s] = atomicExchange(&headForward[slot], s + 1u); }
  else { next[s] = atomicExchange(&headBackward[slot], s + 1u); }
}
// the first min(forward, backward) of each direction by segment order die (exact duplicates: which ones is immaterial)
fn sortedList(head: u32, out: ptr<function, array<u32, 16>>) -> u32 {
  var n = 0u; var cur = head;
  while (cur != 0u && n < 16u) { (*out)[n] = cur - 1u; n = n + 1u; cur = next[cur - 1u]; }
  for (var i = 1u; i < n; i = i + 1u) { let v = (*out)[i]; var j = i; while (j > 0u && (*out)[j - 1u] > v) { (*out)[j] = (*out)[j - 1u]; j = j - 1u; } (*out)[j] = v; }
  return n;
}
@compute @workgroup_size(256) fn pair(@builtin(global_invocation_id) g: vec3<u32>) {
  let slot = tid(g); if (slot > P.y) { return; }
  if (atomicLoad(&owner[slot]) == 0u) { return; }
  var f: array<u32, 16>; var b: array<u32, 16>;
  let nf = sortedList(atomicLoad(&headForward[slot]), &f); let nb = sortedList(atomicLoad(&headBackward[slot]), &b);
  let pairs = min(nf, nb);
  for (var k = 0u; k < pairs; k = k + 1u) { dead[f[k]] = 1u; dead[b[k]] = 1u; }
}`,Ne=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments, table mask
@group(0) @binding(1) var<storage, read> segKeys: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read> segLayer: array<u32>;
@group(0) @binding(3) var<storage, read> dead: array<u32>;
@group(0) @binding(4) var<storage, read_write> owner: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> startHead: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> endHead: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> startNext: array<u32>;
@group(0) @binding(8) var<storage, read_write> endNext: array<u32>;
@group(0) @binding(9) var<storage, read_write> successor: array<u32>;   // also [P.x]: matcher overflow count, [P.x+1]: open ends
${Cr}
${re}
fn slotOf(L: u32, x: i32, y: i32) -> u32 { return mix(mix(mix(0u, L), bitcast<u32>(x)), bitcast<u32>(y)) & P.y; }
@compute @workgroup_size(256) fn insertStarts(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  successor[s] = ${4294967295}u;
  if (dead[s] != 0u) { return; }
  let k = segKeys[s]; let L = segLayer[s];
  var slot = slotOf(L, k.x, k.y);
  loop {
    let o = atomicLoad(&owner[slot]);
    if (o == 0u) { let r = atomicCompareExchangeWeak(&owner[slot], 0u, s + 1u); if (r.exchanged) { break; } continue; }
    let other = o - 1u; let ok = segKeys[other];
    if (segLayer[other] == L && ok.x == k.x && ok.y == k.y) { break; }
    slot = (slot + 1u) & P.y;
  }
  startNext[s] = atomicExchange(&startHead[slot], s + 1u);
}
@compute @workgroup_size(256) fn insertEnds(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x || dead[s] != 0u) { return; }
  let k = segKeys[s]; let L = segLayer[s];
  var slot = slotOf(L, k.z, k.w);
  loop {
    let o = atomicLoad(&owner[slot]);
    if (o == 0u) { return; }   // no segment starts here: an open end (counted by the matcher's absence)
    let other = o - 1u; let ok = segKeys[other];
    if (segLayer[other] == L && ok.x == k.z && ok.y == k.w) { break; }
    slot = (slot + 1u) & P.y;
  }
  endNext[s] = atomicExchange(&endHead[slot], s + 1u);
}
fn sortedStarts(head: u32, out: ptr<function, array<u32, 16>>) -> u32 {
  var n = 0u; var cur = head;
  while (cur != 0u && n < 16u) { (*out)[n] = cur - 1u; n = n + 1u; cur = startNext[cur - 1u]; }
  if (cur != 0u) { return 17u; }
  for (var i = 1u; i < n; i = i + 1u) { let v = (*out)[i]; var j = i; while (j > 0u && (*out)[j - 1u] > v) { (*out)[j] = (*out)[j - 1u]; j = j - 1u; } (*out)[j] = v; }
  return n;
}
fn sortedEnds(head: u32, out: ptr<function, array<u32, 16>>) -> u32 {
  var n = 0u; var cur = head;
  while (cur != 0u && n < 16u) { (*out)[n] = cur - 1u; n = n + 1u; cur = endNext[cur - 1u]; }
  if (cur != 0u) { return 17u; }
  for (var i = 1u; i < n; i = i + 1u) { let v = (*out)[i]; var j = i; while (j > 0u && (*out)[j - 1u] > v) { (*out)[j] = (*out)[j - 1u]; j = j - 1u; } (*out)[j] = v; }
  return n;
}
// chain_polys' greedy walk at one key: an arriving end takes the smallest unused segment starting there. A segment whose
//  two ends share the key (a sub-micron sliver) is taken only when it comes first, and then its own end takes the next
//  start; one left over closes on itself (a 1-segment loop, which chain_polys drops). Arriving ends are served in
//  segment order — the kernel's order whenever one end arrives at a key, which is the manifold case.
@compute @workgroup_size(256) fn pairEnds(@builtin(global_invocation_id) g: vec3<u32>) {
  let slot = tid(g); if (slot > P.y) { return; }
  if (atomicLoad(&owner[slot]) == 0u) { return; }
  var st: array<u32, 16>; var en: array<u32, 16>;
  let ns = sortedStarts(atomicLoad(&startHead[slot]), &st); let ne = sortedEnds(atomicLoad(&endHead[slot]), &en);
  if (ns > 16u || ne > 16u) { successor[P.x] = 1u; return; }
  var used = 0u; var selfKey = 0u;   // bit masks over st
  for (var i = 0u; i < ns; i = i + 1u) { for (var j = 0u; j < ne; j = j + 1u) { if (en[j] == st[i]) { selfKey = selfKey | (1u << i); } } }
  for (var j = 0u; j < ne; j = j + 1u) {
    var arriving = en[j]; var isSelf = false;
    for (var i = 0u; i < ns; i = i + 1u) { if (st[i] == arriving) { isSelf = true; } }
    if (isSelf) { continue; }
    loop {
      var pick = 16u;
      for (var i = 0u; i < ns; i = i + 1u) { if ((used & (1u << i)) == 0u) { pick = i; break; } }
      if (pick == 16u) { break; }
      used = used | (1u << pick); successor[arriving] = st[pick];
      if ((selfKey & (1u << pick)) == 0u) { break; }
      arriving = st[pick];
    }
  }
  for (var i = 0u; i < ns; i = i + 1u) { if ((selfKey & (1u << i)) != 0u && (used & (1u << i)) == 0u) { successor[st[i]] = st[i]; } }
}`,ur=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments, mode (0 init labels, 1 label round, 2 init ranks, 3 rank round)
@group(0) @binding(1) var<storage, read> successor: array<u32>;
@group(0) @binding(2) var<storage, read> dead: array<u32>;
@group(0) @binding(3) var<storage, read_write> valueIn: array<u32>;
@group(0) @binding(4) var<storage, read_write> nextIn: array<u32>;
@group(0) @binding(5) var<storage, read_write> valueOut: array<u32>;
@group(0) @binding(6) var<storage, read_write> nextOut: array<u32>;
@group(0) @binding(7) var<storage, read> label: array<u32>;
@group(0) @binding(8) var<storage, read> reach: array<u32>;   // NONE: not on a cycle
${re}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  if (P.y == 0u) { if (dead[s] != 0u) { valueOut[s] = ${4294967295}u; nextOut[s] = ${4294967295}u; return; } valueOut[s] = s; nextOut[s] = successor[s]; return; }
  if (P.y == 2u) {
    let nx = successor[s];
    if (dead[s] != 0u || nx == ${4294967295}u || reach[s] == ${4294967295}u) { valueOut[s] = 0u; nextOut[s] = ${4294967295}u; return; }
    if (nx == label[s]) { valueOut[s] = 0u; nextOut[s] = s; return; }   // the last segment before the head
    valueOut[s] = 1u; nextOut[s] = nx; return;
  }
  let nx = nextIn[s];
  if (nx == ${4294967295}u) { valueOut[s] = valueIn[s]; nextOut[s] = nx; return; }
  if (P.y == 1u) { valueOut[s] = min(valueIn[s], valueIn[nx]); }
  else { if (nx == s) { valueOut[s] = valueIn[s]; } else { valueOut[s] = valueIn[s] + valueIn[nx]; } }
  nextOut[s] = nextIn[nx];
}`,Ye=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments, mode (0 mark, 1 flag)
@group(0) @binding(1) var<storage, read_write> reach: array<u32>;   // in: succ^(2^R), out: 0 on a cycle, NONE otherwise
@group(0) @binding(2) var<storage, read_write> hit: array<u32>;
${re}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  if (P.y == 0u) { let r = reach[s]; if (r != ${4294967295}u) { hit[r] = 1u; } return; }
  reach[s] = select(${4294967295}u, 0u, hit[s] == 1u); }`,ye=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments, heads (padded), layers, stage parameter
@group(0) @binding(1) var<storage, read> successor: array<u32>;
@group(0) @binding(2) var<storage, read> label: array<u32>;
@group(0) @binding(3) var<storage, read> rank: array<u32>;          // distance to the loop's last segment
@group(0) @binding(4) var<storage, read> segLayer: array<u32>;
@group(0) @binding(5) var<storage, read_write> headFlag: array<u32>; // flag, then (after the scan) the head's index
@group(0) @binding(6) var<storage, read_write> heads: array<vec2<u32>>; // (layer, head) sorted
@group(0) @binding(7) var<storage, read_write> polyOf: array<u32>;   // head segment -> sorted polygon index
@group(0) @binding(8) var<storage, read_write> loopStart: array<u32>;// per sorted polygon: its length, then (scan) its first slot
@group(0) @binding(9) var<storage, read_write> order: array<u32>;    // slot -> segment
@group(0) @binding(10) var<storage, read> reach: array<u32>;
${re}
fn closed(s: u32) -> bool { return successor[s] != ${4294967295}u && reach[s] != ${4294967295}u; }
fn isHead(s: u32) -> bool { return closed(s) && label[s] == s; }
@compute @workgroup_size(256) fn flagHeads(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; } headFlag[s] = select(0u, 1u, isHead(s)); }
@compute @workgroup_size(256) fn gatherHeads(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  if (isHead(s)) { heads[headFlag[s]] = vec2<u32>(segLayer[s], s); } }
@compute @workgroup_size(256) fn padHeads(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = tid(g) + P.w; if (i >= P.y) { return; } heads[i] = vec2<u32>(${4294967295}u, ${4294967295}u); }
fn less(a: vec2<u32>, b: vec2<u32>) -> bool { return a.x < b.x || (a.x == b.x && a.y < b.y); }
@compute @workgroup_size(256) fn bitonic(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = tid(g); if (i >= P.y) { return; }
  let j = P.z; let k = P.w; let partner = i ^ j;
  if (partner <= i) { return; }
  let a = heads[i]; let b = heads[partner];
  let ascending = (i & k) == 0u;
  if (less(b, a) == ascending) { heads[i] = b; heads[partner] = a; }
}
@compute @workgroup_size(256) fn lengths(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = tid(g); if (p >= P.w) { return; }
  let h = heads[p].y; polyOf[h] = p; loopStart[p] = rank[h] + 2u; }   // the kernel's n + 1 points: start(s0), end(s0..s(n-1))
@compute @workgroup_size(256) fn place(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  if (!closed(s)) { return; }
  let p = polyOf[label[s]];
  let length = loopStart[p + 1u] - loopStart[p];
  order[loopStart[p] + 1u + (length - 2u - rank[s])] = s;
  if (label[s] == s) { order[loopStart[p]] = s | 0x80000000u; } }`,Ie=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // slots, polygons, layers, stage
@group(0) @binding(1) var<storage, read> order: array<u32>;
@group(0) @binding(2) var<storage, read> segPoints: array<vec4<i32>>;
@group(0) @binding(3) var<storage, read> segLayer: array<u32>;
@group(0) @binding(4) var<storage, read> successor: array<u32>;
@group(0) @binding(5) var<storage, read> loopStart: array<u32>;      // per polygon: first slot (P.y + 1 entries)
@group(0) @binding(6) var<storage, read_write> kept: array<u32>;     // per slot, then scanned
@group(0) @binding(7) var<storage, read_write> polyKept: array<u32>; // per polygon: kept count, then valid flag, then scanned
@group(0) @binding(8) var<storage, read_write> layerAcc: array<atomic<i32>>;  // per layer: minx miny maxx maxy count, pad
@group(0) @binding(9) var<storage, read_write> slotPoly: array<u32>; // slot -> polygon
${re}
fn pointOf(i: u32) -> vec2<i32> { let e = order[i]; let p = segPoints[e & 0x7fffffffu]; if ((e & 0x80000000u) != 0u) { return p.xy; } return p.zw; }
fn layerOf(i: u32) -> u32 { return segLayer[order[i] & 0x7fffffffu]; }
@compute @workgroup_size(256) fn slotPolygons(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = tid(g); if (p >= P.y) { return; }
  for (var i = loopStart[p]; i < loopStart[p + 1u]; i = i + 1u) { slotPoly[i] = p; } }
// a point is kept unless it equals the next point of its loop (write_polygon), and the layer box takes every live end
@compute @workgroup_size(256) fn keep(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = tid(g); if (i >= P.x) { return; }
  let p = slotPoly[i]; var nx = i + 1u; if (nx == loopStart[p + 1u]) { nx = loopStart[p]; }
  let a = pointOf(i); let b = pointOf(nx);
  kept[i] = select(0u, 1u, any(a != b));
  if (loopStart[p + 1u] - loopStart[p] < 3u) { return; }   // chain_polys keeps a loop of 3 points or more
  let L = layerOf(i);
  atomicMin(&layerAcc[L * 8u], a.x); atomicMin(&layerAcc[L * 8u + 1u], a.y);
  atomicMax(&layerAcc[L * 8u + 2u], a.x); atomicMax(&layerAcc[L * 8u + 3u], a.y); }
@compute @workgroup_size(256) fn polygonCounts(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = tid(g); if (p >= P.y) { return; }
  var n = 0u; for (var i = loopStart[p]; i < loopStart[p + 1u]; i = i + 1u) { n = n + kept[i]; }
  polyKept[p] = select(0u, 1u, n >= 2u && loopStart[p + 1u] - loopStart[p] >= 3u); }
@compute @workgroup_size(256) fn keepValid(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = tid(g); if (i >= P.x) { return; }
  let p = slotPoly[i];
  if (polyKept[p] == 0u) { kept[i] = 0u; } }`,ir=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // slots, polygons, layers
@group(0) @binding(1) var<storage, read> order: array<u32>;
@group(0) @binding(2) var<storage, read> segPoints: array<vec4<i32>>;
@group(0) @binding(3) var<storage, read> segLayer: array<u32>;
@group(0) @binding(4) var<storage, read> keptFlag: array<u32>;   // per slot: kept (0/1)
@group(0) @binding(5) var<storage, read> keptAt: array<u32>;     // per slot: exclusive scan of kept
@group(0) @binding(6) var<storage, read> layerBox: array<i32>;   // per layer: minx miny maxx maxy, 8 words
@group(0) @binding(7) var<storage, read_write> points: array<vec2<i32>>;
@group(0) @binding(8) var<storage, read_write> layerCount: array<atomic<u32>>;
${re}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = tid(g); if (i >= P.x || keptFlag[i] == 0u) { return; }
  let e = order[i]; let s = e & 0x7fffffffu; let L = segLayer[s];
  var q = segPoints[s].zw; if ((e & 0x80000000u) != 0u) { q = segPoints[s].xy; }
  points[keptAt[i]] = q - vec2<i32>(layerBox[L * 8u], layerBox[L * 8u + 1u]);
  atomicAdd(&layerCount[L], 1u); }`,Ke=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // slots, polygons, layers, cell size
@group(0) @binding(1) var<storage, read> layerBox: array<i32>;
@group(0) @binding(2) var<storage, read_write> layerStart: array<u32>;   // per layer count, scanned (L + 1)
@group(0) @binding(3) var<storage, read_write> layerInfo: array<u32>;    // gw gh cellOffset 0
@group(0) @binding(4) var<storage, read> polyValidAt: array<u32>;        // scanned valid flags (P.y + 1)
@group(0) @binding(5) var<storage, read> loopStart: array<u32>;
@group(0) @binding(6) var<storage, read> keptAt: array<u32>;
@group(0) @binding(7) var<storage, read> order: array<u32>;
@group(0) @binding(8) var<storage, read> segLayer: array<u32>;
@group(0) @binding(9) var<storage, read_write> polyInfo: array<u32>;     // start count layerStart layerEnd; polyLayer after
${re}
@compute @workgroup_size(1) fn cells() {   // a serial pass over the layers (hundreds)
  var cells = 0u;
  for (var L = 0u; L < P.z; L = L + 1u) {
    var gw = 1u; var gh = 1u;
    if (layerBox[L * 8u + 2u] >= layerBox[L * 8u]) {
      gw = u32(layerBox[L * 8u + 2u] - layerBox[L * 8u]) / P.w + 1u; gh = u32(layerBox[L * 8u + 3u] - layerBox[L * 8u + 1u]) / P.w + 1u; }
    layerInfo[L * 4u] = gw; layerInfo[L * 4u + 1u] = gh; layerInfo[L * 4u + 2u] = cells; layerInfo[L * 4u + 3u] = 0u;
    cells = cells + gw * gh;
  }
  layerInfo[P.z * 4u] = cells; }
@compute @workgroup_size(256) fn polygons(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = tid(g); if (p >= P.y) { return; }
  if (polyValidAt[p + 1u] == polyValidAt[p]) { return; }
  let q = polyValidAt[p];
  let first = keptAt[loopStart[p]]; let count = keptAt[loopStart[p + 1u]] - first;
  let L = segLayer[order[loopStart[p]] & 0x7fffffffu];
  polyInfo[q * 4u] = first; polyInfo[q * 4u + 1u] = count; polyInfo[q * 4u + 2u] = layerStart[L]; polyInfo[q * 4u + 3u] = layerStart[L + 1u];
  polyInfo[polyValidAt[P.y] * 4u + q] = L; }`,sr=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // polygons, cell size
@group(0) @binding(1) var<storage, read> polyInfo: array<u32>;
@group(0) @binding(2) var<storage, read> points: array<vec2<i32>>;
@group(0) @binding(3) var<storage, read_write> total: array<atomic<u32>>;
${re}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = tid(g); if (p >= P.x) { return; }
  let first = polyInfo[p * 4u]; let n = polyInfo[p * 4u + 1u]; let c = i32(P.y);
  var a = points[first + n - 1u]; var sum = 0u;
  for (var i = 0u; i < n; i = i + 1u) { let b = points[first + i];
    sum = sum + u32(max(a.x, b.x) / c - min(a.x, b.x) / c + 1) * u32(max(a.y, b.y) / c - min(a.y, b.y) / c + 1); a = b; }
  atomicAdd(&total[0], sum); }`,cr=`
@group(0) @binding(0) var<uniform> P: vec4<u32>;   // segments
@group(0) @binding(1) var<storage, read> dead: array<u32>;
@group(0) @binding(2) var<storage, read> reach: array<u32>;          // CYCLES_SHADER's output: NONE off every cycle
@group(0) @binding(3) var<storage, read> segLayer: array<u32>;
@group(0) @binding(4) var<storage, read_write> openLayer: array<u32>;
${re}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let s = tid(g); if (s >= P.x) { return; }
  if (dead[s] == 0u && reach[s] == ${4294967295}u) { openLayer[segLayer[s]] = 1u; } }`;var De=`// a range from a corrupt scan must not spin the GPU: a dispatch keeps running after its process is killed (measured). Observed max 107 per cell, 13 per segment.
const RANGE_CAP = 4096u;
fn badRange(lo: u32, hi: u32) -> bool { return hi < lo || hi - lo > RANGE_CAP; }

fn mulu(a: u32, b: u32) -> vec2<u32> {   // unsigned 32x32 -> 64 (lo, hi)
  let al = a & 0xffffu; let ah = a >> 16u; let bl = b & 0xffffu; let bh = b >> 16u;
  let ll = al * bl; let lh = al * bh; let hl = ah * bl; let hh = ah * bh;
  var lo = ll; var hi = hh + (lh >> 16u) + (hl >> 16u);
  let t1 = lh << 16u; lo = lo + t1; if (lo < t1) { hi = hi + 1u; }
  let t2 = hl << 16u; lo = lo + t2; if (lo < t2) { hi = hi + 1u; }
  return vec2<u32>(lo, hi);
}
fn muls(a: i32, b: i32) -> vec2<u32> {   // signed 32x32 -> 64, two's complement
  let neg = (a < 0) != (b < 0);
  var r = mulu(u32(abs(a)), u32(abs(b)));
  if (neg) { r = neg64(r); }
  return r;
}
fn neg64(a: vec2<u32>) -> vec2<u32> { var lo = ~a.x; var hi = ~a.y; lo = lo + 1u; if (lo == 0u) { hi = hi + 1u; } return vec2<u32>(lo, hi); }
fn sub64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> { var hi = a.y - b.y; if (a.x < b.x) { hi = hi - 1u; } return vec2<u32>(a.x - b.x, hi); }
fn sign64(a: vec2<u32>) -> i32 { if ((a.y & 0x80000000u) != 0u) { return -1; } if (a.x == 0u && a.y == 0u) { return 0; } return 1; }
fn cross(ux: i32, uy: i32, vx: i32, vy: i32) -> vec2<u32> { return sub64(muls(ux, vy), muls(uy, vx)); }
fn orient(ax: i32, ay: i32, bx: i32, by: i32, cx: i32, cy: i32) -> i32 { return sign64(cross(bx - ax, by - ay, cx - ax, cy - ay)); }
fn u64f(a: vec2<u32>) -> f32 { return f32(a.y) * 4294967296.0 + f32(a.x); }   // non-negative values only
// exact rounded quotient round(num * |d| / den) for 0 <= num < den (u64), |d| < 2^31: restoring division in 128-bit arithmetic
fn add128u(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> { var r: vec4<u32>; r.x = a.x + b.x; var c = select(0u, 1u, r.x < a.x);
  let y = a.y + b.y; var c1 = select(0u, 1u, y < a.y); r.y = y + c; if (r.y < y) { c1 = 1u; } c = c1;
  let z = a.z + b.z; var c2 = select(0u, 1u, z < a.z); r.z = z + c; if (r.z < z) { c2 = 1u; } c = c2; r.w = a.w + b.w + c; return r; }
fn sub128u(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> { return add128u(a, add128u(vec4<u32>(~b.x, ~b.y, ~b.z, ~b.w), vec4<u32>(1u, 0u, 0u, 0u))); }
fn ge128(a: vec4<u32>, b: vec4<u32>) -> bool { if (a.w != b.w) { return a.w > b.w; } if (a.z != b.z) { return a.z > b.z; } if (a.y != b.y) { return a.y > b.y; } return a.x >= b.x; }
fn shl128(a: vec4<u32>, s: u32) -> vec4<u32> { if (s == 0u) { return a; } let t = 32u - s; return vec4<u32>(a.x << s, (a.y << s) | (a.x >> t), (a.z << s) | (a.y >> t), (a.w << s) | (a.z >> t)); }
fn roundedShift(num: vec2<u32>, den: vec2<u32>, d: i32) -> i32 {
  if (d == 0) { return 0; }
  let ad = u32(abs(d)); let lo = mulu(num.x, ad); let hi = mulu(num.y, ad);
  var n = vec4<u32>(lo.x, lo.y, 0u, 0u); n = add128u(n, vec4<u32>(0u, hi.x, hi.y, 0u));
  n = shl128(n, 1u); n = add128u(n, vec4<u32>(den.x, den.y, 0u, 0u));
  let dd = shl128(vec4<u32>(den.x, den.y, 0u, 0u), 1u);
  var q = 0u; var sh = shl128(dd, 31u);
  for (var b = 31; b >= 0; b--) { if (ge128(n, sh)) { n = sub128u(n, sh); q = q | (1u << u32(b)); }
    sh = vec4<u32>((sh.x >> 1u) | (sh.y << 31u), (sh.y >> 1u) | (sh.z << 31u), (sh.z >> 1u) | (sh.w << 31u), sh.w >> 1u); }
  if (d < 0) { return -i32(q); } return i32(q);
}
struct Params { n: u32, cells: u32, cs: i32, mode: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> segs: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read> segInfo: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> layerInfo: array<vec4<i32>>;   // gw, gh, cellBase, 0
fn vtx(v: u32) -> vec2<i32> { return segs[v].xy; }
fn orientSoS(p: u32, q: u32, r: u32) -> i32 {   // Simulation of Simplicity: higher id dominates, x displacement before y
  let P = vtx(p); let Q = vtx(q); let R = vtx(r);
  let d = orient(P.x, P.y, Q.x, Q.y, R.x, R.y); if (d != 0) { return d; }
  var ids = array<u32, 3>(p, q, r);
  var cv = array<vec2<i32>, 3>(R - Q, P - R, Q - P);
  for (var round = 0; round < 3; round++) {
    var top = 0u; var found = false;
    for (var k = 0; k < 3; k++) { if (ids[k] != 0xffffffffu && (!found || ids[k] > top)) { top = ids[k]; found = true; } }
    if (!found) { break; }
    var c = vec2<i32>(0, 0);
    for (var k = 0; k < 3; k++) { if (ids[k] == top) { c = c + cv[k]; ids[k] = 0xffffffffu; } }
    if (c.y != 0) { return -sign(c.y); }
    if (c.x != 0) { return sign(c.x); }
  }
  return 0;
}
fn cellRange(i: u32) -> vec4<i32> { let s = segs[i]; return vec4<i32>(min(s.x, s.z) / params.cs, min(s.y, s.w) / params.cs, max(s.x, s.z) / params.cs, max(s.y, s.w) / params.cs); }
`,Rr=De+`
@group(0) @binding(4) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read> cellStart: array<u32>;
@group(0) @binding(6) var<storage, read_write> cellList: array<vec2<u32>>;
@compute @workgroup_size(256) fn count(@builtin(global_invocation_id) gid_raw: vec3<u32>) { let gid = vec3<u32>(gid_raw.x + gid_raw.y * 16776960u, 0u, 0u);
  let i = gid.x; if (i >= params.n) { return; }
  let r = cellRange(i); let L = layerInfo[segInfo[i].x];
  for (var cy = r.y; cy <= r.w; cy++) { for (var cx = r.x; cx <= r.z; cx++) { atomicAdd(&cellCount[u32(L.z + cy * L.x + cx)], 1u); } }
}
@compute @workgroup_size(256) fn scatter(@builtin(global_invocation_id) gid_raw: vec3<u32>) { let gid = vec3<u32>(gid_raw.x + gid_raw.y * 16776960u, 0u, 0u);
  let i = gid.x; if (i >= params.n) { return; }
  let r = cellRange(i); let L = layerInfo[segInfo[i].x];
  for (var cy = r.y; cy <= r.w; cy++) { for (var cx = r.x; cx <= r.z; cx++) { let c = u32(L.z + cy * L.x + cx); let k = atomicAdd(&cellCount[c], 1u); if (cellStart[c] + k < arrayLength(&cellList)) { cellList[cellStart[c] + k] = vec2<u32>(i, c); } } }
}`,Br=De+`
@group(0) @binding(4) var<storage, read> cellStart: array<u32>;
@group(0) @binding(5) var<storage, read> cellList: array<vec2<u32>>;
@group(0) @binding(6) var<storage, read_write> evCount: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> events: array<vec4<u32>>;
@group(0) @binding(8) var<storage, read> evStart: array<u32>;
@group(0) @binding(9) var<storage, read_write> flags: array<atomic<u32>>;   // [0]: pair counter, [1]: collinear pivots
@group(0) @binding(10) var<storage, read_write> pairEdges: array<vec2<u32>>;
fn emit(seg: u32, num: vec2<u32>, den: vec2<u32>, delta: i32, px: i32, py: i32, vid: u32) {
  if (params.mode == 0u) { atomicAdd(&evCount[seg], 1u); return; }
  let k = atomicAdd(&evCount[seg], 1u); let at = (evStart[seg] + k) * 2u; if (at + 1u >= arrayLength(&events)) { return; }
  events[at] = vec4<u32>(num.x, num.y, den.x, den.y); events[at + 1u] = vec4<u32>(bitcast<u32>(delta), bitcast<u32>(px), bitcast<u32>(py), vid);
}
fn dotw(ux: i32, uy: i32, vx: i32, vy: i32) -> vec2<u32> { let a = muls(ux, vx); let b = muls(uy, vy); var lo = a.x + b.x; var hi = a.y + b.y; if (lo < a.x) { hi = hi + 1u; } return vec2<u32>(lo, hi); }
@compute @workgroup_size(256) fn intersect(@builtin(global_invocation_id) gid_raw: vec3<u32>) { let gid = vec3<u32>(gid_raw.x + gid_raw.y * 16776960u, 0u, 0u);
  let a0 = gid.x; if (a0 >= arrayLength(&cellList) || params.cells == 0u) { return; }
  let c = cellList[a0].y; if (c >= params.cells) { return; }
  let s0 = cellStart[c]; let s1 = cellStart[c + 1u]; if (a0 < s0 || a0 >= s1 || badRange(s0, s1)) { return; }
  let L = layerInfo[segInfo[cellList[s0].x].x];
  let cl = i32(c) - L.z; let cellX = cl % L.x; let cellY = cl / L.x;
  for (var a = a0; a < a0 + 1u; a++) {
    let i = cellList[a].x; let A = segs[i]; let a1 = segInfo[i].z;
    for (var b = a + 1u; b < s1; b++) {
      let j = cellList[b].x; let Bs = segs[j]; let b1 = segInfo[j].z;
      let lox = max(min(A.x, A.z), min(Bs.x, Bs.z)); let hix = min(max(A.x, A.z), max(Bs.x, Bs.z));
      let loy = max(min(A.y, A.w), min(Bs.y, Bs.w)); let hiy = min(max(A.y, A.w), max(Bs.y, Bs.w));
      if (lox > hix || loy > hiy) { continue; }
      if (lox / params.cs != cellX || loy / params.cs != cellY) { continue; }
      if (i == j || i == b1 || a1 == j || a1 == b1) { continue; }   // adjacent edges meet only at their shared vertex
      let o1 = orientSoS(i, a1, j); let o2 = orientSoS(i, a1, b1); let o3 = orientSoS(j, b1, i); let o4 = orientSoS(j, b1, a1);
      if (!(o1 * o2 < 0 && o3 * o4 < 0)) { continue; }
      var den = cross(A.z - A.x, A.w - A.y, Bs.z - Bs.x, Bs.w - Bs.y);
      var numI = vec2<u32>(0u, 0u); var denI = vec2<u32>(1u, 0u); var numJ = vec2<u32>(0u, 0u); var denJ = vec2<u32>(1u, 0u);
      var px = 0; var py = 0;
      if (sign64(den) != 0) {
        numI = cross(Bs.x - A.x, Bs.y - A.y, Bs.z - Bs.x, Bs.w - Bs.y); denI = den;
        if (sign64(denI) < 0) { numI = neg64(numI); denI = neg64(denI); }
        numJ = cross(A.x - Bs.x, A.y - Bs.y, A.z - A.x, A.w - A.y); denJ = neg64(den);
        if (sign64(denJ) < 0) { numJ = neg64(numJ); denJ = neg64(denJ); }
        // the point is computed along the lower-index segment: which of the two a cell lists first depends on atomic order, and the
        //  two parametrisations round differently in f32 (measured: 1-unit differences between identical runs)
        // exact integer rounding (f32 rounded 0.84 % of points differently on SwiftShader than on Metal), along the lower-index segment
        if (params.mode == 0u) { }
        else if (i < j) { px = A.x + roundedShift(numI, denI, A.z - A.x); py = A.y + roundedShift(numI, denI, A.w - A.y); }
        else { px = Bs.x + roundedShift(numJ, denJ, Bs.z - Bs.x); py = Bs.y + roundedShift(numJ, denJ, Bs.w - Bs.y); }
      } else {   // collinear pair made to cross by SoS: next to the pivot endpoint
        if (params.mode == 1u) { atomicAdd(&flags[1], 1u); }
        let top = max(max(i, a1), max(j, b1)); var pv = a1;
        if (top == b1) { pv = j; } else if (top == j) { pv = b1; } else if (top == a1) { pv = i; }
        let Pv = vtx(pv); px = Pv.x; py = Pv.y;
        if (pv == i) { numI = vec2<u32>(0u, 0u); } else if (pv == a1) { numI = vec2<u32>(1u, 0u); } else { numI = dotw(px - A.x, py - A.y, A.z - A.x, A.w - A.y); denI = dotw(A.z - A.x, A.w - A.y, A.z - A.x, A.w - A.y); }
        if (pv == j) { numJ = vec2<u32>(0u, 0u); } else if (pv == b1) { numJ = vec2<u32>(1u, 0u); } else { numJ = dotw(px - Bs.x, py - Bs.y, Bs.z - Bs.x, Bs.w - Bs.y); denJ = dotw(Bs.z - Bs.x, Bs.w - Bs.y, Bs.z - Bs.x, Bs.w - Bs.y); }
      }
      var vid = 0u;
      if (params.mode == 1u) { let pid = atomicAdd(&flags[0], 1u); vid = params.n + pid; if (pid < arrayLength(&pairEdges)) { pairEdges[pid] = vec2<u32>(i, j); } }
      var dI = -1; if (o3 < 0) { dI = 1; }
      var dJ = -1; if (o1 < 0) { dJ = 1; }
      emit(i, numI, denI, dI, px, py, vid);
      emit(j, numJ, denJ, dJ, px, py, vid);
    }
  }
}`,Tr=De+`
@group(0) @binding(4) var<storage, read> evStart: array<u32>;
@group(0) @binding(5) var<storage, read_write> events: array<vec4<u32>>;
@group(0) @binding(6) var<storage, read> pairEdges: array<vec2<u32>>;
fn add64(a: vec2<u32>, b: vec2<u32>) -> vec3<u32> { var lo = a.x + b.x; var c = 0u; if (lo < a.x) { c = 1u; } var hi = a.y + b.y + c; var c2 = 0u; if (hi < a.y || (c == 1u && hi == a.y)) { c2 = 1u; } return vec3<u32>(lo, hi, c2); }
fn mul128(a: vec2<u32>, b: vec2<u32>) -> vec4<u32> {
  let p00 = mulu(a.x, b.x); let p01 = mulu(a.x, b.y); let p10 = mulu(a.y, b.x); let p11 = mulu(a.y, b.y);
  var r0 = p00.x;
  let s1 = add64(vec2<u32>(p00.y, 0u), vec2<u32>(p01.x, p01.y));   // limbs 1,2 (+carry into 3)
  let s2 = add64(vec2<u32>(s1.x, s1.y), vec2<u32>(p10.x, p10.y));
  let s3 = add64(vec2<u32>(s2.y, s1.z + s2.z), vec2<u32>(p11.x, p11.y));
  return vec4<u32>(r0, s2.x, s3.x, s3.y);
}
fn lt128(x: vec4<u32>, y: vec4<u32>) -> bool {
  if (x.w != y.w) { return x.w < y.w; } if (x.z != y.z) { return x.z < y.z; } if (x.y != y.y) { return x.y < y.y; } return x.x < y.x;
}
fn before(p: vec4<u32>, q: vec4<u32>) -> bool { return lt128(mul128(p.xy, q.zw), mul128(q.xy, p.zw)); }
// ---- two events at the same place on a segment: ordered as if every vertex were moved by an infinitesimal amount,
//  higher vertex ids first, x before y (the same perturbation the crossing test uses). The order is the sign of the
//  difference of the two events' parameters' derivatives, each a fraction of signed integers up to 128 bits.
struct SM { m: vec4<u32>, neg: bool }
fn isZero128(a: vec4<u32>) -> bool { return a.x == 0u && a.y == 0u && a.z == 0u && a.w == 0u; }
fn add128(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {
  var r = vec4<u32>(0u); var carry = 0u;
  for (var k = 0; k < 4; k++) { let s1 = a[k] + b[k]; var c = 0u; if (s1 < a[k]) { c = 1u; } let s2 = s1 + carry; if (s2 < s1) { c = 1u; } r[k] = s2; carry = c; }
  return r; }
fn sub128(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {   // a >= b
  var r = vec4<u32>(0u); var borrow = 0u;
  for (var k = 0; k < 4; k++) { let d1 = a[k] - b[k]; var c = 0u; if (a[k] < b[k]) { c = 1u; } let d2 = d1 - borrow; if (d1 < borrow) { c = 1u; } r[k] = d2; borrow = c; }
  return r; }
fn smAdd(a: SM, b: SM) -> SM {
  if (a.neg == b.neg) { return SM(add128(a.m, b.m), a.neg); }
  if (lt128(a.m, b.m)) { return SM(sub128(b.m, a.m), b.neg); }
  return SM(sub128(a.m, b.m), a.neg); }
fn smNeg(a: SM) -> SM { return SM(a.m, !a.neg); }
fn smProd(u: vec2<u32>, x: i32) -> SM { return SM(mul128(u, vec2<u32>(u32(abs(x)), 0u)), x < 0); }   // unsigned 64 x signed 32
fn mul256(a: vec4<u32>, b: vec4<u32>) -> array<u32, 8> {
  var r: array<u32, 8>;
  for (var i = 0; i < 4; i++) { var carry = 0u;
    for (var j = 0; j < 4; j++) { let p = mulu(a[i], b[j]); let s1 = r[i + j] + p.x; var c = 0u; if (s1 < p.x) { c = 1u; } let s2 = s1 + carry; if (s2 < s1) { c = c + 1u; } r[i + j] = s2; carry = p.y + c; }
    r[i + 4] = carry; }
  return r; }
// sign of num1/den1 - num2/den2, by cross-multiplying (a zero denominator gives equal, as on the CPU)
fn cmpFrac(n1in: SM, d1: SM, n2in: SM, d2: SM) -> i32 {
  var n1 = n1in; var n2 = n2in; if (d1.neg) { n1.neg = !n1.neg; } if (d2.neg) { n2.neg = !n2.neg; }
  let l = mul256(n1.m, d2.m); let r = mul256(n2.m, d1.m);
  var lz = true; var rz = true; var mag = 0;
  for (var k = 7; k >= 0; k--) { if (l[k] != 0u) { lz = false; } if (r[k] != 0u) { rz = false; } if (mag == 0 && l[k] != r[k]) { if (l[k] < r[k]) { mag = -1; } else { mag = 1; } } }
  let ln = n1.neg && !lz; let rn = n2.neg && !rz;
  if (ln != rn) { if (ln) { return -1; } return 1; }
  if (ln) { return -mag; }
  return mag; }
struct Shift { num: SM, den: SM }
// the derivative of the event's parameter along segment A when vertex v moves in x (axis 0) or y (axis 1)
fn shiftOf(A: u32, n: vec2<u32>, d: vec2<u32>, C: u32, v: u32, axis: u32) -> Shift {
  let a0 = A; let a1 = segInfo[A].z; let c0 = C; let c1 = segInfo[C].z;
  let Pa0 = vtx(a0); let Pa1 = vtx(a1); let Pc0 = vtx(c0); let Pc1 = vtx(c1);
  let dAx = Pa1.x - Pa0.x; let dAy = Pa1.y - Pa0.y; let dCx = Pc1.x - Pc0.x; let dCy = Pc1.y - Pc0.y;
  var D = cross(dAx, dAy, dCx, dCy); let Dneg = sign64(D) < 0; if (Dneg) { D = neg64(D); }
  let den = SM(mul128(D, d), Dneg);
  // cg(u) = gx * u.y - gy * u.x, for u = (w - a0) * d - n * dA, and for u = dC
  var cgC = dCy; if (axis == 1u) { cgC = -dCx; }
  var num = SM(vec4<u32>(0u), false); var touched = false;
  if (v == c0 || v == c1) {
    var w = Pc1; if (v == c1) { w = Pc0; }
    var part: SM;
    if (axis == 0u) { part = smAdd(smProd(d, w.y - Pa0.y), smNeg(smProd(n, dAy))); }
    else { part = smNeg(smAdd(smProd(d, w.x - Pa0.x), smNeg(smProd(n, dAx)))); }
    if (v == c0) { num = smAdd(num, part); }
    if (v == c1) { num = smAdd(num, smNeg(part)); }
    touched = true; }
  if (v == c0 && v == c1) { touched = true; }
  if (v == a0) { let lo = d.x - n.x; var hi = d.y - n.y; if (d.x < n.x) { hi = hi - 1u; } num = smAdd(num, smNeg(smProd(vec2<u32>(lo, hi), cgC))); touched = true; }
  if (v == a1) { num = smAdd(num, smNeg(smProd(n, cgC))); touched = true; }
  if (!touched) { return Shift(SM(vec4<u32>(0u), false), SM(vec4<u32>(1u, 0u, 0u, 0u), false)); }
  return Shift(num, den); }
fn otherEdge(A: u32, vid: u32) -> u32 { let pid = vid - params.n; if (pid >= arrayLength(&pairEdges)) { return A; } let e = pairEdges[pid]; if (e.x == A) { return e.y; } return e.x; }
// -1: p first, 1: q first, 0: the perturbation does not separate them (two segments on one line)
fn sosOrder(A: u32, p0: vec4<u32>, p1: vec4<u32>, q0: vec4<u32>, q1: vec4<u32>) -> i32 {
  let Cp = otherEdge(A, p1.w); let Cq = otherEdge(A, q1.w);
  var ids = array<u32, 6>(A, segInfo[A].z, Cp, segInfo[Cp].z, Cq, segInfo[Cq].z);
  for (var round = 0; round < 6; round++) {
    var top = 0u; var found = false;
    for (var k = 0; k < 6; k++) { if (ids[k] != 0xffffffffu && (!found || ids[k] > top)) { top = ids[k]; found = true; } }
    if (!found) { break; }
    for (var k = 0; k < 6; k++) { if (ids[k] == top) { ids[k] = 0xffffffffu; } }
    for (var axis = 0u; axis < 2u; axis++) {
      let sp = shiftOf(A, p0.xy, p0.zw, Cp, top, axis); let sq = shiftOf(A, q0.xy, q0.zw, Cq, top, axis);
      let c = cmpFrac(sp.num, sp.den, sq.num, sq.den);
      if (c != 0) { return c; } } }
  return 0; }
fn beforeExact(A: u32, k0: vec4<u32>, k1: vec4<u32>, p0: vec4<u32>, p1: vec4<u32>) -> bool {
  if (before(k0, p0)) { return true; }
  if (before(p0, k0)) { return false; }
  if (params.mode == 0u) { return false; }
  return sosOrder(A, k0, k1, p0, p1) < 0; }
@compute @workgroup_size(256) fn sortEvents(@builtin(global_invocation_id) gid_raw: vec3<u32>) { let gid = vec3<u32>(gid_raw.x + gid_raw.y * 16776960u, 0u, 0u);
  let i = gid.x; if (i >= params.n) { return; }
  let r0 = evStart[i]; let r1 = evStart[i + 1u]; if (badRange(r0, r1)) { return; }
  for (var a = r0 + 1u; a < r1; a++) {
    let k0 = events[a * 2u]; let k1 = events[a * 2u + 1u]; var b = a;
    loop { if (b == r0) { break; } let p = events[(b - 1u) * 2u]; let p1 = events[(b - 1u) * 2u + 1u]; if (!beforeExact(i, k0, k1, p, p1)) { break; } events[b * 2u] = p; events[b * 2u + 1u] = p1; b = b - 1u; }
    events[b * 2u] = k0; events[b * 2u + 1u] = k1;
  }
}`,Mr=`
struct LP { e: u32, v: u32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<uniform> lp: LP;
@group(0) @binding(1) var<storage, read> pv: array<vec4<u32>>;          // start vid, end vid, layer
@group(0) @binding(2) var<storage, read> pc: array<vec4<i32>>;          // sx, sy, ex, ey
@group(0) @binding(3) var<storage, read_write> vcount: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read> vstart: array<u32>;
@group(0) @binding(5) var<storage, read_write> vlist: array<u32>;
@group(0) @binding(6) var<storage, read_write> succ: array<u32>;
@group(0) @binding(7) var<storage, read_write> labA: array<vec2<u32>>;   // label, next
@group(0) @binding(8) var<storage, read_write> labB: array<vec2<u32>>;
@compute @workgroup_size(256) fn vcountK(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); if (g.x >= lp.e) { return; } atomicAdd(&vcount[pv[g.x].x], 1u); }
@compute @workgroup_size(256) fn vscatter(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); if (g.x >= lp.e) { return; } let v = pv[g.x].x; let k = atomicAdd(&vcount[v], 1u); vlist[vstart[v] + k] = g.x; }
@compute @workgroup_size(256) fn successor(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u);
  let e = g.x; if (e >= lp.e) { return; }
  let v = pv[e].y; let a = vstart[v]; let b = vstart[v + 1u];
  if (b == a) { succ[e] = e; labA[e] = vec2<u32>(e, e); return; }
  var best = vlist[a];
  if (b - a > 1024u) { atomicAdd(&vcount[lp.v], 1u); succ[e] = e; labA[e] = vec2<u32>(e, e); return; }   // out-degree cap: a corrupt vstart must not spin the GPU
  if (b - a > 1u) {   // first outgoing edge clockwise from the reverse of the incoming one
    let q = pc[e]; let rin = atan2(f32(q.y - q.w), f32(q.x - q.z)); var bestAng = 10.0;
    for (var k = a; k < b; k++) { let o = vlist[k]; let r = pc[o]; var ang = rin - atan2(f32(r.w - r.y), f32(r.z - r.x));
      if (!(ang > 0.0)) { ang = ang + 6.2831853; } if (ang > 6.2831853) { ang = ang - 6.2831853; }   // a difference of two atan2 lies in [-2pi, 2pi]: one step each, no loop
      if (ang < bestAng) { bestAng = ang; best = o; } }
  }
  succ[e] = best; labA[e] = vec2<u32>(min(e, best), best);
}
@compute @workgroup_size(256) fn jumpAB(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let e = g.x; if (e >= lp.e) { return; } let s = labA[e]; let t = labA[s.y]; labB[e] = vec2<u32>(min(s.x, t.x), t.y); }
@compute @workgroup_size(256) fn jumpBA(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let e = g.x; if (e >= lp.e) { return; } let s = labB[e]; let t = labB[s.y]; labA[e] = vec2<u32>(min(s.x, t.x), t.y); }
`,Le=`
@group(0) @binding(0) var<uniform> sp: vec4<u32>;
@group(0) @binding(1) var<storage, read_write> data: array<u32>;
@group(0) @binding(2) var<storage, read_write> sums: array<u32>;
var<workgroup> tmp: array<u32, 256>;
@compute @workgroup_size(256) fn scanBlock(@builtin(global_invocation_id) g_raw: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) wg_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let wg = vec3<u32>(wg_raw.x + wg_raw.y * 65535u, 0u, 0u);
  if (wg.x * 256u >= sp.x + 256u) { return; }   // a workgroup past the last block (the second dispatch row): nothing to scan, and sums[wg] would be out of range
  let i = g.x; var v = 0u; if (i < sp.x) { v = data[i]; } tmp[l.x] = v; workgroupBarrier();
  for (var off = 1u; off < 256u; off = off * 2u) { var t = 0u; if (l.x >= off) { t = tmp[l.x - off]; } workgroupBarrier(); tmp[l.x] = tmp[l.x] + t; workgroupBarrier(); }
  if (i < sp.x) { data[i] = tmp[l.x] - v; }
  if (l.x == 255u) { sums[wg.x] = tmp[255]; }
}
@compute @workgroup_size(256) fn addOff(@builtin(global_invocation_id) g_raw: vec3<u32>, @builtin(workgroup_id) wg_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let wg = vec3<u32>(wg_raw.x + wg_raw.y * 65535u, 0u, 0u); if (g.x < sp.x) { data[g.x] = data[g.x] + sums[wg.x]; } }`,Nr=`
@group(0) @binding(0) var<uniform> cp: vec4<u32>;   // n, cap
@group(0) @binding(1) var<storage, read> starts: array<u32>;
@group(0) @binding(2) var<storage, read_write> bad: array<atomic<u32>>;
@compute @workgroup_size(256) fn check(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let i = g.x; if (i >= cp.x) { return; }
  let lo = starts[i]; let hi = starts[i + 1u]; if (hi < lo || hi - lo > cp.y) { atomicAdd(&bad[0], 1u); } }`,Dr=De+`
struct GP { n: u32, polys: u32, fill: u32, mode: u32 }
@group(0) @binding(4) var<uniform> gp: GP;
@group(0) @binding(5) var<storage, read> evStart: array<u32>;
@group(0) @binding(6) var<storage, read> events: array<vec4<u32>>;
@group(0) @binding(7) var<storage, read> polyInfo: array<vec4<u32>>;      // first, count, layer segStart, layer segEnd
@group(0) @binding(8) var<storage, read_write> work: array<u32>;
@group(0) @binding(9) var<storage, read_write> polyW: array<i32>;
fn leQ(v: u32, a0: u32, ay: i32, dA: vec2<i32>) -> bool {
  if (v == a0) { var s = sign(dA.y); if (s == 0) { s = sign(dA.x); } return s >= 0; }
  let d = vtx(v).y - ay; if (d != 0) { return d < 0; } return v < a0; }
@compute @workgroup_size(256) fn rays(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u);
  let p = g.x; if (p >= gp.polys) { return; }
  let pi = polyInfo[p]; let a0 = pi.x; let a1 = segInfo[a0].z; let A0 = vtx(a0); let dA = vtx(a1) - A0;
  var wn = 0;
  for (var c = pi.z; c < pi.w; c++) { let c1 = segInfo[c].z;
    if (leQ(c, a0, A0.y, dA) == leQ(c1, a0, A0.y, dA)) { continue; }
    var side = 1;
    if (c != a0) {
      if (c1 == a0) { side = orientSoS(c, c1, a1); if (side == 0) { let dc = vtx(c1) - vtx(c); side = sign(dc.x * dA.x + dc.y * dA.y); } }
      else { side = orientSoS(c, c1, a0); } }
    let C0 = vtx(c); let C1 = vtx(c1);
    if (C1.y > C0.y || (C1.y == C0.y && c1 > c)) { if (side > 0) { wn = wn + 1; } } else { if (side < 0) { wn = wn - 1; } } }
  polyW[p] = wn;
}
@compute @workgroup_size(256) fn deltaSums(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u);
  let a = g.x; if (a > gp.n) { return; } if (a == gp.n) { work[a] = 0u; return; }
  if (badRange(evStart[a], evStart[a + 1u])) { return; }
  var s = 0; for (var r = evStart[a]; r < evStart[a + 1u]; r++) { s = s + bitcast<i32>(events[r * 2u + 1u].x); } work[a] = bitcast<u32>(s);
}`,qr=De+`
struct GP { n: u32, polys: u32, fill: u32, mode: u32 }
@group(0) @binding(4) var<uniform> gp: GP;
@group(0) @binding(5) var<storage, read> evStart: array<u32>;
@group(0) @binding(6) var<storage, read> events: array<vec4<u32>>;
@group(0) @binding(7) var<storage, read> leftW: array<vec2<u32>>;       // per segment: (scanned delta sum, polygon index)
@group(0) @binding(8) var<storage, read> polyInfoW: array<vec4<i32>>;   // first, count, start winding, 0
@group(0) @binding(9) var<storage, read_write> pieceCount: array<u32>;
@group(0) @binding(10) var<storage, read_write> pv: array<vec4<u32>>;   // start vid, end vid, layer
@group(0) @binding(11) var<storage, read_write> pcd: array<vec4<i32>>;   // two entries per piece: coordinates, parent direction
fn insideOf(w: i32) -> bool { if (gp.fill == 3u) { return (w & 1) != 0; } if (gp.fill == 2u) { return w < 0; } if (gp.fill == 1u) { return w > 0; } return w != 0; }
@compute @workgroup_size(256) fn pieces(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u);
  let a = g.x; if (a >= gp.n) { return; }
  let lw = leftW[a]; let pw = polyInfoW[lw.y]; let firstScan = leftW[u32(pw.x)].x;
  var wl = pw.z + bitcast<i32>(lw.x - firstScan);
  let S = segs[a]; var x = S.x; var y = S.y; var vid = a; let nxt = segInfo[a].z; let dir = vec2<i32>(S.z - S.x, S.w - S.y); let layer = segInfo[a].x;
  var k = 0u; let base = pieceCount[a]; let r0 = evStart[a]; let r1 = evStart[a + 1u]; if (badRange(r0, r1)) { return; }
  for (var r = r0; r <= r1; r++) {
    var nx = S.z; var ny = S.w; var nv = nxt; var d = 0;
    if (r < r1) { let e = events[r * 2u + 1u]; d = bitcast<i32>(e.x); nx = bitcast<i32>(e.y); ny = bitcast<i32>(e.z); nv = e.w; }
    let il = insideOf(wl); let ir = insideOf(wl - 1);
    if (il != ir) {
      if (gp.mode == 1u) { let o = base + k;
        if (il) { pv[o] = vec4<u32>(vid, nv, layer, 0u); pcd[o * 2u] = vec4<i32>(x, y, nx, ny); pcd[o * 2u + 1u] = vec4<i32>(0, 0, dir.x, dir.y); }
        else { pv[o] = vec4<u32>(nv, vid, layer, 0u); pcd[o * 2u] = vec4<i32>(nx, ny, x, y); pcd[o * 2u + 1u] = vec4<i32>(0, 0, -dir.x, -dir.y); } }
      k = k + 1u; }
    x = nx; y = ny; vid = nv; wl = wl + d; }
  if (gp.mode == 0u) { pieceCount[a] = k; }
}`,Gr=`
@group(0) @binding(0) var<uniform> tp: vec4<u32>;
@group(0) @binding(1) var<storage, read> evStart: array<u32>;
@group(0) @binding(2) var<storage, read> events: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> tieList: array<atomic<u32>>;
fn mulu(a: u32, b: u32) -> vec2<u32> { let al = a & 0xffffu; let ah = a >> 16u; let bl = b & 0xffffu; let bh = b >> 16u; let ll = al * bl; let lh = al * bh; let hl = ah * bl; let hh = ah * bh;
  var lo = ll; var hi = hh + (lh >> 16u) + (hl >> 16u); let t1 = lh << 16u; lo = lo + t1; if (lo < t1) { hi = hi + 1u; } let t2 = hl << 16u; lo = lo + t2; if (lo < t2) { hi = hi + 1u; } return vec2<u32>(lo, hi); }
fn add128(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> { var r: vec4<u32>; r.x = a.x + b.x; var c = select(0u, 1u, r.x < a.x);
  let y = a.y + b.y; var c1 = select(0u, 1u, y < a.y); r.y = y + c; if (r.y < y) { c1 = 1u; } c = c1;
  let z = a.z + b.z; var c2 = select(0u, 1u, z < a.z); r.z = z + c; if (r.z < z) { c2 = 1u; } c = c2; r.w = a.w + b.w + c; return r; }
fn mul128(a: vec2<u32>, b: vec2<u32>) -> vec4<u32> { let p00 = mulu(a.x, b.x); let p01 = mulu(a.x, b.y); let p10 = mulu(a.y, b.x); let p11 = mulu(a.y, b.y);
  var r = vec4<u32>(p00.x, p00.y, p11.x, p11.y); r = add128(r, vec4<u32>(0u, p01.x, p01.y, 0u)); r = add128(r, vec4<u32>(0u, p10.x, p10.y, 0u)); return r; }
@compute @workgroup_size(256) fn ties(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u);
  let a = g.x; if (a >= tp.x) { return; } if (evStart[a + 1u] < evStart[a] || evStart[a + 1u] - evStart[a] > 4096u) { return; }   // RANGE_CAP (this shader has no prelude)
  for (var r = evStart[a] + 1u; r < evStart[a + 1u]; r++) { let p = events[(r - 1u) * 2u]; let q = events[r * 2u];
    if (all(mul128(p.xy, q.zw) == mul128(q.xy, p.zw))) { let k = atomicAdd(&tieList[0], 1u); atomicStore(&tieList[1u + k], a); return; } }
}`,Hr=`
@group(0) @binding(0) var<uniform> zp: vec4<u32>;
@group(0) @binding(1) var<storage, read> a: array<u32>;
@group(0) @binding(2) var<storage, read> b: array<u32>;
@group(0) @binding(3) var<storage, read_write> o: array<vec2<u32>>;
@compute @workgroup_size(256) fn zip(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); if (g.x < zp.x) { o[g.x] = vec2<u32>(a[g.x], b[g.x]); } }`,Fr=`
@group(0) @binding(0) var<uniform> dp: vec4<u32>;
@group(0) @binding(1) var<storage, read> pcd: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read_write> dirOut: array<vec4<i32>>;
@compute @workgroup_size(256) fn dirs(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); if (g.x < dp.x) { dirOut[g.x] = pcd[g.x * 2u + 1u]; } }`,$r=`
@group(0) @binding(0) var<uniform> ep: vec4<u32>;   // segments, polygons
@group(0) @binding(1) var<storage, read> pts: array<vec2<i32>>;
@group(0) @binding(2) var<storage, read> polyIn: array<vec4<u32>>;   // first, count, layer start, layer end
@group(0) @binding(3) var<storage, read> polyLayerIn: array<u32>;
@group(0) @binding(4) var<storage, read_write> segOut: array<vec4<i32>>;
@group(0) @binding(5) var<storage, read_write> infoOut: array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> segPolyOut: array<u32>;
@compute @workgroup_size(256) fn expand(@builtin(global_invocation_id) g_raw: vec3<u32>) { let i = g_raw.x + g_raw.y * 16776960u; if (i >= ep.x || ep.y == 0u) { return; }
  var lo = 0u; var hi = ep.y;
  for (var step = 0u; step < 32u; step++) { if (hi - lo <= 1u) { break; } let mid = (lo + hi) / 2u; if (polyIn[mid].x <= i) { lo = mid; } else { hi = mid; } }
  let first = polyIn[lo].x; let count = polyIn[lo].y; let next = first + (i - first + 1u) % count; let prev = first + (i - first + count - 1u) % count;
  let a = pts[i]; let b = pts[next];
  segOut[i] = vec4<i32>(a.x, a.y, b.x, b.y);
  var flag = 0u; if (i == first) { flag = 1u; }
  infoOut[i] = vec4<u32>(polyLayerIn[lo], prev, next, flag);
  segPolyOut[i] = lo; }`,jr=`
@group(0) @binding(0) var<uniform> dp: vec4<u32>;
@group(0) @binding(1) var<storage, read> pcd: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read> succIn: array<u32>;
@group(0) @binding(3) var<storage, read> pvIn: array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> compactOut: array<vec4<i32>>;
@compute @workgroup_size(256) fn compact(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = g_raw.x + g_raw.y * 16776960u; if (g < dp.x) { let c = pcd[g * 2u]; compactOut[g] = vec4<i32>(c.x, c.y, bitcast<i32>(succIn[g]), bitcast<i32>(pvIn[g].z)); } }`,Wr=`
@group(0) @binding(0) var<uniform> gu: vec4<u32>;   // x: index into src, y: use src (1) or the constant z
@group(0) @binding(1) var<storage, read> bad: array<u32>;
@group(0) @binding(2) var<storage, read> src: array<u32>;
@group(0) @binding(3) var<storage, read_write> dst: array<u32>;
// a count for a later kernel's uniform, zero once any range check has failed: every later loop is bounded by that count
@compute @workgroup_size(1) fn gate() { var v = gu.z; if (gu.y == 1u) { v = src[gu.x]; } if (bad[0] != 0u) { v = 0u; } dst[0] = v; }`,Ur=`
@group(0) @binding(0) var<uniform> au: vec4<u32>;   // x: workgroup size
@group(0) @binding(1) var<storage, read> cnt: array<u32>;
@group(0) @binding(2) var<storage, read_write> args: array<u32>;
@compute @workgroup_size(1) fn argsK() { let groups = max(1u, (cnt[0] + au.x - 1u) / au.x); args[0] = min(groups, 65535u); args[1] = (groups + 65534u) / 65535u; args[2] = 1u; }`,Yr=`
@group(0) @binding(0) var<uniform> pu: vec4<u32>;
@group(0) @binding(1) var<storage, read> polyInfo: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read> polyW: array<i32>;
@group(0) @binding(3) var<storage, read_write> polyInfoW: array<vec4<i32>>;
@compute @workgroup_size(256) fn polyWK(@builtin(global_invocation_id) g_raw: vec3<u32>) { let g = vec3<u32>(g_raw.x + g_raw.y * 16776960u, 0u, 0u); let p = g.x; if (p >= pu.x) { return; } let q = polyInfo[p]; polyInfoW[p] = vec4<i32>(i32(q.x), i32(q.y), polyW[p], 0); }`;var pe={MAP_READ:1,COPY_SRC:4,COPY_DST:8,UNIFORM:64,STORAGE:128},zt=4,It=1,Kr=256,lr=65535,Jr=2e6,Vr=2147483647,Xr=-2147483648,Zr=r=>2**Math.ceil(Math.log2(Math.max(2,r)));async function Qr(r){let e={u:"uniform",r:"read-only-storage",w:"storage"},o=new Map,t=new Map,d=new Map,a=new Map,x=null,n=[],y=b=>(o.has(b)||o.set(b,r.createBindGroupLayout({entries:[...b].map((p,s)=>({binding:s,visibility:zt,buffer:{type:e[p]}}))})),o.get(b)),h=(b,p,s)=>{let w=`${p}\0${s}\0${b}`;return d.has(w)||(t.has(b)||t.set(b,r.createShaderModule({code:b})),d.set(w,r.createComputePipeline({layout:r.createPipelineLayout({bindGroupLayouts:[y(s)]}),compute:{module:t.get(b),entryPoint:p}}))),d.get(w)};for(let b of[We,Ue,Ne,ur,Ye,ye,Ie,ir,Ke,sr,cr,Le]){let p=r.createShaderModule({code:b});t.set(b,p);let s=(await p.getCompilationInfo()).messages.find(w=>w.type==="error");if(s)throw new Error(`contour front shader: line ${s.lineNum}: ${s.message}`)}let i=(b,p)=>{let s=Math.max(16,Math.ceil(p/16)*16),w=a.get(b);if(w&&w.size>=s)return w;w&&n.push(w);let I=r.createBuffer({size:s,usage:pe.STORAGE|pe.COPY_SRC|pe.COPY_DST});return a.set(b,I),I},S=()=>(x||(x=r.createCommandEncoder()),x),P=b=>{let p=r.createBuffer({size:Math.max(16,b.length*4),usage:pe.UNIFORM|pe.COPY_DST});return r.queue.writeBuffer(p,0,new Uint32Array(b)),n.push(p),p},f=r.createBuffer({size:16,usage:pe.UNIFORM|pe.COPY_DST});r.queue.writeBuffer(f,0,new Uint32Array(4));let m=(b,p,s,w,I)=>{if(I<=0)return;let O=Math.ceil(I/Kr),H=1;O>lr&&(H=Math.ceil(O/lr),O=lr);let C=r.createBindGroup({layout:y(s),entries:w.map((u,_)=>({binding:_,resource:{buffer:u}}))}),c=S().beginComputePass();c.setPipeline(h(b,p,s)),c.setBindGroup(0,C),c.dispatchWorkgroups(O,H),c.end()},A=(b,p)=>S().clearBuffer(b,0,Math.ceil(p/4)*4),J=(b,p,s,w,I)=>S().copyBufferToBuffer(b,p,s,w,I),L=async()=>{x&&(r.queue.submit([x.finish()]),x=null),await r.queue.onSubmittedWorkDone();for(let b of n)b.destroy();n=[]},q=async(b,p,s=0,w=Uint32Array)=>{let I=Math.max(4,p*4),O=r.createBuffer({size:Math.ceil(I/16)*16,usage:pe.MAP_READ|pe.COPY_DST});S().copyBufferToBuffer(b,s*4,O,0,Math.ceil(I/4)*4),await L(),await O.mapAsync(It);let H=new w(O.getMappedRange(0,p*4).slice(0));return O.unmap(),O.destroy(),H},R=(b,p,s=0)=>{let w=Math.ceil(p/Kr),I=i(`scan.${s}`,(w+1)*4),O=P([p,0,0,0]);m(Le,"scanBlock","uww",[O,b,I],p),w!==1&&(R(I,w,s+1),m(Le,"addOff","uww",[O,b,I],p))};async function G(b,p){let s=b.length/9,w=p.length,I=new Float32Array(w*2);for(let V=0;V<w;V++){let be=Math.fround(p[V]);I[V*2]=be,I[V*2+1]=Math.fround(p[V]-be)}let O=i("triangles",b.byteLength),H=i("planes",I.byteLength);r.queue.writeBuffer(O,0,b),r.queue.writeBuffer(H,0,I);let C=i("counts",(s+1)*4);A(C,(s+1)*4);let c=[1,2,3].map(V=>i(`unused${V}`,16));m(We,"main","urrwwwwu",[P([s,w,0,0]),O,H,C,...c,f],s),R(C,s+1);let[u]=await q(C,1,s),_=i("segmentPoints",u*16),l=i("segmentKeys",u*16),v=i("segmentLayer",u*4);m(We,"main","urrwwwwu",[P([s,w,1,0]),O,H,C,_,l,v,f],s);let k=Zr(u*2),T=k-1,W=i("dead",u*4),$=i("owner",k*4),Z=i("headA",k*4),D=i("headB",k*4),Y=i("nextA",u*4),de=i("nextB",u*4);A(W,u*4),A($,k*4),A(Z,k*4),A(D,k*4);let Ae=[P([u,T,0,0]),_,v,$,Z,D,Y,W];m(Ue,"insert","urrwwwww",Ae,u),m(Ue,"pair","urrwwwww",Ae,k),A($,k*4),A(Z,k*4),A(D,k*4);let E=i("successor",(u+2)*4);A(E,(u+2)*4);let N=[P([u,T,0,0]),l,v,W,$,Z,D,Y,de,E];return m(Ne,"insertStarts","urrrwwwwww",N,u),m(Ne,"insertEnds","urrrwwwwww",N,u),m(Ne,"pairEnds","urrrwwwwww",N,k),{layerCount:w,segmentCount:u,segmentPoints:_,segmentLayer:v,successor:E,dead:W}}async function M(b){let{layerCount:p,segmentCount:s,segmentPoints:w,segmentLayer:I,successor:O,dead:H}=b,C=Math.ceil(Math.log2(Math.max(2,s)))+1,c=i("valueA",s*4),u=i("nextOfA",s*4),_=i("valueB",s*4),l=i("nextOfB",s*4),v=i("label",s*4),k=i("rank",s*4),T=i("reach",s*4),W=(z,j,ne)=>m(ur,"main","urrwwwwrr",[P([s,z,0,0]),O,H,j[0],j[1],ne[0],ne[1],v,T],s),$=(z,j,ne)=>{let Q=[c,u],le=[_,l];for(let fe=0;fe<C;fe++)W(z,Q,le),[Q,le]=[le,Q];J(Q[0],0,j,0,s*4),ne&&J(Q[1],0,ne,0,s*4)};W(0,[_,l],[c,u]),$(1,v,T);let Z=i("hit",s*4);A(Z,s*4),m(Ye,"main","uww",[P([s,0,0,0]),T,Z],s),m(Ye,"main","uww",[P([s,1,0,0]),T,Z],s);let D=i("openLayer",p*4);A(D,p*4),m(cr,"main","urrrw",[P([s,0,0,0]),H,T,I,D],s),W(2,[_,l],[c,u]),$(3,k);let Y=i("headFlag",(s+1)*4);A(Y,(s+1)*4);let de=(z,j,ne,Q,le)=>[z,O,v,k,I,Y,j,ne,Q,le,T],Ae=[4,5,6,7].map(z=>i(`unused${z}`,16));m(ye,"flagHeads","urrrrwwwwwr",de(P([s,0,p,0]),...Ae),s),R(Y,s+1);let[E]=await q(Y,1,s),N=Zr(E),V=i("heads",N*8),be=i("polygonOf",s*4),U=i("loopStart",(E+1)*4),ie=i("order",(s+E)*4),te=z=>de(z,V,be,U,ie);m(ye,"gatherHeads","urrrrwwwwwr",te(P([s,N,p,0])),s),m(ye,"padHeads","urrrrwwwwwr",te(P([s,N,p,E])),N-E);for(let z=2;z<=N;z*=2)for(let j=z/2;j>=1;j/=2)m(ye,"bitonic","urrrrwwwwwr",te(P([s,N,j,z])),N);A(U,(E+1)*4),m(ye,"lengths","urrrrwwwwwr",te(P([s,N,p,E])),E),R(U,E+1);let[B]=await q(U,1,E);m(ye,"place","urrrrwwwwwr",te(P([s,N,p,E])),s);let X=i("kept",(B+1)*4),Oe=i("polygonKept",(E+1)*4),K=i("layerBox",p*32),ee=i("slotPolygon",B*4),ae=new Int32Array(p*8);for(let z=0;z<p;z++)ae.set([Vr,Vr,Xr,Xr],z*8);r.queue.writeBuffer(K,0,ae),A(X,(B+1)*4);let _e=[P([B,E,p,0]),ie,w,I,O,U,X,Oe,K,ee];m(Ie,"slotPolygons","urrrrrwwww",_e,E),m(Ie,"keep","urrrrrwwww",_e,B),m(Ie,"polygonCounts","urrrrrwwww",_e,E),m(Ie,"keepValid","urrrrrwwww",_e,B);let se=i("polygonValidAt",(E+1)*4);A(se,(E+1)*4),J(Oe,0,se,0,E*4),R(se,E+1);let F=i("keptAt",(B+1)*4);A(F,(B+1)*4),J(X,0,F,0,B*4),R(F,B+1);let[Ce]=await q(F,1,B),[ge]=await q(se,1,E),xe=i("points",Ce*8),we=i("layerStart",(p+1)*4);A(we,(p+1)*4),m(ir,"main","urrrrrrww",[P([B,E,p,0]),ie,w,I,X,F,K,xe,we],B),R(we,p+1);let Ee=i("layerInfo",(p+1)*16),Pe=i("polygonInfo",ge*20+16),ce=[P([B,E,p,Jr]),K,we,Ee,se,U,F,ie,I,Pe];m(Ke,"cells","urwwrrrrrw",ce,1),m(Ke,"polygons","urwwrrrrrw",ce,E);let ze=i("entries",16);A(ze,16),m(sr,"main","urrw",[P([ge,Jr,0,0]),Pe,xe,ze],ge);let[Re]=await q(Ee,1,p*4),[Be]=await q(ze,1),he=await q(K,p*8,0,Int32Array),He=await q(D,p),Se=new Int32Array(p*2);for(let z=0;z<p;z++)he[z*8+2]<he[z*8]||(Se[z*2]=he[z*8],Se[z*2+1]=he[z*8+1]);return{layerCount:p,segmentCount:Ce,polygonCount:ge,cellCount:Re,cellEntryCount:Be,headCount:E,slotCount:B,origins:Se,openLayers:He,points:xe,layerInfo:Ee,polygonInfo:Pe}}return{cut:async(b,p)=>{let s=performance.now(),w=await G(b,p),[I]=await q(w.successor,1,w.segmentCount),O=await q(w.dead,w.segmentCount),H=0;for(let u of O)H+=u;let C=await M(w),c=C.slotCount-C.headCount;return{ms:performance.now()-s,triangleCount:b.length/9,rawSegments:w.segmentCount,cancelled:H,openSegments:w.segmentCount-H-c,matcherOverflow:I,origins:C.origins,openLayers:C.openLayers,input:{layerCount:C.layerCount,segmentCount:C.segmentCount,polygonCount:C.polygonCount,cellCount:C.cellCount,cellEntryCount:C.cellEntryCount,points:{gpuBuffer:C.points},layerInfo:{gpuBuffer:C.layerInfo},polyInfo:{gpuBuffer:C.polygonInfo},polyLayer:{gpuBuffer:C.polygonInfo,offset:C.polygonCount*16}}}},dispose:()=>{for(let b of a.values())b.destroy();a.clear();for(let b of n)b.destroy();n=[],f.destroy()}}}var g={MAP_READ:1,COPY_SRC:4,COPY_DST:8,UNIFORM:64,STORAGE:128,INDIRECT:256},Lt=4,Ot=1,et=2e6,rt=0,fr=256,pr=65535,tt=4096,Ct=1024,Rt=65536,at=65536,Bt=[1,3],nt=1<<30,ot=10;async function ut(r){if(!r)return null;let e=await r.requestAdapter();return!e||e.limits.maxStorageBuffersPerShaderStage<ot?null:e.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.min(e.limits.maxStorageBufferBindingSize,nt),maxBufferSize:Math.min(e.limits.maxBufferSize,nt),maxStorageBuffersPerShaderStage:ot}})}async function it(r){let e=async(c,u)=>{let _=r.createShaderModule({code:c}),v=(await _.getCompilationInfo()).messages.find(k=>k.type==="error");if(v)throw new Error(`contour GPU shader ${u}: line ${v.lineNum}: ${v.message}`);return _},o={u:"uniform",r:"read-only-storage",w:"storage"},t=c=>r.createBindGroupLayout({entries:[...c].map((u,_)=>({binding:_,visibility:Lt,buffer:{type:o[u]}}))}),d=(c,u,_)=>r.createComputePipeline({layout:r.createPipelineLayout({bindGroupLayouts:[u]}),compute:{module:c,entryPoint:_}}),a={expand:t("urrrwww"),bin:t("urrrwrw"),intersect:t("urrrrrwwrww"),sort:t("urrrrwr"),link:t("urrwrwwww"),scan:t("uww"),check:t("urw"),glue:t("urrrurrrww"),pieces:t("urrrurrrrwww"),ties:t("urrw"),zip:t("urrw"),directions:t("urw"),compact:t("urrrw"),gate:t("urrw"),args:t("urw"),polygonWinding:t("urrw")},x={expand:await e($r,"expand"),bin:await e(Rr,"bin"),intersect:await e(Br,"intersect"),sort:await e(Tr,"sort"),link:await e(Mr,"link"),scan:await e(Le,"scan"),check:await e(Nr,"check"),glue:await e(Dr,"glue"),pieces:await e(qr,"pieces"),ties:await e(Gr,"ties"),zip:await e(Hr,"zip"),directions:await e(Fr,"directions"),compact:await e(jr,"compact"),gate:await e(Wr,"gate"),args:await e(Ur,"args"),polygonWinding:await e(Yr,"polygon winding")},n={expand:d(x.expand,a.expand,"expand"),cellCount:d(x.bin,a.bin,"count"),cellScatter:d(x.bin,a.bin,"scatter"),intersect:d(x.intersect,a.intersect,"intersect"),sortEvents:d(x.sort,a.sort,"sortEvents"),vertexCount:d(x.link,a.link,"vcountK"),vertexScatter:d(x.link,a.link,"vscatter"),successor:d(x.link,a.link,"successor"),scanBlock:d(x.scan,a.scan,"scanBlock"),scanAddOffsets:d(x.scan,a.scan,"addOff"),checkRanges:d(x.check,a.check,"check"),rays:d(x.glue,a.glue,"rays"),deltaSums:d(x.glue,a.glue,"deltaSums"),pieces:d(x.pieces,a.pieces,"pieces"),ties:d(x.ties,a.ties,"ties"),zip:d(x.zip,a.zip,"zip"),directions:d(x.directions,a.directions,"dirs"),compact:d(x.compact,a.compact,"compact"),gate:d(x.gate,a.gate,"gate"),dispatchArguments:d(x.args,a.args,"argsK"),polygonWinding:d(x.polygonWinding,a.polygonWinding,"polyWK")},y=new Map,h=[],i=[],S=null,P=c=>{let u=r.createBuffer({size:16,usage:c});return i.push(u),u},f=(c,u)=>{let _=Math.max(Rt,2**Math.ceil(Math.log2(Math.max(16,c)))),l=`${_}:${u}`,v=y.get(l)?.pop();return v||(v=r.createBuffer({size:_,usage:u|g.COPY_DST})),h.push([l,v]),v},m=()=>{for(let[c,u]of h)y.has(c)||y.set(c,[]),y.get(c).push(u);for(let c of i)c.destroy?.();h=[],i=[]},A=()=>(S||(S=r.createCommandEncoder()),S),J=(c,u)=>{let _=r.createBindGroup({layout:c,entries:u.map((l,v)=>({binding:v,resource:{buffer:l}}))});return i.push(_),_},L=(c,u,_,l)=>{let v=Math.ceil(l/fr),k=1;v>pr&&(k=Math.ceil(v/pr),v=pr);let T=A().beginComputePass();T.setPipeline(c),T.setBindGroup(0,J(u,_)),T.dispatchWorkgroups(v,k),T.end()},q=(c,u,_,l)=>{let v=A().beginComputePass();v.setPipeline(c),v.setBindGroup(0,J(u,_)),v.dispatchWorkgroupsIndirect(l,0),v.end()},R=c=>A().clearBuffer(c),G=(c,u,_,l,v)=>A().copyBufferToBuffer(c,u,_,l,v),M=c=>{let u=P(g.UNIFORM|g.COPY_DST);return r.queue.writeBuffer(u,0,new Uint32Array(c)),u},me=(c,u)=>{let _=Math.ceil(u/fr),l=M([u,0,0,0]),v=f(_*4+4,g.STORAGE);L(n.scanBlock,a.scan,[l,c,v],u),_!==1&&(me(v,_),L(n.scanAddOffsets,a.scan,[l,c,v],u))},Ge=(c,u,_,l)=>L(n.checkRanges,a.check,[M([u,_,0,0]),c,l],u),b=(c,u,_,l,v,k=0)=>{let T=f(16,g.STORAGE|g.COPY_SRC),W=1,$=u;return u||(W=0,$=f(16,g.STORAGE)),L(n.gate,a.gate,[M([_,W,k,0]),c,$,T],1),G(T,0,l,v*4,4),T},p=c=>{let u=f(16,g.STORAGE|g.INDIRECT);return L(n.dispatchArguments,a.args,[M([fr,0,0,0]),c,u],1),u},s=async()=>{S&&(r.queue.submit([S.finish()]),S=null),await r.queue.onSubmittedWorkDone()},w=async(c,u,_)=>{let l=Math.max(4,u*4),v=r.createBuffer({size:Math.ceil(l/16)*16,usage:g.MAP_READ|g.COPY_DST}),k=r.createCommandEncoder();k.copyBufferToBuffer(c,0,v,0,Math.ceil(l/4)*4),r.queue.submit([k.finish()]),await v.mapAsync(Ot);let T=_(new Uint32Array(v.getMappedRange(),0,u));return v.unmap(),v.destroy(),T},I=async(c,u,_)=>{let l=c.segmentCount,v=c.cellCount,k=c.polygonCount,T=c.layerCount,W=Math.max(1,c.cellEntryCount),$=Math.max(at,l*u),Z=Math.ceil($/2),D=l+$,Y=l+Z,de=2**Math.ceil(Math.log2(Math.max(D*32,$*32)));if(de>r.limits.maxStorageBufferBindingSize||de>r.limits.maxBufferSize)return{ok:!1,reason:`a ${de} byte buffer is over this device's limit`,overflow:!1};let Ae=performance.now(),E=M([l,v,et,0]),N=M([l,v,et,1]),V=f(l*8,g.STORAGE),be=f(k*4,g.STORAGE),U=f(T*16,g.STORAGE),ie=f(k*16,g.STORAGE),te=(oe,je,zr)=>{if(je.gpuBuffer){G(je.gpuBuffer,je.offset??0,oe,0,zr*4);return}r.queue.writeBuffer(oe,0,je,0,zr)};te(V,c.points,l*2),te(be,c.polyLayer,k),te(U,c.layerInfo,T*4),te(ie,c.polyInfo,k*4);let B=f(l*16,g.STORAGE),X=f(l*16,g.STORAGE),Oe=f(l*4,g.STORAGE),K=[0,1,2,3,4].map(()=>f(16,g.STORAGE)),ee=f(16,g.STORAGE|g.COPY_SRC);R(ee),L(n.expand,a.expand,[M([l,k,0,0]),V,ie,be,B,X,Oe],l);let ae=f((v+1)*4,g.STORAGE|g.COPY_SRC);R(ae),L(n.cellCount,a.bin,[E,B,X,U,ae,K[0],K[1]],l),me(ae,v+1),Ge(ae,v,tt,ee),b(ee,null,0,N,1,v),b(ee,null,0,E,1,v);let _e=f((v+1)*4,g.STORAGE),se=f(W*8,g.STORAGE);R(_e),L(n.cellScatter,a.bin,[E,B,X,U,_e,ae,se],l);let F=f((l+1)*4,g.STORAGE|g.COPY_SRC),Ce=f(16,g.STORAGE),ge=f(16,g.STORAGE|g.COPY_SRC);R(ge),R(Ce),R(F),L(n.intersect,a.intersect,[E,B,X,U,ae,se,F,K[0],K[2],Ce,K[1]],W),me(F,l+1),Ge(F,l,tt,ee);let xe=M([l,k,rt,0]),we=M([l,k,rt,1]),Ee=M([l,0,0,0]);for(let oe of[N,xe,we,Ee])b(ee,null,0,oe,0,l);let Pe=f((l+1)*4,g.STORAGE);R(Pe);let ce=f($*32,g.STORAGE),ze=f(Z*8,g.STORAGE);L(n.intersect,a.intersect,[N,B,X,U,ae,se,Pe,ce,F,ge,ze],W),L(n.sortEvents,a.sort,[N,B,X,U,F,ce,ze],l);let Re=f((at+1)*4,g.STORAGE|g.COPY_SRC);R(Re),L(n.ties,a.ties,[Ee,F,ce,Re],l);let Be=f((l+1)*4,g.STORAGE),he=f(k*4,g.STORAGE),He=[N,B,X,U,xe,F,ce,ie,Be,he];L(n.rays,a.glue,He,k),L(n.deltaSums,a.glue,He,l+1),me(Be,l+1);let Se=f(k*16,g.STORAGE);L(n.polygonWinding,a.polygonWinding,[M([k,0,0,0]),ie,he,Se],k);let z=f(l*8,g.STORAGE);L(n.zip,a.zip,[M([l,0,0,0]),Be,Oe,z],l);let j=f((l+1)*4,g.STORAGE|g.COPY_SRC);R(j);let ne=[N,B,X,U];L(n.pieces,a.pieces,[...ne,xe,F,ce,z,Se,j,K[3],K[4]],l),me(j,l+1);let Q=f(D*16,g.STORAGE),le=f(D*32,g.STORAGE);L(n.pieces,a.pieces,[...ne,we,F,ce,z,Se,j,Q,le],l);let fe=f(16,g.STORAGE|g.COPY_SRC);G(j,l*4,fe,0,4);let Qe=M([0,0,0,0]);G(fe,0,Qe,0,4);let er=p(fe),rr=f(D*16,g.STORAGE);q(n.directions,a.directions,[Qe,le,rr],er);let Fe=M([0,Y,0,0]);G(fe,0,Fe,0,4);let Te=f((Y+1)*4,g.STORAGE),tr=f((Y+1)*4,g.STORAGE|g.COPY_SRC),_r=f(D*4,g.STORAGE),ar=f(D*4,g.STORAGE),xr=f(D*8,g.STORAGE),wr=f(D*8,g.STORAGE);R(tr),R(Te),q(n.vertexCount,a.link,[Fe,Q,rr,Te,K[2],_r,ar,xr,wr],er),me(Te,Y+1),Ge(Te,Y,Ct,ee);let xt=b(ee,fe,0,Fe,0),hr=p(xt),Sr=[Fe,Q,rr,tr,Te,_r,ar,xr,wr];q(n.vertexScatter,a.link,Sr,hr),q(n.successor,a.link,Sr,hr);let kr=f(D*16,g.STORAGE|g.COPY_SRC);q(n.compact,a.compact,[Qe,le,ar,Q,kr],er);let ke=f(32,g.STORAGE|g.COPY_SRC);G(fe,0,ke,0,4),G(F,l*4,ke,4,4),G(ge,0,ke,8,4),G(Re,0,ke,12,4),G(ee,0,ke,16,4),G(tr,Y*4,ke,20,4),await s();let[$e,nr,Ar,wt,Er,Pr]=await w(ke,6,oe=>Array.from(oe)),or={pieceCount:$e,eventCount:nr,pairCount:Ar,tiedSegments:wt,eventsPerSegment:u};if(nr>$||Ar>Z)return m(),{ok:!1,overflow:!0,reason:`${nr} crossings over the ${$} the buffers held`,...or};if(Er>0||Pr>0||$e>D)return m(),{ok:!1,overflow:!1,reason:`the pipeline stopped itself: ${Er} ranges out of bounds, ${Pr} vertices over the degree limit`,...or};let ht=_($e);return await w(kr,$e*4,oe=>ht.set(new Int32Array(oe.buffer,oe.byteOffset,oe.length))),m(),{ok:!0,ms:performance.now()-Ae,...or}},O=async(c,u)=>{if(c.segmentCount===0||c.polygonCount===0)return u(0),{ok:!0,ms:0,pieceCount:0,eventCount:0,pairCount:0,tiedSegments:0};let _=null;for(let l of Bt)if(_=await I(c,l,u),_.ok||!_.overflow)return _;return _},H=await Qr(r);return{union:O,front:H,dispose:()=>{m();for(let c of y.values())for(let u of c)u.destroy();y.clear(),H.dispose()}}}var st=r=>typeof r?.contour_phase_mode=="function",Tt=r=>typeof r?.contour_mesh=="function";async function ct(r){return r.meshRoute!==!1&&r.contourGpu.front&&Tt(r.kernel)?Mt(r):Nt(r)}var Je=({kernel:r,stl:e,paramsText:o,onProgress:t},d)=>{r.contour_phase_mode(0);let a=r.slice(e,o,t);return a?.stats&&(a.stats.contour_engine="cpu",a.stats.contour_engine_reason=d),a},lt=({kernel:r,paramsText:e},o)=>(r.contour_phase_mode(0),o?.stats&&(o.stats.contour_engine="cpu",o.stats.contour_engine_reason="this slice has its own contour path",Number(JSON.parse(e).reuse_stages)>=2&&(o.stats.contour_engine="reused",delete o.stats.contour_engine_reason)),o),ft=({kernel:r,stl:e,paramsText:o,onProgress:t},d)=>{r.contour_phase_mode(d);try{return r.slice(e,o,t)}catch(a){throw r.contour_phase_mode(0),a}},pt=({kernel:r,stl:e,paramsText:o,onProgress:t},d)=>{let a;try{a=r.slice(e,o,t)}finally{r.contour_phase_mode(0)}return a?.stats&&Object.assign(a.stats,{contour_engine:"gpu"},d),a};async function Mt(r){let{kernel:e,contourGpu:o,canceled:t=()=>!1}=r,d=performance.now(),a=ft(r,3);if(!a?.captured)return lt(r,a);let x=performance.now()-d,n=performance.now(),y;try{let f=e.contour_mesh();y=await o.front.cut(f.tris,f.planes)}catch(f){y={failure:String(f?.message??f)}}if(t())return e.contour_phase_mode(0),{error:"canceled"};if(y.failure)return Je(r,y.failure);e.contour_origin_buffer(y.input.layerCount).set(y.origins),e.contour_open_layers().set(y.openLayers);let h;try{h=await o.union(y.input,f=>e.contour_result_buffer(f))}catch(f){h={ok:!1,reason:String(f?.message??f)}}if(t())return e.contour_phase_mode(0),{error:"canceled"};if(!h.ok)return Je(r,h.reason);let i=e.contour_assemble();if(i.unavailable)return Je(r,"a layer the GPU left open has no mesh to be rebuilt from");let S=performance.now()-n,P=0;for(let f of y.openLayers)P+=f;return pt(r,{contour_front:"gpu",contour_capture_ms:x,contour_front_ms:y.ms,contour_gpu_ms:S,contour_fallback_layers:i.fallbackLayers,contour_open_layers:P,contour_pieces:h.pieceCount,contour_crossings:h.eventCount})}async function Nt(r){let{kernel:e,contourGpu:o,canceled:t=()=>!1}=r,d=performance.now(),a=ft(r,1);if(!a?.captured)return lt(r,a);let x=performance.now()-d,n=performance.now(),y;try{y=await o.union(e.contour_gpu_input(),S=>e.contour_result_buffer(S))}catch(S){y={ok:!1,reason:String(S?.message??S)}}if(t())return e.contour_phase_mode(0),{error:"canceled"};if(!y.ok)return Je(r,y.reason);let h=e.contour_assemble(),i=performance.now()-n;return pt(r,{contour_front:"cpu",contour_capture_ms:x,contour_gpu_ms:i,contour_fallback_layers:h.fallbackLayers,contour_pieces:y.pieceCount,contour_crossings:y.eventCount})}var dr=new Set(["smart","bucket","triangle"]);var yt=r=>typeof r=="string"?r:JSON.stringify(r??{}),vt=!1,qe=(r,...e)=>{vt||console[r](...e)},Ze=null,gr=async()=>{if(typeof crossOriginIsolated<"u"&&crossOriginIsolated)try{let o=await(await import("./c-FGVHCMLI.js")).default();return qe("info","[slicer.worker] core: mt (threads)"),Ze="mt",o}catch(o){qe("warn","[slicer.worker] mt load failed — falling back to st:",o)}let e=await(await import("./c-QYYMLA6Z.js")).default();return qe("info","[slicer.worker] core: st"),Ze="st",e},ue=null,ve=null,Dt=async()=>{if(ve!==null)return ve;try{let r=await ut(self.navigator?.gpu);if(!r)return ve=!1,ve;ve=await it(r),r.lost.then(()=>{ve=null})}catch(r){qe("warn","[slicer.worker] contour GPU unavailable:",r),ve=!1}return ve},qt=async(r,e,o)=>{let t=new Uint8Array(e.stl),d=yt(e.params);if(!e.gpu)return r.slice(t,d,o);let a=h=>{let i=r.slice(t,d,o);return i?.stats&&(i.stats.contour_engine="cpu",i.stats.contour_engine_reason=h),i};if(!st(r))return a("this kernel build has no contour phase");let x=await Dt();return x?ct({kernel:r,contourGpu:x,stl:t,paramsText:d,onProgress:o,canceled:()=>{let h=r.cancel_flag_view?.();return!!h&&h[0]!==0},meshRoute:Ze==="st"}):a("no WebGPU device")},mt=1,Gt=2,bt=16,Ht=r=>Number.isInteger(r)&&r>=mt&&r<=bt,Ve=new Float32Array(0),_t=r=>{for(let e of r)if(!Ht(e))throw new Error(`paint state must be an integer 1..${bt} (got ${JSON.stringify(e)})`);return r},br=(r,e)=>Array.isArray(r.states)?_t(r.states):e===null?null:[e],Ft=r=>r.state===void 0||r.state===null?null:(_t([r.state]),r.state),Xe=r=>r.cursor==="circle"?1:0,dt=r=>Number.isFinite(r.px)&&Number.isFinite(r.py)&&Number.isFinite(r.pz),yr={smart:0,bucket:1,triangle:2},gt=(r,e,o)=>{let t=Number.isFinite(e.angle)?e.angle:30;if(e.tool==="smart"){o===null?r.selector_seed_fill_erase(e.facet,e.hx,e.hy,e.hz,t):r.selector_seed_fill(e.facet,e.hx,e.hy,e.hz,t,o);return}let d=e.tool==="bucket",a=d?t:-1;o===null?r.selector_bucket_fill_erase(e.facet,e.hx,e.hy,e.hz,a,d):r.selector_bucket_fill(e.facet,e.hx,e.hy,e.hz,a,d,o)},vr=(r,e,o)=>{let t={type:"painted",enf:r.selector_painted_count(!0),blk:r.selector_painted_count(!1)},d=br(e,o);return d&&(t.counts=Object.fromEntries(d.map(a=>[a,r.selector_painted_count_state(a)]))),t},mr=Promise.resolve();self.onmessage=r=>(mr=mr.then(()=>$t(r)).catch(e=>qe("warn","[slicer.worker] message failed:",e)),mr);var $t=async r=>{let e=r.data,o=(t,d)=>{if(e?.requestId===void 0){self.postMessage(t,d);return}self.postMessage({...t,requestId:e.requestId},d)};e.quiet!==void 0&&(vt=!!e.quiet);try{if(e.cmd==="exportPaint"&&!ue){o({type:"paintExport",supported:!1,facets:[],hex:""});return}if(e.cmd==="slaJob"){let n=Ir(e.job);ue||(ue=gr());let y=await ue,h=(i,S)=>o({type:"progress",done:i,total:S});if(y.slice_sla_job){y.set_layer_sink((P,f,m,A,J)=>{let L=[];A?.buffer&&L.push(A.buffer),J?.buffer&&L.push(J.buffer),o({type:"layer",z:P,idx:f,gcode:"",paths:A,widths:J},L)});let i,S=performance.now();try{i=y.slice_sla_job(n,h)}finally{y.clear_layer_sink()}if(i?.error){o({type:"error",error:String(i.error)});return}o({type:"done",result:Me(i,performance.now()-S)});return}o({type:"error",code:"SLA_UNSUPPORTED_OBJECT_AWARE",error:"Object-aware SLA slicing requires WASM kernel support"});return}if(e.cmd==="sla"){let n=yt(e.params);ue||(ue=gr());let y=await ue,h=(m,A)=>o({type:"progress",done:m,total:A});if(y.slice_sla){y.set_layer_sink((J,L,q,R,G)=>{let M=[];R&&R.buffer&&M.push(R.buffer),G&&G.buffer&&M.push(G.buffer),o({type:"layer",z:J,idx:L,gcode:"",paths:R,widths:G},M)});let m,A=performance.now();try{m=y.slice_sla(new Uint8Array(e.stl),n,h)}finally{y.clear_layer_sink()}if(m&&m.error){o({type:"error",error:String(m.error)});return}o({type:"done",result:Me(m,performance.now()-A)});return}let{sliceSla:i}=await import("./c-DZGUMBNE.js"),S=JSON.parse(n);Lr(S);let P=performance.now(),f=i(new Uint8Array(e.stl),S,{onProgress:h,onLayer:m=>{let A=[];m.paths?.buffer&&A.push(m.paths.buffer),m.widths?.buffer&&A.push(m.widths.buffer),o({type:"layer",z:m.z,idx:m.idx,gcode:"",paths:m.paths,widths:m.widths},A)}});if(f&&f.error){o({type:"error",error:String(f.error)});return}o({type:"done",result:Me(f,performance.now()-P)});return}ue||(ue=gr());let t=await ue;if(e.cmd==="warmup"){o({type:"warm",kernel:Ze});return}if(e.cmd==="prepare"){let n=e.keepPaint?t.selector_reprepare(new Uint8Array(e.stl)):(t.selector_prepare(new Uint8Array(e.stl)),!1);o({type:"prepared",facets:t.selector_facet_count(),kept:n});return}if(e.cmd==="paint"){let n=Ft(e);if(dr.has(e.tool)){if(n===null)throw new Error(`a '${e.tool}' fill needs an explicit integer state`);gt(t,e,n)}else n===null?t.selector_paint(e.facet,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius,e.enforcer):dt(e)&&t.selector_paint_stroke?t.selector_paint_stroke(e.facet,e.px,e.py,e.pz,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius,n,Xe(e)):t.selector_paint_shape(e.facet,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius,n,Xe(e));o(vr(t,e,n));return}if(e.cmd==="erase"){dr.has(e.tool)?gt(t,e,null):dt(e)&&t.selector_erase_stroke?t.selector_erase_stroke(e.facet,e.px,e.py,e.pz,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius,Xe(e)):t.selector_erase_shape?t.selector_erase_shape(e.facet,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius,Xe(e)):t.selector_erase(e.facet,e.hx,e.hy,e.hz,e.cx,e.cy,e.cz,e.radius),o(vr(t,e,null));return}if(e.cmd==="importPaint"){let n=t.selector_import_paint?t.selector_import_paint(e.facets,e.hex??""):0,y=vr(t,e,null);y.applied=n,o(y);return}if(e.cmd==="exportPaint"){let n=t.selector_export_paint?t.selector_export_paint():null;o({type:"paintExport",supported:!!t.selector_export_paint,facets:n?.facets??[],hex:n?.hex??""});return}if(e.cmd==="clear"){t.selector_clear();let n={type:"painted",enf:0,blk:0},y=br(e,null);y&&(n.counts=Object.fromEntries(y.map(h=>[h,0]))),o(n);return}if(e.cmd==="overlay"){let n=br(e,null),y=n&&!n.includes(mt)&&!n.includes(Gt),h={type:"overlay",enf:y?Ve:t.selector_overlay(!0),blk:y?Ve:t.selector_overlay(!1)};n&&(h.overlays=Object.fromEntries(n.map(S=>[S,t.selector_overlay_state(S)])));let i=[h.enf,h.blk,...Object.values(h.overlays??{})].filter(S=>S?.buffer&&S.byteLength>0).map(S=>S.buffer);o(h,i);return}if(e.cmd==="fillPreview"){if(!t.selector_fill_preview){o({type:"fillPreview",supported:!1,tris:Ve});return}if(e.clear){t.selector_fill_preview_clear(),o({type:"fillPreview",supported:!0,tris:Ve});return}let n=Number.isFinite(e.angle)?e.angle:30,y=yr[e.tool]??yr.smart,h=t.selector_fill_preview(e.facet,e.hx,e.hy,e.hz,y===yr.triangle?-1:n,y);o({type:"fillPreview",supported:!0,tris:h},h?.buffer&&h.byteLength>0?[h.buffer]:[]);return}if(e.cmd==="paintMode"){if(Number.isFinite(e.overhangDeg)&&t.selector_set_overhang_limit&&t.selector_set_overhang_limit(e.overhangDeg),t.selector_set_clip_plane){let n=e.clipPlane;n?t.selector_set_clip_plane(n[0],n[1],n[2],n[3],!0):e.clipPlane===null&&t.selector_set_clip_plane(0,0,1,0,!1)}o({type:"paintMode",ok:!0});return}if(e.stall)return;if(!self.__supSabSent){self.__supSabSent=!0;try{let n=t.sup_progress_view&&t.sup_progress_view(),y=t.cancel_flag_view&&t.cancel_flag_view();n&&n.buffer instanceof SharedArrayBuffer&&o({type:"supsab",buf:n.buffer,ptr:n.byteOffset,cancelPtr:y?.byteOffset??0})}catch{}}let d=(n,y)=>o({type:"progress",done:n,total:y});t.set_layer_sink((n,y,h,i,S)=>{let P=[];i&&i.buffer&&P.push(i.buffer),S&&S.buffer&&P.push(S.buffer),o({type:"layer",z:n,idx:y,gcode:h,paths:i,widths:S},P)});let a,x=performance.now();try{a=await qt(t,e,d)}finally{t.clear_layer_sink()}if(a&&a.error){o({type:"error",error:String(a.error)});return}o({type:"done",result:Me(Or(a),performance.now()-x)})}catch(t){let d={type:"error",error:String(t&&t.message||t)};t?.code&&(d.code=t.code),o(d)}};
