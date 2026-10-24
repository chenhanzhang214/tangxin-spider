@echo off
setlocal EnableExtensions
rem Keep CMD source ASCII; the application prints UTF-8 text.
chcp 65001 >nul
cd /d "%~dp0"
title Tangxin LAN Server
set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"

echo ===================================================
echo   Tangxin LAN Server
echo ===================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js was not found. Install Node.js and reopen this file.
  pause
  exit /b 1
)

if not exist "scripts\lan-server.mjs" (
  echo [ERROR] scripts\lan-server.mjs is missing. Keep this file with the source project.
  pause
  exit /b 1
)

node scripts\lan-server.mjs %*
set "SERVER_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%SERVER_EXIT_CODE%"=="0" echo [ERROR] Server stopped. Exit code: %SERVER_EXIT_CODE%
echo Press any key to close this window.
pause >nul
exit /b %SERVER_EXIT_CODE%
