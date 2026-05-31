@echo off
echo Starting Celery Worker...
echo.

cd /d "%~dp0backend"

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo Starting Celery worker...
celery -A ecommerce_analytics worker --loglevel=info -P solo

pause
