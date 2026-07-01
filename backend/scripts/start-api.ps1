# Stop listeners on dev ports, then start uvicorn on port 8000.
param(
    [int]$Port = 8000,
    [string]$ListenHost = "127.0.0.1"
)

$killScript = Join-Path $PSScriptRoot "..\..\scripts\kill-dev-ports.ps1"
if (Test-Path $killScript) {
    # Only free the API port — do not kill the frontend on 3000 when starting API alone.
    & $killScript -Ports @(8000, 8010)
}

Set-Location $PSScriptRoot\..

$venvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

Write-Host "Running database migrations..."
& $python scripts/migrate.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database migration failed. Check DATABASE_URL in backend/.env"
    exit $LASTEXITCODE
}

Write-Host "Starting SkillSearchFit API on http://${ListenHost}:$Port"
Write-Host "Frontend should use NEXT_PUBLIC_API_URL=http://localhost:$Port/api/v1"
Write-Host "After start, verify with: npm run dev:verify"

& $python -m uvicorn app.main:app --reload --host $ListenHost --port $Port
