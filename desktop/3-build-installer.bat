@echo off
setlocal
title StockFlow - Build Windows installer
cd /d "%~dp0"

if not exist "node_modules\electron-builder\package.json" (
  echo [i] Installing dependencies first...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [X] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Building the installer and the portable executable...
echo This takes a couple of minutes.
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo [X] Build failed - see the messages above.
  pause
  exit /b 1
)

echo.
echo [OK] Build finished. Files in the "release" folder:
echo.
dir /b "release\*.exe" 2>nul
echo.
start "" "%~dp0release"
pause
