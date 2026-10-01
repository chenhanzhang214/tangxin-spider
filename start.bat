@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Tangxin GUI

echo.
echo  Starting Tangxin GUI...
echo  Keep this window open.
echo.

rem Explorer double-click often has a stale PATH; add common Node locations.
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"

set NODE_EXE=
where node >nul 2>&1 && for /f "delims=" %%I in ('where node') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo  [ERROR] Node.js not found.
  echo  Install LTS from https://nodejs.org/
  echo  Tick "Add to PATH", then reopen this file.
  echo.
  pause
  exit /b 1
)

echo  Node: %NODE_EXE%
echo.

if not exist "scripts\windows-start.mjs" (
  echo  [ERROR] Missing scripts\windows-start.mjs
  echo  Run start.bat from the unzipped project root ^(where package.json is^).
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" scripts\windows-start.mjs
echo.
echo  Process ended.  Errorlevel=%ERRORLEVEL%
echo  Press any key to close this window.
pause >nul
