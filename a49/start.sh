#!/bin/bash
echo "============================================"
echo "  N-Body 引力模拟系统 - 快速启动"
echo "============================================"
echo ""

echo "[1/4] 检查 PostgreSQL 数据库..."
echo "请确保 PostgreSQL 已启动并创建了数据库 'nbody_sim'"
echo ""

echo "[2/4] 启动后端服务..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

gnome-terminal -- bash -c "cd $PWD && source venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000; exec bash" &
echo "后端服务已启动 (http://localhost:8000)"
echo ""

echo "[3/4] 启动前端服务..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

gnome-terminal -- bash -c "cd $PWD && npm run dev; exec bash" &
echo "前端服务已启动 (http://localhost:3000)"
echo ""

echo "============================================"
echo "  启动完成!"
echo "  - API 文档: http://localhost:8000/docs"
echo "  - 前端界面: http://localhost:3000"
echo "============================================"
