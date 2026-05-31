@echo off
echo Starting MDVis Backend Server...
echo.

cd /d "%~dp0backend"

if not exist "data" (
    mkdir data
)

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo Failed to create virtual environment
        pause
        exit /b 1
    )
    
    echo Activating virtual environment and installing dependencies...
    call venv\Scripts\activate
    pip install -r requirements.txt
    if errorlevel 1 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Activating virtual environment...
    call venv\Scripts\activate
)

echo.
echo Starting FastAPI server on http://localhost:8000
echo Press Ctrl+C to stop
echo.

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
