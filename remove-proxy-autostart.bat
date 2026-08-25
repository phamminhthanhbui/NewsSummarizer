@echo off
rem Go dang ky tu khoi dong proxy (ngung chay cung Windows).
schtasks /delete /tn "NewsSummarizerProxy" /f
if errorlevel 1 (
    echo [LOI] Khong xoa duoc task hoac task khong ton tai.
    pause
    exit /b 1
)
echo Da go tu khoi dong. Proxy dang chay bay gio van con den khi tat PC
echo hoac chay: taskkill /f /im node.exe
pause
