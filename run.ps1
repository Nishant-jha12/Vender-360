# Run Script for Vendor360 Prototype
Write-Host "Starting Vendor360 Backend and Frontend..."

# Start Backend
Write-Host "Starting FastAPI Backend on port 8000..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; pip install -r requirements.txt; uvicorn main:app --reload --port 8000"

# Start Frontend
Write-Host "Starting Vite React Frontend on port 5173..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "Services are starting up!"
Write-Host "Backend API: http://127.0.0.1:8000"
Write-Host "Frontend App: http://127.0.0.1:5173"
