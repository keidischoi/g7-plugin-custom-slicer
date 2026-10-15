<?php

namespace Plugins\Custom\Slicer;

use App\Extension\AbstractPlugin;
use Plugins\Custom\Slicer\Listeners\MenuListener;
use Plugins\Custom\Slicer\Listeners\RouteListener;

/**
 * 🔪 슬라이서 (custom-slicer) — AGPL-3.0-or-later · 웹 슬라이서(custom-web_slicer)를 대신함
 *
 *  - 회원 브라우저에서 도는 전체 슬라이서: 판 배치 · 이동/회전/크기 · 칠하기(다색 · 서포트) · OrcaSlicer 설정 · 층별 G-code 미리 보기
 *    (서버로 모델을 올리지 않음 · 저장 안 함)
 *  - 엔진 · 화면: three-slicer (OrcaSlicer 를 WebAssembly 로 옮긴 것, AGPL) — 슬라이서를 열 때만 받음
 *  - 결과: Bambu 는 .gcode.3mf, 그 밖은 .gcode — 내려받기 또는 프린터 라운지(custom-my_printer)의 「출력 파일 보내기」로 바로 보냄
 *  - 화면: /print-slicer · 출력 검사기의 「🔪 슬라이스」 탭 · 다른 화면의 「🔪 슬라이스 · 보내기」 큰 창 (window.G7Slicer)
 *
 * 이 플러그인은 엔진과 함께 AGPL 로 공개 — 다른 확장과는 HTTP 주소로만 주고받음 (코드를 가져다 쓰지 않음).
 */
class Plugin extends AbstractPlugin
{
    public const IDENTIFIER = 'custom-slicer';

    public const USER_LAYOUT = 'custom-slicer.slicer';

    private static bool $autoload = false;

    /** 이 플러그인 클래스를 스스로 불러오게 (확장 autoload 캐시가 늦게 갱신돼도 켜기 · 훅이 되게) */
    public static function autoload(): void
    {
        if (self::$autoload) {
            return;
        }
        $here = __DIR__;
        spl_autoload_register(static function (string $class) use ($here): void {
            $p = 'Plugins\\Custom\\Slicer\\';
            if (! str_starts_with($class, $p)) {
                return;
            }
            $rel = '/src/'.str_replace('\\', '/', substr($class, strlen($p))).'.php';
            $roots = [];
            try {
                if (function_exists('base_path')) {
                    $roots[] = base_path('plugins/'.self::IDENTIFIER);
                }
            } catch (\Throwable) {
            }
            $roots[] = $here;
            foreach ($roots as $r) {
                if (is_string($r) && is_file($r.$rel)) {
                    require_once $r.$rel;

                    return;
                }
            }
        });
        self::$autoload = true;
    }

    public function install(): bool
    {
        self::autoload();

        return true;
    }

    public function activate(): bool
    {
        self::autoload();

        return true;
    }

    public function deactivate(): bool
    {
        self::autoload();

        return true;
    }

    public function uninstall(): bool
    {
        self::autoload();

        return true;
    }

    /** @return list<string> */
    public function getDynamicTables(): array
    {
        return [];
    }

    /** @return array<int, class-string> */
    public function getHookListeners(): array
    {
        self::autoload();

        return [RouteListener::class, MenuListener::class];
    }

    /** @return array<string, mixed> */
    public function getMetadata(): array
    {
        return ['author' => 'keidischoi', 'license' => 'AGPL-3.0-or-later', 'keywords' => ['3d printing', 'slicer', 'gcode', 'orcaslicer', 'bambu']];
    }
}
