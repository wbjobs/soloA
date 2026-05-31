#!/bin/bash
echo "========================================"
echo "  Roguelike地牢探险 - 启动后端服务器"
echo "========================================"
echo ""

cd "$(dirname "$0")/server"

if ! command -v go &> /dev/null; then
    echo "[错误] 未检测到 Go 语言环境！"
    echo ""
    echo "请先安装 Go 1.21 或更高版本："
    echo "下载地址: https://go.dev/dl/"
    echo ""
    exit 1
fi

echo "[1/2] 安装后端依赖..."
go mod download
if [ $? -ne 0 ]; then
    echo "[错误] 依赖安装失败！"
    exit 1
fi

echo ""
echo "[2/2] 启动游戏服务器..."
echo "服务器将在 http://localhost:8080 运行"
echo "按 Ctrl+C 停止服务器"
echo ""

go run main.go
