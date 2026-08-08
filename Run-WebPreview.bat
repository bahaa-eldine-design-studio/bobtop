@echo off
title BobTop - Web Preview
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is NOT installed.
  echo Install from https://nodejs.org then try again.
  echo.
  echo Opening offline standalone demo instead...
  timeout /t 2 >nul
  start "" "BobTop-Standalone.html"
  pause
  exit /b 1
)
echo Starting web preview on http://localhost:3000
echo Keep this window open and open browser to http://localhost:3000
node src/web-preview/server.js
pause
