@echo off
echo ========================================
echo Industrial IoT Analytics Frontend
echo ========================================
echo.

echo Checking Node.js dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo.
echo Starting React development server...
echo Frontend will run on http://localhost:3000
echo.

npm start

pause
