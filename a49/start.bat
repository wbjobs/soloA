@echo off
echo ============================================
echo  N-Body 引力模拟系统 - 快速启动
echo ============================================
echo.

echo [1/4] 检查 PostgreSQL 数据库...
echo 请确保 PostgreSQL 已启动并创建了数据库 'nbody_sim'
echo.

echo [2/4] 启动后端服务...
cd backend
if not exist "venv" (
    echo 创建虚拟环境...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

start "Backend - FastAPI" cmd /k "cd /d %cd% && call venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo 后端服务已启动 (http://localhost:8000)
echo.

echo [3/4] 启动前端服务...
cd ..\frontend
if not exist "node_modules" (
    echo 安装前端依赖...
    npm install
)

start "Frontend - React" cmd /k "cd /d %cd% && npm run dev"

echo 前端服务已启动 (http://localhost:3000)
echo.

echo ============================================
echo  启动完成!
echo  - API 文档: http://localhost:8000/docs
echo  - 前端界面: http://localhost:3000
echo ============================================
echo.
pause
