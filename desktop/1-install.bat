@echo off
setlocal EnableDelayedExpansion
title StockFlow - Install dependencies
cd /d "%~dp0"

echo ============================================
echo   StockFlow - dependency installer
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found.
  echo     Install Node.js 18 or newer from https://nodejs.org
  echo     then double-click this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [i] Node.js !NODEVER! detected.
echo [i] Downloading Electron and build tools - about 100 MB, one time only.
echo.

call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [X] Installation failed. Check your internet connection or proxy settings.
  echo     Behind a proxy:  npm config set proxy http://user:pass@host:port
  echo     Electron mirror: set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  echo.
  pause
  exit /b 1
)

echo.
echo [OK] Dependencies installed.
echo      Next step: double-click 2-run.bat
echo.
pause
