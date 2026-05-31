@echo off
echo Starting E-commerce Analytics Frontend...
echo.

cd /d "%~dp0frontend"

echo Installing dependencies...
call npm install

echo.
echo Starting Vue development server on http://localhost:3000
call npm run dev

pause
