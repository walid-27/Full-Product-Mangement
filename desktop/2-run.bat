@echo off
setlocal
title StockFlow
cd /d "%~dp0"

if not exist "node_modules\electron\package.json" (
  echo [!] Dependencies are missing - running the installer first.
  echo.
  call "%~dp0\1-install.bat"
  if errorlevel 1 exit /b 1
)

echo Starting StockFlow...
echo.
call npm start
if errorlevel 1 (
  echo.
  echo [X] StockFlow closed with an error - see the messages above.
  echo.
  pause
)
