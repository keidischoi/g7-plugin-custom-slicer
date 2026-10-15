<?php

namespace Plugins\Custom\Slicer\Listeners;

use App\Contracts\Extension\HookListenerInterface;

/**
 * 헤더 메인 메뉴 「슬라이서」 (#slc-nav · #slc-nav-mobile — 그리는 것은 plugin.iife.js)
 *  - core.frontend.filter_app_config: 화면 HTML 에 메뉴 설정을 실음 — G7Config.appConfig.cextNav["custom-slicer"].cfg (따로 요청 없음)
 * CRITICAL: 훅 필터는 예외를 던지지 않음 — 실패하면 받은 그대로.
 */
class MenuListener implements HookListenerInterface
{
    public const PATH = '/print-slicer';

    public const LABEL = '슬라이서';

    public static function getSubscribedHooks(): array
    {
        return [
            'core.frontend.filter_app_config' => ['method' => 'embed', 'priority' => 50, 'type' => 'filter', 'sync' => true],
        ];
    }

    public function handle(...$args): void {}

    public function embed(mixed $config = null): mixed
    {
        if (! is_array($config)) {
            return $config;
        }
        try {
            $nav = is_array($config['cextNav'] ?? null) ? $config['cextNav'] : [];
            $nav['custom-slicer'] = ['cfg' => ['enabled' => true, 'menu_enabled' => true, 'menu_label' => self::LABEL, 'path' => self::PATH]];
            $config['cextNav'] = $nav;
        } catch (\Throwable) {
        }

        return $config;
    }
}
