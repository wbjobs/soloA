@echo off
echo Starting MDVis Frontend Server...
echo.

cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting Vite dev server on http://localhost:3000
echo Press Ctrl+C to stop
echo.

npm run dev

pause
