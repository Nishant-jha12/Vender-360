# Vendor360 — start the backend and frontend together.
Write-Host "Starting Vendor360..." -ForegroundColor Cyan

$root = $PSScriptRoot

# Create backend/.env from the example on first run.
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "backend\.env.example") $envFile
    $key = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    (Get-Content $envFile) -replace '^SECRET_KEY=.*', "SECRET_KEY=$key" | Set-Content $envFile
    Write-Host "Created backend\.env with a generated SECRET_KEY." -ForegroundColor Green
}

Write-Host "Backend  -> http://127.0.0.1:8000  (docs at /docs)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$root\backend'; pip install -r requirements.txt; python migrate.py; uvicorn main:app --reload --port 8000"

Write-Host "Frontend -> http://127.0.0.1:5173"
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$root\frontend'; npm install; npm run dev"

Write-Host ""
Write-Host "Both services are starting in separate windows." -ForegroundColor Green
Write-Host "Sign up, then use the verification code shown on screen (or 123456)."
