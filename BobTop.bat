@echo off
chcp 65001 >nul
title BobTop - مراقب جروبات التصميم
echo ========================================
echo   BobTop - مراقب جروبات التصميم
echo ========================================
echo.

REM Check if node_modules exists, if not install
if not exist "node_modules\electron" (
  echo [1/3] تثبيت المتطلبات لأول مرة... قد يأخذ دقيقة
  call npm config set strict-ssl false
  call npm install --loglevel error
  if errorlevel 1 (
    echo فشل التثبيت، جرب تشغيل كمسؤول
    pause
    exit /b 1
  )
)

echo [2/3] تشغيل BobTop...
echo [3/3] لو ظهرت واجهة سوداء لا تغلقها - البرنامج سيفتح في ثواني
echo.
call npx electron .
if errorlevel 1 (
  echo.
  echo حدث خطأ، جرب المعاينة الخفيفة:
  echo node src/web-preview/server.js
  pause
)
