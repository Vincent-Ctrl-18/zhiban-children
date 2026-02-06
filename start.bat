@echo off
chcp 65001 >nul
echo ========================================
echo    智伴乡童 - 留守儿童关怀平台
echo ========================================
echo.

REM 设置变量
set CLOUDFLARED_PATH=C:\Users\Vincent\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe
set PROJECT_PATH=D:\practice\children
set NODE_PATH=D:\node.js

echo 正在启动后端服务...
start "后端服务" cmd /k "cd /d %PROJECT_PATH%\server && %NODE_PATH%\node.exe app.js"

timeout /t 3 /nobreak >nul

echo 正在启动前端服务...
start "前端服务" cmd /k "cd /d %PROJECT_PATH%\client && set Path=%NODE_PATH%;%Path% && %NODE_PATH%\npm.cmd run dev"

timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo 本地启动完成！
echo 前端地址: http://localhost:5173
echo 后端地址: http://localhost:3001
echo ========================================
echo.

REM 询问是否启用公网访问
set /p ENABLE_TUNNEL=是否启用公网访问 (Cloudflare Tunnel)? [Y/N]: 
if /i "%ENABLE_TUNNEL%"=="Y" (
    echo.
    echo 正在启动 Cloudflare Tunnel...
    echo 请等待，公网地址将在下方显示...
    echo ========================================
    start "Cloudflare Tunnel" cmd /k ""%CLOUDFLARED_PATH%" tunnel --url http://localhost:5173 && echo. && echo 复制上方 https://xxx.trycloudflare.com 地址分享给同伴"
    echo.
    echo Tunnel 已在新窗口启动，查看该窗口获取公网地址
    echo 地址格式: https://xxx-xxx-xxx.trycloudflare.com
    echo ========================================
) else (
    echo 正在打开浏览器...
    start http://localhost:5173
)

echo.
echo 按任意键关闭此窗口...
pause >nul
