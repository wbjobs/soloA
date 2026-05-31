@echo off
echo ========================================
echo   Roguelike地牢探险 - 启动后端服务器
echo ========================================
echo.

cd /d "%~dp0server"

where go >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Go 语言环境！
    echo.
    echo 请先安装 Go 1.21 或更高版本：
    echo 下载地址: https://go.dev/dl/
    echo.
    pause
    exit /b 1
)

echo [1/2] 安装后端依赖...
go mod download
if errorlevel 1 (
    echo [错误] 依赖安装失败！
    pause
    exit /b 1
)

echo.
echo [2/2] 启动游戏服务器...
echo 服务器将在 http://localhost:8080 运行
echo 按 Ctrl+C 停止服务器
echo.

go run main.go
