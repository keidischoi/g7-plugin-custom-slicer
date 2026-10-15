<?php

namespace Plugins\Custom\Slicer\Listeners;

use App\Contracts\Extension\HookListenerInterface;
use Plugins\Custom\Slicer\Plugin;

/**
 * 사용자 화면 주소 (/print-slicer) — 코어는 플러그인 routes.json 을 관리자 템플릿에만 합치므로 사용자 화면은 이 필터로
 * (레이아웃 resources/layouts/user/slicer.json → 플러그인 켤 때 custom-slicer.slicer 로 등록됨).
 */
class RouteListener implements HookListenerInterface
{
    public const PATHS = ['/print-slicer'];

    public static function getSubscribedHooks(): array
    {
        return [
            'core.routes.filter_merged' => ['method' => 'addUserRoutes', 'priority' => 50, 'type' => 'filter', 'sync' => true],
        ];
    }

    public function handle(...$args): void {}

    public function addUserRoutes(mixed $routes = [], mixed $templateType = 'user', mixed $identifier = null): mixed
    {
        if (! is_array($routes) || $templateType !== 'user') {
            return $routes;
        }
        foreach ($routes as $r) {
            if (is_array($r) && ($r['layout'] ?? '') === Plugin::USER_LAYOUT) {
                return $routes;
            }
        }
        foreach (self::PATHS as $p) {
            $routes[] = ['path' => '*'.$p, 'layout' => Plugin::USER_LAYOUT, 'auth_required' => false,
                'meta' => ['title' => '$t:custom-slicer.user.title'], 'source' => ['kind' => 'plugin', 'identifier' => Plugin::IDENTIFIER]];
        }

        return $routes;
    }
}
