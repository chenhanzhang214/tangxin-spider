@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title 糖心图谱 - 局域网服务

echo ===================================================
echo   糖心图谱 局域网服务启动器
echo   服务将监听 0.0.0.0:8080 (对局域网内所有设备开放)
echo ===================================================
echo.

rem Check node
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [错误] 未检测到 Node.js，请确保已安装 Node.js。
  pause
  exit /b 1
)

echo 正在启动服务...
echo 启动成功后，iPad 等设备可直接通过浏览器访问。
echo.

call npm run dev
if %ERRORLEVEL% neq 0 (
  echo.
  echo [错误] 服务意外停止。
  pause
)
