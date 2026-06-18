# Quick check that dev servers are on 3000 (web) and 8000 (API) with website-analysis routes.
$ErrorActionPreference = "Stop"

function Test-PortListening([int]$port) {
    return [bool](netstat -ano | Select-String "LISTENING" | Select-String ":$port\s")
}

$webOk = Test-PortListening 3000
$apiOk = Test-PortListening 8000

Write-Host "Frontend port 3000: $(if ($webOk) { 'LISTENING' } else { 'NOT LISTENING' })"
Write-Host "API port 8000:      $(if ($apiOk) { 'LISTENING' } else { 'NOT LISTENING' })"

if ($apiOk) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
        $features = @($health.features)
        $hasAnalysis = $features -contains "website_analysis"
        Write-Host "API health: $($health.status) | website_analysis: $hasAnalysis"
        if (-not $hasAnalysis) {
            Write-Host "ERROR: Stale API detected — /health missing website_analysis feature."
            exit 1
        }
    } catch {
        Write-Host "ERROR: Could not reach API health: $_"
        exit 1
    }
}

if (-not $webOk -or -not $apiOk) {
    exit 1
}

Write-Host "OK — use http://localhost:3000 (frontend) and http://localhost:8000 (API)."
