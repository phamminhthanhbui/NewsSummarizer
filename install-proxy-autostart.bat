@echo off
rem Dang ky proxy tu khoi dong cung Windows (chay nen am) de app tren
rem dien thoai LUON co proxy tai http://<IP-PC>:3001.
rem Cach dung: double-click file nay 1 lan. De go: remove-proxy-autostart.bat
cd /d %~dp0

echo Dang dang ky scheduled task "NewsSummarizerProxy" (chay luc dang nhap)...
schtasks /create /tn "NewsSummarizerProxy" /tr "wscript.exe \"%~dp0proxy-hidden.vbs\"" /sc onlogon /rl limited /f
if errorlevel 1 (
    echo [LOI] Khong tao duoc task. Chay lai bang "Run as administrator".
    pause
    exit /b 1
)

echo Khoi dong proxy ngay bay gio...
start "" wscript.exe "%~dp0proxy-hidden.vbs"
timeout /t 3 /nobreak >nul

echo.
echo Xong! Proxy chay nen tai http://localhost:3001
echo Kiem tra: tasklist /fi "IMAGENAME eq node.exe"
echo Nho cap nhat .env neu IP LAN cua PC doi roi build lai APK.
pause
