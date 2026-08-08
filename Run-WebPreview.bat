@echo off
chcp 65001 >nul
echo تشغيل المعاينة الخفيفة...
node src/web-preview/server.js
pause
