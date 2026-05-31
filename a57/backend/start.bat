@echo off
echo ========================================
echo Industrial IoT Analytics Platform
echo ========================================
echo.

echo Checking Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo Starting FastAPI backend server...
echo Server will run on http://localhost:8000
echo API documentation: http://localhost:8000/docs
echo.

cd app
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
