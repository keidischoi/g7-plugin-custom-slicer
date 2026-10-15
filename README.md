# 🔪 슬라이서 (custom-slicer)

회원 브라우저에서 도는 **전체 슬라이서** — 그누보드7(G7) 플러그인입니다. 웹 슬라이서(`custom-web_slicer`)를 대신합니다.
모델은 서버로 올라가지 않습니다 (읽기 · 슬라이스 모두 회원 브라우저 · Web Worker 에서).

- 엔진 · 화면: [three-slicer](https://github.com/kimgh06/Three_Slicer) 0.3.4 — OrcaSlicer 를 WebAssembly 로 옮긴 것 (AGPL-3.0)
  - `<Viewport/>`: 판 배치 · 이동/회전/크기 · 여러 판 · 칠하기(다색 · 서포트) · 슬라이스 · **층별 G-code 미리 보기**
  - `<SettingsPanel/>`: OrcaSlicer 설정 976개 (검색 · 단계 · 바뀐 값 표시)
- 보내기: 프린터 라운지(`custom-my_printer`)의 「📤 출력 파일 보내기」 (`POST /api/plugins/custom-my_printer/printers/{id}/send-file`)

## 어디서 쓰나

| 자리 | 하는 일 |
|---|---|
| 🖨️ **프린터로 보내기** 팝업 | 다른 화면의 받기 단추(`data-wsl-send`) 옆 단추 → 예전 웹 슬라이서와 같은 작은 창: 프린터 → 품질 · 색마다 필라멘트 · AMS 칸 · 채우기 · 서포트 · 브림 · 🧹 베드 비웠어요 → 「🔪 슬라이스하고 보내기」 |
| ↗ 자세히 (팝업 안) | 회원이 고름 — **📐 출력 검사기에서** (출력 검사기의 「슬라이스」 탭으로, 파일 · 프린터를 들고) · **🔪 전용 슬라이서에서** (이 화면 위 큰 창) |
| 🔪 큰 슬라이서 창 | 전체 슬라이서 · 크기 단추 **◱ 보통 · ◳ 크게 · ⛶ 전체 화면** (고른 크기는 이 브라우저가 기억) |
| `/print-slicer` | 전용 화면 (헤더 메뉴 「슬라이서」) |
| 출력 검사기 「슬라이스」 탭 | `window.G7Slicer.mount` — 지금 모델 · ✂️ 자른 조각 모두(판에 펼침) · 팝업에서 넘긴 파일 |

## 이어지는 확장

- **프린터 라운지** — 내 프린터 칩(누르면 그 프린터 설정으로) · 📤 보내기 · AMS 칸(색이 가까운 칸으로 미리)
- **🎛️ 슬라이서 프로필**(`custom-slicer_profiles`) — 위 띠 「🎛️ 슬라이서 프로필」: 내 프린터의 인기 프로필을 골라 바로 적용
  - 읽는 꼴: Bambu Studio · OrcaSlicer 프리셋(`.json` `.bbscfg` `.bbsflmt`) · 묶음(`.orca_printer` `.orca_filament` `.orca_bundle` `.zip`) · 프로젝트 `.3mf`(판 설정만)
  - 못 읽는 꼴: PrusaSlicer `.ini` · Cura `.curaprofile` (「보기 ↗」로 그 프로필 화면)
- **출력 검사기** — 「슬라이스」 탭 · 검사 결과 「슬라이스」 단추 · 자르기 「조각 모두 슬라이스」 · 검사에서 고른 프린터로 맞춤
- **맞춤 3D · 출력 검사기의 받기 단추** — `data-wsl-send` 표시만 있으면 옆에 「🖨️ 프린터로 보내기」
- **웹저장소 연결** — `.gcode.3mf` · `.gcode` 받기 단추에 「내 저장소에 저장」 (`data-cls-save`)

웹 슬라이서와 둘 다 켜져 있어도 단추는 하나입니다 (이 플러그인이 `data-wsl-sent` 를 먼저 붙임). 확인이 끝나면 웹 슬라이서를 끄세요.

## 다른 확장에서 부르기

```js
window.G7Slicer.popup({ files: [file], printer: { brand: 'Bambu Lab', model: 'A1' } })   // 🖨️ 빠른 보내기 팝업
window.G7Slicer.big({ files: [file] })                                                     // 🔪 큰 슬라이서 창
window.G7Slicer.mount(el, { files: [file], compact: true, printer })                     // 내 화면 안에
window.G7Slicer.takeCarry()                                                                // 팝업 「↗ 자세히」가 남긴 {files, printer} (한 번만)
```

## 모양

출력 검사기와 같은 말씨 — 하늘색→남색 그라데이션 · 둥근 카드 · 알약 칩. 뷰어 · 설정 칸은 자기 그림자 DOM 안에서 그려서
색은 CSS 변수(`--vp-*`)로, 입력칸 · 숫자칸 · 고르기 · 줄 간격은 그림자 뿌리마다 넣는 스타일(`web/src/polish.js`)로 맞춥니다.
사이트 언어를 따라갑니다 (G7 의 `g7_locale` → `<html lang>`): 한국어 사이트면 설정 이름 · 단위 · 고르기 값이 한국어이고 설정 이름 아래에 OrcaSlicer 영어 이름이 작게 붙습니다.
영어 사이트면 뷰어는 원래 영어, 이 플러그인 화면(보내기 · 프로필 · 도구 등)도 영어(`web/i18n/en.js` — 빌드가 한글 문자열을 `__T()` 로 감쌈).

## 라이선스 (AGPL-3.0-or-later)

AGPL 엔진(three-slicer, OrcaSlicer 파생)을 회원 브라우저로 내려보내므로 **플러그인 전체를 AGPL-3.0-or-later 로 공개**합니다. 화면 아래에 소스 링크가 있습니다.
다른 확장과는 HTTP 주소와 `window.G7Slicer` 로만 주고받고 코드를 가져다 쓰지 않습니다 (출력 검사기는 MIT 그대로).

- `web/src/model-read.cjs` 는 같은 저작자의 출력 검사기(MIT)의 계산 핵심 — 여기서는 AGPL 로 함께 배포
- `web/i18n/ko.json` — [OrcaSlicer 한국어 번역](https://github.com/SoftFever/OrcaSlicer/tree/main/localization/i18n/ko) (AGPL-3.0, OrcaSlicer 기여자 · 번역 crwusiz 외)에서 이 화면에 나오는 말만 고른 것 (`node web/i18n/make-ko.mjs <OrcaSlicer_ko.po>`)
- `dist/web/three-slicer-LICENSE.txt` · `three-slicer-NOTICES.txt` — 엔진의 라이선스 · 제3자 고지

## 알려진 한계

- 엔진은 OrcaSlicer 를 옮긴 작은 엔진이라 Bambu Studio · OrcaSlicer 와 결과가 조금 다를 수 있어요
- 큰 모델(삼각형 수십만 개)은 휴대폰에서 메모리가 모자랄 수 있어요
- 「📤 보내기」는 시험하는 동안 관리자에게만 (`SEND_ADMIN_ONLY` — app.js · quick.js)
- 「↗ 출력 검사기에서」는 화면을 새로 읽으면(새로 고침) 들고 간 파일이 사라져요 — 그때는 다시 여세요

## 개발

```bash
npm install          # esbuild · three-slicer · react · three (개발용 — node_modules 는 저장소에 없음)
npm run build        # web/src → dist/web (app.js · quick.js · worker 들 · c-<해시>.js · app.css)
php tests/run.php    # 구조 검사
node tests/web.test.mjs   # .gcode.3mf · 엔진 슬라이스 · 계산 도구 · 불러오기
```

`dist/web` 은 저장소에 넣습니다 (설치 zip 이 빌드 없이 바로 쓰게).

## 설치

```bash
cd /volume1/web/3ds; sudo -u http php82 artisan plugin:install custom-slicer; sudo -u http php82 artisan plugin:activate custom-slicer; sudo -u http php82 artisan hooks:clear; sudo -u http php82 artisan cache:clear; sudo -u http php82 artisan ext-static:publish --force
```
