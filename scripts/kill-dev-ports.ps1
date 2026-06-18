# Free SkillSearchFit dev ports - frontend 3000, API 8000 (+ stale alternates).
param(
    [int[]]$Ports = @(3000, 3001, 3002, 3003, 8000, 8010)
)

$ErrorActionPreference = "SilentlyContinue"
$stopped = @{}
$projectRoot = Split-Path $PSScriptRoot -Parent

function Stop-ProcId([int]$procId, [string]$reason) {
    if (-not $procId -or $procId -le 0 -or $stopped.ContainsKey($procId)) { return }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "unknown" }
    Write-Host "Stopping $name (PID $procId) - $reason"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    taskkill /F /PID $procId 2>$null | Out-Null
    $stopped[$procId] = $true
}

# 1) Anything listening on our dev ports (netstat is authoritative on Windows).
$netstat = netstat -ano | Select-String "LISTENING"
foreach ($port in $Ports) {
    $pattern = ":$port\s"
    foreach ($line in $netstat) {
        if ($line -notmatch $pattern) { continue }
        $parts = ($line.ToString().Trim() -split "\s+")
        $procId = [int]$parts[-1]
        Stop-ProcId $procId "port $port"
    }
}

# 2) Project-scoped node (next dev, concurrently, npm).
foreach ($proc in Get-CimInstance Win32_Process -Filter "name='node.exe'") {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }
    if ($cmd -notmatch [regex]::Escape($projectRoot)) { continue }
    if ($cmd -match "next(\.exe)?\s+dev|concurrently|npm run dev") {
        Stop-ProcId $proc.ProcessId "project node dev"
    }
}

# 3) Any uvicorn running this API.
foreach ($proc in Get-CimInstance Win32_Process -Filter "name='python.exe'") {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }
    if ($cmd -match "uvicorn\s+app\.main") {
        Stop-ProcId $proc.ProcessId "uvicorn"
    }
}

Start-Sleep -Seconds 3

$remaining = @()
foreach ($port in $Ports) {
    $listeners = netstat -ano | Select-String "LISTENING" | Select-String ":$port\s"
    if ($listeners) { $remaining += $port }
}

if ($stopped.Count -eq 0) {
    Write-Host "No dev processes were running."
} else {
    Write-Host "Stopped $($stopped.Count) process(es)."
}

if ($remaining.Count -gt 0) {
    Write-Host "WARNING: ports still in use: $($remaining -join ', '). Close other terminals or reboot if needed."
} else {
    Write-Host "Ports ready: frontend 3000, API 8000."
}
