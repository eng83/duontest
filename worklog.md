
## 2026-08-27
### 14:54
- **`openapi_converter/openapi_converter.html`** — `fetchFromUrl` 함수의 환경 자동감지 순서 오류 수정 (`validateJson()` 이후 `applyEnvFromUrl(fetchUrl)` 호출하도록 변경), 프록시 폴백 포트를 `localhost:3000` → `localhost:9090` 으로 수정
- **`worklog.md` 한글 깨짐 원인 분석** — `powershell.exe`(PS 5.1) 기본 `$OutputEncoding`이 ASCII라 한글이 `?`로 변환되고, `Add-Content -Encoding utf8`이 매 호출마다 BOM을 삽입하는 두 가지 문제 확인
- **`.claude/settings.json`** — 훅 실행 셸을 `powershell.exe` → `pwsh.exe`(PS 7+)로 변경해 기본 UTF-8 처리로 근본 해결
- **`.claude/hooks/append-work-log.ps1`** — UTF-8 BOM 추가, `$OutputEncoding = UTF8` 명시적 설정, `Add-Content` 대신 `System.IO.File::AppendAllText`(BOM 없는 인코더)로 파일 쓰기 교체
- **`.claude/hooks/append-tool-log.ps1`** — PS 5.1 fallback 대비 안전장치로 UTF-8 BOM 추가
