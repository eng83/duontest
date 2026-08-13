# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

브라우저 기반 개발자 도구 모음. 빌드 스텝 없이 정적 HTML 파일로 동작하며, API Gateway / Keycloak 등 CORS가 필요한 호출 시 Node.js 프록시 서버가 필요하다.

| 도구 | 파일 | 외부 의존 |
|------|------|-----------|
| JWT Parser | `jwt_parser/jwt_parser.html` | 없음 |
| OpenAPI Converter | `openapi_converter/openapi_converter.html` | 없음 |
| Keycloak Token Issuer | `keycloak_issuer/keycloak_issuer.html` | 프록시 서버 필요 |
| LLM Gateway 사용량 | `llmgw-usage/llmgw-usage.html` | 네트워크 필요 |
| APIGW Trace Viewer | `traceLog/trace_viewer_v1.html` | 없음 |
| Duplicate File Finder | `duplicate_checker/duplicate_checker.html` | 없음 |
| APIGW User 관리 | `apigw_api_mgmt/apigw_user_mgmt.html` | 프록시 서버 필요 |
| APIGW API 관리 | `apigw_api_mgmt/apigw_api_mgmt.html` | 프록시 서버 필요 |

## 프록시 서버 (CORS 우회 시 필요)

```bash
cd server
npm install   # 최초 1회
npm start     # http://localhost:9090 실행 (기본 포트)
```

Node.js 18+ 필수 (built-in `fetch` 사용).

### 포트 변경

Windows에서 특정 포트가 예약/점유된 경우 포트 변경 가능:

```cmd
# CMD
set PORT=10090
npm start

# PowerShell
$env:PORT=10090; npm start
```

서버 시작 시 `shared/js/proxy-config.js`가 현재 포트로 **자동 갱신**되어 모든 HTML 도구에 반영된다.

### 예약된 포트 (이 PC 기준)

Windows가 아래 범위를 예약하여 사용 불가:
`1848~1947`, `2874~2973`, `2981~3280`, `12050~12149`, `12330~12429`, `50000~50059`

WSL이 추가로 점유: `13000` (`wslrelay`, `host-switch`)

기본 포트 **9090** 사용.

### 엔드포인트

| 엔드포인트 | 용도 |
|---|---|
| `POST /proxy/keycloak/:env` (env = `dev` \| `prod`) | Keycloak 토큰 발급 |
| `POST /proxy/fetch-json` body: `{ url }` | OpenAPI 등 외부 JSON 범용 fetch |
| `POST /proxy/forward` body: `{ url, method, headers, body }` | 인증 헤더 포함 범용 forward (Basic Auth 등) |
| `POST /proxy/upload-api` body: `{ url, method, auth, specText, apiName, ... }` | API Gateway 스펙 파일 multipart 업로드 |
| `GET /api/connections` | `apigw_api_mgmt/connections.json` 서빙 |

- `/proxy/forward`, `/proxy/fetch-json`: 요청 바디 512kb 제한
- `/proxy/upload-api`: 요청 바디 20MB 제한 (OpenAPI 스펙 파일 업로드용)
- Keycloak URL은 `server/server.js` 상단 `KEYCLOAK_URLS` 상수에 하드코딩

## 프록시 포트 동적 설정 (`proxy-config.js`)

모든 HTML 도구는 프록시 포트를 `shared/js/proxy-config.js`에서 읽는다.

```html
<!-- 각 도구 head에 반드시 포함 (theme.js 앞에) -->
<script src="../shared/js/proxy-config.js"></script>
```

```javascript
// 각 도구 script에서 사용
const PROXY = window.WEB_TOOLS_PROXY || 'http://localhost:9090';
```

`proxy-config.js`는 서버 시작 시 자동 갱신되므로 **직접 편집하지 말 것**.

## 공유 리소스 구조

```
shared/
  css/common.css          ← CSS 변수 + 공통 컴포넌트 스타일
  js/theme.js             ← 다크/라이트 테마 토글 로직
  js/proxy-config.js      ← 프록시 포트 설정 (서버 시작 시 자동 갱신)
  libs/                   ← Vue 3, highlight.js, github.min.css (로컬 번들)
```

