<?php

namespace Plugins\Custom\Slicer\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * GET me — 지금 보는 사람이 관리자인가 (「📤 내 프린터로 보내기」를 시험하는 동안 관리자에게만 보임)
 */
class MeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $u = $request->user();

        return response()->json(['success' => true, 'data' => ['logged_in' => $u !== null, 'admin' => self::isAdmin($u)]])
            ->header('Cache-Control', 'no-store');
    }

    public static function isAdmin(mixed $u): bool
    {
        try {
            return $u !== null && ((bool) ($u->is_super ?? false) || (method_exists($u, 'isAdmin') && $u->isAdmin()));
        } catch (\Throwable) {
            return false;
        }
    }
}
