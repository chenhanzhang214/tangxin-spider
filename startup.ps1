# Windows equivalent of startup.sh. Start only when the local dev UI is absent.
$ErrorActionPreference = 'Stop'
try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) { exit 0 }
} catch { }
$logDirectory = Join-Path $PSScriptRoot '.tmp-dev-server'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/s', '/c', 'npm run dev' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'stdout.log') -RedirectStandardError (Join-Path $logDirectory 'stderr.log') -PassThru
Write-Output "Development server starting (PID $($process.Id))."