각 도구의 HTML에서 참조하는 상대경로 패턴:
```html
<link rel="stylesheet" href="../shared/libs/github.min.css">
<link rel="stylesheet" href="../shared/css/common.css">
<script src="../shared/libs/vue.global.prod.js"></script>
<script src="../shared/libs/highlight.min.js"></script>
<script src="../shared/js/proxy-config.js"></script>
<script src="../shared/js/theme.js" defer></script>
```
`index.html`은 루트에 있으므로 `./shared/`를 사용한다.

## 테마 시스템

- **저장 키:** `localStorage('wt-theme')` — 값: `"light"` | `"dark"`
- **적용 방식:** `<html data-theme="dark">` 속성 → `common.css`의 CSS 변수 캐스케이드
- **기본값:** `prefers-color-scheme` 미디어쿼리 감지
- **FOUIT 방지:** 모든 HTML의 `<head>` 최상단에 아래 인라인 스크립트를 둔다:
  ```html
  <script>(function(){var t=localStorage.getItem('wt-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;})();</script>
  ```
- **토글 버튼:** `<button class="theme-toggle" onclick="toggleTheme()">🌙</button>` — `theme.js`가 아이콘(☀/🌙)과 title을 자동 갱신

## index.html 뷰 시스템

`index.html`은 그리드/캐러셀 두 레이아웃을 하나의 파일에서 제공한다.

- **저장 키:** `localStorage('wt-view')` — 값: `"grid"` | `"carousel"`, 기본값: `"grid"`
- **적용 방식:** `<html data-view="grid|carousel">` 속성으로 CSS 분기
- **FOUIT 방지:** `index.html` `<head>` 인라인 스크립트에서 테마와 함께 뷰 속성도 즉시 적용
- **전환 버튼:** 헤더 우측 `▤` / `❏` 버튼 — `toggleView()` 함수가 속성 갱신 및 localStorage 저장
- **카드 데이터:** `TOOLS` 배열로 단일 정의 → 그리드/캐러셀 모두 JS로 동적 생성
- **새 도구 추가 시:** `index.html`의 `TOOLS` 배열에 항목 1개만 추가하면 양쪽 뷰에 자동 반영

## CSS 설계 시스템

`common.css`의 주요 CSS 변수 (라이트 기본값, `[data-theme="dark"]` 블록에서 오버라이드):

```css
--color-primary      /* #4a90e2 (dark: #6366f1) */
--color-success      /* #34a853 */
--color-error / --color-error-bg / --color-error-text
--color-warning / --color-warning-bg
--color-bg           /* 페이지 배경 */
--color-card         /* 카드/패널 배경 */
--color-panel-header /* 패널 헤더 배경 */
--color-text / --color-text-heading / --color-text-label / --color-text-muted
--color-border / --color-border-subtle
--font-body / --font-mono
--radius-sm (6px) / --radius-md (10px)
--shadow-card
```

공통 컴포넌트 클래스: `.app`, `.tool-nav`, `.input-section`, `.panel`, `.panel-header`, `.panel-body`, `.btn-primary`, `.btn-success`, `.btn-ghost`, `.btn-copy`, `.status-badge`, `.error-box`, `.theme-toggle`

각 도구의 `<style>` 블록은 도구 고유 스타일만 담고, 다크 모드 오버라이드는 `[data-theme="dark"] .클래스명 { }` 형태로 추가한다.

**버튼 disabled 스타일:** `common.css`에 `.btn:disabled, button:disabled { opacity: 0.38; cursor: not-allowed; }` 정의됨.

## 연결 프로파일 (`connections.json`)

APIGW 도구들이 공유하는 Host URL 목록. `apigw_api_mgmt/connections.json`에 정의.

```json
[
  { "name": "개발 환경", "host": "https://dev-apigw.hd.com:7111" },
  { "name": "운영 환경", "host": "https://apigw.hd.com:7111" }
]
```

- `name`과 `host`만 관리 (username/password는 저장하지 않음 — 보안)
- 서버가 `GET /api/connections`로 서빙
- HTML 로드 시 자동 조회 → Host URL 옆 `☰` 버튼으로 선택
- 프록시 미실행 시 드롭다운 비활성화, 직접 입력으로 폴백

## APIGW 도구 공통 패턴

### API 호출 helper

```javascript
const PROXY = window.WEB_TOOLS_PROXY || 'http://localhost:9090';

async function apigwFetch(path, method = 'GET', body = undefined) {
  const auth = btoa(`${username.value}:${password.value}`);
  const res = await fetch(`${PROXY}/proxy/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${host.value}/rest/apigateway${path}`,
      method,
      headers: { Authorization: `Basic ${auth}` },
      body,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.errorDescription || data?.description
             || data?.error || data?.errorDetails
             || (data ? JSON.stringify(data) : `HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}
