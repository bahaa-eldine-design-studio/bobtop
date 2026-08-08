#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
echo "تشغيل المعاينة الخفيفة على http://localhost:3000"
node src/web-preview/server.js
