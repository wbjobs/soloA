@echo off
echo Starting E-commerce Analytics Backend...
echo.

cd /d "%~dp0backend"

echo Creating virtual environment...
if not exist venv (
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Before proceeding, make sure:
echo 1. MySQL is running and database 'ecommerce_analytics' exists
echo 2. ClickHouse is running
echo 3. Redis is running
echo.

echo Running migrations...
python manage.py makemigrations
python manage.py migrate

echo.
echo Starting Django server on http://localhost:8000
python manage.py runserver 0.0.0.0:8000

pause
