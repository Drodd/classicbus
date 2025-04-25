#!/bin/bash

# 检查是否安装了Node.js
if ! command -v node &> /dev/null; then
  echo "错误: 未安装Node.js，请先安装Node.js"
  exit 1
fi

# 启动HTTP服务器
echo "正在启动HTTP服务器..."
node server.js 