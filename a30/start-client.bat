@echo off
echo ========================================
echo   Roguelike地牢探险 - 启动前端
echo ========================================
echo.

cd /d "%~dp0client"

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js 环境！
    echo.
    echo 请先安装 Node.js 16 或更高版本：
    echo 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] 安装前端依赖...
    echo 这可能需要几分钟...
    echo.
    npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败！
        pause
        exit /b 1
    )
)

echo.
echo [2/2] 启动前端开发服务器...
echo 前端将在 http://localhost:3000 运行
echo 按 Ctrl+C 停止服务器
echo.

npm run dev
