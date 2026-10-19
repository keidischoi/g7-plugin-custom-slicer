/*! custom-slicer 0.1.58 — 🔪 슬라이서 불러오기 (전역) · AGPL-3.0-or-later
 *  - 슬라이서 화면(data-slc-app) · 다른 화면의 큰 창 · window.G7Slicer.mount 를 부를 때만 앱 · 엔진을 받음
 *  - 헤더 메뉴 「슬라이서」
 *  - 다른 확장의 받기 단추(data-wsl-send) 옆 「🖨️ 프린터로 보내기」 — 웹 슬라이서(custom-web_slicer)와 같은 작은 팝업을 이 플러그인이 맡음 (「↗ 자세히」로 큰 슬라이서)
 *  - window.G7Slicer = { version, mount(el, {files, compact}), popup({files}), ready() } — 출력 검사기의 「🔪 슬라이스」 탭이 씀 (코드를 가져가지 않고 이 주소로만) */
(function () {
  'use strict';
  // 0.1.11 사이트 언어 — 영어 사이트(g7_locale · <html lang>)면 영어 · 「」 는 “”
  var EN_T = {"슬라이서를 불러오지 못했어요.":"Could not load the slicer.","슬라이서를 받지 못했어요 — 연결을 확인해 주세요.":"Could not download the slicer — check your connection.","보내기 창을 불러오지 못했어요.":"Could not load the send window.","보내기 창을 받지 못했어요 — 연결을 확인해 주세요.":"Could not download the send window — check your connection.","슬라이서":"Slicer","」 은(는) 슬라이스할 수 있는 모델 파일(STL · 3MF · OBJ)이 아니에요.":"” is not a model file that can be sliced (STL · 3MF · OBJ).","파일을 넘기지 못했어요: ":"Could not hand over the file: ","이 파일":"this file","을(를) 내 프린터로 — 프린터 고르기 · 설정 · 슬라이스 · 보내기를 이 화면에서 (「↗ 자세히」: 판 배치 · 모든 설정)":" to my printer — pick a printer · settings · slice · send right here (“↗ More”: arrange · all settings)","🖨️ 프린터로 보내기":"🖨️ Send to printer","파일을 만드는 데 너무 오래 걸렸어요 — 다시 눌러 주세요.":"Making the file took too long — please press again.","<div class=\"slc-qbox\" role=\"dialog\" aria-modal=\"true\" aria-label=\"프린터로 보내기\"><div class=\"slc-qhd\"><span>🖨️ 프린터로 보내기</span><button type=\"button\" data-slc-x aria-label=\"닫기\">✕</button></div><div data-slc-mount><p class=\"slc-qwait\">📦 파일을 준비하는 중…</p></div></div>":"<div class=\"slc-qbox\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Send to printer\"><div class=\"slc-qhd\"><span>🖨️ Send to printer</span><button type=\"button\" data-slc-x aria-label=\"Close\">✕</button></div><div data-slc-mount><p class=\"slc-qwait\">📦 Preparing the file…</p></div></div>","<div class=\"slc-pop-box\" role=\"dialog\" aria-modal=\"true\" aria-label=\"슬라이서\"><div data-slc-mount><p class=\"slc-qwait\">🔪 슬라이서를 불러오는 중… (처음 한 번은 몇 MB 를 받아요)</p></div></div>":"<div class=\"slc-pop-box\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Slicer\"><div data-slc-mount><p class=\"slc-qwait\">🔪 Loading the slicer… (a few MB the first time)</p></div></div>"};
  function __T(s) { var l = ''; try { l = localStorage.getItem('g7_locale') || ''; } catch (e) {} l = l || document.documentElement.getAttribute('lang') || navigator.language || 'ko'; if (/^ko/i.test(l)) return s; var t = EN_T.hasOwnProperty(s) ? EN_T[s] : s; return t.replace(/「/g, '“').replace(/」/g, '”'); }
  if (window.__slcLoader) return;
  window.__slcLoader = true;
  var API = '/api/plugins/custom-slicer', V = '0.1.58', loading = null;
  function css() {
    if (document.getElementById('slc-css')) return;
    var l = document.createElement('link'); l.id = 'slc-css'; l.rel = 'stylesheet'; l.href = API + '/assets/app.css?v=' + V; document.head.appendChild(l);
  }
  /** 앱 모듈 (한 번만) → window.__slcApp */
  function ready() {
    css();
    if (window.__slcApp) return Promise.resolve(window.__slcApp);
    if (loading) return loading;
    loading = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.type = 'module'; s.src = API + '/assets/app.js?v=' + V;
      s.onload = function () { var n = 0; (function wait() { if (window.__slcApp) ok(window.__slcApp); else if (n++ < 100) setTimeout(wait, 50); else no(new Error(__T('슬라이서를 불러오지 못했어요.'))); })(); };
      s.onerror = function () { loading = null; no(new Error(__T('슬라이서를 받지 못했어요 — 연결을 확인해 주세요.'))); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function app() { if (document.querySelector('[data-slc-app]')) ready().then(function (a) { a.tick(); }, function () {}); }
  app();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app);
  addEventListener('popstate', function () { setTimeout(app, 40); });
  try { new MutationObserver(function () { if (document.querySelector('[data-slc-app]')) app(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  function errHtml(e) { return '<p class="slc-perr">⚠️ ' + String((e && e.message) || e).replace(/</g, '&lt;') + '</p>'; }
  /** 🖨️ 빠른 보내기 팝업 — 예전 웹 슬라이서와 같은 작은 창 (프린터 → 설정 → 슬라이스하고 보내기) · 「↗ 자세히」로 큰 슬라이서 */
  var quickLoading = null;
  function quickReady() {
    css();
    if (window.__slcQuick) return Promise.resolve(window.__slcQuick);
    if (quickLoading) return quickLoading;
    quickLoading = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.type = 'module'; s.src = API + '/assets/quick.js?v=' + V;
      s.onload = function () { var n = 0; (function wait() { if (window.__slcQuick) ok(window.__slcQuick); else if (n++ < 100) setTimeout(wait, 50); else no(new Error(__T('보내기 창을 불러오지 못했어요.'))); })(); };
      s.onerror = function () { quickLoading = null; no(new Error(__T('보내기 창을 받지 못했어요 — 연결을 확인해 주세요.'))); };
      document.head.appendChild(s);
    });
    return quickLoading;
  }
  function popup(opts) {
    css();
    var old = document.querySelector('[data-slc-pop]'); if (old) old.remove();
    var ov = document.createElement('div'); ov.className = 'slc-qpop'; ov.setAttribute('data-slc-pop', '1');
    ov.innerHTML = __T('<div class="slc-qbox" role="dialog" aria-modal="true" aria-label="프린터로 보내기"><div class="slc-qhd"><span>🖨️ 프린터로 보내기</span><button type="button" data-slc-x aria-label="닫기">✕</button></div><div data-slc-mount><p class="slc-qwait">📦 파일을 준비하는 중…</p></div></div>');
    var el = ov.querySelector('[data-slc-mount]'), onKey = function (e) { if (e.key === 'Escape') close(); };
    function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
    ov.querySelector('[data-slc-x]').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    quickReady().then(function (Q) { if (ov.isConnected) Q.open(el, { files: opts && opts.files, printer: (opts && opts.printer) || null, close: close, big: big }); }, function (e) { el.innerHTML = errHtml(e); });
    return { close: close };
  }
  /** 🔪 큰 슬라이서 창 — 전체 슬라이서(판 배치 · 설정 · 미리 보기)를 이 화면 위에 · 크기 단추(보통 · 크게 · 전체 화면) */
  var SIZES = ['m', 'l', 'full'], LS_SIZE = 'slc-pop-size';
  function big(opts) {
    css();
    var old = document.querySelector('[data-slc-pop]'); if (old) old.remove();
    var size = 'l'; try { size = localStorage.getItem(LS_SIZE) || 'l'; } catch (e) {}
    if (SIZES.indexOf(size) < 0 || size === 'full') size = 'l';
    var ov = document.createElement('div'); ov.className = 'slc-pop slc-pop--' + size; ov.setAttribute('data-slc-pop', '1');
    ov.innerHTML = __T('<div class="slc-pop-box" role="dialog" aria-modal="true" aria-label="슬라이서"><div data-slc-mount><p class="slc-qwait">🔪 슬라이서를 불러오는 중… (처음 한 번은 몇 MB 를 받아요)</p></div></div>');
    var el = ov.querySelector('[data-slc-mount]'), onKey = function (e) { if (e.key === 'Escape' && !document.querySelector('.slc-modal') && !document.fullscreenElement) close(); };
    function close() { document.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); try { if (document.fullscreenElement === ov) document.exitFullscreen(); } catch (e) {} ov.remove(); }
    function onFs() { if (!document.fullscreenElement && size === 'full') setSize('l', true); }
    /** 크기 — m: 가운데 창 · l: 화면 가장자리까지 · full: 브라우저 전체 화면 */
    function setSize(s, quiet) {
      if (SIZES.indexOf(s) < 0) return size;
      size = s; ov.className = 'slc-pop slc-pop--' + s;
      if (s === 'full') { try { if (ov.requestFullscreen && !document.fullscreenElement) ov.requestFullscreen().catch(function () {}); } catch (e) {} }
      else { try { if (!quiet && document.fullscreenElement === ov) document.exitFullscreen(); } catch (e) {} try { localStorage.setItem(LS_SIZE, s); } catch (e) {} }
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
      return size;
    }
    document.addEventListener('keydown', onKey); document.addEventListener('fullscreenchange', onFs);
    document.body.appendChild(ov);
    Promise.all([Promise.resolve(opts && opts.files), ready()]).then(function (x) { if (!ov.isConnected) return; el.innerHTML = ''; x[1].mount(el, { files: x[0] || [], popup: { close: close, size: setSize, current: function () { return size; } }, printer: (opts && opts.printer) || null }); })
      .catch(function (e) { el.innerHTML = errHtml(e); });
    return { close: close, size: setSize };
  }
  window.G7Slicer = {
    version: V,
    ready: ready,
    /** el 안에 슬라이서 — opts.files: File[] (STL · 3MF · OBJ · ZIP), opts.compact: 다른 화면의 탭 안 (단축키 끔 · 높이 맞춤), opts.printer: {brand, model, name} */
    mount: function (el, opts) { return ready().then(function (a) { return a.mount(el, opts || {}); }); },
    setPrinter: function (el, p) { var a = window.__slcApp; return !!(a && a.setPrinter && a.setPrinter(el, p)); },   // 0.1.10 붙인 슬라이서의 프린터만 바꿈
    /** 🖨️ 빠른 보내기 팝업 (작은 창) — opts.files: File[] 또는 그 Promise, opts.printer */
    popup: popup,
    /** 🔪 큰 슬라이서 창 (크기 단추) */
    big: big,
    /** 팝업의 「↗ 출력 검사기에서」가 남긴 파일 · 프린터 — 한 번만 꺼냄 (5분 지나면 버림) */
    takeCarry: function () { var c = window.__slcCarry; window.__slcCarry = null; return c && Date.now() - (c.at || 0) < 300000 ? c : null; },
  };
  // 0.1.1 먼저 그려진 화면(출력 검사기의 「슬라이스」 탭 · 단추)이 알 수 있게
  try { window.dispatchEvent(new Event('g7slicer:ready')); } catch (e) {}

  // 헤더 메인 메뉴 「슬라이서」 (#slc-nav · #slc-nav-mobile) — 설정은 화면 HTML 에 같이 실려 옴: G7Config.appConfig.cextNav["custom-slicer"].cfg
  var NAV_ID = 'slc-nav', NAV_MOB = 'slc-nav-mobile', NAV_PATH = '/print-slicer', NAV_LABEL = __T('슬라이서');
  var NAV_BASE = 'px-3 py-2 text-sm font-medium whitespace-nowrap cursor-pointer rounded-lg transition-colors';
  var NAV_ON = NAV_BASE + ' bg-gray-900 text-white dark:bg-white dark:text-gray-900';
  var NAV_OFF = NAV_BASE + ' text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800';
  var DRAWER_BTN = 'w-full flex items-center justify-start gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer';
  function navCfg() { try { var n = window.G7Config && window.G7Config.appConfig && window.G7Config.appConfig.cextNav; return (n && n['custom-slicer'] && n['custom-slicer'].cfg) || {}; } catch (e) { return {}; } }
  function navGo(p) {
    try { if (window.G7Core && typeof G7Core.dispatch === 'function') { G7Core.dispatch({ handler: 'navigate', params: { path: p } }); return; } } catch (e) {}
    location.href = p;
  }
  function nav() {
    var c = navCfg(), on = c.enabled !== false && c.menu_enabled !== false, label = __T(c.menu_label || NAV_LABEL), p = c.path || NAV_PATH;   // 0.1.11 영어 사이트면 Slicer
    var here = location.pathname === p || location.pathname.indexOf(p + '/') === 0;
    var btn = document.getElementById(NAV_ID), mob = document.getElementById(NAV_MOB);
    if (!on) { if (btn) btn.remove(); if (mob) mob.remove(); return; }
    var home = document.querySelector('[data-testid="nav-home"]'), row = home && home.parentNode;
    if (row) {
      if (!btn) { btn = document.createElement('button'); btn.id = NAV_ID; btn.type = 'button'; btn.setAttribute('data-testid', 'nav-slicer'); btn.addEventListener('click', function (e) { e.preventDefault(); navGo(p); }); }
      if (btn.textContent !== label) btn.textContent = label;
      var cls = here ? NAV_ON : NAV_OFF; if (btn.className !== cls) btn.className = cls;
      if (btn.parentNode !== row) row.appendChild(btn);
    }
    var drawer = document.querySelector('div[class*="inset-y-0"][class*="right-0"][class*="w-80"]');
    if (!drawer || (mob && drawer.contains(mob))) { if (mob) { var l0 = mob.querySelector('[data-slc-label]'); if (l0 && l0.textContent !== label) l0.textContent = label; } return; }
    var btns = Array.prototype.filter.call(drawer.querySelectorAll('button[class*="px-3 py-2.5"][class*="w-full"]'), function (b) { return !(b.closest && b.closest('[id$="-nav-mobile"]')); });
    if (!btns.length) return;
    var section = btns[btns.length - 1].parentNode;
    if (!section || !section.parentNode) return;
    if (!mob) {
      mob = document.createElement('div'); mob.id = NAV_MOB; mob.className = 'px-4 py-4 border-b border-gray-200 dark:border-gray-700';
      var b = document.createElement('button'); b.type = 'button'; b.className = DRAWER_BTN; b.setAttribute('data-testid', 'mobile-nav-slicer');
      var s = document.createElement('span'); s.setAttribute('data-slc-label', '1'); s.textContent = label; b.appendChild(s); mob.appendChild(b);
      b.addEventListener('click', function () { try { G7Core.state.set({ mobileMenuOpen: false }); } catch (e) {} navGo(p); });
    }
    section.parentNode.insertBefore(mob, section.nextSibling);
  }
  var navT = 0;
  function navSoon() { if (navT) return; navT = setTimeout(function () { navT = 0; try { nav(); } catch (e) {} }, 60); }
  navSoon();
  addEventListener('popstate', navSoon);
  try { new MutationObserver(navSoon).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  /* ───────── 「🖨️ 프린터로 보내기」 — 다른 확장(출력 검사기 · 맞춤 3D …)의 받기 단추에 data-wsl-send 가 붙어 있으면 옆에 단추
   *  웹 슬라이서의 「🖨️ 프린터로 보내기」와 같은 표시(data-wsl-send)를 그대로 받아 대신함 — 둘 다 켜져 있어도 단추는 하나 (data-wsl-sent 를 먼저 붙임)
   *  누르면 작은 팝업을 열고 → 그 받기 단추를 대신 눌러 → 만든 파일(Blob → <a download>.click)을 내려받지 않고 팝업으로 (서버로는 안 감) */
  var MODEL = /\.(stl|3mf|obj|amf|ply|zip)$/i;
  var armed = null, blobs = {};
  function disarm() { clearTimeout(armed && armed.t); armed = null; blobs = {}; }
  function take(a) {
    if (!armed || !a || !a.hasAttribute || !a.hasAttribute('download')) return false;
    var href = a.href || '', o = armed, b = blobs[href], name = a.getAttribute('download') || 'model.stl';
    var get = b ? Promise.resolve(b) : /^(data:|blob:)/.test(href) || (href.indexOf(location.origin + '/') === 0) ? fetch(href, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }) : null;
    if (!get) return false;
    disarm(); a.setAttribute('data-cls-taken', '1');   // 부른 쪽이 「저장했어요」 알림을 안 띄우게 (웹저장소 연결과 같은 표시)
    if (!MODEL.test(name)) { o.no(new Error(__T('「') + name + __T('」 은(는) 슬라이스할 수 있는 모델 파일(STL · 3MF · OBJ)이 아니에요.'))); return true; }
    get.then(function (bl) { o.ok([new File([bl], name, { type: bl.type || '' })]); }, function (e) { o.no(new Error(__T('파일을 넘기지 못했어요: ') + ((e && e.message) || e))); });
    return true;
  }
  (function hook() {
    try {
      if (!window.URL || !URL.createObjectURL || URL.createObjectURL.__slc) return;
      var orig = URL.createObjectURL, w = function (o) { var u = orig.apply(this, arguments); try { if (armed && o instanceof Blob) blobs[u] = o; } catch (e) {} return u; };
      w.__slc = 1; if (orig.__cls) w.__cls = orig.__cls; if (orig.__wsl) w.__wsl = orig.__wsl; URL.createObjectURL = w;
      var click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { try { if (armed && take(this)) return; } catch (e) {} return click.apply(this, arguments); };
      document.addEventListener('click', function (e) { try { if (!armed) return; var a = e.target && e.target.closest && e.target.closest('a[download]'); if (a && take(a)) { e.preventDefault(); e.stopPropagation(); } } catch (er) {} }, true);
    } catch (e) {}
  })();
  function sendButtons() {
    var c = navCfg(); if (c.enabled === false) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-wsl-send]:not([data-wsl-sent])'), function (src) {
      src.setAttribute('data-wsl-sent', '1');   // 웹 슬라이서가 같은 자리에 단추를 또 달지 않게
      var b = document.createElement('button'); b.type = 'button'; b.className = (src.getAttribute('data-wsl-send-class') || src.className || '') + ' slc-send2';
      b.setAttribute('data-cls-skip', '1'); b.setAttribute('data-slc-btn', '1');
      b.title = (src.getAttribute('data-wsl-send') || __T('이 파일')) + __T('을(를) 내 프린터로 — 프린터 고르기 · 설정 · 슬라이스 · 보내기를 이 화면에서 (「↗ 자세히」: 판 배치 · 모든 설정)');
      b.textContent = __T('🖨️ 프린터로 보내기'); b.disabled = !!src.disabled; b.hidden = !!src.hidden;
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); if (src.disabled) return;
        disarm();
        var files = new Promise(function (ok, no) { armed = { ok: ok, no: no, t: setTimeout(function () { if (armed) { disarm(); no(new Error(__T('파일을 만드는 데 너무 오래 걸렸어요 — 다시 눌러 주세요.'))); } }, 60000) }; });
        popup({ files: files });
        src.click();
      });
      src.insertAdjacentElement('afterend', b);
      try { new MutationObserver(function () { b.disabled = !!src.disabled; b.hidden = !!src.hidden; }).observe(src, { attributes: true, attributeFilter: ['disabled', 'hidden'] }); } catch (er) {}
    });
  }
  var sendT = 0;
  function sendSoon() { if (sendT) return; sendT = setTimeout(function () { sendT = 0; try { sendButtons(); } catch (e) {} }, 30); }
  sendSoon();
  // 표시(data-wsl-send)를 단추를 그린 뒤에 붙이는 화면도 있어(출력 검사기) 속성 바뀜도 봄
  try { new MutationObserver(sendSoon).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wsl-send'] }); } catch (e) {}
})();
