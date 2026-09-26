#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# 检查 .env 配置文件
if [ ! -f ".env" ]; then
  echo "错误: 未找到 .env 配置文件！请先参考 .env.example 创建 .env"
  exit 1
fi

echo "=========================================="
echo "  CECP 舞台耳返控制系统 · 正在启动..."
echo "  实体调音台: PreSonus StudioLive 32S"
echo "  模式: 局域网本地模式 (LAN / Localhost)"
echo "=========================================="

# 启动 Node 后端服务
exec node --env-file-if-exists=.env src/server/index.ts
