# start_local.ps1 — Helper script to run and test HABE local stack from Windows
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Blockchain-Aided HABE Local Stack Manager" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Run startup script via WSL
wsl -u root bash -c "/habe_workspace/start_services.sh"

Write-Host "`nTesting API health from Windows..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "http://localhost:3000/admin/health" -Method Get
    Write-Host "API Gateway Health Check: SUCCESS" -ForegroundColor Green
    Write-Host ($res | ConvertTo-Json)
} catch {
    Write-Host "API Gateway Health Check Failed: $_" -ForegroundColor Red
}

Write-Host "`nTesting ML Eligibility Service health..." -ForegroundColor Yellow
try {
    $mlRes = Invoke-RestMethod -Uri "http://localhost:5001/health" -Method Get
    Write-Host "ML Service Health Check: SUCCESS" -ForegroundColor Green
    Write-Host ($mlRes | ConvertTo-Json)
} catch {
    Write-Host "ML Service Health Check Failed: $_" -ForegroundColor Red
}
