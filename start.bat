@echo off
chcp 65001 >nul
echo ========================================
echo    智伴乡童 - 留守儿童关怀平台
echo ========================================
echo.
echo 正在启动后端服务...
start "后端服务" cmd /k "cd /d D:\practice\children\server && D:\node.js\node.exe app.js"

timeout /t 3 /nobreak >nul

echo 正在启动前端服务...
start "前端服务" cmd /k "cd /d D:\practice\children\client && set Path=D:\node.js;%Path% && D:\node.js\npm.cmd run dev"

timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo 启动完成！
echo 前端地址: http://localhost:5173
echo 后端地址: http://localhost:3001
echo ========================================
echo.
echo 正在打开浏览器...
start http://localhost:5173

echo 按任意键关闭此窗口...
pause >nul
