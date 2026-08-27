# PostToolUse 훅 (Windows / PowerShell 버전)
# Edit / Write / NotebookEdit / MultiEdit / Bash / PowerShell 도구 호출을
# 세션별 임시 로그(.claude\.session-changes\<session_id>.log)에 기록한다.
#
# AI 호출 없이 즉시 끝나는 "사실 기록" 전용 훅. 이 로그는 나중에
# SessionEnd 훅(append-work-log.ps1)이 읽어서 최종 요약의 근거 자료로 쓰고,
# 요약이 끝나면 자동으로 삭제한다.
#
# 설치: <프로젝트>\.claude\hooks\append-tool-log.ps1 로 저장
#       (별도 chmod 불필요 - settings.json에서 powershell.exe로 직접 실행)

$ErrorActionPreference = "SilentlyContinue"

$raw = [Console]::In.ReadToEnd()
try {
    $data = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (Get-Location).Path }

$changesDir = Join-Path $projectDir ".claude\.session-changes"
New-Item -ItemType Directory -Force -Path $changesDir | Out-Null

$sessionId = $data.session_id
if (-not $sessionId) { $sessionId = "unknown" }
$toolName = $data.tool_name
$logFile = Join-Path $changesDir "$sessionId.log"
$now = Get-Date -Format "HH:mm:ss"

$detail = $null
switch ($toolName) {
    { $_ -in @("Edit", "Write", "NotebookEdit", "MultiEdit") } {
        $detail = $data.tool_input.file_path
    }
    { $_ -in @("Bash", "PowerShell") } {
        $cmd = $data.tool_input.command
        if ($cmd) {
            $cmd = $cmd -replace "`r?`n", " "
            if ($cmd.Length -gt 200) { $cmd = $cmd.Substring(0, 200) }
            $detail = $cmd
        }
    }
    default {
        exit 0
    }
}

if (-not $detail) { exit 0 }

$line = "$now | $toolName | $detail"

# 동시 tool call 기록 시 파일 깨짐 방지 (flock 대체 - 재시도 방식)
$maxRetry = 20
for ($i = 0; $i -lt $maxRetry; $i++) {
    try {
        Add-Content -Path $logFile -Value $line -Encoding utf8 -ErrorAction Stop
        break
    } catch {
        Start-Sleep -Milliseconds 100
    }
}

exit 0
