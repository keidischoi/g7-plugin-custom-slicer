<?php

use Illuminate\Support\Facades\Route;
use Plugins\Custom\Slicer\Http\Controllers\AssetController;
use Plugins\Custom\Slicer\Http\Controllers\MeController;

/*
| PluginRouteServiceProvider prefix: api/plugins/custom-slicer
| 모델 파일은 서버로 오지 않음 — 회원 브라우저에서 슬라이스 (dist/web/*)
| 내 프린터로 보내기는 프린터 라운지 API (api/plugins/custom-my_printer/printers/{id}/send-file) 를 브라우저가 바로 부름
*/

Route::get('assets/{file}', [AssetController::class, 'show'])
    ->where('file', '[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(js|css|json|wasm|txt)')->middleware('throttle:600,1')->name('assets');

// 0.1.1 지금 보는 사람이 관리자인가 (보내기 단추 — 시험하는 동안 관리자에게만)
Route::middleware(['optional.sanctum', 'throttle:120,1'])->group(function () {
    Route::get('me', [MeController::class, 'show'])->name('me');
});
