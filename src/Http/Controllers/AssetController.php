<?php

namespace Plugins\Custom\Slicer\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\Response;

/**
 * 슬라이서 화면 · 엔진 파일을 API 경로로 내려줌 (빌드 · 퍼블리시 없이 zip 덮어쓰기만으로 반영).
 *  - dist/web/ 안의 파일만 (이름 규칙으로 걸러 경로 밖으로 못 나감). 엔진 조각은 이름에 내용 해시가 붙어 길게 캐시.
 *  - 슬라이서 화면을 열 때만 받음 — 다른 화면은 이 파일들을 받지 않음.
 */
class AssetController extends Controller
{
    private const TYPES = ['js' => 'application/javascript; charset=UTF-8', 'css' => 'text/css; charset=UTF-8', 'json' => 'application/json; charset=UTF-8', 'wasm' => 'application/wasm', 'txt' => 'text/plain; charset=UTF-8'];

    public function show(Request $request, string $file): Response
    {
        if (! preg_match('/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(js|css|json|wasm|txt)$/', $file, $m) || str_contains($file, '..')) {
            return response('/* not found */', 404, ['Content-Type' => 'text/plain']);
        }
        $path = dirname(__DIR__, 3).'/dist/web/'.$file;
        if (! is_file($path)) {
            return response('/* missing */', 404, ['Content-Type' => 'text/plain', 'Cache-Control' => 'no-cache']);
        }
        $mtime = (int) @filemtime($path);
        $etag = '"'.substr(md5($file.'|'.$mtime.'|'.(int) @filesize($path)), 0, 20).'"';
        $hashed = (bool) preg_match('/^c-[A-Za-z0-9_-]{6,}\./', $file);   // 엔진 조각 (이름에 내용 해시)
        $headers = [
            'Content-Type' => self::TYPES[$m[1]],
            'Cache-Control' => $hashed || $request->query('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
            'ETag' => $etag,
            'X-Content-Type-Options' => 'nosniff',
        ];
        if (trim((string) $request->headers->get('If-None-Match', '')) === $etag) {
            unset($headers['Content-Type']);

            return response('', 304, $headers);
        }

        return response()->file($path, $headers);
    }
}
