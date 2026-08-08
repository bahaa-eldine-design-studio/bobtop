@echo off
title BobTop - Facebook Groups Monitor
echo ========================================
echo   BobTop - Facebook Groups Monitor
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is NOT installed on this PC.
  echo.
  echo Please install Node.js first:
  echo https://nodejs.org  - Download LTS and install (Next - Next)
  echo.
  echo After installing, close this window and double-click BobTop.bat again.
  echo.
  echo Alternative: Double-click BobTop-Standalone.html to try offline demo without Node.
  echo.
  pause
  start https://nodejs.org
  exit /b 1
)

echo Node found: 
call node --version
echo.

if not exist "node_modules\electron" (
  echo [1/3] Installing dependencies first time... please wait
  call npm config set strict-ssl false >nul 2>nul
  call npm install --loglevel error
  if errorlevel 1 (
    echo Install failed. Try Run as Administrator.
    pause
    exit /b 1
  )
)

echo [2/3] Starting BobTop...
echo [3/3] Keep this window open - app will open in seconds
echo.
call npx electron .
if errorlevel 1 (
  echo.
  echo Electron failed. Trying web preview...
  call node src/web-preview/server.js
  pause
)
