# SessionEnd 훅 (Windows / PowerShell 버전)
# PostToolUse 훅(append-tool-log.ps1)이 쌓아둔 "세션별 변경 로그"와
# transcript(대화 내용)를 함께 Claude에게 넘겨 자연어로 요약시키고,
# <프로젝트 루트>\worklog.md 에 append 한다. 요약 후 세션별 임시 로그는 삭제한다.
#
# 설치:
#   1) <프로젝트>\.claude\hooks\append-work-log.ps1 로 저장
#   2) append-tool-log.ps1 도 같은 폴더에 설치 (PostToolUse 훅)
#   3) .claude\settings.json 에 settings.json.example 내용 병합
#
# 전제: claude CLI가 PATH에 등록되어 있어야 함 (claude -p 재호출)

$ErrorActionPreference = "SilentlyContinue"
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- 재귀 방지 ---------------------------------------------------------
# 아래에서 claude -p 를 다시 호출하는데, 그 호출도 세션이므로 SessionEnd 훅이
# 다시 걸릴 수 있다. 이 환경변수로 내부 호출임을 표시해서 무한 루프를 막는다.
if ($env:WORK_LOG_HOOK_RUNNING -eq "1") {
    exit 0
}

$raw = [Console]::In.ReadToEnd()
try {
    $data = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (Get-Location).Path }

$logFile = Join-Path $projectDir "worklog.md"
$changesDir = Join-Path $projectDir ".claude\.session-changes"

$transcriptPath = $data.transcript_path
$sessionId = $data.session_id
$reason = $data.reason
if (-not $reason) { $reason = "unknown" }

# --- PostToolUse가 쌓아둔 세션별 변경 로그 읽기 -------------------------
$changesText = ""
$changesFile = $null
if ($sessionId) {
    $changesFile = Join-Path $changesDir "$sessionId.log"
    if (Test-Path $changesFile) {
        $changesText = Get-Content -Path $changesFile -Raw -Encoding utf8
    }
}

# --- transcript(JSONL)에서 user/assistant 텍스트만 추출 ------------------
# 너무 길면 요약 프롬프트가 비대해지므로 최근 부분(약 8000자)만 사용
$convoText = ""
if ($transcriptPath -and (Test-Path $transcriptPath)) {
    $lines = Get-Content -Path $transcriptPath -Encoding utf8
    $texts = @()
    foreach ($l in $lines) {
        if (-not $l) { continue }
        try {
            $obj = $l | ConvertFrom-Json
        } catch {
            continue
        }
        if ($obj.type -eq "user" -or $obj.type -eq "assistant") {
            foreach ($c in $obj.message.content) {
                if ($c.type -eq "text" -and $c.text) {
                    $texts += $c.text
                }
            }
        }
    }
    $joined = [string]::Join("`n", $texts)
    if ($joined.Length -gt 8000) {
        $convoText = $joined.Substring($joined.Length - 8000)
    } else {
        $convoText = $joined
    }
}

# 대화도 변경 로그도 없으면 기록할 게 없으므로 조용히 종료
if (-not $convoText -and -not $changesText) {
    exit 0
}

$convoDisplay = if ($convoText) { $convoText } else { "없음" }
$changesDisplay = if ($changesText) { $changesText } else { "없음" }

# --- Claude를 다시 호출해서 자연어 요약 생성 ------------------------------
$prompt = @"
다음은 방금 끝난 Claude Code 세션의 정보야.

[대화 내용 일부]
$convoDisplay

[실제로 실행된 파일 수정/명령어 로그 - 시간 | 도구 | 내용]
$changesDisplay

위 정보를 바탕으로 실제로 어떤 작업(코드 변경, 조사, 설정 등)을 했는지 한국어로 2~5줄 불릿으로 간결하게 요약해줘.
가능하면 실제로 수정된 파일명이나 실행된 주요 명령어(git commit 메시지 등)를 구체적으로 언급해줘.
인사말이나 서론 없이 요약 내용만 출력해.
"@

$env:WORK_LOG_HOOK_RUNNING = "1"
$savedOutputEncoding    = [Console]::OutputEncoding
$savedOutputEncodingVar = $OutputEncoding
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$summaryLines = & claude -p $prompt 2>$null
$summary = $summaryLines -join "`n"
[Console]::OutputEncoding = $savedOutputEncoding
$OutputEncoding           = $savedOutputEncodingVar
Remove-Item Env:\WORK_LOG_HOOK_RUNNING -ErrorAction SilentlyContinue

if (-not $summary) {
    $summary = "(요약 생성 실패 - reason: $reason)"
}

# --- worklog.md에 append (동시쓰기 대비 재시도 방식) -----------------------
$today = Get-Date -Format "yyyy-MM-dd"
$now = Get-Date -Format "HH:mm"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$maxRetry = 20
for ($i = 0; $i -lt $maxRetry; $i++) {
    try {
        if (-not (Test-Path $logFile)) {
            [System.IO.File]::WriteAllText($logFile, "", $utf8NoBom)
        }
        $existing = [System.IO.File]::ReadAllText($logFile, $utf8NoBom)
        if (-not $existing) { $existing = "" }

        $append = ""
        if ($existing -notmatch "(?m)^## $today") {
            $append += "`n## $today"
        }
        $append += "`n### $now`n$summary`n"
        [System.IO.File]::AppendAllText($logFile, $append, $utf8NoBom)
        break
    } catch {
        Start-Sleep -Milliseconds 100
    }
}

# --- 세션별 임시 변경 로그 정리 -------------------------------------------
if ($changesFile -and (Test-Path $changesFile)) {
    Remove-Item -Path $changesFile -Force -ErrorAction SilentlyContinue
}

exit 0
