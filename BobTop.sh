#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
echo "========================================"
echo "  BobTop - Facebook Groups Monitor"
echo "========================================"
if ! command -v node &> /dev/null; then
  echo "Node.js NOT found. Install from https://nodejs.org"
  echo "Or double-click BobTop-Standalone.html for offline demo"
  xdg-open "https://nodejs.org" 2>/dev/null || open "https://nodejs.org" 2>/dev/null || true
  exit 1
fi
echo "Node found: $(node --version)"
if [ ! -d "node_modules/electron" ]; then
  echo "[1/3] Installing dependencies first time... please wait"
  npm config set strict-ssl false
  npm install --loglevel error
  if [ $? -ne 0 ]; then echo "Install failed. Try sudo."; exit 1; fi
fi
echo "[2/3] Starting BobTop..."
npx electron .
