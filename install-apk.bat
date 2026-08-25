@echo off
rem Cài APK release lên điện thoại Android qua adb.
rem Dùng: cắm điện thoại (bật USB debugging) rồi double-click file này,
rem hoặc chạy "install-apk.bat" trong terminal.

setlocal
set APK=%~dp0android\app\build\outputs\apk\release\app-release.apk

if not exist "%APK%" (
    echo [LOI] Khong tim thay APK: %APK%
    echo Chay build truoc: cd android ^&^& gradlew.bat assembleRelease
    exit /b 1
)

echo Kiem tra thiet bi...
adb get-state >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong thay dien thoai. Kiem tra:
    echo   1. Cap USB da cam vao may tinh
    echo   2. Tren dien thoai bat "USB debugging" (Nha phat trien)
    echo   3. Chon "Cho phep" khi dien thoai hoi cho phep may tinh
    echo Danh sach thiet bi:
    adb devices
    exit /b 1
)

echo Dang cai APK...
adb install -r "%APK%"
if errorlevel 1 (
    echo [LOI] Cai that bai. Neu bao "INSTALL_FAILED_UPDATE_INCOMPATIBLE":
    echo   adb uninstall com.autoship.NewsSummarizer
    echo roi chay lai file nay.
    exit /b 1
)

echo.
echo Cai thanh cong! Mo app NewsSummarizer tren dien thoai.
endlocal
