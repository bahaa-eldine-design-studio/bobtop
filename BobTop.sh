#!/bin/bash
# BobTop - مراقب جروبات التصميم - Linux / macOS launcher
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================"
echo "  BobTop - مراقب جروبات التصميم"
echo "========================================"

# check node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js غير مثبت. ثبته من https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules/electron" ]; then
  echo "[1/3] تثبيت المتطلبات لأول مرة..."
  npm config set strict-ssl false
  npm install --loglevel error
fi

echo "[2/3] تشغيل BobTop..."
echo "[3/3] البرنامج سيفتح الآن - لا تغلق هذه النافذة"
npx electron .
