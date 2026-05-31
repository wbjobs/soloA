#!/bin/bash
echo "========================================"
echo "  Roguelike地牢探险 - 启动前端"
echo "========================================"
echo ""

cd "$(dirname "$0")/client"

if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js 环境！"
    echo ""
    echo "请先安装 Node.js 16 或更高版本："
    echo "下载地址: https://nodejs.org/"
    echo ""
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[1/2] 安装前端依赖..."
    echo "这可能需要几分钟..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败！"
        exit 1
    fi
fi

echo ""
echo "[2/2] 启动前端开发服务器..."
echo "前端将在 http://localhost:3000 运行"
echo "按 Ctrl+C 停止服务器"
echo ""

npm run dev
