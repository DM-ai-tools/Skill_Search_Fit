# Stop listeners on dev ports, then start uvicorn on port 8000.
param(
    [int]$Port = 8000,
    [string]$ListenHost = "127.0.0.1"
)

$killScript = Join-Path $PSScriptRoot "..\..\scripts\kill-dev-ports.ps1"
if (Test-Path $killScript) {
    & $killScript
}

Set-Location $PSScriptRoot\..

$venvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

Write-Host "Starting SkillSearchFit API on http://${ListenHost}:$Port"
Write-Host "Frontend should use NEXT_PUBLIC_API_URL=http://localhost:$Port/api/v1"

& $python -m uvicorn app.main:app --reload --host $ListenHost --port $Port
