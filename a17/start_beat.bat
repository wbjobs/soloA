@echo off
echo Starting Celery Beat (Scheduler)...
echo.

cd /d "%~dp0backend"

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo Starting Celery Beat scheduler...
celery -A ecommerce_analytics beat --loglevel=info

pause