```

### localStorage 키

| 키 | 값 | 용도 |
|---|---|---|
| `wt-theme` | `"light"` \| `"dark"` | 테마 |
| `wt-view` | `"grid"` \| `"carousel"` | index.html 레이아웃 |
| `wt-apigw-host` | URL 문자열 | 마지막 연결 Host URL |
| `wt-apigw-user` | 문자열 | 마지막 연결 Username |

password는 localStorage에 저장하지 않는다.

### PUT 시 password 처리 (APIGW User 관리)

webMethods API Gateway `PUT /users/{id}`는 전체 덮어쓰기이며 `password` 필드가 필수다.
GET 응답의 마스킹 값 `"********************************"`을 그대로 PUT body에 포함하면 서버가 "비밀번호 변경 없음"으로 처리한다 (테스트 검증 완료).

```javascript
// GET → id·systemDefined 제거 → active 변경 → PUT
const { id, systemDefined, ...base } = currentUser;
await apigwFetch(`/users/${userId}`, 'PUT', { ...base, active: false });
// password("****...")는 base에 포함된 채로 전송 → 비밀번호 유지됨
```

새 비밀번호 변경 시에는 `base.password`를 새 값으로 교체하여 전송.

### API 스펙 파일 위치

`apigw_api_mgmt/api_spec/` — webMethods API Gateway 각 서비스별 Swagger 2.0 스펙 JSON.

| 파일 | 내용 |
|---|---|
| `APIGatewayServiceManagement.json` | API CRUD, 활성화/비활성화, 버전 관리 |
| `APIGatewayUserManagementSwagger.json` | 사용자/그룹/팀 관리, 잠금 계정 |
| `APIGatewayAdministration.json` | 비밀번호 정책, 계정 잠금 설정 |
| 기타 16개 | Alias, Application, Policy, Archive 등 |

## 새 도구 추가 시 체크리스트

1. `새도구명/새도구명.html` 생성
2. `<head>` 최상단에 FOUIT 인라인 스크립트 삽입
3. 공유 CSS/JS 참조 (`../shared/...`) — `proxy-config.js` 포함
4. `<body>` 최상단(Vue 마운트 엘리먼트 **바깥**)에 정적 `.tool-nav` 삽입:
   ```html
   <nav class="tool-nav">
     <a href="../index.html">← Web Tools</a>
     <span class="tool-nav-sep">/</span>
     <span class="tool-nav-current">도구 이름</span>
     <button class="theme-toggle" onclick="toggleTheme()" style="margin-left:auto;">🌙</button>
   </nav>
   ```
5. `index.html`의 `TOOLS` 배열에 `{ icon, name, href, desc }` 항목 추가
6. 프록시 필요 시: `const PROXY = window.WEB_TOOLS_PROXY || 'http://localhost:9090';` 사용

## 도구 간 연동

**Keycloak Issuer → JWT Parser** (localStorage 경유):
- Issuer: `localStorage.setItem('wt-pending-token', accessToken)` 후 JWT Parser 새 탭
- JWT Parser: `onMounted`에서 `wt-pending-token` 읽어 textarea 자동 채움 후 키 삭제

## Vue 3 패턴

모든 도구는 Vue 3 Composition API(`setup()`)를 사용한다:
```javascript
const { createApp, ref, computed, reactive, watch, onMounted } = Vue;
createApp({ setup() { /* ... */ return { ... }; } }).mount('#app');
```

**주의:** `setup()` 내부에서 `document.getElementById`로 Vue 마운트 엘리먼트 **내부** DOM에 직접 접근하면 안 된다. 마운트 전이라 `null`이 반환되어 에러가 발생한다. 이벤트 핸들러는 템플릿 `@event` 바인딩을 사용한다.

**Set 반응성 주의:** `ref(new Set())`의 `.size`를 `computed`에서 추적할 때 `[...set].length`를 사용한다. `.size` 직접 접근은 Vue 3에서 반응성이 불안정할 수 있다.

**systemDefined 조건:** 템플릿에서 `systemDefined` 같은 boolean 필드를 조건으로 쓸 때는 `=== true` 명시적 비교 또는 별도 `computed`로 분리한다. 직접 바인딩 시 `undefined` falsy 처리가 애매할 수 있다.
