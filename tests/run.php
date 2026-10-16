<?php

/**
 * 🔪 슬라이서 구조 검사 — Laravel 없이: php tests/run.php
 * 버전 · 경로 · 파일 내주기 규칙 · 빌드 결과 · 라이선스 표시
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$pass = 0;
$fail = 0;
function ok(bool $c, string $m): void
{
    global $pass, $fail;
    $c ? $pass++ : $fail++;
    echo ($c ? '  ok   ' : '  FAIL ').$m."\n";
}
$plugin = json_decode((string) file_get_contents($root.'/plugin.json'), true);
$ver = (string) ($plugin['version'] ?? '');
$composer = json_decode((string) file_get_contents($root.'/composer.json'), true);
$pkg = json_decode((string) file_get_contents($root.'/package.json'), true);
ok($plugin['identifier'] === 'custom-slicer' && $ver !== '' && ($composer['version'] ?? '') === $ver && ($pkg['version'] ?? '') === $ver, 'plugin.json · composer.json · package.json 버전 같음 ('.$ver.')');
ok(($plugin['license'] ?? '') === 'AGPL-3.0-or-later' && ($composer['license'] ?? '') === 'AGPL-3.0-or-later' && str_contains((string) file_get_contents($root.'/LICENSE'), 'GNU AFFERO GENERAL PUBLIC LICENSE'), 'AGPL 라이선스 표시 · LICENSE');
ok(str_contains((string) file_get_contents($root.'/CHANGELOG.md'), '## '.$ver), 'CHANGELOG 에 지금 버전');
$loader = (string) file_get_contents($root.'/resources/js/slicer.js');
ok($loader === (string) @file_get_contents($root.'/dist/js/plugin.iife.js') && str_contains($loader, "V = '".$ver."'") && str_contains($loader, 'custom-slicer '.$ver), '불러오기 스크립트 = 번들 · 버전');
ok(str_contains($loader, "querySelector('[data-slc-app]')") && str_contains($loader, "s.type = 'module'") && str_contains($loader, "NAV_PATH = '/print-slicer'"), '불러오기: 슬라이서 자리가 있을 때만 앱(모듈)을 받음 · 메뉴 주소');
$app = (string) file_get_contents($root.'/web/src/app.js');
ok(str_contains($app, "V = '".$ver."'") && str_contains($app, 'custom-slicer '.$ver), '앱 버전');
ok(str_contains($app, 'const SEND_ADMIN_ONLY = true') && str_contains($app, "API = '/api/plugins/custom-slicer'") && str_contains((string) file_get_contents($root.'/src/routes/api.php'), "Route::get('me'") && str_contains((string) file_get_contents($root.'/src/Http/Controllers/MeController.php'), 'isAdmin()'), '보내기는 시험하는 동안 관리자에게만 (me)');
$layout = json_decode((string) file_get_contents($root.'/resources/layouts/user/slicer.json'), true);
ok(($layout['layout_name'] ?? '') === 'slicer' && ($layout['slots']['content'][0]['props']['data-slc-app'] ?? '') === '1', '사용자 레이아웃 · 앱 자리');
$routes = (string) file_get_contents($root.'/src/routes/api.php');
ok(str_contains($routes, "Route::get('assets/{file}'") && str_contains($routes, '(js|css|json|wasm|txt)') && substr_count($routes, 'Route::get(') === 2, 'API: assets · me 만');
$asset = (string) file_get_contents($root.'/src/Http/Controllers/AssetController.php');
ok(str_contains($asset, "'/dist/web/'") && str_contains($asset, "str_contains(\$file, '..')"), '파일 내주기: dist/web 안만 · 경로 밖으로 못 나감');
$re = '/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(js|css|json|wasm|txt)$/';
ok(preg_match($re, 'c-EFFSTYQX.js') === 1 && preg_match($re, 'parse_3mf.worker.js') === 1 && preg_match($re, '../plugin.php') === 0 && preg_match($re, '.env') === 0 && preg_match($re, 'a/b.js') === 0, '파일 이름 규칙 (조각 · worker 는 됨, 경로 · 숨은 파일은 안 됨)');
$dist = $root.'/dist/web';
$files = is_dir($dist) ? scandir($dist) : [];
$need = ['app.js', 'quick.js', 'app.css', 'slicer.worker.js', 'parse_3mf.worker.js', 'sl1_encode.worker.js', 'sla_reconstruct.worker.js', 'sla_slice.worker.js', 'three-slicer-LICENSE.txt'];
ok(array_diff($need, $files) === [], '빌드 결과: 앱 · 빠른 보내기 팝업 · 엔진 worker · 뷰어 worker 4개 · 엔진 라이선스');
$bad = array_filter($files, static fn ($f) => $f !== '.' && $f !== '..' && preg_match($re, $f) !== 1);
ok($bad === [], '빌드 결과 파일 이름이 모두 내주기 규칙에 맞음'.($bad ? ' — '.implode(', ', $bad) : ''));
$appJs = '';
foreach ($files as $jf) {
    if (str_ends_with($jf, '.js')) {
        $appJs .= (string) @file_get_contents($dist.'/'.$jf);
    }
}
$okUrls = true;
foreach (['slicer.worker.js', 'parse_3mf.worker.js', 'sl1_encode.worker.js', 'sla_reconstruct.worker.js', 'sla_slice.worker.js'] as $w) {
    $okUrls = $okUrls && str_contains($appJs, 'new URL("./'.$w.'",import.meta.url)');
}
ok($okUrls && str_contains($appJs, $ver), '빌드된 앱 · 조각: worker 주소가 모두 옆 파일 (dist/web) · 버전');
ok(str_contains((string) file_get_contents($root.'/plugin.php'), 'RouteListener::class, MenuListener::class') && str_contains((string) file_get_contents($root.'/src/Listeners/RouteListener.php'), "'/print-slicer'") && str_contains((string) file_get_contents($root.'/src/Listeners/MenuListener.php'), "'/print-slicer'"), '화면 주소 /print-slicer · 메뉴 (웹 슬라이서 /slicer 와 겹치지 않음)');
foreach (['plugin.php', 'src/Listeners/RouteListener.php', 'src/Listeners/MenuListener.php', 'src/Http/Controllers/AssetController.php', 'src/Http/Controllers/MeController.php', 'src/routes/api.php'] as $f) {
    $o = [];
    $c = 0;
    exec('php -l '.escapeshellarg($root.'/'.$f).' 2>&1', $o, $c);
    ok($c === 0 && ! str_contains((string) file_get_contents($root.'/'.$f), 'WebSlicer'), 'PHP 문법 · 이름 '.$f);
}
$ac = (string) file_get_contents($root.'/src/Http/Controllers/AssetController.php');
ok(str_contains($ac, "\$hashed || \$fresh ? 'public, max-age=31536000, immutable' : 'no-cache'") && str_contains($ac, "\$fresh = \$v !== '' && \$v === self::version();"), '0.1.50 · 0.1.52 해시 조각 · 지금 판 번호(?v)만 길게 캐시 — worker · 옛 번호는 매번 확인');
echo "\n".($fail ? "FAIL $fail / " : 'OK ').($pass + $fail)."\n";
exit($fail ? 1 : 0);
